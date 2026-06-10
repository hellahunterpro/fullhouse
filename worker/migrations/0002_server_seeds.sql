-- Provably-fair server seeds: committed in advance, revealed on rotation.
-- A user has at most one active seed; the nonce increments once per round.

CREATE TABLE server_seeds (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  seed        TEXT NOT NULL,
  seed_hash   TEXT NOT NULL,
  nonce       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revealed')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revealed_at TEXT
);

CREATE UNIQUE INDEX idx_server_seeds_active_user ON server_seeds(user_id) WHERE status = 'active';
CREATE INDEX idx_server_seeds_user ON server_seeds(user_id);
