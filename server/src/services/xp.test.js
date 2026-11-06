import { describe, it, expect } from 'vitest';
import { computeXp, rankForXp, RANKS } from './scoringService.js';

const row = (challenge_id, score, created_at, extra = {}) => ({
  id: extra.id ?? `${challenge_id}-${created_at}`,
  challenge_id,
  status: 'evaluated',
  score,
  created_at,
  ...extra,
});

describe('computeXp (docs/SCORING.md, XP and ranks)', () => {
  it('no attempts gives 0 XP and an empty map', () => {
    const { totalXp, byChallenge } = computeXp([]);
    expect(totalXp).toBe(0);
    expect(byChallenge.size).toBe(0);
  });

  it('XP is the score of the first solving attempt, not the best', () => {
    // Rows newest first, as the DB returns them.
    const { totalXp, byChallenge } = computeXp([
      row('a', 100, '2026-11-06T12:00:00Z'),
      row('a', 75, '2026-11-06T11:00:00Z'),
      row('a', 50, '2026-11-06T10:00:00Z'),
    ]);
    expect(byChallenge.get('a')).toEqual({
      xp: 75,
      solvedAt: '2026-11-06T11:00:00Z',
    });
    expect(totalXp).toBe(75);
  });

  it('an unsolved challenge gives 0 XP and no solvedAt', () => {
    const { totalXp, byChallenge } = computeXp([
      row('a', 69, '2026-11-06T10:00:00Z'),
    ]);
    expect(byChallenge.get('a')).toEqual({ xp: 0, solvedAt: null });
    expect(totalXp).toBe(0);
  });

  it('exactly 70 solves; submitted attempts never solve', () => {
    const { byChallenge } = computeXp([
      row('a', 70, '2026-11-06T10:00:00Z'),
      row('b', null, '2026-11-06T09:00:00Z', { status: 'submitted' }),
    ]);
    expect(byChallenge.get('a').xp).toBe(70);
    expect(byChallenge.get('b')).toEqual({ xp: 0, solvedAt: null });
  });

  it('compares created_at as instants across offsets, ties by id', () => {
    const { byChallenge } = computeXp([
      // 11:30+02:00 is 09:30Z, earlier than 10:00Z.
      row('a', 90, '2026-11-06T10:00:00Z'),
      row('a', 80, '2026-11-06T11:30:00+02:00'),
      row('b', 95, '2026-11-06T10:00:00Z', { id: 'bbb' }),
      row('b', 85, '2026-11-06T10:00:00Z', { id: 'aaa' }),
    ]);
    expect(byChallenge.get('a').xp).toBe(80);
    expect(byChallenge.get('b').xp).toBe(85);
  });

  it('sums over challenges', () => {
    const { totalXp } = computeXp([
      row('a', 80, '2026-11-06T10:00:00Z'),
      row('b', 90, '2026-11-06T10:00:00Z'),
      row('c', 10, '2026-11-06T10:00:00Z'),
    ]);
    expect(totalXp).toBe(170);
  });
});

describe('rankForXp', () => {
  it('tiers match the client and the spec', () => {
    expect(RANKS.map((r) => [r.name, r.minXp])).toEqual([
      ['Larva', 0],
      ['Hunter', 100],
      ['Exterminator', 200],
      ['Arena Legend', 300],
    ]);
  });

  it.each([
    [0, { name: 'Larva', xp: 0, nextName: 'Hunter', xpToNext: 100 }],
    [99, { name: 'Larva', xp: 99, nextName: 'Hunter', xpToNext: 1 }],
    [100, { name: 'Hunter', xp: 100, nextName: 'Exterminator', xpToNext: 100 }],
    [174, { name: 'Hunter', xp: 174, nextName: 'Exterminator', xpToNext: 26 }],
    [
      299,
      { name: 'Exterminator', xp: 299, nextName: 'Arena Legend', xpToNext: 1 },
    ],
    [300, { name: 'Arena Legend', xp: 300, nextName: null, xpToNext: 0 }],
    [950, { name: 'Arena Legend', xp: 950, nextName: null, xpToNext: 0 }],
  ])('%i XP', (xp, expected) => {
    expect(rankForXp(xp)).toEqual(expected);
  });

  it('negative or invalid XP counts as 0', () => {
    expect(rankForXp(-5).name).toBe('Larva');
    expect(rankForXp(Number.NaN)).toEqual({
      name: 'Larva',
      xp: 0,
      nextName: 'Hunter',
      xpToNext: 100,
    });
  });
});
