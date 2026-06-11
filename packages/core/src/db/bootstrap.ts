import { BOOTSTRAP_STATEMENTS } from './bootstrap-sql.generated.js';

let applied: Promise<void> | null = null;

// Applies the schema idempotently on the first request of an isolate. Every
// statement is IF NOT EXISTS, so after the first deploy this is a cheap no-op
// batch; it keeps the remote database in sync with the committed migrations
// without a manual apply step.
export function ensureSchema(db: D1Database): Promise<void> {
  applied ??= db
    .batch(BOOTSTRAP_STATEMENTS.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      applied = null;
      throw err;
    });
  return applied;
}
