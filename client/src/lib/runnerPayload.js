// Turns runner output into the evaluation payload (docs/API.md).
import { EDGE_CASE_TEST_ID, MAX_ERROR_LENGTH, MESSAGES } from './submitConstants.js';

/** A runner error as text of at most MAX_ERROR_LENGTH chars, or null when there is none. */
export function truncateError(error) {
  if (error === null || error === undefined || error === '' || error === false) return null;
  let text;
  if (typeof error === 'string') text = error;
  else if (typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) text = error.message;
    else {
      try {
        text = JSON.stringify(error);
      } catch {
        text = 'Greška';
      }
    }
  } else text = String(error);
  return text.slice(0, MAX_ERROR_LENGTH);
}

function jsonValue(value) {
  return value === undefined ? null : value;
}

/** Tests in the shape the runner takes: { id, args, expected }. */
export function toRunnerTests(tests) {
  return tests.map(({ id, args, expected }) => ({ id, args, expected: jsonValue(expected) }));
}

/**
 * Turns runner results into the evaluation's testResults, one per test in `tests` order.
 * A test with an error has actual null; a timed-out test never counts as passed.
 * Throws when any test has no result, so partial or stub results are never sent.
 */
export function toTestResults(tests, results) {
  if (!Array.isArray(results)) throw new Error(MESSAGES.incompleteResults);
  const byId = new Map(results.filter(Boolean).map((r) => [r.id, r]));
  return tests.map((test) => {
    const result = byId.get(test.id);
    if (!result || typeof result.passed !== 'boolean') throw new Error(MESSAGES.incompleteResults);
    const error = truncateError(result.error);
    return {
      id: test.id,
      passed: result.passed && error !== 'timeout',
      actual: error ? null : jsonValue(result.actual),
      error,
    };
  });
}

function edgeResult(runOutput) {
  const result = runOutput?.results?.find?.((r) => r?.id === EDGE_CASE_TEST_ID);
  if (!result) throw new Error(MESSAGES.incompleteResults);
  return result;
}

/**
 * edgeCaseCheck exactly as docs/API.md defines it: what the original code and the reference
 * solution return for the edge-case input. If the original raised (or timed out),
 * originalOutput is null and error holds the text. The reference is trusted not to raise, so
 * the request has no field for its error: a reference error is sent as referenceOutput null.
 */
export function toEdgeCaseCheck(originalRun, referenceRun) {
  const original = edgeResult(originalRun);
  const reference = edgeResult(referenceRun);
  const error = truncateError(original.error);
  return {
    originalOutput: error ? null : jsonValue(original.actual),
    referenceOutput: truncateError(reference.error) ? null : jsonValue(reference.actual),
    error,
  };
}

/** A test counts as passed when passed is true and it did not time out (docs/API.md). */
export function countPassed(testResults) {
  return testResults.filter((r) => r.passed === true && r.error !== 'timeout').length;
}

/**
 * Runs the edge case on the reference and the original, then every test on the student's fix,
 * through safeRun (useRunnerGate). Returns { testResults, edgeCaseCheck }; throws when any
 * run is missing or incomplete.
 */
export async function runSubmitTests({ safeRun, challenge, attempt, signal }) {
  const runTests = async (code, tests) => {
    const output = await safeRun({ code, functionName: challenge.functionName, tests }, { signal });
    if (!output || !Array.isArray(output.results)) throw new Error(MESSAGES.incompleteResults);
    return output;
  };
  const { args, expected } = attempt.edgeCase;
  const edgeTest = [{ id: EDGE_CASE_TEST_ID, args, expected }];
  // The student's fix runs last: it is the most likely to time out or crash the worker.
  const reference = await runTests(attempt.referenceSolution, edgeTest);
  const original = await runTests(challenge.code, edgeTest);
  const fixed = await runTests(attempt.code, toRunnerTests(attempt.tests));
  return {
    testResults: toTestResults(attempt.tests, fixed.results),
    edgeCaseCheck: toEdgeCaseCheck(original, reference),
  };
}
