import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createDuel, listDuels } from './duel.js';

let mf: Miniflare;
let db: D1Database;

async function applyMigrations(db: D1Database) {
  const dir = join(__dirname, '../../migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8').replace(/--[^\n]*/g, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}

let seq = 0;
async function seedUser(userId: string, walletId: string, balance: number) {
  await db.batch([
    db
      .prepare('INSERT INTO users (id, tg_id, username) VALUES (?, ?, ?)')
      .bind(userId, ++seq, `user_${userId}`),
    db
      .prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .bind(walletId, userId, 'CHIP', balance),
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
  seq = 0;
});

afterAll(async () => {
  if (mf) await mf.dispose();
});

describe('duel service', () => {
  it('creates a duel with a share link and a duel_created event', async () => {
    await seedUser('u1', 'w1', 5000);
    const duel = await createDuel(
      db,
      { id: 'u1', walletId: 'w1' },
      { game: 'coinflip', stake: 500 },
      'fullhouse_bot',
    );
    expect(duel.duelId).toMatch(/^[0-9a-f]+$/);
    expect(duel.shareLink).toBe(`https://t.me/fullhouse_bot?startapp=duel_${duel.duelId}`);

    const row = await db
      .prepare('SELECT * FROM duels WHERE id = ?')
      .bind(duel.duelId)
      .first<{ creator_id: string; state: string; game: string; stake: number }>();
    expect(row).toMatchObject({ creator_id: 'u1', state: 'created', game: 'coinflip', stake: 500 });

    const event = await db
      .prepare(`SELECT payload FROM audit_events WHERE user_id = 'u1' AND event_type = 'duel_created'`)
      .first<{ payload: string }>();
    expect(JSON.parse(event!.payload)).toMatchObject({ duelId: duel.duelId, game: 'coinflip', stake: 500 });
  });

  it('rejects invalid games, stakes, and insufficient balances', async () => {
    await seedUser('u1', 'w1', 100);
    await expect(
      createDuel(db, { id: 'u1', walletId: 'w1' }, { game: 'roulette' as never, stake: 50 }, ''),
    ).rejects.toThrow('Invalid duel game');
    await expect(
      createDuel(db, { id: 'u1', walletId: 'w1' }, { game: 'dice', stake: 0 }, ''),
    ).rejects.toThrow('Invalid stake');
    await expect(
      createDuel(db, { id: 'u1', walletId: 'w1' }, { game: 'dice', stake: 10.5 }, ''),
    ).rejects.toThrow('Invalid stake');
    await expect(
      createDuel(db, { id: 'u1', walletId: 'w1' }, { game: 'dice', stake: 500 }, ''),
    ).rejects.toThrow('Insufficient balance');
  });

  it('lists duels for both roles with won flags and names', async () => {
    await seedUser('u1', 'w1', 5000);
    await seedUser('u2', 'w2', 5000);
    await db.batch([
      db
        .prepare(
          `INSERT INTO duels (id, creator_id, opponent_id, game, stake, state, round, winner_id, resolved_at)
           VALUES ('d1', 'u1', 'u2', 'coinflip', 100, 'resolved', 0, 'u1', '2026-06-11T10:00:00Z')`,
        )
        .bind(),
      db
        .prepare(
          `INSERT INTO duels (id, creator_id, opponent_id, game, stake, state, round, winner_id, resolved_at)
           VALUES ('d2', 'u2', 'u1', 'dice', 250, 'resolved', 1, 'u2', '2026-06-11T11:00:00Z')`,
        )
        .bind(),
      db
        .prepare(
          `INSERT INTO duels (id, creator_id, game, stake, state, round)
           VALUES ('d3', 'u1', 'dice', 50, 'created', 0)`,
        )
        .bind(),
    ]);

    const duels = await listDuels(db, 'u1');
    expect(duels).toHaveLength(3);

    const d1 = duels.find((d) => d.duelId === 'd1')!;
    expect(d1.won).toBe(true);
    expect(d1.creatorName).toBe('user_u1');
    expect(d1.opponentName).toBe('user_u2');

    const d2 = duels.find((d) => d.duelId === 'd2')!;
    expect(d2.won).toBe(false);
    expect(d2.round).toBe(1);

    const d3 = duels.find((d) => d.duelId === 'd3')!;
    expect(d3.won).toBeNull();
    expect(d3.state).toBe('created');

    // A third user sees nothing.
    await seedUser('u3', 'w3', 100);
    expect(await listDuels(db, 'u3')).toHaveLength(0);
  });
});
