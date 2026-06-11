-- Duel records. Live state is orchestrated by the realtime DuelObject; this
-- row is the durable record used for summaries, history, and recovery.
CREATE TABLE duels (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  opponent_id TEXT REFERENCES users(id),
  game TEXT NOT NULL,
  stake INTEGER NOT NULL CHECK (stake > 0),
  state TEXT NOT NULL DEFAULT 'created',
  round INTEGER NOT NULL DEFAULT 0,
  winner_id TEXT REFERENCES users(id),
  server_seed_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE INDEX idx_duels_creator ON duels(creator_id, created_at);
CREATE INDEX idx_duels_opponent ON duels(opponent_id, created_at);
