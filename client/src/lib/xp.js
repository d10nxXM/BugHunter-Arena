/**
 * XP and rank tiers. Display only: never sent to the server and never part of
 * the score (docs/SCORING.md "XP and ranks").
 *
 * The server computes XP: a challenge gives the score of the first attempt that
 * solved it (score >= SOLVED_MIN_SCORE), unsolved challenges give 0. Pages use
 * the server's `totalXp` and per-challenge `xp` (GET /api/progress) when they are
 * present, and fall back to the best score per challenge when an older server
 * does not send them. Every page reads XP, ranks and "solved" from this module.
 */

/** Best score at or above which a challenge counts as solved. */
export const SOLVED_MIN_SCORE = 70;

/** Most XP a single challenge can give (best score is 0-100). */
export const MAX_CHALLENGE_XP = 100;

/** Rank tiers, ascending by `minXp`. The first tier must start at 0. */
export const RANKS = Object.freeze([
  Object.freeze({ name: 'Larva', minXp: 0, description: 'Your first squashed bugs.' }),
  Object.freeze({ name: 'Hunter', minXp: 100, description: 'Reliable on logic and edge cases.' }),
  Object.freeze({ name: 'Exterminator', minXp: 200, description: 'Few bugs get past you.' }),
  Object.freeze({ name: 'Arena Legend', minXp: 300, description: 'No bug survives you.' }),
]);

function toXp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** XP a challenge gives for a best score (0-100). Missing or invalid counts as 0. */
export function challengeXp(bestScore) {
  return Math.min(toXp(bestScore), MAX_CHALLENGE_XP);
}

function isXpNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * XP of one `perChallenge` entry of GET /api/progress: the server's `xp` when present,
 * otherwise challengeXp(bestScore).
 */
export function entryXp(entry) {
  if (isXpNumber(entry?.xp)) return challengeXp(entry.xp);
  return challengeXp(entry?.bestScore);
}

/**
 * Total XP. `serverTotal` is `totalXp` from GET /api/progress; when it is a number it wins.
 * Otherwise the sum of entryXp over `perChallenge` (`[{ xp?, bestScore }]`).
 */
export function totalXp(perChallenge, serverTotal) {
  if (isXpNumber(serverTotal)) return toXp(serverTotal);
  if (!Array.isArray(perChallenge)) return 0;
  return perChallenge.reduce((sum, item) => sum + entryXp(item), 0);
}

/** Whether a best score counts as solved. */
export function isSolved(bestScore) {
  const n = Number(bestScore);
  return Number.isFinite(n) && n >= SOLVED_MIN_SCORE;
}

/**
 * Rank for an XP total.
 * @returns {{ name: string, description: string, minXp: number,
 *   next: { name: string, minXp: number } | null, toNext: number, pct: number }}
 *   `pct` is progress from this tier to the next (0-100); 100 at the top tier.
 */
export function rankFor(xp) {
  const value = toXp(xp);
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (value >= RANKS[i].minXp) index = i;
  }
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  if (!next) {
    return { ...current, next: null, toNext: 0, pct: 100 };
  }
  const span = next.minXp - current.minXp;
  return {
    ...current,
    next: { name: next.name, minXp: next.minXp },
    toNext: next.minXp - value,
    pct: Math.round(((value - current.minXp) / span) * 100),
  };
}
