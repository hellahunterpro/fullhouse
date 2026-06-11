import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { join } from 'path';
import { claimDailyBonus, getDailyBonusStatus } from './daily-bonus.js';
import { writeAuditEvent } from '@fullhouse/core';

let mf: Miniflare;
let db: D1Database;

async function applyMigrations(db: D1Database) {
  const migration = readFileSync(join(__dirname, '../../migrations/0001_init.sql'), 'utf-8');
  const noComments = migration.replace(/--[^\n]*/g, '');
  const stmts = noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }
}

async function seedUser(userId: string, walletId: string) {
  await db.batch([
    db.prepare('INSERT INTO users (id, tg_id, username) VALUES (?, ?, ?)').bind(userId, 1, 'u1'),
    db
      .prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .bind(walletId, userId, 'CHIP', 0),
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
});

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('daily bonus status', () => {
  it('reports available with zero streak for a fresh user', async () => {
    await seedUser('u1', 'w1');
    const status = await getDailyBonusStatus(db, 'u1');
    expect(status).toEqual({ available: true, streak: 0 });
  });

  it('reports unavailable after claiming today', async () => {
    await seedUser('u1', 'w1');
    const claim = await claimDailyBonus(db, 'u1', 'w1');
    expect(claim.awarded).toBe(true);
    const status = await getDailyBonusStatus(db, 'u1');
    expect(status).toEqual({ available: false, streak: claim.streak });
  });

  it('reports available with continuing streak after a claim yesterday', async () => {
    await seedUser('u1', 'w1');
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await writeAuditEvent(db, 'u1', 'daily_bonus', {
      date: yesterday.toISOString().slice(0, 10),
      streak: 3,
      amount: 1300,
    });
    const status = await getDailyBonusStatus(db, 'u1');
    expect(status).toEqual({ available: true, streak: 3 });
  });

  it('resets streak to zero when the last claim is older than yesterday', async () => {
    await seedUser('u1', 'w1');
    const lastWeek = new Date();
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
    await writeAuditEvent(db, 'u1', 'daily_bonus', {
      date: lastWeek.toISOString().slice(0, 10),
      streak: 5,
      amount: 1500,
    });
    const status = await getDailyBonusStatus(db, 'u1');
    expect(status).toEqual({ available: true, streak: 0 });
  });

  it('claim is idempotent within the same day', async () => {
    await seedUser('u1', 'w1');
    const first = await claimDailyBonus(db, 'u1', 'w1');
    const second = await claimDailyBonus(db, 'u1', 'w1');
    expect(first.awarded).toBe(true);
    expect(second.awarded).toBe(false);
    expect(second.streak).toBe(first.streak);
  });
});
