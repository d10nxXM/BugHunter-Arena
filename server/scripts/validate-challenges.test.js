import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CHALLENGES_DIR, loadFindMaxFile } from '../test/fixtures.js';
import { validateChallengeDir } from './validate-challenges.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bha-validate-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name, value) {
  writeFileSync(
    join(dir, name),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}

function withTests(tests) {
  return { ...loadFindMaxFile(), tests_json: tests };
}

describe('validateChallengeDir', () => {
  it('passes the real challenge directory', async () => {
    const result = await validateChallengeDir(CHALLENGES_DIR);
    expect(result.problems).toEqual([]);
    expect(result.checked).toBeGreaterThanOrEqual(1);
  });

  it('passes a valid file', async () => {
    write('find-max.json', loadFindMaxFile());
    const result = await validateChallengeDir(dir);
    expect(result).toEqual({ checked: 1, problems: [] });
  });

  it('reports an empty directory', async () => {
    const result = await validateChallengeDir(dir);
    expect(result.problems.length).toBe(1);
  });

  it('reports broken JSON with the file name and keeps going', async () => {
    write('bad.json', '{ nope');
    write('find-max.json', loadFindMaxFile());
    const result = await validateChallengeDir(dir);
    expect(result.checked).toBe(2);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^bad\.json: /);
  });

  it('reports a file name that differs from the id', async () => {
    write('other.json', loadFindMaxFile());
    const { problems } = await validateChallengeDir(dir);
    expect(problems.some((p) => p.startsWith('other.json:'))).toBe(true);
    expect(problems.join('\n')).toContain('find-max.json');
  });

  it.each([2, 4])('reports hints_json with %i entries', async (n) => {
    const file = loadFindMaxFile();
    file.hints_json = Array.from({ length: n }, (_, i) => `h${i}`);
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.some((p) => p.startsWith('find-max.json:'))).toBe(true);
  });

  it('reports an unknown extra field', async () => {
    write('find-max.json', { ...loadFindMaxFile(), extra: 1 });
    const { problems } = await validateChallengeDir(dir);
    expect(problems).not.toEqual([]);
  });

  it('reports a test without failsOnOriginal', async () => {
    const file = loadFindMaxFile();
    delete file.tests_json[2].failsOnOriginal;
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.join('\n')).toMatch(/failsOnOriginal/);
  });

  it('reports when no hidden test fails on the original', async () => {
    const file = loadFindMaxFile();
    file.tests_json = file.tests_json.map((t) => ({
      ...t,
      failsOnOriginal: false,
    }));
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.join('\n')).toMatch(/hidden test/);
  });

  it('reports when every visible test fails on the original', async () => {
    const file = loadFindMaxFile();
    file.tests_json = file.tests_json.map((t) =>
      t.visible ? { ...t, failsOnOriginal: true } : t,
    );
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.join('\n')).toMatch(/visible/);
  });

  it('reports a bug line outside the code', async () => {
    const file = loadFindMaxFile();
    file.bug_lines = [99];
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.join('\n')).toMatch(/bug_lines/);
  });

  it('ignores non-json files', async () => {
    write('notes.txt', 'hello');
    write('find-max.json', loadFindMaxFile());
    expect((await validateChallengeDir(dir)).problems).toEqual([]);
  });

  it('withTests helper keeps the fixture valid', async () => {
    write('find-max.json', withTests(loadFindMaxFile().tests_json));
    expect((await validateChallengeDir(dir)).problems).toEqual([]);
  });
});

describe('hints_json length', () => {
  it.each([0, 1, 2, 4])('reports %i hints', async (n) => {
    const file = loadFindMaxFile();
    file.hints_json = Array.from({ length: n }, (_, i) => `hint ${i}`);
    write('find-max.json', file);
    const { problems } = await validateChallengeDir(dir);
    expect(problems.some((p) => p.includes('hints_json'))).toBe(true);
  });
});

describe('validate-challenges.js CLI', () => {
  const script = fileURLToPath(
    new URL('./validate-challenges.js', import.meta.url),
  );
  it('exits 0 on the real challenges', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('OK');
  });
});

describe('validate-challenges.js CLI', () => {
  const script = fileURLToPath(
    new URL('./validate-challenges.js', import.meta.url),
  );
  const run = (arg) =>
    spawnSync(process.execPath, [script, arg], { encoding: 'utf8' });

  it('exits 1 and names the file for an invalid directory', () => {
    write('bad.json', '{ nope');
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('bad.json');
  });

  it('exits 1 for a missing directory', () => {
    expect(run(join(dir, 'missing')).status).toBe(1);
  });

  it('exits 0 for a valid directory', () => {
    write('find-max.json', loadFindMaxFile());
    expect(run(dir).status).toBe(0);
  });
});

describe('validate-challenges.js source', () => {
  it('never imports code-execution modules', () => {
    const src = readFileSync(
      new URL('./validate-challenges.js', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/child_process|node:vm|\beval\s*\(|new Function/);
  });
});
