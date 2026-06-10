import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { join } from 'path';
import { playRound } from './round.js';
import { provisionUser } from './auth.js';
import { getBalance } from './wallet.js';
import { verify } from './rng.js';
import { registerGame, clearRegistry } from '../games/registry.js';
import { diceGame } from '../games/dice.js';

let mf: Miniflare;
let db: D1Database;

async function applyMigrations(db: D1Database) {
  const migration = readFileSync(join(__dirname, '../../migrations/0001_init.sql'), 'utf-8');
  const noComments = migration.replace(/--[^\n]*/g, '');
  const stmts = noComments.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
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

  it('fairness proof verifies correctly', async () => {
    const user = await provisionUser(db, { id: 88888, username: 'proof_test' });

    const result = await playRound(db, {
      gameId: 'dice',
      bet: { stake: 50, target: 50, direction: 'over' },
      clientSeed: 'verify-me',
      userId: user.id,
      walletId: user.walletId,
    });

    const valid = await verify(result.proof, 100);
    expect(valid).toBe(true);
  });

  it('writes an audit event', async () => {
    const user = await provisionUser(db, { id: 77777, username: 'audit_test' });

    await playRound(db, {
      gameId: 'dice',
      bet: { stake: 100, target: 50, direction: 'under' },
      clientSeed: 'audit-seed',
      userId: user.id,
      walletId: user.walletId,
    });

    const events = await db
      .prepare('SELECT event_type, payload FROM audit_events WHERE user_id = ? AND event_type = ?')
      .bind(user.id, 'bet_resolved')
      .all();

    expect(events.results).toHaveLength(1);
    const payload = JSON.parse(events.results[0].payload as string);
    expect(payload.gameId).toBe('dice');
    expect(payload.stake).toBe(100);
    expect(payload.balanceBefore).toBe(10_000);
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
