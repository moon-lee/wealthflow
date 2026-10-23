/**
 * Regenerates the generated regions of `src/seed/wealth-seed.sql` from the
 * extension manifest and the reconciled holding history.
 *
 *   npx vite-node scripts\generate-seed-holdings.ts
 *
 * The SQL seed and the dev seed have to write the SAME rows, or the installed
 * app shows a different portfolio from the dev harness. Writing them by hand
 * guarantees they drift, so the SQL is generated from the one source both
 * paths already share.
 *
 * The seed file itself is gitignored personal data. This script is safe to
 * commit — it contains no data of its own.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema, buildHoldings } from '../src/data/seed-sql.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_PATH = join(root, 'src', 'seed', 'wealth-seed.sql');

function replaceRegion(
  text: string,
  startMarker: string,
  endMarker: string,
  body: string,
): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start === -1 || end === -1)
    throw new Error(`seed: markers not found (${startMarker} .. ${endMarker})`);
  return (
    text.slice(0, start + startMarker.length) +
    '\n' +
    body +
    '\n' +
    text.slice(end)
  );
}

if (!existsSync(SQL_PATH)) {
  console.error(
    'seed: src/seed/wealth-seed.sql is missing. It is gitignored personal data.',
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as any;

let sql = readFileSync(SQL_PATH, 'utf8');
sql = replaceRegion(
  sql,
  '-- @@GENERATED-SCHEMA@@',
  '-- @@END-GENERATED@@',
  buildSchema(pkg.financeExtension.tables),
);
sql = replaceRegion(
  sql,
  '-- @@GENERATED-HOLDINGS@@',
  '-- @@END-GENERATED@@',
  buildHoldings(),
);
writeFileSync(SQL_PATH, sql, 'utf8');
console.log('seed: regenerated the schema and holdings regions');
