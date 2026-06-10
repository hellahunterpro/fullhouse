import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function createTestDb(): Promise<{ db: D1Database; mf: Miniflare }> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'test-db' },
  });

  const db = await mf.getD1Database('DB');

  const migration = readFileSync(
    join(__dirname, '../../migrations/0001_init.sql'),
    'utf-8',
  );

  const statements = migration
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.exec(stmt);
  }

  return { db, mf };
}

export async function seedWallet(
  db: D1Database,
  userId: string,
  walletId: string,
  balance: number,
): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO users (id, tg_id, username) VALUES (?, ?, ?)')
      .bind(userId, Math.floor(Math.random() * 1000000), `user_${userId}`),
    db
      .prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .bind(walletId, userId, 'CHIP', balance),
  ]);
}
