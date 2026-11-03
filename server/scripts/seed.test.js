import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeSupabase } from '../test/fakeSupabase.js';
import { CHALLENGES_DIR, loadFindMaxFile } from '../test/fixtures.js';
import { loadChallengeFiles, seed } from './seed.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bha-seed-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeJson(name, value) {
  writeFileSync(
    join(dir, name),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}

describe('loadChallengeFiles', () => {
  it('loads and validates the real challenge directory', async () => {
    const files = await loadChallengeFiles(CHALLENGES_DIR);
    expect(files.map((f) => f.id)).toContain('find-max');
    expect(files.find((f) => f.id === 'find-max')).toEqual(loadFindMaxFile());
  });

  it('loads every valid .json file in a directory and ignores other files', async () => {
    const file = loadFindMaxFile();
    writeJson('find-max.json', file);
    writeJson('second.json', { ...file, id: 'second' });
    writeFileSync(join(dir, 'README.txt'), 'not a challenge');
    const files = await loadChallengeFiles(dir);
    expect(files.map((f) => f.id).sort()).toEqual(['find-max', 'second']);
  });

  it('rejects a file whose name does not match its id, naming the file', async () => {
    writeJson('wrong-name.json', loadFindMaxFile());
    await expect(async () => loadChallengeFiles(dir)).rejects.toThrow(
      /wrong-name\.json/,
    );
  });

  it('rejects a file with fewer than 3 hints, naming the file', async () => {
    const file = loadFindMaxFile();
    writeJson('find-max.json', {
      ...file,
      hints_json: file.hints_json.slice(0, 2),
    });
    await expect(async () => loadChallengeFiles(dir)).rejects.toThrow(
      /find-max\.json/,
    );
  });

  it('rejects a file that is not valid JSON, naming the file', async () => {
    writeJson('broken.json', '{ not json');
    await expect(async () => loadChallengeFiles(dir)).rejects.toThrow(
      /broken\.json/,
    );
  });

  it('rejects when one of several files is bad', async () => {
    const file = loadFindMaxFile();
    writeJson('find-max.json', file);
    writeJson('bad.json', { ...file, id: 'bad', language: 'ruby' });
    await expect(async () => loadChallengeFiles(dir)).rejects.toThrow(
      /bad\.json/,
    );
  });
});

describe('seed', () => {
  it('upserts all rows in a single call with onConflict "id"', async () => {
    const file = loadFindMaxFile();
    writeJson('find-max.json', file);
    writeJson('second.json', { ...file, id: 'second' });
    const { db, calls } = createFakeSupabase();

    const result = await seed({ db, dir });

    expect(calls.upserts).toHaveLength(1);
    const [upsert] = calls.upserts;
    expect(upsert.table).toBe('challenges');
    expect(upsert.options).toEqual({ onConflict: 'id' });
    expect(upsert.rows.map((r) => r.id).sort()).toEqual(['find-max', 'second']);
    expect(upsert.rows.find((r) => r.id === 'find-max')).toEqual(file);
    expect(result).toEqual({ count: 2 });
  });

  it('seeds the real challenge directory', async () => {
    const { db, calls } = createFakeSupabase();
    await seed({ db, dir: CHALLENGES_DIR });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0].rows.map((r) => r.id)).toContain('find-max');
  });

  it('writes nothing when any file is invalid', async () => {
    const file = loadFindMaxFile();
    writeJson('find-max.json', file);
    writeJson('bad.json', { ...file, id: 'bad', hints_json: ['only one'] });
    const { db, calls } = createFakeSupabase();

    await expect(seed({ db, dir })).rejects.toThrow(/bad\.json/);
    expect(calls.upserts).toHaveLength(0);
    expect(calls.from).toEqual([]);
  });

  it('passes an upsert error on as cause', async () => {
    writeJson('find-max.json', loadFindMaxFile());
    const dbError = { message: 'permission denied', code: '42501' };
    const { db } = createFakeSupabase({ upsertError: dbError });

    const err = await seed({ db, dir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(dbError);
  });
});
