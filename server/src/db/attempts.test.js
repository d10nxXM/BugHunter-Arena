import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('./client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const {
  FK_VIOLATION,
  insertAttempt,
  getAttemptForEvaluation,
  completeEvaluation,
  listAttemptSummaries,
  getChallengeCategories,
  EVALUATION_COLUMNS,
  SUMMARY_COLUMNS,
} = await import('./attempts.js');

const columnsOf = (select) => select.split(',').map((c) => c.trim());

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

function install(options) {
  const fake = createFakeSupabase(options);
  state.db = fake.db;
  return fake;
}

const summary = (id, challenge_id, created_at, user_id = U) => ({
  id,
  user_id,
  challenge_id,
  status: 'evaluated',
  score: 50,
  created_at,
});

describe('FK_VIOLATION', () => {
  it('is the Postgres foreign key violation code', () => {
    expect(FK_VIOLATION).toBe('23503');
  });
});

describe('insertAttempt', () => {
  it('returns the new id', async () => {
    const { tables } = install({ tables: { attempts: [] } });
    const id = await insertAttempt({ challenge_id: 'a', user_id: null });
    expect(id).toBe(tables.attempts[0].id);
    expect(tables.attempts[0].status).toBe('submitted');
  });

  it('throws with the database error as cause', async () => {
    const dbError = { code: FK_VIOLATION, message: 'fk' };
    install({ insertError: dbError });
    await expect(insertAttempt({})).rejects.toMatchObject({
      message: 'insertAttempt failed',
      cause: dbError,
    });
  });
});

describe('getAttemptForEvaluation', () => {
  it('returns the row', async () => {
    install({ tables: { attempts: [summary('x', 'a', '2026-01-01')] } });
    await expect(getAttemptForEvaluation('x')).resolves.toMatchObject({
      id: 'x',
    });
  });

  it('selects exactly the evaluation columns, filtered by id', async () => {
    const { calls } = install({ tables: { attempts: [] } });
    await getAttemptForEvaluation('x');
    expect(calls.selects).toEqual([
      { table: 'attempts', columns: EVALUATION_COLUMNS },
    ]);
    expect(columnsOf(EVALUATION_COLUMNS).sort()).toEqual(
      [
        'challenge_id',
        'edge_case',
        'explanation',
        'fixed_code',
        'hints_used',
        'id',
        'selected_lines',
        'status',
        'user_id',
      ].sort(),
    );
    expect(calls.filters).toEqual([
      { table: 'attempts', column: 'id', value: 'x' },
    ]);
  });

  it('returns null for an unknown id', async () => {
    install({ tables: { attempts: [] } });
    await expect(getAttemptForEvaluation('nope')).resolves.toBeNull();
  });

  it('throws on a database error', async () => {
    install({ error: { message: 'boom' } });
    await expect(getAttemptForEvaluation('x')).rejects.toThrow(
      'getAttemptForEvaluation failed',
    );
  });
});

describe('completeEvaluation', () => {
  it('true when it evaluated a submitted attempt', async () => {
    const { tables } = install({
      tables: { attempts: [{ id: 'x', status: 'submitted' }] },
    });
    await expect(completeEvaluation('x', { score: 80 })).resolves.toBe(true);
    expect(tables.attempts[0]).toMatchObject({
      status: 'evaluated',
      score: 80,
    });
  });

  it('false when the attempt is already evaluated', async () => {
    install({ tables: { attempts: [{ id: 'x', status: 'evaluated' }] } });
    await expect(completeEvaluation('x', { score: 1 })).resolves.toBe(false);
  });

  it('throws on a database error', async () => {
    install({ updateError: { message: 'boom' } });
    await expect(completeEvaluation('x', {})).rejects.toThrow(
      'completeEvaluation failed',
    );
  });
});

describe('listAttemptSummaries', () => {
  const rows = () => [
    summary('a1', 'a', '2026-01-01T00:00:00.000Z'),
    summary('b1', 'b', '2026-01-02T00:00:00.000Z'),
    summary('a2', 'a', '2026-01-03T00:00:00.000Z'),
    summary('a3', 'a', '2026-01-03T00:00:00.000Z'),
    summary('o1', 'a', '2026-01-04T00:00:00.000Z', OTHER),
  ];

  it('one user, newest first, then id desc, default limit 1000', async () => {
    const { calls } = install({ tables: { attempts: rows() } });
    const out = await listAttemptSummaries(U);
    expect(out.map((r) => r.id)).toEqual(['a3', 'a2', 'b1', 'a1']);
    expect(calls.filters).toEqual([
      { table: 'attempts', column: 'user_id', value: U },
    ]);
    expect(calls.ranges).toEqual([]);
    expect(calls.orders).toEqual([
      { table: 'attempts', column: 'created_at', ascending: false },
      { table: 'attempts', column: 'id', ascending: false },
    ]);
    expect(calls.limits).toEqual([{ table: 'attempts', limit: 1000 }]);
  });

  it('selects only the summary columns, never student text or feedback', async () => {
    const { calls } = install({ tables: { attempts: rows() } });
    await listAttemptSummaries(U);
    expect(calls.selects).toEqual([
      { table: 'attempts', columns: SUMMARY_COLUMNS },
    ]);
    const columns = columnsOf(calls.selects[0].columns);
    for (const banned of [
      '*',
      'explanation',
      'fixed_code',
      'test_results',
      'ai_feedback',
    ]) {
      expect(columns).not.toContain(banned);
    }
    expect(calls.selects[0].columns).not.toContain('*');
  });

  it('filters by challenge', async () => {
    const { calls } = install({ tables: { attempts: rows() } });
    const out = await listAttemptSummaries(U, { challengeId: 'b' });
    expect(out.map((r) => r.id)).toEqual(['b1']);
    expect(calls.filters).toContainEqual({
      table: 'attempts',
      column: 'challenge_id',
      value: 'b',
    });
  });

  it('applies before (created_at < before) and the limit', async () => {
    const { calls } = install({ tables: { attempts: rows() } });
    const out = await listAttemptSummaries(U, {
      challengeId: 'a',
      before: '2026-01-03T00:00:00.000Z',
      limit: 5,
    });
    expect(out.map((r) => r.id)).toEqual(['a1']);
    expect(calls.ranges).toEqual([
      {
        table: 'attempts',
        column: 'created_at',
        op: 'lt',
        value: '2026-01-03T00:00:00.000Z',
      },
    ]);
    expect(calls.limits).toEqual([{ table: 'attempts', limit: 5 }]);
  });

  it('compares the cursor as an instant: +00:00 cursor against stored Z', async () => {
    install({ tables: { attempts: rows() } });
    const out = await listAttemptSummaries(U, {
      before: '2026-01-03T00:00:00+00:00',
    });
    // Equal instant is not < cursor, so a2/a3 are excluded.
    expect(out.map((r) => r.id)).toEqual(['b1', 'a1']);
  });

  it('compares a +02:00 cursor as the same instant in UTC', async () => {
    install({ tables: { attempts: rows() } });
    // 2026-01-03T01:00:00+02:00 is 2026-01-02T23:00:00Z.
    const before = await listAttemptSummaries(U, {
      before: '2026-01-03T01:00:00+02:00',
    });
    expect(before.map((r) => r.id)).toEqual(['b1', 'a1']);
    // 2026-01-03T02:00:01+02:00 is 2026-01-03T00:00:01Z, after a2/a3.
    const after = await listAttemptSummaries(U, {
      before: '2026-01-03T02:00:01+02:00',
    });
    expect(after.map((r) => r.id)).toEqual(['a3', 'a2', 'b1', 'a1']);
  });

  it('returns at most limit rows', async () => {
    install({ tables: { attempts: rows() } });
    const out = await listAttemptSummaries(U, { limit: 1 });
    expect(out.map((r) => r.id)).toEqual(['a3']);
  });

  it('gives [] when data is null', async () => {
    state.db = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          lt: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: null, error: null }),
        };
        return chain;
      },
    };
    await expect(listAttemptSummaries(U)).resolves.toEqual([]);
  });

  it('throws on a database error', async () => {
    install({ error: { message: 'boom' } });
    await expect(listAttemptSummaries(U)).rejects.toThrow(
      'listAttemptSummaries failed',
    );
  });
});

describe('getChallengeCategories', () => {
  it('maps challenge id to bug category', async () => {
    install({
      tables: {
        challenges: [
          { id: 'a', bug_category: 'A' },
          { id: 'b', bug_category: 'B' },
        ],
      },
    });
    const map = await getChallengeCategories();
    expect([...map]).toEqual([
      ['a', 'A'],
      ['b', 'B'],
    ]);
  });

  it('gives an empty Map when data is null', async () => {
    state.db = {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: null }),
      }),
    };
    const map = await getChallengeCategories();
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it('throws on a database error', async () => {
    install({ error: { message: 'boom' } });
    await expect(getChallengeCategories()).rejects.toThrow(
      'getChallengeCategories failed',
    );
  });
});
