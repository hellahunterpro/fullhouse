import { generateId } from '../utils/id.js';
import { generateServerSeed, commit } from './rng.js';
import type { ServerSeedRow } from '../db/schema.js';

export interface Commitment {
  id: string;
  seedHash: string;
  nonce: number;
}

export interface RevealedSeed {
  seed: string;
  seedHash: string;
  nonce: number;
}

async function createSeed(db: D1Database, userId: string): Promise<ServerSeedRow> {
  const seed = await generateServerSeed();
  const seedHash = (await commit(seed)).serverSeedHash;
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO server_seeds (id, user_id, seed, seed_hash, nonce, status)
       VALUES (?, ?, ?, ?, 0, 'active')`,
    )
    .bind(id, userId, seed, seedHash)
    .run();
  return { id, user_id: userId, seed, seed_hash: seedHash, nonce: 0, status: 'active', created_at: '', revealed_at: null };
}

// Returns the active seed row, creating one if the user has none. Includes the raw
// seed for server-side outcome derivation only — callers must never expose `seed`
// while the seed is active.
export async function getActiveSeedRow(db: D1Database, userId: string): Promise<ServerSeedRow> {
  const row = await db
    .prepare(`SELECT * FROM server_seeds WHERE user_id = ? AND status = 'active'`)
    .bind(userId)
    .first<ServerSeedRow>();
  return row ?? createSeed(db, userId);
}

// The public commitment shown to the player BEFORE betting (no raw seed).
export async function getCommitment(db: D1Database, userId: string): Promise<Commitment> {
  const row = await getActiveSeedRow(db, userId);
  return { id: row.id, seedHash: row.seed_hash, nonce: row.nonce };
}

// Prepared statement that advances the active seed's nonce, run inside the round
// settlement batch so the nonce moves atomically with the payout.
export function incrementNonceStmt(db: D1Database, seedId: string): D1PreparedStatement {
  return db.prepare('UPDATE server_seeds SET nonce = nonce + 1 WHERE id = ?').bind(seedId);
}

// Reveals the active seed (so every round played under it can now be verified) and
// starts a fresh active seed.
export async function rotateSeed(db: D1Database, userId: string): Promise<RevealedSeed> {
  const current = await getActiveSeedRow(db, userId);
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE server_seeds SET status = 'revealed', revealed_at = ? WHERE id = ?`)
    .bind(now, current.id)
    .run();
  await createSeed(db, userId);
  return { seed: current.seed, seedHash: current.seed_hash, nonce: current.nonce };
}
