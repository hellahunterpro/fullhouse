import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createValidInitData } from '@fullhouse/core/test-helpers';

const BOT_TOKEN = 'test-bot-token:AABBCCDD';

let mf: Miniflare;
let db: D1Database;

type WsMessage = { type: string; [key: string]: unknown };

class Inbox {
  private msgs: WsMessage[] = [];
  private waiters: Array<{ pred: (m: WsMessage) => boolean; resolve: (m: WsMessage) => void }> =
    [];

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
      for (let i = 0; i < this.msgs.length; i++) {
        if (this.waiters[w].pred(this.msgs[i])) {
          const [waiter] = this.waiters.splice(w, 1);
          const [msg] = this.msgs.splice(i, 1);
          waiter.resolve(msg);
          this.drain();
          return;
        }
      }
    }
  }

  next(pred: (m: WsMessage) => boolean, timeoutMs = 6000): Promise<WsMessage> {
    for (let i = 0; i < this.msgs.length; i++) {
      if (pred(this.msgs[i])) {
        const [msg] = this.msgs.splice(i, 1);
        return Promise.resolve(msg);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out; saw: ${JSON.stringify(this.msgs)}`)),
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
  userId: string;
}

async function connect(duelId: string, tgId: number, username: string): Promise<Client> {
  const initData = await createValidInitData(BOT_TOKEN, { id: tgId, username });
  const params = new URLSearchParams({ duel: duelId, initData });
  const res = await mf.dispatchFetch(`http://localhost/ws?${params}`, {
    headers: { Upgrade: 'websocket' },
  });
  if (res.status !== 101) throw new Error(`connect failed: ${res.status}`);
  const ws = res.webSocket! as unknown as WebSocket;
  (ws as unknown as { accept(): void }).accept();
  const inbox = new Inbox(ws);
  const hello = await inbox.next((m) => m.type === 'hello');
  return { ws, inbox, tgId, userId: (hello.you as { userId: string }).userId };
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

async function ledgerForDuel(duelId: string) {
  const { results } = await db
    .prepare(
      `SELECT type, amount, ref_key FROM ledger_entries WHERE ref_key LIKE ? ORDER BY created_at`,
    )
    .bind(`duel:${duelId}:%`)
    .all<{ type: string; amount: number; ref_key: string }>();
  return results;
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
      DUEL_TIMEOUT_MS: '120000',
      DUEL_CLEANUP_MS: '120000',
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

describe('duel escrow & settlement', () => {
  it('double-join race: exactly one of two challengers becomes the opponent', async () => {
    const duelId = 'escrow-join-race';
    const a = await connect(duelId, 2001, 'host');
    const b = await connect(duelId, 2002, 'fast');
    const c = await connect(duelId, 2003, 'faster');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 100 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');

    // Both challengers race to join: each either takes the seat or is rejected.
    const seatOrError = (client: Client) =>
      client.inbox.next(
        (m) =>
          (m.type === 'duel_state' &&
            (m.opponent as { userId: string } | null)?.userId === client.userId) ||
          m.type === 'error',
      );
    b.ws.send(JSON.stringify({ type: 'join' }));
    c.ws.send(JSON.stringify({ type: 'join' }));
    const results = await Promise.all([seatOrError(b), seatOrError(c)]);

    const errors = results.filter((r) => r.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain('already has an opponent');

    const row = await db
      .prepare('SELECT opponent_id FROM duels WHERE id = ?')
      .bind(duelId)
      .first<{ opponent_id: string | null }>();
    expect([b.userId, c.userId]).toContain(row?.opponent_id);

    a.ws.close();
    b.ws.close();
    c.ws.close();
  });

  it('double-commit race: rapid duplicate commits lock the stake exactly once', async () => {
    const duelId = 'escrow-commit-race';
    const a = await connect(duelId, 2004, 'alpha');
    const b = await connect(duelId, 2005, 'beta');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'dice', stake: 400 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');

    // Two commit messages in the same tick.
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 's1' }));
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 's2' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.committed as string[]).length === 1);

    expect(await balanceOf(2004)).toBe(9600);
    const stakes = (await ledgerForDuel(duelId)).filter((e) => e.type === 'duel_stake');
    expect(stakes).toHaveLength(1);

    a.ws.close();
    b.ws.close();
  });

  it('full duel + rematch keeps a balanced ledger: 2 stakes and 1 payout per round', async () => {
    const duelId = 'escrow-ledger';
    const a = await connect(duelId, 2006, 'gamma');
    const b = await connect(duelId, 2007, 'delta');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 1000 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'g0' }));
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'd0' }));
    await a.inbox.next((m) => m.type === 'resolved');

    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'g1' }));
    b.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'd1' }));
    await a.inbox.next((m) => m.type === 'resolved');

    const entries = await ledgerForDuel(duelId);
    const stakes = entries.filter((e) => e.type === 'duel_stake');
    const payouts = entries.filter((e) => e.type === 'duel_payout');
    const refunds = entries.filter((e) => e.type === 'duel_refund');
    expect(stakes).toHaveLength(4);
    expect(payouts).toHaveLength(2);
    expect(refunds).toHaveLength(0);

    // Ledger sums to zero: every chip staked was paid back out.
    const net = entries.reduce((sum, e) => sum + e.amount, 0);
    expect(net).toBe(0);

    // And the wallets agree.
    expect((await balanceOf(2006)) + (await balanceOf(2007))).toBe(20000);

    a.ws.close();
    b.ws.close();
  });

  it('duplicate rematch votes do not double-lock or double-resolve', async () => {
    const duelId = 'escrow-rematch-replay';
    const a = await connect(duelId, 2008, 'eps');
    const b = await connect(duelId, 2009, 'zeta');

    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 100 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'e0' }));
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'z0' }));
    await a.inbox.next((m) => m.type === 'resolved');

    // The same player mashes rematch.
    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'e1' }));
    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'e1-again' }));
    await a.inbox.next((m) => m.type === 'duel_state' && (m.rematchVotes as string[]).length === 1);

    b.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'z1' }));
    await a.inbox.next((m) => m.type === 'resolved' && m.round === 1);

    const entries = await ledgerForDuel(duelId);
    expect(entries.filter((e) => e.ref_key.includes(':r1:stake:'))).toHaveLength(2);
    expect(entries.filter((e) => e.ref_key.includes(':r1:payout'))).toHaveLength(1);

    a.ws.close();
    b.ws.close();
  });

  it('rematch with insufficient funds cancels and refunds the player already locked', async () => {
    const duelId = 'escrow-broke-rematch';
    const a = await connect(duelId, 2010, 'rich');
    const b = await connect(duelId, 2011, 'poor');

    // Stake over half the starting balance: the round-0 loser cannot afford round 1.
    a.ws.send(JSON.stringify({ type: 'create', duelId, game: 'coinflip', stake: 6000 }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'created');
    b.ws.send(JSON.stringify({ type: 'join' }));
    await a.inbox.next((m) => m.type === 'duel_state' && m.state === 'joined');
    a.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'r0' }));
    b.ws.send(JSON.stringify({ type: 'commit', clientSeed: 'p0' }));
    const resolved = await a.inbox.next((m) => m.type === 'resolved');

    a.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'r1' }));
    b.ws.send(JSON.stringify({ type: 'rematch', clientSeed: 'p1' }));
    const cancelled = await a.inbox.next((m) => m.type === 'cancelled');
    expect(cancelled.reason).toContain('Insufficient');

    // Total chips conserved and the winner kept the round-0 winnings.
    const balA = await balanceOf(2010);
    const balB = await balanceOf(2011);
    expect(balA + balB).toBe(20000);
    const aWon = resolved.winnerName === 'rich';
    expect(balA).toBe(aWon ? 16000 : 4000);

    const row = await db
      .prepare('SELECT state FROM duels WHERE id = ?')
      .bind(duelId)
      .first<{ state: string }>();
    expect(row?.state).toBe('cancelled');
  });
});
