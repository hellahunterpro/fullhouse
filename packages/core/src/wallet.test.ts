import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { join } from 'path';
import { credit, debit, getBalance, settleRound, InsufficientFundsError, DuplicateTransactionError } from './wallet.js';

let mf: Miniflare;
let db: D1Database;
let walletCounter = 0;

async function applyMigrations(db: D1Database) {
  const migration = readFileSync(join(__dirname, '../../../worker/migrations/0001_init.sql'), 'utf-8');
  const noComments = migration.replace(/--[^\n]*/g, '');
  const stmts = noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }
}

async function seedWallet(userId: string, walletId: string, balance: number) {
  await db.batch([
    db.prepare('INSERT INTO users (id, tg_id, username) VALUES (?, ?, ?)').bind(userId, ++walletCounter, `u${walletCounter}`),
    db.prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)').bind(walletId, userId, 'CHIP', balance),
  ]);
}

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'test-db' },
  });
  db = await mf.getD1Database('DB');
  await applyMigrations(db);
  walletCounter = 0;
});

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('wallet service', () => {
  describe('credit', () => {
    it('credits a wallet and returns correct balances', async () => {
      await seedWallet('u1', 'w1', 1000);
      const result = await credit(db, 'w1', 500, 'bonus');

      expect(result.balanceBefore).toBe(1000);
      expect(result.balanceAfter).toBe(1500);
      expect(result.amount).toBe(500);
      expect(result.type).toBe('credit');

      const balance = await getBalance(db, 'w1');
      expect(balance).toBe(1500);
    });

    it('rejects zero or negative amounts', async () => {
      await seedWallet('u1', 'w1', 1000);
      await expect(credit(db, 'w1', 0, 'bonus')).rejects.toThrow('Amount must be positive');
      await expect(credit(db, 'w1', -100, 'bonus')).rejects.toThrow('Amount must be positive');
    });

    it('rejects duplicate ref_key', async () => {
      await seedWallet('u1', 'w1', 1000);
      await credit(db, 'w1', 500, 'bonus', { refKey: 'ref-1' });
      await expect(credit(db, 'w1', 500, 'bonus', { refKey: 'ref-1' })).rejects.toThrow(DuplicateTransactionError);
    });
  });

  describe('debit', () => {
    it('debits a wallet and returns correct balances', async () => {
      await seedWallet('u1', 'w1', 1000);
      const result = await debit(db, 'w1', 300, 'bet');

      expect(result.balanceBefore).toBe(1000);
      expect(result.balanceAfter).toBe(700);
      expect(result.amount).toBe(300);
      expect(result.type).toBe('debit');

      const balance = await getBalance(db, 'w1');
      expect(balance).toBe(700);
    });

    it('rejects debit when insufficient funds', async () => {
      await seedWallet('u1', 'w1', 100);
      await expect(debit(db, 'w1', 200, 'bet')).rejects.toThrow(InsufficientFundsError);

      const balance = await getBalance(db, 'w1');
      expect(balance).toBe(100);
    });

    it('allows debit of exact balance', async () => {
      await seedWallet('u1', 'w1', 500);
      const result = await debit(db, 'w1', 500, 'bet');
      expect(result.balanceAfter).toBe(0);
    });

    it('rejects duplicate ref_key', async () => {
      await seedWallet('u1', 'w1', 1000);
      await debit(db, 'w1', 100, 'bet', { refKey: 'ref-2' });
      await expect(debit(db, 'w1', 100, 'bet', { refKey: 'ref-2' })).rejects.toThrow(DuplicateTransactionError);
    });
  });

  describe('ledger entries', () => {
    it('records all transactions in ledger', async () => {
      await seedWallet('u1', 'w1', 1000);
      await credit(db, 'w1', 500, 'bonus', { refKey: 'c1' });
      await debit(db, 'w1', 200, 'bet', { refKey: 'd1' });

      const entries = await db
        .prepare('SELECT type, amount, balance_after, ref_key FROM ledger_entries WHERE wallet_id = ? ORDER BY created_at')
        .bind('w1')
        .all();

      expect(entries.results).toHaveLength(2);
      expect(entries.results[0]).toMatchObject({ type: 'bonus', amount: 500, balance_after: 1500, ref_key: 'c1' });
      expect(entries.results[1]).toMatchObject({ type: 'bet', amount: -200, balance_after: 1300, ref_key: 'd1' });
    });
  });

  describe('parallel debit race condition', () => {
    it('prevents double-spend under concurrent debits', async () => {
      await seedWallet('u1', 'w1', 1000);

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          debit(db, 'w1', 300, 'bet', { refKey: `race-${i}` }),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      // At most 3 debits of 300 can succeed from 1000 (3*300 = 900 <= 1000)
      expect(succeeded.length).toBeLessThanOrEqual(3);
      expect(succeeded.length + failed.length).toBe(5);

      const finalBalance = await getBalance(db, 'w1');
      expect(finalBalance).toBeGreaterThanOrEqual(0);
      expect(finalBalance).toBe(1000 - succeeded.length * 300);
    });
  });
});

describe('settleRound (atomic round)', () => {
  it('debits stake and credits payout in one transaction', async () => {
    await seedWallet('u1', 'w1', 1000);
    const res = await settleRound(db, {
      walletId: 'w1',
      stake: 100,
      payout: 198,
      stakeRefKey: 'r1:stake',
      payoutRefKey: 'r1:payout',
    });
    expect(res.balanceBefore).toBe(1000);
    expect(res.balanceAfter).toBe(1098);

    const entries = await db
      .prepare('SELECT amount FROM ledger_entries WHERE wallet_id = ?')
      .bind('w1')
      .all();
    const amounts = entries.results.map((e) => e.amount as number).sort((a, b) => a - b);
    expect(amounts).toEqual([-100, 198]);
    expect(await getBalance(db, 'w1')).toBe(1098);
  });

  it('records a single ledger entry when payout is zero', async () => {
    await seedWallet('u1', 'w1', 1000);
    const res = await settleRound(db, {
      walletId: 'w1',
      stake: 100,
      payout: 0,
      stakeRefKey: 'r2:stake',
      payoutRefKey: 'r2:payout',
    });
    expect(res.balanceAfter).toBe(900);
    const entries = await db.prepare('SELECT amount FROM ledger_entries WHERE wallet_id = ?').bind('w1').all();
    expect(entries.results).toHaveLength(1);
  });

  it('rejects when stake exceeds balance and writes nothing', async () => {
    await seedWallet('u1', 'w1', 50);
    await expect(
      settleRound(db, { walletId: 'w1', stake: 100, payout: 198, stakeRefKey: 'r3:stake', payoutRefKey: 'r3:payout' }),
    ).rejects.toThrow(InsufficientFundsError);
    expect(await getBalance(db, 'w1')).toBe(50);
    const entries = await db.prepare('SELECT id FROM ledger_entries WHERE wallet_id = ?').bind('w1').all();
    expect(entries.results).toHaveLength(0);
  });

  it('rolls back the whole round if an extra statement fails', async () => {
    await seedWallet('u1', 'w1', 1000);
    const badStmt = db
      .prepare('INSERT INTO users (id, tg_id, username) VALUES (?, ?, ?)')
      .bind('u1', 999111, 'dup');
    await expect(
      settleRound(
        db,
        { walletId: 'w1', stake: 100, payout: 198, stakeRefKey: 'r4:stake', payoutRefKey: 'r4:payout' },
        [badStmt],
      ),
    ).rejects.toBeTruthy();
    expect(await getBalance(db, 'w1')).toBe(1000);
    const entries = await db.prepare('SELECT id FROM ledger_entries WHERE wallet_id = ?').bind('w1').all();
    expect(entries.results).toHaveLength(0);
  });

  it('is idempotent on the stake ref key', async () => {
    await seedWallet('u1', 'w1', 1000);
    await settleRound(db, { walletId: 'w1', stake: 100, payout: 0, stakeRefKey: 'r5:stake', payoutRefKey: 'r5:payout' });
    await expect(
      settleRound(db, { walletId: 'w1', stake: 100, payout: 0, stakeRefKey: 'r5:stake', payoutRefKey: 'r5:payout' }),
    ).rejects.toThrow(DuplicateTransactionError);
  });
});
