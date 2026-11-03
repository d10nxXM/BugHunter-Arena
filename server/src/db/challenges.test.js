import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import {
  API_DETAIL_EXAMPLE,
  API_LIST_EXAMPLE,
  HIDDEN_COLUMNS,
  loadFindMaxRow,
} from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('./client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const { listPublicChallenges, getPublicChallenge, HINT_LEVELS } =
  await import('./challenges.js');

function install(options) {
  const fake = createFakeSupabase(options);
  state.db = fake.db;
  return fake.calls;
}

function columnsOf(selectString) {
  return selectString.split(',').map((c) => c.trim());
}

describe('HINT_LEVELS', () => {
  it('is 3', () => {
    expect(HINT_LEVELS).toBe(3);
  });
});

describe('listPublicChallenges', () => {
  let calls;
  beforeEach(() => {
    calls = install({ tables: { challenges: [loadFindMaxRow()] } });
  });

  it('returns camelCase summaries matching the API.md example', async () => {
    expect(await listPublicChallenges()).toEqual(API_LIST_EXAMPLE);
  });

  it('queries only the challenges table', async () => {
    await listPublicChallenges();
    expect(calls.from).toEqual(['challenges']);
  });

  it('never selects a hidden column or *', async () => {
    await listPublicChallenges();
    expect(calls.selects).toHaveLength(1);
    const columns = columnsOf(calls.selects[0].columns);
    expect(columns).not.toContain('*');
    for (const hidden of HIDDEN_COLUMNS) {
      expect(columns).not.toContain(hidden);
    }
  });

  it('returns only the five summary keys even when the row has more', async () => {
    const [item] = await listPublicChallenges();
    expect(Object.keys(item).sort()).toEqual(
      ['bugCategory', 'difficulty', 'id', 'language', 'title'].sort(),
    );
  });

  it('orders by created_at, then id', async () => {
    const base = loadFindMaxRow();
    install({
      tables: {
        challenges: [
          { ...base, id: 'b-second', created_at: '2025-01-01T00:00:00Z' },
          { ...base, id: 'c-late', created_at: '2025-03-01T00:00:00Z' },
          { ...base, id: 'a-first', created_at: '2025-01-01T00:00:00Z' },
          { ...base, id: 'z-early', created_at: '2024-12-01T00:00:00Z' },
        ],
      },
    });
    const items = await listPublicChallenges();
    expect(items.map((i) => i.id)).toEqual([
      'z-early',
      'a-first',
      'b-second',
      'c-late',
    ]);
  });

  it('returns an empty array when there are no challenges', async () => {
    install({ tables: { challenges: [] } });
    expect(await listPublicChallenges()).toEqual([]);
  });

  it('throws with the original db error as cause', async () => {
    const dbError = { message: 'db exploded', code: 'XX000' };
    install({ error: dbError });
    const err = await listPublicChallenges().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(dbError);
  });
});

describe('getPublicChallenge', () => {
  let calls;
  beforeEach(() => {
    calls = install({ tables: { challenges: [loadFindMaxRow()] } });
  });

  it('returns the camelCase shape from API.md with hintCount 3', async () => {
    const result = await getPublicChallenge('find-max');
    expect(result).toEqual(API_DETAIL_EXAMPLE);
    expect(result.hintCount).toBe(3);
  });

  it('filters by id on the challenges table', async () => {
    await getPublicChallenge('find-max');
    expect(calls.from).toEqual(['challenges']);
    expect(calls.filters).toEqual([
      { table: 'challenges', column: 'id', value: 'find-max' },
    ]);
  });

  it('exposes only t1 and t2, each as { id, args, expected }', async () => {
    const { visibleTests } = await getPublicChallenge('find-max');
    expect(visibleTests.map((t) => t.id)).toEqual(['t1', 't2']);
    for (const t of visibleTests) {
      expect(Object.keys(t).sort()).toEqual(['args', 'expected', 'id']);
    }
    expect(JSON.stringify(visibleTests)).not.toContain('-10');
  });

  it('never selects a hidden column or *', async () => {
    await getPublicChallenge('find-max');
    expect(calls.selects).toHaveLength(1);
    const columns = columnsOf(calls.selects[0].columns);
    expect(columns).not.toContain('*');
    for (const hidden of HIDDEN_COLUMNS) {
      expect(columns).not.toContain(hidden);
    }
  });

  it('maps fields explicitly: unknown columns in the row do not pass through', async () => {
    const row = {
      ...loadFindMaxRow(),
      future_secret: 'nope',
      internal_note: 'nope',
    };
    install({ tables: { challenges: [row] } });
    const result = await getPublicChallenge('find-max');
    expect(Object.keys(result).sort()).toEqual(
      Object.keys(API_DETAIL_EXAMPLE).sort(),
    );
    expect(JSON.stringify(result)).not.toContain('nope');
  });

  it('returns null when the challenge does not exist', async () => {
    expect(await getPublicChallenge('does-not-exist')).toBeNull();
  });

  it('throws with the original db error as cause', async () => {
    const dbError = { message: 'db exploded', code: 'XX000' };
    install({ error: dbError });
    const err = await getPublicChallenge('find-max').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(dbError);
  });
});

describe('getChallengeHints', () => {
  it('selects only id and hints_json and returns the hints', async () => {
    const calls = install({ tables: { challenges: [loadFindMaxRow()] } });
    const { getChallengeHints } = await import('./challenges.js');
    const result = await getChallengeHints('find-max');
    expect(result).toEqual({ hints: loadFindMaxRow().hints_json });
    expect(columnsOf(calls.selects[0].columns)).toEqual(['id', 'hints_json']);
  });

  it('returns null for an unknown id and throws on db error', async () => {
    const { getChallengeHints } = await import('./challenges.js');
    install({ tables: { challenges: [] } });
    expect(await getChallengeHints('nope')).toBeNull();
    install({ error: { message: 'x' } });
    await expect(getChallengeHints('nope')).rejects.toThrow(
      'getChallengeHints failed',
    );
  });
});

describe('getFullChallenge', () => {
  it('returns the full row, or null', async () => {
    const { getFullChallenge } = await import('./challenges.js');
    install({ tables: { challenges: [loadFindMaxRow()] } });
    const full = await getFullChallenge('find-max');
    expect(full.reference_solution).toBe(loadFindMaxRow().reference_solution);
    expect(full.bug_lines).toEqual([2]);
    expect(full.tests_json).toHaveLength(4);
    expect(await getFullChallenge('nope')).toBeNull();
  });

  it('selects an explicit column list, never *', async () => {
    const { getFullChallenge } = await import('./challenges.js');
    const calls = install({ tables: { challenges: [loadFindMaxRow()] } });
    await getFullChallenge('find-max');
    const sel = calls.selects[0].columns;
    expect(sel).not.toContain('*');
    expect(sel).not.toContain('created_at');
    expect(columnsOf(sel)).toContain('reference_solution');
  });

  it('throws on db error', async () => {
    const { getFullChallenge } = await import('./challenges.js');
    install({ error: { message: 'x' } });
    await expect(getFullChallenge('a')).rejects.toThrow(
      'getFullChallenge failed',
    );
  });
});
