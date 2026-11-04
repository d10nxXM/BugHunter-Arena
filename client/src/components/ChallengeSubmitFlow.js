// Pure helpers for the challenge submit flow: answer validation, error classification, the
// evaluation payload built from runner results, recovery of a stored attempt (docs/API.md,
// "Timeouts and retries"), and the submission phase table.
import { ApiError, getAttempts, nextAttemptsPage } from '../api/client.js';

/** Limits from the POST /api/attempts validation (docs/API.md). */
export const EXPLANATION_MIN = 20;
export const EXPLANATION_MAX = 1000;
export const MAX_SELECTED_LINES = 10;
export const MAX_FIXED_CODE = 5000;

/** DOM ids, so the page can move focus to a field, the submit button or the outcome. */
export const FIELD_IDS = {
  lines: 'answer-lines-error',
  explanation: 'answer-explanation',
  edgeArgs: 'answer-edge-args',
  edgeExpected: 'answer-edge-expected',
  code: 'answer-code-error',
};
export const SUBMIT_BUTTON_ID = 'answer-submit';
export const OUTCOME_ID = 'submit-outcome';
export const RECOVERED_HEADING_ID = 'recovered-heading';

/** Order in which invalid fields are focused. */
export const FIELD_ORDER = ['lines', 'code', 'explanation', 'edgeArgs', 'edgeExpected'];

/** Page size when searching GET /api/attempts for one attempt. */
export const ATTEMPTS_PAGE_SIZE = 50;
/** Upper bound on pages read while recovering. */
export const MAX_ATTEMPT_PAGES = 40;

/** Longest error text the evaluation endpoint accepts. */
export const MAX_ERROR_LENGTH = 200;

/** Id of the edge-case pseudo-test run on the original code and on the reference solution. */
export const EDGE_CASE_TEST_ID = 'edge-case';

const MAYBE_SAVED_CODES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'BAD_RESPONSE']);

export const MESSAGES = {
  attemptMaybeLost: 'Predaja možda nije stigla do servera. Pokušaj ponovo.',
  resultMaybeSaved: 'Rezultat je možda sačuvan, ali ga nismo mogli učitati.',
  interrupted: 'Slanje je prekinuto. Pokušaj ponovo.',
  rateLimited: 'Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.',
  generic: 'Došlo je do greške. Pokušaj ponovo.',
  incompleteResults: 'Rezultati testova nisu potpuni, pa nisu poslati.',
  testsNotRun: 'Testovi nisu pokrenuti, pa rezultat nije poslat.',
  badAttempt: 'Server je vratio neočekivan odgovor na predaju.',
  badEvaluation: 'Server je vratio neočekivanu ocjenu.',
};

/**
 * Submission phases. editable: the answer can still change; busy: a step is running (submit
 * ignores clicks); status: text for the polite live region.
 */
export const PHASES = {
  idle: { editable: true, busy: false, status: '' },
  creating: { editable: false, busy: true, status: 'Šaljem odgovor…' },
  createFailed: { editable: true, busy: false, status: '' },
  testing: { editable: false, busy: true, status: 'Pokrećem sve testove na tvom kodu…' },
  testsFailed: { editable: false, busy: false, status: '' },
  evaluating: {
    editable: false,
    busy: true,
    status: 'Računam bodove i čekam pomoćnu AI procjenu. Ovo može potrajati nekoliko sekundi…',
  },
  evalFailed: { editable: false, busy: false, status: '' },
  recovering: { editable: false, busy: true, status: 'Provjeravam da li je rezultat sačuvan…' },
  recovered: { editable: false, busy: false, status: '' },
  unknown: { editable: false, busy: false, status: '' },
  done: { editable: false, busy: true, status: 'Rezultat je spreman.' },
};

/**
 * Validates the answer before POST /api/attempts.
 * Returns { errors, edgeCase }: errors maps field -> Montenegrin message (empty when valid);
 * edgeCase is { args, expected } once both edge-case fields parse.
 */
export function validateAnswer({ selectedLines, explanation, edgeArgs, edgeExpected, code }) {
  const errors = {};
  if (selectedLines.length === 0) errors.lines = 'Označi bar jednu liniju sa greškom.';
  else if (selectedLines.length > MAX_SELECTED_LINES) {
    errors.lines = `Možeš označiti najviše ${MAX_SELECTED_LINES} linija.`;
  }

  if (code.length > MAX_FIXED_CODE) {
    errors.code = `Kod može imati najviše ${MAX_FIXED_CODE} karaktera.`;
  }

  const length = explanation.trim().length;
  if (length < EXPLANATION_MIN) {
    errors.explanation = `Objašnjenje mora imati najmanje ${EXPLANATION_MIN} karaktera.`;
  } else if (length > EXPLANATION_MAX) {
    errors.explanation = `Objašnjenje može imati najviše ${EXPLANATION_MAX} karaktera.`;
  }

  let args;
  try {
    if (edgeArgs.trim() === '') throw new Error('empty');
    args = JSON.parse(`[${edgeArgs}]`);
  } catch {
    errors.edgeArgs = 'Unesi argumente kao JSON vrijednosti odvojene zarezom, npr. [1, 2], 3.';
  }

  let expected;
  try {
    if (edgeExpected.trim() === '') throw new Error('empty');
    expected = JSON.parse(edgeExpected);
  } catch {
    errors.edgeExpected = 'Unesi očekivani rezultat kao JSON vrijednost, npr. 5, "tekst" ili null.';
  }

  const edgeCase = errors.edgeArgs || errors.edgeExpected ? null : { args, expected };
  return { errors, edgeCase };
}

export function isAbortError(error) {
  return error?.name === 'AbortError';
}

/** True for a POST failure where the server may have stored the request (never an AbortError). */
export function isMaybeSaved(error) {
  if (!(error instanceof ApiError)) return false;
  return MAYBE_SAVED_CODES.has(error.code) || (error.status ?? 0) >= 500;
}

export function isAlreadyEvaluated(error) {
  return error instanceof ApiError && (error.status === 409 || error.code === 'ALREADY_EVALUATED');
}

export function isRateLimited(error) {
  return error instanceof ApiError && (error.status === 429 || error.code === 'RATE_LIMITED');
}

/** Whether repeating the same request can help: AbortError, 429 or maybe saved. Not 400/404. */
export function isRetryable(error) {
  return isAbortError(error) || isRateLimited(error) || isMaybeSaved(error);
}

/** Montenegrin text for an error, safe to show. */
export function errorMessage(error) {
  if (isAbortError(error)) return MESSAGES.interrupted;
  if (isRateLimited(error)) return MESSAGES.rateLimited;
  return typeof error?.message === 'string' && error.message ? error.message : MESSAGES.generic;
}

/** Dev-only log of a failed step: route and code, never a payload or student text. */
export function reportFailure(route, error) {
  if (import.meta.env.DEV) console.warn('[submit]', route, error?.code ?? error?.name ?? 'Error');
}

/** Checks the POST /api/attempts response; a malformed 201 is treated like BAD_RESPONSE. */
export function assertAttemptResponse(data) {
  const ok =
    data !== null &&
    typeof data === 'object' &&
    typeof data.attemptId === 'string' &&
    data.attemptId.length > 0 &&
    typeof data.referenceSolution === 'string' &&
    Array.isArray(data.tests) &&
    data.tests.length > 0 &&
    data.tests.every((t) => t && typeof t.id === 'string' && Array.isArray(t.args));
  if (!ok) throw new ApiError(MESSAGES.badAttempt, { status: 201, code: 'BAD_RESPONSE' });
  return data;
}

/** Checks the POST /api/attempts/:id/evaluation response; malformed counts as BAD_RESPONSE. */
export function assertEvaluationResponse(data) {
  const ok =
    data !== null &&
    typeof data === 'object' &&
    Number.isFinite(data.score) &&
    data.breakdown !== null &&
    typeof data.breakdown === 'object' &&
    data.feedback !== null &&
    typeof data.feedback === 'object';
  if (!ok) throw new ApiError(MESSAGES.badEvaluation, { status: 200, code: 'BAD_RESPONSE' });
  return data;
}

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
 * Pages GET /api/attempts?userId=&challengeId= (cursor + cursorId) until the item whose id is
 * attemptId is found. Returns it, or null when the list ends or MAX_ATTEMPT_PAGES were read.
 * Never falls back to the newest item.
 */
export async function findAttemptById({ userId, challengeId, attemptId, signal }) {
  let page = { cursor: undefined, cursorId: undefined };
  for (let i = 0; i < MAX_ATTEMPT_PAGES && page; i += 1) {
    const items = await getAttempts(
      {
        userId,
        challengeId,
        limit: ATTEMPTS_PAGE_SIZE,
        cursor: page.cursor,
        cursorId: page.cursorId,
      },
      { signal },
    );
    if (!Array.isArray(items)) {
      throw new ApiError(MESSAGES.badEvaluation, { status: 200, code: 'BAD_RESPONSE' });
    }
    const match = items.find((item) => item?.id === attemptId);
    if (match) return match;
    page = nextAttemptsPage(items, ATTEMPTS_PAGE_SIZE);
  }
  return null;
}
