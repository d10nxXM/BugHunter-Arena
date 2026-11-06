import { describe, it, expect } from 'vitest';
import { computeProfile } from './profileService.js';

const ACCOUNT = {
  id: 'u1',
  handle: 'dion_m',
  displayName: 'dion_m',
  memberSince: '2026-11-01T00:00:00Z',
  authUserId: 'auth-secret-id',
};

const meta = (entries) =>
  new Map(
    entries.map(([id, language = 'python']) => [
      id,
      {
        title: `Title ${id}`,
        language,
        difficulty: 'easy',
        bugCategory: `Cat ${id}`,
      },
    ]),
  );

let seq = 0;
const row = (challenge_id, score, created_at, extra = {}) => ({
  id: `r${String((seq += 1)).padStart(4, '0')}`,
  challenge_id,
  status: 'evaluated',
  score,
  score_breakdown: { lineIdentification: 40 },
  duration: 60,
  created_at,
  ...extra,
});

describe('computeProfile', () => {
  it('a user with no attempts', () => {
    expect(computeProfile(ACCOUNT, [], meta([['a'], ['b']]))).toEqual({
      handle: 'dion_m',
      displayName: 'dion_m',
      memberSince: '2026-11-01T00:00:00Z',
      rank: { name: 'Larva', xp: 0, nextName: 'Hunter', xpToNext: 100 },
      totalXp: 0,
      solved: 0,
      attempted: 0,
      challengesAvailable: 2,
      solvedByLanguage: [],
      recentSolves: [],
    });
  });

  it('XP from first solves, rank, counts and the exact keys', () => {
    const rows = [
      row('a', 100, '2026-11-06T12:00:00Z'),
      row('a', 75, '2026-11-06T10:00:00Z'),
      row('b', 99, '2026-11-06T11:00:00Z'),
      row('c', 40, '2026-11-06T09:00:00Z'),
    ];
    const p = computeProfile(ACCOUNT, rows, meta([['a'], ['b'], ['c'], ['d']]));
    expect(Object.keys(p).sort()).toEqual(
      [
        'attempted',
        'challengesAvailable',
        'displayName',
        'handle',
        'memberSince',
        'rank',
        'recentSolves',
        'solved',
        'solvedByLanguage',
        'totalXp',
      ].sort(),
    );
    expect(p.totalXp).toBe(174);
    expect(p.rank).toEqual({
      name: 'Hunter',
      xp: 174,
      nextName: 'Exterminator',
      xpToNext: 26,
    });
    expect(p.solved).toBe(2);
    expect(p.attempted).toBe(3);
    expect(p.challengesAvailable).toBe(4);
    expect(p.recentSolves).toEqual([
      {
        challengeId: 'b',
        title: 'Title b',
        language: 'python',
        difficulty: 'easy',
        bestScore: 99,
        solvedAt: '2026-11-06T11:00:00Z',
      },
      {
        challengeId: 'a',
        title: 'Title a',
        language: 'python',
        difficulty: 'easy',
        bestScore: 100,
        solvedAt: '2026-11-06T10:00:00Z',
      },
    ]);
  });

  it('top rank at 300 XP', () => {
    const rows = ['a', 'b', 'c'].map((id) =>
      row(id, 100, '2026-11-06T10:00:00Z'),
    );
    expect(
      computeProfile(ACCOUNT, rows, meta([['a'], ['b'], ['c']])).rank,
    ).toEqual({
      name: 'Arena Legend',
      xp: 300,
      nextName: null,
      xpToNext: 0,
    });
  });

  it('groups solved challenges by language, most first, ties by name', () => {
    const rows = [
      row('p1', 80, '2026-11-06T10:00:00Z'),
      row('p2', 80, '2026-11-06T10:00:00Z'),
      row('j1', 80, '2026-11-06T10:00:00Z'),
      row('j2', 50, '2026-11-06T10:00:00Z'),
      row('z1', 90, '2026-11-06T10:00:00Z'),
    ];
    const m = meta([
      ['p1', 'python'],
      ['p2', 'python'],
      ['j1', 'javascript'],
      ['j2', 'javascript'],
      ['z1', 'zig'],
    ]);
    expect(computeProfile(ACCOUNT, rows, m).solvedByLanguage).toEqual([
      { language: 'python', solved: 2 },
      { language: 'javascript', solved: 1 },
      { language: 'zig', solved: 1 },
    ]);
  });

  it('recentSolves: newest first, at most 10', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const rows = ids.map((id, i) =>
      row(id, 80, `2026-11-06T${String(i).padStart(2, '0')}:00:00Z`),
    );
    const p = computeProfile(ACCOUNT, rows, meta(ids.map((id) => [id])));
    expect(p.recentSolves).toHaveLength(10);
    expect(p.recentSolves.map((s) => s.challengeId)).toEqual(
      ids.slice(2).reverse(),
    );
  });

  it('a solved challenge missing from meta counts in totals only', () => {
    const rows = [
      row('gone', 90, '2026-11-06T10:00:00Z'),
      row('a', 80, '2026-11-06T10:00:00Z'),
    ];
    const p = computeProfile(ACCOUNT, rows, meta([['a']]));
    expect(p.totalXp).toBe(170);
    expect(p.solved).toBe(2);
    expect(p.recentSolves.map((s) => s.challengeId)).toEqual(['a']);
    expect(p.solvedByLanguage).toEqual([{ language: 'python', solved: 1 }]);
  });

  it('never exposes the auth id, weak categories or feedback', () => {
    const rows = [
      row('a', 30, '2026-11-06T10:00:00Z', {
        ai_feedback: { feedback: 'secret feedback' },
        explanation: 'secret explanation',
      }),
    ];
    const text = JSON.stringify(computeProfile(ACCOUNT, rows, meta([['a']])));
    expect(text).not.toContain('auth-secret-id');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('Cat a');
  });
});
