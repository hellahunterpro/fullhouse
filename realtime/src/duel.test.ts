import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createValidInitData } from '@fullhouse/core/test-helpers';
import { verify } from '@fullhouse/core';
import { resolveDuelOutcome } from './duel-logic.js';

const BOT_TOKEN = 'test-bot-token:AABBCCDD';

let mf: Miniflare;
let db: D1Database;

type WsMessage = { type: string; [key: string]: unknown };

class Inbox {
  private msgs: WsMessage[] = [];
  private cursor = 0;
  private waiters: Array<{
    pred: (m: WsMessage) => boolean;
    resolve: (m: WsMessage) => void;
  }> = [];

  constructor(ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      const text = String((event as MessageEvent).data);
      if (text === 'pong') return;
      this.msgs.push(JSON.parse(text) as WsMessage);
      this.drain();
    });
  }

  private drain() {
    for (let w = 0; w < this.waiters.length; w++) {
      for (let i = this.cursor; i < this.msgs.length; i++) {
        if (this.waiters[w].pred(this.msgs[i])) {
          const [waiter] = this.waiters.splice(w, 1);
          const [msg] = this.msgs.splice(i, 1);
          if (i < this.cursor) this.cursor--;
          waiter.resolve(msg);
          this.drain();
          return;
        }
      }
    }
  }

  next(pred: (m: WsMessage) => boolean, timeoutMs = 6000): Promise<WsMessage> {
    for (let i = this.cursor; i < this.msgs.length; i++) {
      if (pred(this.msgs[i])) {
        const [msg] = this.msgs.splice(i, 1);
        return Promise.resolve(msg);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for message; saw: ${JSON.stringify(this.msgs)}`)),
        timeoutMs,
      );
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }
}

interface Client {
  ws: WebSocket;
  inbox: Inbox;
  tgId: number;
}

async function connect(duelId: string, tgId: number, username: string): Promise<Client> {
  const initData = await createValidInitData(BOT_TOKEN, { id: tgId, username });
  const params = new URLSearchParams({ duel: duelId, initData });
  const res = await mf.dispatchFetch(`http://localhost/ws?${params}`, {
    headers: { Upgrade: 'websocket' },
  });
  if (res.status !== 101) {
    throw new Error(`connect failed: ${res.status} ${await res.text()}`);
  }
  const ws = res.webSocket! as unknown as WebSocket;
  (ws as unknown as { accept(): void }).accept();
  const inbox = new Inbox(ws);
  await inbox.next((m) => m.type === 'hello');
  return { ws, inbox, tgId };
}

async function balanceOf(tgId: number): Promise<number> {
  const row = await db
    .prepare(
      'SELECT w.balance AS balance FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.tg_id = ?',
    )
    .bind(tgId)
    .first<{ balance: number }>();
  return row?.balance ?? -1;
}

async function duelRow(id: string) {
  return db.prepare('SELECT * FROM duels WHERE id = ?').bind(id).first();
}

beforeAll(async () => {
  const bundled = await build({
    entryPoints: [join(__dirname, 'index.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
  });
  mf = new Miniflare({
    modules: true,
    script: bundled.outputFiles[0].text,
    durableObjects: { DUEL: 'DuelObject' },
    d1Databases: { DB: 'test-db' },
    bindings: {
      BOT_TOKEN,
      DEV_MODE: 'false',
      DUEL_TIMEOUT_MS: '400',
      DUEL_CLEANUP_MS: '60000',
    },
    compatibilityDate: '2024-11-01',
  });
  db = await mf.getD1Database('DB');
  const dir = join(__dirname, '../../worker/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8').replace(/--[^\n]*/g, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}, 30000);

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('duel outcome logic', () => {
  it('coinflip maps the fair roll to a winner', () => {
    expect(resolveDuelOutcome('coinflip', 0, 'ff').winnerIdx).toBe(0);
    expect(resolveDuelOutcome('coinflip', 1, 'ff').winnerIdx).toBe(1);
  });

  it('dice derives distinct rolls and walks past ties', () => {
    // First pair ties (0x10 % 100 === 0x10 % 100), second pair decides.
    const r = resolveDuelOutcome('dice', 0, '1010' + '4b2c' + '00'.repeat(28));
    expect(r.outcome.kind).toBe('dice');
    if (r.outcome.kind === 'dice') {
      expect(r.outcome.rolls[0]).toBe(0x4b % 100);
      expect(r.outcome.rolls[1]).toBe(0x2c % 100);
      // 0x4b (75) beats 0x2c (44), so the creator wins.
      expect(r.winnerIdx).toBe(0);
    }
  });
});

describe('duel state machine', () => {
  it('runs a full coinflip duel: create → join → commit → resolved with verifiable proof', async () => {
    const duelId = 'duel-flow-1';
    const a = await connect(duelId, 1001, 'alice');
    const b = await connect(duelId, 1002, 'bob');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 500 }));
    const created = await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    expect(created.seedHash).toBeTruthy();

    b.ws.send(JSON.stringify({ type: 'join' }));
    const joined = await b.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    expect((joined.opponent as { name: string }).name).toBe('bob');

    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'seed-alice' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'seed-bob' }));

    const resolvedA = await a.inbox.next((m) => m.type === 'resolved');
    const resolvedB = await b.inbox.next((m) => m.type === 'resolved');
    expect(resolvedA.winnerId).toBe(resolvedB.winnerId);
    expect(resolvedA.payout).toBe(1000);

    // The proof's commitment matches the pre-bet commitment and verifies.
    const proof = resolvedA.proof as {
      serverSeed: string;
      serverSeedHash: string;
      clientSeeds: string[];
      nonce: number;
      combinedHmac: string;
      roll: number;
    };
    expect(proof.serverSeedHash).toBe(created.seedHash);
    expect(proof.clientSeeds).toEqual(['seed-alice', 'seed-bob']);
    expect(await verify(proof, 2)).toBe(true);

    // Winner gained the opponent's stake; loser lost theirs.
    const balA = await balanceOf(1001);
    const balB = await balanceOf(1002);
    const aWon = resolvedA.winnerName === 'alice';
    expect(balA).toBe(aWon ? 10500 : 9500);
    expect(balB).toBe(aWon ? 9500 : 10500);

    const row = (await duelRow(duelId)) as { state: string; winner_id: string };
    expect(row.state).toBe('resolved');
    expect(row.winner_id).toBe(resolvedA.winnerId);

    a.ws.close();
    b.ws.close();
  });

  it('dice duels expose both rolls and the winner has the higher roll', async () => {
    const duelId = 'duel-dice-1';
    const a = await connect(duelId, 1003, 'carol');
    const b = await connect(duelId, 1004, 'dave');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'dice', stake: 100 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');

    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'cs-1' }));
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'cs-2' }));

    const resolved = await a.inbox.next((m) => m.type === 'resolved');
    const outcome = resolved.outcome as { kind: string; rolls: [number, number] };
    expect(outcome.kind).toBe('dice');
    expect(outcome.rolls[0]).not.toBe(outcome.rolls[1]);
    const creatorWon = outcome.rolls[0] > outcome.rolls[1];
    expect(resolved.winnerName).toBe(creatorWon ? 'carol' : 'dave');

    a.ws.close();
    b.ws.close();
  });

  it('supports a rematch with a fresh pre-committed seed and a higher nonce', async () => {
    const duelId = 'duel-rematch-1';
    const a = await connect(duelId, 1005, 'erin');
    const b = await connect(duelId, 1006, 'frank');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 200 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'r0-a' }));
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'r0-b' }));

    const first = await a.inbox.next((m) => m.type === 'resolved');
    expect(first.round).toBe(0);
    const nextSeedHash = first.nextSeedHash as string;
    expect(nextSeedHash).toBeTruthy();

    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'r1-a' }));
    await b.inbox.next((m) => m.type === 'duel_state' && (m.rematchVotes as string[]).length === 1);
    b.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'r1-b' }));

    const second = await a.inbox.next((m) => m.type === 'resolved');
    expect(second.round).toBe(1);
    const proof = second.proof as { serverSeedHash: string; nonce: number; clientSeeds: string[] };
    // Round 1 was played against the seed committed in the round 0 result.
    expect(proof.serverSeedHash).toBe(nextSeedHash);
    expect(proof.nonce).toBe(1);
    expect(proof.clientSeeds).toEqual(['r1-a', 'r1-b']);
    expect(await verify(second.proof as Parameters<typeof verify>[0], 2)).toBe(true);

    // Two rounds: total chips conserved between the two players.
    const total = (await balanceOf(1005)) + (await balanceOf(1006));
    expect(total).toBe(20000);

    a.ws.close();
    b.ws.close();
  });

  it('rejects illegal transitions', async () => {
    const duelId = 'duel-guards-1';
    const a = await connect(duelId, 1007, 'gus');

    // Commit before the duel exists.
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'x' }));
    expect((await a.inbox.next((m) => m.type === 'error')).error).toContain('not found');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 100 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');

    // The creator cannot join their own duel.
    a.ws.send(JSON.stringify({ type: 'join' }));
    expect((await a.inbox.next((m) => m.type === 'error')).error).toContain('own duel');

    // Commits are rejected before an opponent joins.
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'x' }));
    expect((await a.inbox.next((m) => m.type === 'error')).error).toContain('state created');

    // Rematch only makes sense after a resolution.
    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'x' }));
    expect((await a.inbox.next((m) => m.type === 'error')).error).toContain('state created');

    const b = await connect(duelId, 1008, 'hana');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await b.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');

    // A third player cannot take the opponent seat.
    const c = await connect(duelId, 1009, 'igor');
    c.ws.send(JSON.stringify({ type: 'join' }));
    expect((await c.inbox.next((m) => m.type === 'error')).error).toContain('already has an opponent');

    // Another user cannot re-create an existing duel.
    c.ws.send(JSON.stringify({ type: 'create', duelId, game: 'dice', stake: 1 }));
    expect((await c.inbox.next((m) => m.type === 'error')).error).toContain('already exists');

    a.ws.close();
    b.ws.close();
    c.ws.close();
  });

  it('replayed commits stay idempotent: stake is locked once', async () => {
    const duelId = 'duel-replay-1';
    const a = await connect(duelId, 1010, 'jack');
    const b = await connect(duelId, 1011, 'kim');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 300 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');

    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'once' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'twice' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);

    expect(await balanceOf(1010)).toBe(9700);

    a.ws.close();
    b.ws.close();
  });

  it('cancels an unjoined duel after the timeout', async () => {
    const duelId = 'duel-timeout-1';
    const a = await connect(duelId, 1012, 'lena');
    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 100 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');

    const cancelled = await a.inbox.next((m) => m.type === 'cancelled', 5000);
    expect(cancelled.reason).toContain('expired');

    const row = (await duelRow(duelId)) as { state: string };
    expect(row.state).toBe('cancelled');
    expect(await balanceOf(1012)).toBe(10000);
  });

  it('refunds a locked stake when the other player abandons', async () => {
    const duelId = 'duel-abandon-1';
    const a = await connect(duelId, 1013, 'mona');
    const b = await connect(duelId, 1014, 'nick');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'dice', stake: 800 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');

    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'committed' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);
    expect(await balanceOf(1013)).toBe(9200);

    // B never commits; the alarm cancels and refunds.
    const cancelled = await a.inbox.next((m) => m.type === 'cancelled', 5000);
    expect(cancelled.reason).toContain('timed out');
    expect(await balanceOf(1013)).toBe(10000);

    const refund = await db
      .prepare(`SELECT type FROM ledger_entries WHERE ref_key = ?`)
      .bind(`duel:${duelId}:r0:refund:` + (await userIdOf(1013)))
      .first<{ type: string }>();
    expect(refund?.type).toBe('duel_refund');
  });

  it('a player leaving pre-resolution cancels and refunds', async () => {
    const duelId = 'duel-leave-1';
    const a = await connect(duelId, 1015, 'olga');
    const b = await connect(duelId, 1016, 'pete');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 250 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await b.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'cs-b' }));
    await b.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);
    expect(await balanceOf(1016)).toBe(9750);

    a.ws.send(JSON.stringify({ type: 'leave' }));
    const cancelled = await b.inbox.next((m) => m.type === 'cancelled');
    expect(cancelled.reason).toContain('left');
    expect(await balanceOf(1016)).toBe(10000);
  });

  it('rejects a duel id that contradicts the signed start_param', async () => {
    const initData = await createValidInitData(
      BOT_TOKEN,
      { id: 1017, username: 'quinn' },
      undefined,
      { start_param: 'duel_other-duel' },
    );
    const params = new URLSearchParams({ duel: 'duel-mismatch-1', initData });
    const res = await mf.dispatchFetch(`http://localhost/ws?${params}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(403);
  });
});

async function userIdOf(tgId: number): Promise<string> {
  const row = await db
    .prepare('SELECT id FROM users WHERE tg_id = ?')
    .bind(tgId)
    .first<{ id: string }>();
  return row!.id;
}
