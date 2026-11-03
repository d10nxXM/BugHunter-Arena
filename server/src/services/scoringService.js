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
