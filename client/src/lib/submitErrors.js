// Error classification and response checks for the submit flow.
import { ApiError } from '../api/client.js';
import { RUNNER_WAIT_MESSAGE, RUN_TIMEOUT_MESSAGE } from '../hooks/useRunnerGate.js';
import { MESSAGES } from './submitConstants.js';

const MAYBE_SAVED_CODES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'BAD_RESPONSE']);

// Messages written in this app, safe to show as they are.
const OWN_MESSAGES = new Set([
  ...Object.values(MESSAGES),
  RUN_TIMEOUT_MESSAGE,
  RUNNER_WAIT_MESSAGE,
]);

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

/**
 * Whether the student may repeat the same step: AbortError (the request was cut short; the
 * flow's own unmount abort never reaches the UI), 429 or maybe saved. Not 400/404.
 */
export function isRetryable(error) {
  return isAbortError(error) || isRateLimited(error) || isMaybeSaved(error);
}

/** User-facing text for an error, safe to show. Runner and library texts become generic. */
export function errorMessage(error) {
  if (isAbortError(error)) return MESSAGES.interrupted;
  if (isRateLimited(error)) return MESSAGES.rateLimited;
  const text = error?.message;
  if (typeof text === 'string' && text && (error instanceof ApiError || OWN_MESSAGES.has(text))) {
    return text;
  }
  return error instanceof ApiError ? MESSAGES.generic : MESSAGES.runnerFailed;
}

/** Log of a failed step: route and code only, never a payload or student text. */
export function reportFailure(route, error) {
  console.warn('[submit]', route, error?.code ?? error?.name ?? 'Error');
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
