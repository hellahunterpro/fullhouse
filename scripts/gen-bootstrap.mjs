import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates packages/core/src/db/bootstrap-sql.generated.ts from
// worker/migrations/*.sql. Statements are rewritten to IF NOT EXISTS so the
// worker can apply the schema idempotently at runtime; the migration files
// remain the single source of truth.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'worker', 'migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const statements = [];
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf-8').replace(/--[^\n]*/g, '');
  for (const raw of sql.split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const stmt = trimmed
      .replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/^CREATE UNIQUE INDEX (?!IF NOT EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE INDEX (?!IF NOT EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ');
    statements.push(stmt);
  }
}

const out = `/* eslint-disable */
// Generated from worker/migrations by scripts/gen-bootstrap.mjs. Do not edit.
export const BOOTSTRAP_STATEMENTS: string[] = ${JSON.stringify(statements, null, 2)};
`;

writeFileSync(join(root, 'packages', 'core', 'src', 'db', 'bootstrap-sql.generated.ts'), out);
console.log(`bootstrap: ${statements.length} statements from ${files.length} migration files`);
