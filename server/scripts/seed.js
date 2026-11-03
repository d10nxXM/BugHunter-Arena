// Loads data/challenges/*.json into the challenges table.
// Usage (from server/): npm run seed
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in server/.env and the
// migration pushed. Safe to run repeatedly: rows are upserted by id.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ChallengeFileSchema } from '../src/schemas/challenge.js';

const DEFAULT_DIR = fileURLToPath(
  new URL('../data/challenges', import.meta.url),
);

/**
 * Reads and validates every .json file in `dir`. Throws on the first bad
 * file, naming it, so nothing is written unless every file is valid.
 */
export async function loadChallengeFiles(dir) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  const files = [];

  for (const name of names) {
    let raw;
    try {
      raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (err) {
      throw new Error(`${name}: not valid JSON`, { cause: err });
    }

    const result = ChallengeFileSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`${name}: ${z.prettifyError(result.error)}`, {
        cause: result.error,
      });
    }
    if (name !== `${result.data.id}.json`) {
      throw new Error(`${name}: file name must be "${result.data.id}.json"`);
    }
    files.push(result.data);
  }

  return files;
}

/** Validates all files in `dir`, then upserts them in one call. */
export async function seed({ db, dir = DEFAULT_DIR }) {
  const rows = await loadChallengeFiles(dir);
  if (rows.length === 0) {
    throw new Error(`No challenge files found in ${dir}`);
  }

  const { error } = await db
    .from('challenges')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error('Upsert into challenges failed', { cause: error });

  return { count: rows.length };
}

async function main() {
  // Imported here so tests of this module never build a real client.
  const { logger } = await import('../src/lib/logger.js');
  try {
    const { db } = await import('../src/db/client.js');
    const { count } = await seed({ db });
    logger.info({ count }, 'seeded challenges');
  } catch (err) {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  }
}

const runDirectly =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase();

if (runDirectly) {
  await main();
}
