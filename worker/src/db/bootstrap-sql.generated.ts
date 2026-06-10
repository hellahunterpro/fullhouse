/* eslint-disable */
// Generated from worker/migrations by scripts/gen-bootstrap.mjs. Do not edit.
export const BOOTSTRAP_STATEMENTS: string[] = [
  "CREATE TABLE IF NOT EXISTS users (\n  id         TEXT PRIMARY KEY,\n  tg_id      INTEGER UNIQUE NOT NULL,\n  username   TEXT,\n  first_name TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n)",
  "CREATE TABLE IF NOT EXISTS wallets (\n  id         TEXT PRIMARY KEY,\n  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id),\n  currency   TEXT NOT NULL DEFAULT 'CHIP',\n  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n)",
  "CREATE TABLE IF NOT EXISTS ledger_entries (\n  id              TEXT PRIMARY KEY,\n  wallet_id       TEXT NOT NULL REFERENCES wallets(id),\n  type            TEXT NOT NULL,\n  amount          INTEGER NOT NULL,\n  balance_after   INTEGER NOT NULL,\n  ref_key         TEXT UNIQUE,\n  description     TEXT,\n  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n)",
  "CREATE TABLE IF NOT EXISTS audit_events (\n  id         TEXT PRIMARY KEY,\n  user_id    TEXT REFERENCES users(id),\n  event_type TEXT NOT NULL,\n  payload    TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n)",
  "CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id ON ledger_entries(wallet_id)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_ref_key ON ledger_entries(ref_key)",
  "CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_events(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type)",
  "CREATE TABLE IF NOT EXISTS server_seeds (\n  id          TEXT PRIMARY KEY,\n  user_id     TEXT NOT NULL REFERENCES users(id),\n  seed        TEXT NOT NULL,\n  seed_hash   TEXT NOT NULL,\n  nonce       INTEGER NOT NULL DEFAULT 0,\n  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revealed')),\n  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),\n  revealed_at TEXT\n)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_server_seeds_active_user ON server_seeds(user_id) WHERE status = 'active'",
  "CREATE INDEX IF NOT EXISTS idx_server_seeds_user ON server_seeds(user_id)"
];
