// Validates every data/challenges/*.json against the challenge format in
// docs/DATA_MODEL.md. Structure only.
// Usage (from server/): node scripts/validate-challenges.js
// Exit code 1 if any file is invalid; each problem is printed with its file.
//
// SAFETY: this script never runs Python or any challenge code (no process
// spawning, no dynamic evaluation). It only reads JSON and checks its shape.
//
// KNOWN GAP: `failsOnOriginal` (whether a test fails on the buggy `code` and
// passes on `reference_solution`) can only be computed by executing the
// challenge code. It is NOT computed here. We only check that the boolean is
// present on every test and that the flags are plausible (at least one hidden
// test fails on the original; the visible tests do not all fail). Verifying
// the flags needs a separate, sandboxed (browser/Pyodide) step.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChallengeFileSchema } from '../src/schemas/challenge.js';

const DEFAULT_DIR = fileURLToPath(
  new URL('../data/challenges', import.meta.url),
);

function checkSemantics(data) {
  const problems = [];
  const lineCount = data.code.split('\n').length;

  for (const field of ['bug_lines', 'related_lines']) {
    const bad = data[field].filter((n) => n > lineCount);
    if (bad.length > 0) {
      problems.push(
        `${field} ${bad.join(', ')} outside the code (${lineCount} lines)`,
      );
    }
  }

  const tests = data.tests_json;
  const missing = tests.filter((t) => typeof t.failsOnOriginal !== 'boolean');
  if (missing.length > 0) {
    problems.push(
      `failsOnOriginal missing on test(s): ${missing.map((t) => t.id).join(', ')}`,
    );
  } else {
    const hidden = tests.filter((t) => !t.visible);
    const visible = tests.filter((t) => t.visible);
    if (!hidden.some((t) => t.failsOnOriginal)) {
      problems.push('at least one hidden test must have failsOnOriginal true');
    }
    if (visible.length > 0 && visible.every((t) => t.failsOnOriginal)) {
      problems.push('visible tests must not all have failsOnOriginal true');
    }
  }
  return problems;
}

/**
 * Validates every .json file in `dir`. Never throws for a bad file; returns
 * { checked, problems } where each problem is prefixed with the file name.
 */
export async function validateChallengeDir(dir = DEFAULT_DIR) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  const problems = [];

  if (names.length === 0) {
    problems.push(`${dir}: no challenge files found`);
  }

  for (const name of names) {
    let raw;
    try {
      raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch {
      problems.push(`${name}: not valid JSON`);
      continue;
    }

    const result = ChallengeFileSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
        problems.push(`${name}: ${where}${issue.message}`);
      }
      continue;
    }

    if (name !== `${result.data.id}.json`) {
      problems.push(`${name}: file name must be "${result.data.id}.json"`);
    }
    for (const problem of checkSemantics(result.data)) {
      problems.push(`${name}: ${problem}`);
    }
  }

  return { checked: names.length, problems };
}

async function main() {
  // Optional directory argument (used by tests): node validate-challenges.js [dir]
  const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_DIR;
  let result;
  try {
    result = await validateChallengeDir(dir);
  } catch {
    console.error(`${dir}: cannot read directory`);
    process.exitCode = 1;
    return;
  }
  const { checked, problems } = result;
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`${problems.length} problem(s) in ${checked} file(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${checked} challenge file(s) valid`);
}

const runDirectly =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase();

if (runDirectly) {
  await main();
}
