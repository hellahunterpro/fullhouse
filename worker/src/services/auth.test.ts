import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { join } from 'path';
import { authenticate, AuthError } from './auth.js';
import { getBalance } from './wallet.js';

const BOT_TOKEN = 'test-bot-token:AABBCCDD';

let mf: Miniflare;
let db: D1Database;

async function applyMigrations(db: D1Database) {
  const migration = readFileSync(join(__dirname, '../../migrations/0001_init.sql'), 'utf-8');
  const noComments = migration.replace(/--[^\n]*/g, '');
  const stmts = noComments.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }
}

async function createValidInitData(
  botToken: string,
  user: { id: number; username?: string; first_name?: string },
  authDate?: number,
): Promise<string> {
  const enc = new TextEncoder();
  const now = authDate ?? Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify(user);

  const params = new URLSearchParams();
  params.set('auth_date', String(now));
  params.set('user', userJson);
  params.set('query_id', 'test-query');

  // Build data-check-string
  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Compute hash
  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const secretKey = await crypto.subtle.sign('HMAC', secretKeyMaterial, enc.encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretKey,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(sorted));
  const hash = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');

  params.set('hash', hash);
  return params.toString();
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

describe('auth service', () => {
  it('authenticates valid initData and provisions new user with starting chips', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 12345, username: 'testuser', first_name: 'Test' });
    const user = await authenticate(db, initData, BOT_TOKEN);

    expect(user.tgId).toBe(12345);
    expect(user.username).toBe('testuser');
    expect(user.firstName).toBe('Test');
    expect(user.isNewUser).toBe(true);
    expect(user.walletId).toBeTruthy();

    const balance = await getBalance(db, user.walletId);
    expect(balance).toBe(10_000);
  });

  it('returns existing user on repeated auth', async () => {
    const initData1 = await createValidInitData(BOT_TOKEN, { id: 12345, username: 'testuser' });
    const user1 = await authenticate(db, initData1, BOT_TOKEN);

    const initData2 = await createValidInitData(BOT_TOKEN, { id: 12345, username: 'testuser' });
    const user2 = await authenticate(db, initData2, BOT_TOKEN);

    expect(user2.id).toBe(user1.id);
    expect(user2.walletId).toBe(user1.walletId);
    expect(user2.isNewUser).toBe(false);
  });

  it('rejects expired initData', async () => {
    const expiredDate = Math.floor(Date.now() / 1000) - 600;
    const initData = await createValidInitData(BOT_TOKEN, { id: 12345 }, expiredDate);

    await expect(authenticate(db, initData, BOT_TOKEN)).rejects.toThrow(AuthError);
    await expect(authenticate(db, initData, BOT_TOKEN)).rejects.toThrow('expired');
  });

  it('rejects tampered signature', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 12345 });
    const tampered = initData.replace(/hash=[^&]+/, 'hash=0000000000000000000000000000000000000000000000000000000000000000');

    await expect(authenticate(db, tampered, BOT_TOKEN)).rejects.toThrow(AuthError);
    await expect(authenticate(db, tampered, BOT_TOKEN)).rejects.toThrow('signature');
  });

  it('rejects wrong bot token', async () => {
    const initData = await createValidInitData(BOT_TOKEN, { id: 12345 });
    await expect(authenticate(db, initData, 'wrong-token')).rejects.toThrow(AuthError);
  });

  it('rejects missing hash', async () => {
    await expect(authenticate(db, 'auth_date=123&user={}', BOT_TOKEN)).rejects.toThrow('Missing hash');
  });

  it('rejects missing user', async () => {
    await expect(authenticate(db, 'auth_date=123&hash=abc', BOT_TOKEN)).rejects.toThrow('Missing user');
  });
});
