/**
 * Scoring, pure functions, no I/O. Rules: docs/SCORING.md.
 * Never logs: inputs contain student text.
 */

const HINT_PENALTY = [0, 5, 10, 20]; // total penalty for 0-3 hints used
const MAX_SELECTED_FOR_FULL = 3;

/** JSON equality per docs/SCORING.md. NaN, Infinity and non-JSON values never match. */
export function jsonEqual(a, b) {
  if (a === null || b === null) return a === null && b === null;
  const type = typeof a;
  if (type !== typeof b) return false;
  if (type === 'number')
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  if (type === 'string' || type === 'boolean') return a === b;
  if (type !== 'object') return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const proto = Object.getPrototypeOf(a);
  if (
    (proto !== Object.prototype && proto !== null) ||
    Object.getPrototypeOf(b) !== proto
  ) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]),
  );
}

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Bug identification: 0, 20 or 40. */
export function scoreLines(selectedLines, bugLines, relatedLines) {
  const selected = [...new Set(asArray(selectedLines))];
  const bug = asArray(bugLines);
  const related = asArray(relatedLines);
  if (selected.some((line) => bug.includes(line))) {
    return selected.length <= MAX_SELECTED_FOR_FULL ? 40 : 20;
  }
  if (selected.some((line) => related.includes(line))) return 20;
  return 0;
}

/** Explanation: round(quality * 3), quality clamped to 0-10, so 0-30. */
export function scoreExplanation(quality) {
  if (typeof quality !== 'number' || !Number.isFinite(quality)) return 0;
  return Math.round(Math.min(10, Math.max(0, quality)) * 3);
}

/**
 * Edge case: 0, 10 or 20. `error` set on the check means the original raised
 * (see contract request in the report); the reference is trusted not to raise.
 */
export function scoreEdgeCase(edgeCaseCheck, expected) {
  if (!edgeCaseCheck || typeof edgeCaseCheck !== 'object') return 0;
  const { originalOutput, referenceOutput, error } = edgeCaseCheck;
  const originalRaised = typeof error === 'string' && error !== '';
  const exposes = originalRaised || !jsonEqual(originalOutput, referenceOutput);
  if (!exposes) return 0;
  return jsonEqual(expected, referenceOutput) ? 20 : 10;
}

const stripWhitespace = (code) => String(code ?? '').replace(/\s+/g, '');

function passedIds(testResults) {
  const ids = new Set();
  for (const result of asArray(testResults)) {
    if (result && result.passed === true && result.error !== 'timeout')
      ids.add(result.id);
  }
  return ids;
}

/** Number of the challenge's tests that passed, and the total. */
export function countPassedTests(testResults, testsJson) {
  const tests = asArray(testsJson);
  const passed = passedIds(testResults);
  return {
    testsPassed: tests.filter((t) => passed.has(t.id)).length,
    testsTotal: tests.length,
  };
}

/** Fix: 0, 5 or 10. */
export function scoreFix(testResults, testsJson, fixedCode, originalCode) {
  const tests = asArray(testsJson);
  if (tests.length === 0) return 0;
  if (stripWhitespace(fixedCode) === stripWhitespace(originalCode)) return 0;
  const passed = passedIds(testResults);
  if (tests.every((t) => passed.has(t.id))) return 10;
  if (tests.some((t) => t.failsOnOriginal === true && passed.has(t.id)))
    return 5;
  return 0;
}

/** Total hint penalty (positive number) for 0-3 hints used. */
export function hintPenalty(hintsUsed) {
  if (
    !Number.isInteger(hintsUsed) ||
    hintsUsed < 0 ||
    hintsUsed >= HINT_PENALTY.length
  ) {
    throw new RangeError('hintsUsed must be an integer 0-3');
  }
  return HINT_PENALTY[hintsUsed];
}

export function calculateScore({
  attempt,
  challenge,
  explanationQuality,
  edgeCaseCheck,
  testResults,
}) {
  const lines = scoreLines(
    attempt.selectedLines,
    challenge.bug_lines,
    challenge.related_lines,
  );
  const explanation = scoreExplanation(explanationQuality);
  const edgeCase = scoreEdgeCase(edgeCaseCheck, attempt.edgeCase?.expected);
  const fix = scoreFix(
    testResults,
    challenge.tests_json,
    attempt.fixedCode,
    challenge.code,
  );
  const penalty = hintPenalty(attempt.hintsUsed);
  const total = Math.min(
    100,
    Math.max(0, lines + explanation + edgeCase + fix - penalty),
  );
  return {
    total,
    breakdown: {
      lineIdentification: lines,
      explanation,
      edgeCase,
      fix,
      hintPenalty: -penalty,
    },
  };
}

// XP and ranks (docs/SCORING.md, "XP and ranks"). Display data only: never
// part of an attempt score.

/** Score at or above which an evaluated attempt solves its challenge. */
export const SOLVED_MIN_SCORE = 70;

/** Rank tiers, ascending. Same names and thresholds as client/src/lib/xp.js. */
export const RANKS = Object.freeze([
  Object.freeze({ name: 'Larva', minXp: 0 }),
  Object.freeze({ name: 'Hunter', minXp: 100 }),
  Object.freeze({ name: 'Exterminator', minXp: 200 }),
  Object.freeze({ name: 'Arena Legend', minXp: 300 }),
]);

function instant(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** True if row a was created before row b (created_at as instant, then id). */
function createdBefore(a, b) {
  const ta = instant(a.created_at);
  const tb = instant(b.created_at);
  if (ta !== tb) return ta < tb;
  return String(a.id) < String(b.id);
}

/**
 * XP per challenge: the score of the first evaluated attempt (oldest
 * created_at, then smallest id) that scored at least SOLVED_MIN_SCORE; 0 if
 * unsolved. Pure; rows in any order.
 * Returns { totalXp, byChallenge: Map<challengeId, { xp, solvedAt }> }.
 */
export function computeXp(rows) {
  const firstSolve = new Map();
  const seen = new Set();
  for (const row of rows) {
    seen.add(row.challenge_id);
    if (row.status !== 'evaluated' || !(row.score >= SOLVED_MIN_SCORE)) {
      continue;
    }
    const current = firstSolve.get(row.challenge_id);
    if (!current || createdBefore(row, current)) {
      firstSolve.set(row.challenge_id, row);
    }
  }
  const byChallenge = new Map();
  let totalXp = 0;
  for (const challengeId of seen) {
    const solve = firstSolve.get(challengeId);
    const xp = solve ? solve.score : 0;
    totalXp += xp;
    byChallenge.set(challengeId, { xp, solvedAt: solve?.created_at ?? null });
  }
  return { totalXp, byChallenge };
}

/** Rank object { name, xp, nextName, xpToNext } for a total XP. Pure. */
export function rankForXp(totalXp) {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.round(totalXp) : 0;
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (xp >= RANKS[i].minXp) index = i;
  }
  const next = RANKS[index + 1];
  return {
    name: RANKS[index].name,
    xp,
    nextName: next?.name ?? null,
    xpToNext: next ? next.minXp - xp : 0,
  };
}
