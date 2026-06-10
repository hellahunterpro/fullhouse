import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { playRound } from './round.js';
import { provisionUser } from './auth.js';
import { getBalance } from './wallet.js';
import { verify } from './rng.js';
import { getCommitment, rotateSeed } from './fairness.js';
import { registerGame, clearRegistry } from '../games/registry.js';
import { diceGame } from '../games/dice.js';

let mf: Miniflare;
let db: D1Database;

async function applyMigrations(db: D1Database) {
  const dir = join(__dirname, '../../migrations');
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8').replace(/--[^\n]*/g, '');
    const stmts = sql.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    for (const stmt of stmts) {
      await db.prepare(stmt).run();
    }
  }
}

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'test-db' },
  });
  db = await mf.getD1Database('DB');
  await applyMigrations(db);
  clearRegistry();
  registerGame(diceGame);
});

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('end-to-end round', () => {
  it('plays a full dice round with correct balance movement', async () => {
    const user = await provisionUser(db, { id: 99999, username: 'e2e_test' });
    const startBalance = await getBalance(db, user.walletId);
    expect(startBalance).toBe(10_000);

    const result = await playRound(db, {
      gameId: 'dice',
      bet: { stake: 100, target: 50, direction: 'under' },
      clientSeed: 'test-client-seed',
      userId: user.id,
      walletId: user.walletId,
    });

    expect(result.roundId).toBeTruthy();
    expect(result.outcome).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.balanceBefore).toBe(10_000);

    // Balance moved correctly
    const finalBalance = await getBalance(db, user.walletId);
    expect(finalBalance).toBe(result.balanceAfter);

    const outcome = result.outcome as { win: boolean; payout: number };
    if (outcome.win) {
      expect(result.balanceAfter).toBe(10_000 - 100 + outcome.payout);
    } else {
      expect(result.balanceAfter).toBe(10_000 - 100);
    }
  });

  it('per-round proof hides the server seed and verifies after reveal', async () => {
    const user = await provisionUser(db, { id: 88888, username: 'proof_test' });

    const result = await playRound(db, {
      gameId: 'dice',
      bet: { stake: 50, target: 50, direction: 'over' },
      clientSeed: 'verify-me',
      userId: user.id,
      walletId: user.walletId,
    });

    // The per-round proof must not leak the raw server seed.
    expect((result.proof as Record<string, unknown>).serverSeed).toBeUndefined();
    expect(result.proof.serverSeedHash).toBeTruthy();

    // Rotating reveals the seed; the revealed seed must match the prior commitment.
    const revealed = await rotateSeed(db, user.id);
    expect(revealed.seedHash).toBe(result.proof.serverSeedHash);

    const valid = await verify(
      {
        serverSeed: revealed.seed,
        serverSeedHash: result.proof.serverSeedHash,
        clientSeeds: result.proof.clientSeeds,
        nonce: result.proof.nonce,
        combinedHmac: result.proof.combinedHmac,
        roll: result.proof.roll,
      },
      100,
    );
    expect(valid).toBe(true);
  });

  it('writes structured analytics events', async () => {
    const user = await provisionUser(db, { id: 77777, username: 'audit_test' });

    await playRound(db, {
      gameId: 'dice',
      bet: { stake: 100, target: 50, direction: 'under' },
      clientSeed: 'audit-seed',
      userId: user.id,
      walletId: user.walletId,
    });

    const events = await db
      .prepare('SELECT event_type, payload FROM audit_events WHERE user_id = ? ORDER BY created_at')
      .bind(user.id)
      .all();

    const types = events.results.map((e) => e.event_type);
    expect(types).toContain('bet_placed');
    expect(types).toContain('bet_resolved');
    expect(types).toContain('balance_delta');

    const placed = events.results.find((e) => e.event_type === 'bet_placed');
    const placedPayload = JSON.parse(placed!.payload as string);
    expect(placedPayload.gameId).toBe('dice');
    expect(placedPayload.stake).toBe(100);
    expect(placedPayload.commitment).toBeTruthy();

    const resolved = events.results.find((e) => e.event_type === 'bet_resolved');
    const resolvedPayload = JSON.parse(resolved!.payload as string);
    expect(resolvedPayload.netDelta).toBeDefined();

    const delta = events.results.find((e) => e.event_type === 'balance_delta');
    const deltaPayload = JSON.parse(delta!.payload as string);
    expect(deltaPayload.balanceBefore).toBe(10_000);
    expect(deltaPayload.delta).toBe(deltaPayload.balanceAfter - deltaPayload.balanceBefore);
  });

  it('rejects invalid bets', async () => {
    const user = await provisionUser(db, { id: 66666, username: 'invalid_test' });

    await expect(
      playRound(db, {
        gameId: 'dice',
        bet: { stake: 100, target: 150, direction: 'under' },
        clientSeed: 'bad-target',
        userId: user.id,
        walletId: user.walletId,
      }),
    ).rejects.toThrow('Target');
  });

  it('rejects unknown game', async () => {
    const user = await provisionUser(db, { id: 55555, username: 'unknown_game' });

    await expect(
      playRound(db, {
        gameId: 'nonexistent',
        bet: { stake: 100, target: 50, direction: 'under' },
        clientSeed: 'nope',
        userId: user.id,
        walletId: user.walletId,
      }),
    ).rejects.toThrow('Unknown game');
  });

  it('plays multiple rounds and balance tracks correctly', async () => {
    const user = await provisionUser(db, { id: 44444, username: 'multi_round' });
    let expectedBalance = 10_000;

    for (let i = 0; i < 5; i++) {
      const result = await playRound(db, {
        gameId: 'dice',
        bet: { stake: 100, target: 50, direction: 'under' },
        clientSeed: `round-${i}`,
        userId: user.id,
        walletId: user.walletId,
      });

      expect(result.balanceBefore).toBe(expectedBalance);
      expectedBalance = result.balanceAfter;
    }

    const finalBalance = await getBalance(db, user.walletId);
    expect(finalBalance).toBe(expectedBalance);
  });
});

describe('provably-fair seed lifecycle', () => {
  it('commits the seed before betting and advances the nonce each round', async () => {
    const user = await provisionUser(db, { id: 33333, username: 'seed_test' });

    const before = await getCommitment(db, user.id);
    expect(before.seedHash).toBeTruthy();
    expect(before.nonce).toBe(0);

    const r1 = await playRound(db, {
      gameId: 'dice',
      bet: { stake: 100, target: 50, direction: 'under' },
      clientSeed: 'a',
      userId: user.id,
      walletId: user.walletId,
    });
    expect(r1.proof.serverSeedHash).toBe(before.seedHash);
    expect(r1.proof.nonce).toBe(0);

    const afterOne = await getCommitment(db, user.id);
    expect(afterOne.seedHash).toBe(before.seedHash);
    expect(afterOne.nonce).toBe(1);

    const r2 = await playRound(db, {
      gameId: 'dice',
      bet: { stake: 100, target: 50, direction: 'under' },
      clientSeed: 'b',
      userId: user.id,
      walletId: user.walletId,
    });
    expect(r2.proof.nonce).toBe(1);
    expect((await getCommitment(db, user.id)).nonce).toBe(2);
  });

  it('rotating reveals the old seed and starts a fresh commitment', async () => {
    const user = await provisionUser(db, { id: 22222, username: 'rotate_test' });
    const first = await getCommitment(db, user.id);

    const revealed = await rotateSeed(db, user.id);
    expect(revealed.seedHash).toBe(first.seedHash);

    const next = await getCommitment(db, user.id);
    expect(next.seedHash).not.toBe(first.seedHash);
    expect(next.nonce).toBe(0);
  });
});
