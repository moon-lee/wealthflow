// Choosing which finance.db to write. Split out of apply-seed.mjs so the test
// can import it without executing the seeder.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The first non-flag argument, i.e. the database path. Reading argv[2] blindly
 * treats `apply-seed.mjs --no-backup` as a request to use a file named
 * "--no-backup", and then helpfully creates one.
 */
export function pickDatabaseArg(argv) {
  return argv.slice(2).find((a) => !a.startsWith('--'));
}

/**
 * The database to write, in order of preference:
 *   1. an explicit path argument
 *   2. $WEALTHFLOW_DB
 *   3. the single match under %APPDATA%
 *
 * A dev and a production install can both exist, and the production one may sit
 * outside %APPDATA% entirely, so this never guesses: with more than one
 * candidate it refuses and lists them.
 */
export function findDatabase(explicit, env = process.env) {
  if (explicit) return resolve(explicit);
  if (env.WEALTHFLOW_DB) return resolve(env.WEALTHFLOW_DB);
  const appData = env.APPDATA;
  if (!appData)
    throw new Error('APPDATA is not set; pass the .db path as an argument');
  const candidates = readdirSync(appData)
    .filter((d) => d.toLowerCase().startsWith('finance flow'))
    .map((d) => join(appData, d, 'finance.db'))
    .filter((p) => existsSync(p))
    .sort();
  if (candidates.length === 0) {
    throw new Error(
      `No finance.db under ${appData}\\Finance Flow*.\n` +
        'Pass the path explicitly, e.g.\n' +
        '  node scripts\\apply-seed.mjs "D:\\Finance Flow Product\\data\\finance.db"',
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Found ${candidates.length} databases, so refusing to guess which one you meant:\n` +
        candidates.map((p) => `  ${p}`).join('\n') +
        '\nPass the one you want as an argument, e.g.\n' +
        `  node scripts\\apply-seed.mjs "${candidates[0]}"`,
    );
  }
  return candidates[0];
}
