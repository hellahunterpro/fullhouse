import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { join } from 'path';
import { createValidInitData } from '@fullhouse/core/test-helpers';

const BOT_TOKEN = 'test-bot-token:AABBCCDD';

let mf: Miniflare;

async function bundleWorker(): Promise<string> {
  const result = await build({
    entryPoints: [join(__dirname, 'index.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
  });
  return result.outputFiles[0].text;
}

type WsMessage = { type: string; [key: string]: unknown };

function nextMessage(ws: WebSocket, predicate?: (m: WsMessage) => boolean): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for message')), 5000);
    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data)) as WsMessage;
      if (!predicate || predicate(msg)) {
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        resolve(msg);
      }
    };
    ws.addEventListener('message', onMessage);
  });
}

async function connect(duelId: string, query: Record<string, string>) {
  const params = new URLSearchParams({ duel: duelId, ...query });
  const res = await mf.dispatchFetch(`http://localhost/ws?${params}`, {
    headers: { Upgrade: 'websocket' },
  });
  return res;
}

beforeAll(async () => {
  const script = await bundleWorker();
  mf = new Miniflare({
    modules: true,
    script,
    durableObjects: { DUEL: 'DuelObject' },
    d1Databases: { DB: 'test-db' },
    bindings: { BOT_TOKEN, DEV_MODE: 'false' },
    compatibilityDate: '2024-11-01',
  });
}, 30000);

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('realtime worker', () => {
  it('responds on /health', async () => {
    const res = await mf.dispatchFetch('http://localhost/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('rejects /ws without a websocket upgrade', async () => {
    const res = await mf.dispatchFetch('http://localhost/ws?duel=abcd1234');
    expect(res.status).toBe(426);
  });

  it('rejects a missing or malformed duel id', async () => {
    const res = await connect('x', {});
    expect(res.status).toBe(400);
  });

  it('rejects a connection without initData', async () => {
    const res = await connect('duel-test-1', {});
    expect(res.status).toBe(401);
  });

  it('rejects a connection with a tampered initData signature', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 7, username: 'mallory' });
    const res = await connect('duel-test-1', { initData: initData.replace(/hash=\w{8}/, 'hash=00000000') });
    expect(res.status).toBe(401);
  });

  it('accepts an authenticated connection and sends hello', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 101, username: 'alice' });
    const res = await connect('duel-test-2', { initData });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    expect(ws).toBeTruthy();
    ws.accept();

    const hello = await nextMessage(ws as unknown as WebSocket, (m) => m.type === 'hello');
    expect(hello.duelId).toBe('duel-test-2');
    expect((hello.you as { name: string }).name).toBe('alice');
    ws.close();
  });

  it('answers heartbeat pings with pongs', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 102, username: 'bob' });
    const res = await connect('duel-test-3', { initData });
    const ws = res.webSocket!;
    ws.accept();
    await nextMessage(ws as unknown as WebSocket, (m) => m.type === 'hello');

    const pong = new Promise<string>((resolve) => {
      ws.addEventListener('message', (event) => {
        if (String(event.data) === 'pong') resolve('pong');
      });
    });
    ws.send('ping');
    expect(await pong).toBe('pong');
    ws.close();
  });

  it('broadcasts presence when a second player joins and when one leaves', async () => {
    const initA = await createValidInitData(BOT_TOKEN, { id: 201, username: 'p_one' });
    const initB = await createValidInitData(BOT_TOKEN, { id: 202, username: 'p_two' });

    const resA = await connect('duel-test-4', { initData: initA });
    const wsA = resA.webSocket!;
    wsA.accept();
    const helloA = await nextMessage(wsA as unknown as WebSocket, (m) => m.type === 'hello');
    expect((helloA.peers as unknown[]).length).toBe(1);

    const presencePromise = nextMessage(wsA as unknown as WebSocket, (m) => m.type === 'presence');
    const resB = await connect('duel-test-4', { initData: initB });
    const wsB = resB.webSocket!;
    wsB.accept();
    const helloB = await nextMessage(wsB as unknown as WebSocket, (m) => m.type === 'hello');
    expect((helloB.peers as unknown[]).length).toBe(2);

    const presence = await presencePromise;
    const names = (presence.peers as { name: string }[]).map((p) => p.name).sort();
    expect(names).toEqual(['p_one', 'p_two']);

    const leavePromise = nextMessage(wsA as unknown as WebSocket, (m) => m.type === 'presence');
    wsB.close();
    const leave = await leavePromise;
    expect((leave.peers as { name: string }[]).map((p) => p.name)).toEqual(['p_one']);
    wsA.close();
  });

  it('rejects unknown message types with an error reply', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 103, username: 'carol' });
    const res = await connect('duel-test-5', { initData });
    const ws = res.webSocket!;
    ws.accept();
    await nextMessage(ws as unknown as WebSocket, (m) => m.type === 'hello');

    ws.send(JSON.stringify({ type: 'bogus' }));
    const err = await nextMessage(ws as unknown as WebSocket, (m) => m.type === 'error');
    expect(err.error).toContain('bogus');
    ws.close();
  });
});
