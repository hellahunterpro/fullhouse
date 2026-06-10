import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getCommitment, getActiveSeedRow, incrementNonceStmt, rotateSeed } from './fairness.js';
import { provisionUser } from './auth.js';

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
});

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('fairness seed service', () => {
  it('lazily creates one active seed with a stable hash', async () => {
    const user = await provisionUser(db, { id: 1, username: 'a' });
    const c1 = await getCommitment(db, user.id);
    expect(c1.seedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(c1.nonce).toBe(0);

    const c2 = await getCommitment(db, user.id);
    expect(c2.seedHash).toBe(c1.seedHash);
    expect(c2.id).toBe(c1.id);
  });

  it('seed hash is sha256 of the committed seed', async () => {
    const user = await provisionUser(db, { id: 2, username: 'b' });
    const row = await getActiveSeedRow(db, user.id);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.seed));
    const hex = Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(row.seed_hash);
  });

  it('increments the nonce atomically via the batch statement', async () => {
    const user = await provisionUser(db, { id: 3, username: 'c' });
    const row = await getActiveSeedRow(db, user.id);
    await db.batch([incrementNonceStmt(db, row.id)]);
    expect((await getCommitment(db, user.id)).nonce).toBe(1);
  });

  it('keeps exactly one active seed after repeated rotation', async () => {
    const user = await provisionUser(db, { id: 4, username: 'd' });
    const first = await getCommitment(db, user.id);
    await rotateSeed(db, user.id);
    await rotateSeed(db, user.id);

    const active = await db
      .prepare(`SELECT COUNT(*) as n FROM server_seeds WHERE user_id = ? AND status = 'active'`)
      .bind(user.id)
      .first<{ n: number }>();
    const revealed = await db
      .prepare(`SELECT COUNT(*) as n FROM server_seeds WHERE user_id = ? AND status = 'revealed'`)
      .bind(user.id)
      .first<{ n: number }>();

    expect(active!.n).toBe(1);
    expect(revealed!.n).toBe(2);
    expect((await getCommitment(db, user.id)).seedHash).not.toBe(first.seedHash);
  });
});
