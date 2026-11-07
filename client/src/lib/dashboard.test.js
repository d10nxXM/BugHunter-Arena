import { describe, expect, it } from 'vitest';
import {
  continueTarget,
  recommendations,
  skillsByCategory,
  solvedBreakdown,
  unsolvedChallenges,
} from './dashboard.js';

const LIST = [
  { id: 'a', title: 'A', difficulty: 'easy', bugCategory: 'Off-by-one' },
  { id: 'b', title: 'B', difficulty: 'hard', bugCategory: 'Wrong initialization' },
  { id: 'c', title: 'C', difficulty: 'medium', bugCategory: 'Off-by-one' },
  { id: 'd', title: 'D', difficulty: 'easy', bugCategory: 'Wrong initialization' },
];

const PROGRESS = [
  { challengeId: 'a', bestScore: 90, attempts: 1 },
  { challengeId: 'b', bestScore: 40, attempts: 3 },
];

describe('solvedBreakdown', () => {
  it('counts solved challenges per difficulty against the list', () => {
    expect(solvedBreakdown(LIST, PROGRESS)).toEqual({
      solved: 1,
      total: 4,
      byDifficulty: {
        easy: { solved: 1, total: 2 },
        medium: { solved: 0, total: 1 },
        hard: { solved: 0, total: 1 },
      },
    });
  });

  it('handles missing data', () => {
    expect(solvedBreakdown(null, undefined).total).toBe(0);
  });
});

describe('unsolvedChallenges', () => {
  it('keeps list order and drops solved ones', () => {
    expect(unsolvedChallenges(LIST, PROGRESS).map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('continueTarget', () => {
  it('resumes the newest attempt on an unsolved challenge', () => {
    const history = [
      { challengeId: 'a', createdAt: '2026-11-07T10:00:00Z' },
      { challengeId: 'b', createdAt: '2026-11-06T10:00:00Z' },
    ];
    const target = continueTarget(LIST, PROGRESS, history);
    expect(target).toMatchObject({ kind: 'resume', lastAt: '2026-11-06T10:00:00Z' });
    expect(target.challenge.id).toBe('b');
    expect(target.entry.attempts).toBe(3);
  });

  it('skips attempts on challenges that are no longer listed', () => {
    const target = continueTarget(LIST, PROGRESS, [{ challengeId: 'gone' }]);
    expect(target).toMatchObject({ kind: 'start' });
    expect(target.challenge.id).toBe('b');
  });

  it('is null when everything is solved', () => {
    const all = LIST.map((c) => ({ challengeId: c.id, bestScore: 100, attempts: 1 }));
    expect(continueTarget(LIST, all, [])).toBeNull();
  });
});

describe('recommendations', () => {
  it('puts weak categories first, then easier challenges, and skips the excluded one', () => {
    const weak = [{ category: 'Off-by-one', misses: 2 }];
    expect(recommendations(LIST, PROGRESS, weak, null).map((c) => c.id)).toEqual(['c', 'd', 'b']);
    expect(recommendations(LIST, PROGRESS, weak, 'c').map((c) => c.id)).toEqual(['d', 'b']);
  });

  it('respects the limit', () => {
    expect(recommendations(LIST, [], [], null, 2)).toHaveLength(2);
  });
});

describe('skillsByCategory', () => {
  it('counts solved per category with misses, best share first', () => {
    const weak = [{ category: 'Wrong initialization', misses: 2 }];
    expect(skillsByCategory(LIST, PROGRESS, weak)).toEqual([
      { category: 'Off-by-one', solved: 1, total: 2, misses: 0 },
      { category: 'Wrong initialization', solved: 0, total: 2, misses: 2 },
    ]);
  });
});
