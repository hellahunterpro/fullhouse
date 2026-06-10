import { generateId } from '../utils/id.js';
import type { WalletRow, LedgerEntryRow } from '../db/schema.js';

export type TransactionType = 'credit' | 'debit';

export interface TransactionResult {
  ledgerEntryId: string;
  walletId: string;
  balanceBefore: number;
  balanceAfter: number;
  amount: number;
  type: TransactionType;
}

export class InsufficientFundsError extends Error {
  constructor(walletId: string, requested: number, available: number) {
    super(`Insufficient funds in wallet ${walletId}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

export class DuplicateTransactionError extends Error {
  constructor(refKey: string) {
    super(`Duplicate transaction with ref_key: ${refKey}`);
    this.name = 'DuplicateTransactionError';
  }
}

/**
 * Atomic wallet operations. All balance mutations go through this module.
 *
 * Atomicity: D1 batch() executes all statements in a single implicit transaction.
 * The conditional UPDATE (balance >= amount) prevents double-spend: if a concurrent
 * batch already decremented the balance, the WHERE clause fails and changes = 0.
 */

export async function credit(
  db: D1Database,
  walletId: string,
  amount: number,
  type: string,
  opts: { refKey?: string; description?: string } = {},
): Promise<TransactionResult> {
  if (amount <= 0) throw new Error('Amount must be positive');

  const entryId = generateId();
  const now = new Date().toISOString();

  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?').bind(
      amount,
      now,
      walletId,
    ),
    db.prepare(
      `INSERT INTO ledger_entries (id, wallet_id, type, amount, balance_after, ref_key, description, created_at)
       VALUES (?, ?, ?, ?, (SELECT balance FROM wallets WHERE id = ?), ?, ?, ?)`,
    ).bind(entryId, walletId, type, amount, walletId, opts.refKey ?? null, opts.description ?? null, now),
  ];

  if (opts.refKey) {
    const existing = await db
      .prepare('SELECT id FROM ledger_entries WHERE ref_key = ?')
      .bind(opts.refKey)
      .first<Pick<LedgerEntryRow, 'id'>>();
    if (existing) throw new DuplicateTransactionError(opts.refKey);
  }

  const results = await db.batch(stmts);
  const updateMeta = results[0] as D1Result;

  if (!updateMeta.meta.changes || updateMeta.meta.changes === 0) {
    throw new Error(`Wallet ${walletId} not found`);
  }

  const wallet = await db
    .prepare('SELECT balance FROM wallets WHERE id = ?')
    .bind(walletId)
    .first<Pick<WalletRow, 'balance'>>();

  return {
    ledgerEntryId: entryId,
    walletId,
    balanceBefore: wallet!.balance - amount,
    balanceAfter: wallet!.balance,
    amount,
    type: 'credit',
  };
}

export async function debit(
  db: D1Database,
  walletId: string,
  amount: number,
  type: string,
  opts: { refKey?: string; description?: string } = {},
): Promise<TransactionResult> {
  if (amount <= 0) throw new Error('Amount must be positive');

  if (opts.refKey) {
    const existing = await db
      .prepare('SELECT id FROM ledger_entries WHERE ref_key = ?')
      .bind(opts.refKey)
      .first<Pick<LedgerEntryRow, 'id'>>();
    if (existing) throw new DuplicateTransactionError(opts.refKey);
  }

  const entryId = generateId();
  const now = new Date().toISOString();

  // Conditional update: only succeeds if balance >= amount
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      'UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?',
    ).bind(amount, now, walletId, amount),
    db.prepare(
      `INSERT INTO ledger_entries (id, wallet_id, type, amount, balance_after, ref_key, description, created_at)
       VALUES (?, ?, ?, ?, (SELECT balance FROM wallets WHERE id = ?), ?, ?, ?)`,
    ).bind(entryId, walletId, type, -amount, walletId, opts.refKey ?? null, opts.description ?? null, now),
  ];

  const results = await db.batch(stmts);
  const updateMeta = results[0] as D1Result;

  if (!updateMeta.meta.changes || updateMeta.meta.changes === 0) {
    const wallet = await db
      .prepare('SELECT balance FROM wallets WHERE id = ?')
      .bind(walletId)
      .first<Pick<WalletRow, 'balance'>>();

    if (!wallet) throw new Error(`Wallet ${walletId} not found`);
    throw new InsufficientFundsError(walletId, amount, wallet.balance);
  }

  const wallet = await db
    .prepare('SELECT balance FROM wallets WHERE id = ?')
    .bind(walletId)
    .first<Pick<WalletRow, 'balance'>>();

  return {
    ledgerEntryId: entryId,
    walletId,
    balanceBefore: wallet!.balance + amount,
    balanceAfter: wallet!.balance,
    amount,
    type: 'debit',
  };
}

export async function getBalance(db: D1Database, walletId: string): Promise<number> {
  const wallet = await db
    .prepare('SELECT balance FROM wallets WHERE id = ?')
    .bind(walletId)
    .first<Pick<WalletRow, 'balance'>>();
  if (!wallet) throw new Error(`Wallet ${walletId} not found`);
  return wallet.balance;
}
