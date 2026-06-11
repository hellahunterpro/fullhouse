// Fails the build if first-load JS exceeds the webview performance budget.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 250;
const assetsDir = join(process.cwd(), 'web', 'dist', 'assets');

let totalGzip = 0;
const rows = [];
for (const file of readdirSync(assetsDir)) {
  if (!file.endsWith('.js')) continue;
  const gz = gzipSync(readFileSync(join(assetsDir, file))).length;
  totalGzip += gz;
  rows.push(`  ${file}: ${(gz / 1024).toFixed(1)} KB gzip`);
}

console.log('First-load JS:');
console.log(rows.join('\n'));
console.log(`Total: ${(totalGzip / 1024).toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);

if (totalGzip > BUDGET_KB * 1024) {
  console.error('Bundle exceeds the first-load JS budget.');
  process.exit(1);
}
