import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: {
    from: (...args) => state.db.from(...args),
    rpc: (...args) => state.db.rpc(...args),
  },
}));

const { app } = await import('../app.js');
const { resetLeaderboardCache } =
  await import('../services/leaderboardService.js');

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const GUEST = '00000000-0000-4000-8000-000000000003';
const U4 = '00000000-0000-4000-8000-000000000004';

const attempt = (id, user_id, challenge_id, score, created_at) => ({
  id,
  user_id,
  challenge_id,
  status: 'evaluated',
  score,
  created_at,
});

function seed() {
  return createFakeSupabase({
    tables: {
      users: [
        {
          id: U1,
          display_name: 'alice_1',
          handle: 'alice_1',
          auth_user_id: 'a1',
        },
        { id: U2, display_name: 'bob_2', handle: 'bob_2', auth_user_id: 'a2' },
        {
          id: GUEST,
          display_name: 'Guest Gus',
          handle: null,
          auth_user_id: null,
        },
        {
          id: U4,
          display_name: 'zero_4',
          handle: 'zero_4',
          auth_user_id: 'a4',
        },
      ],
      attempts: [
        // alice: first solve of find-max is 75 (the later 100 never counts).
        attempt('a-1', U1, 'find-max', 75, '2026-11-06T10:00:00Z'),
        attempt('a-2', U1, 'find-max', 100, '2026-11-06T11:00:00Z'),
        attempt('a-3', U1, 'binary-search', 90, '2026-11-06T12:00:00Z'),
        // bob: 95 on one challenge, one unsolved and one not evaluated.
        attempt('b-1', U2, 'find-max', 95, '2026-11-05T10:00:00Z'),
        attempt('b-2', U2, 'binary-search', 40, '2026-11-05T11:00:00Z'),
        {
          ...attempt(
            'b-3',
            U2,
            'remove-negatives',
            null,
            '2026-11-05T12:00:00Z',
          ),
          status: 'submitted',
        },
        // a guest with a high score is never listed.
        attempt('g-1', GUEST, 'find-max', 100, '2026-11-04T10:00:00Z'),
        // zero_4 never solved anything.
        attempt('z-1', U4, 'find-max', 30, '2026-11-04T10:00:00Z'),
      ],
    },
  });
}

beforeEach(() => {
  resetLeaderboardCache();
  state.db = seed().db;
});

describe('GET /api/leaderboard', () => {
  it('200 with ranked accounts only, first-solve XP and the documented keys', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'entries',
      'total',
      'updatedAt',
    ]);
    expect(res.body.total).toBe(2);
    expect(res.body.entries).toEqual([
      {
        position: 1,
        handle: 'alice_1',
        totalXp: 165,
        rankName: 'Hunter',
        solved: 2,
      },
      {
        position: 2,
        handle: 'bob_2',
        totalXp: 95,
        rankName: 'Larva',
        solved: 1,
      },
    ]);
  });

  it('never returns ids, guest names or auth ids', async () => {
    const res = await request(app).get('/api/leaderboard');
    for (const secret of [
      U1,
      U2,
      GUEST,
      'Guest Gus',
      'a1',
      'auth_user_id',
      'email',
    ]) {
      expect(res.text).not.toContain(secret);
    }
  });

  it('limit caps the entries but not the total', async () => {
    const res = await request(app).get('/api/leaderboard?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.handle)).toEqual(['alice_1']);
    expect(res.body.total).toBe(2);
  });

  it('two first solves at the same instant: the smaller id is the first solve', async () => {
    const T = '2026-11-07T10:00:00Z';
    state.db = createFakeSupabase({
      tables: {
        users: [
          {
            id: U1,
            display_name: 'alice_1',
            handle: 'alice_1',
            auth_user_id: 'a1',
          },
        ],
        attempts: [
          attempt(
            '00000000-0000-4000-8000-00000000000b',
            U1,
            'find-max',
            100,
            T,
          ),
          attempt(
            '00000000-0000-4000-8000-00000000000a',
            U1,
            'find-max',
            72,
            T,
          ),
        ],
      },
    }).db;
    const res = await request(app).get('/api/leaderboard');
    expect(res.body.entries).toEqual([
      {
        position: 1,
        handle: 'alice_1',
        totalXp: 72,
        rankName: 'Larva',
        solved: 1,
      },
    ]);
  });

  it('400 for a repeated limit', async () => {
    const res = await request(app).get('/api/leaderboard?limit=1&limit=2');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['0', '101', '1.5', 'abc', '-1', ''])(
    '400 for limit=%s',
    async (limit) => {
      const res = await request(app).get(`/api/leaderboard?limit=${limit}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('500 with the fixed message when the database fails', async () => {
    state.db = createFakeSupabase({ error: { message: 'boom' } }).db;
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('boom');
  });
});

describe('GET /api/profiles/:handle globalPosition', () => {
  it('is the leaderboard position, or null at 0 XP', async () => {
    const bob = await request(app).get('/api/profiles/bob_2');
    expect(bob.status).toBe(200);
    expect(bob.body.globalPosition).toBe(2);
    const zero = await request(app).get('/api/profiles/zero_4');
    expect(zero.status).toBe(200);
    expect(zero.body.globalPosition).toBeNull();
  });

  it('is null (and the profile still loads) when the leaderboard read fails', async () => {
    const fake = seed();
    fake.db.rpc = () =>
      Promise.resolve({ data: null, error: { message: 'x' } });
    state.db = fake.db;
    const res = await request(app).get('/api/profiles/alice_1');
    expect(res.status).toBe(200);
    expect(res.body.globalPosition).toBeNull();
    expect(res.body.totalXp).toBe(165);
  });
});
