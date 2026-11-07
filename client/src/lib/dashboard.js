// Derived data for the dashboard, from GET /api/challenges, GET /api/progress and
// GET /api/attempts. Display only: XP, scores and "solved" still follow src/lib/xp.js.
import { normalizeDifficulty } from './labels.js';
import { isSolved } from './xp.js';

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };

function list(value) {
  return Array.isArray(value) ? value : [];
}

/** Map challengeId -> perChallenge entry. */
export function entriesById(perChallenge) {
  return new Map(list(perChallenge).map((e) => [e?.challengeId, e]));
}

function solvedIdsOf(perChallenge) {
  return new Set(
    list(perChallenge)
      .filter((e) => isSolved(e?.bestScore))
      .map((e) => e.challengeId),
  );
}

/**
 * Solved challenges per difficulty, counted against the current list.
 * @returns {{ solved: number, total: number,
 *   byDifficulty: Record<'easy' | 'medium' | 'hard', { solved: number, total: number }> }}
 */
export function solvedBreakdown(challenges, perChallenge) {
  const solvedIds = solvedIdsOf(perChallenge);
  const byDifficulty = {
    easy: { solved: 0, total: 0 },
    medium: { solved: 0, total: 0 },
    hard: { solved: 0, total: 0 },
  };
  let solved = 0;
  for (const c of list(challenges)) {
    const done = solvedIds.has(c.id);
    if (done) solved += 1;
    const level = byDifficulty[normalizeDifficulty(c.difficulty)];
    if (level) {
      level.total += 1;
      if (done) level.solved += 1;
    }
  }
  return { solved, total: list(challenges).length, byDifficulty };
}

/** The list's challenges that are not solved yet, in list order. */
export function unsolvedChallenges(challenges, perChallenge) {
  const solvedIds = solvedIdsOf(perChallenge);
  return list(challenges).filter((c) => !solvedIds.has(c.id));
}

/**
 * What to continue: the newest attempt on a challenge that is still unsolved
 * ({ kind: 'resume', challenge, entry, lastAt }), otherwise the first unsolved challenge
 * ({ kind: 'start', challenge }), or null when everything is solved or the list is empty.
 * `history` is GET /api/attempts, newest first.
 */
export function continueTarget(challenges, perChallenge, history) {
  const byId = new Map(list(challenges).map((c) => [c.id, c]));
  const entries = entriesById(perChallenge);
  for (const attempt of list(history)) {
    const challenge = byId.get(attempt?.challengeId);
    const entry = entries.get(attempt?.challengeId);
    if (challenge && !isSolved(entry?.bestScore)) {
      return { kind: 'resume', challenge, entry: entry ?? null, lastAt: attempt.createdAt };
    }
  }
  const first = unsolvedChallenges(challenges, perChallenge)[0];
  return first ? { kind: 'start', challenge: first } : null;
}

/**
 * Up to `limit` unsolved challenges to try next: weak categories first (most misses first),
 * then easier before harder, then list order. `excludeId` skips the "continue" challenge.
 */
export function recommendations(challenges, perChallenge, weakCategories, excludeId, limit = 4) {
  const misses = new Map(list(weakCategories).map((w) => [w?.category, w?.misses ?? 0]));
  return unsolvedChallenges(challenges, perChallenge)
    .map((challenge, index) => ({ challenge, index }))
    .filter(({ challenge }) => challenge.id !== excludeId)
    .sort((a, b) => {
      const weak =
        (misses.get(b.challenge.bugCategory) ?? 0) - (misses.get(a.challenge.bugCategory) ?? 0);
      if (weak !== 0) return weak;
      const level =
        (DIFFICULTY_ORDER[normalizeDifficulty(a.challenge.difficulty)] ?? 3) -
        (DIFFICULTY_ORDER[normalizeDifficulty(b.challenge.difficulty)] ?? 3);
      return level !== 0 ? level : a.index - b.index;
    })
    .slice(0, limit)
    .map(({ challenge }) => challenge);
}

/**
 * Solved challenges per bug category, plus misses from `weakCategories`, sorted by share solved
 * (highest first), then by name.
 * @returns {Array<{ category: string, solved: number, total: number, misses: number }>}
 */
export function skillsByCategory(challenges, perChallenge, weakCategories) {
  const solvedIds = solvedIdsOf(perChallenge);
  const misses = new Map(list(weakCategories).map((w) => [w?.category, w?.misses ?? 0]));
  const rows = new Map();
  for (const c of list(challenges)) {
    if (typeof c.bugCategory !== 'string' || c.bugCategory.trim() === '') continue;
    const row = rows.get(c.bugCategory) ?? {
      category: c.bugCategory,
      solved: 0,
      total: 0,
      misses: misses.get(c.bugCategory) ?? 0,
    };
    row.total += 1;
    if (solvedIds.has(c.id)) row.solved += 1;
    rows.set(c.bugCategory, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.solved / b.total - a.solved / a.total || a.category.localeCompare(b.category),
  );
}
