import { describe, it, expect } from 'vitest';
import { RANKS, challengeXp, entryXp, totalXp, isSolved, rankFor, SOLVED_MIN_SCORE } from './xp.js';

describe('xp', () => {
  it('challengeXp is the best score, clamped to 0-100, invalid as 0', () => {
    expect(challengeXp(94)).toBe(94);
    expect(challengeXp(150)).toBe(100);
    expect(challengeXp(-5)).toBe(0);
    expect(challengeXp(null)).toBe(0);
    expect(challengeXp('abc')).toBe(0);
    expect(challengeXp(70.6)).toBe(71);
  });

  it('totalXp sums the best scores and tolerates bad input', () => {
    expect(totalXp([{ bestScore: 94 }, { bestScore: 40 }, { bestScore: null }, null])).toBe(134);
    expect(totalXp([])).toBe(0);
    expect(totalXp(undefined)).toBe(0);
  });

  it('prefers the server xp per challenge and the server total', () => {
    expect(entryXp({ bestScore: 94, xp: 81 })).toBe(81);
    expect(entryXp({ bestScore: 40, xp: 0 })).toBe(0);
    expect(entryXp({ bestScore: 94 })).toBe(94);
    expect(entryXp({ bestScore: 94, xp: null })).toBe(94);
    expect(
      totalXp([
        { bestScore: 94, xp: 81 },
        { bestScore: 40, xp: 0 },
      ]),
    ).toBe(81);
    expect(totalXp([{ bestScore: 94 }], 120)).toBe(120);
    expect(totalXp([{ bestScore: 94 }], 0)).toBe(0);
    expect(totalXp([{ bestScore: 94 }], null)).toBe(94);
    expect(totalXp(undefined, 55)).toBe(55);
  });

  it('isSolved uses the threshold', () => {
    expect(SOLVED_MIN_SCORE).toBe(70);
    expect(isSolved(69)).toBe(false);
    expect(isSolved(70)).toBe(true);
    expect(isSolved(null)).toBe(false);
  });

  it('ranks start at 0 and ascend', () => {
    expect(RANKS[0].minXp).toBe(0);
    for (let i = 1; i < RANKS.length; i += 1) {
      expect(RANKS[i].minXp).toBeGreaterThan(RANKS[i - 1].minXp);
    }
  });

  it('rankFor gives the tier, the next tier and progress', () => {
    expect(rankFor(0)).toMatchObject({
      name: 'Larva',
      toNext: 100,
      pct: 0,
      next: { name: 'Hunter' },
    });
    expect(rankFor(99)).toMatchObject({ name: 'Larva', toNext: 1, pct: 99 });
    expect(rankFor(100)).toMatchObject({ name: 'Hunter', toNext: 100, pct: 0 });
    expect(rankFor(250)).toMatchObject({ name: 'Exterminator', toNext: 50, pct: 50 });
    expect(rankFor(300)).toMatchObject({ name: 'Arena Legend', next: null, toNext: 0, pct: 100 });
    expect(rankFor(-10)).toMatchObject({ name: 'Larva' });
  });
});
