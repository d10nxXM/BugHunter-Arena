// Pure builders for the submit flow (hooks/useSubmitFlow.js).
import { countPassed } from './runnerPayload.js';
import { MESSAGES } from './submitConstants.js';
import { errorMessage, isAlreadyEvaluated, isRetryable } from './submitErrors.js';

/** The locked attempt kept across retries: the POST /api/attempts response plus what was sent. */
export function buildAttempt(created, body) {
  return {
    attemptId: created.attemptId,
    tests: created.tests,
    referenceSolution: created.referenceSolution,
    userId: body.userId,
    code: body.fixedCode,
    edgeCase: body.edgeCase,
  };
}

/** ResultState (src/paths.js) plus referenceSolution, which ResultView (F) shows. */
export function buildResultState({ attempt, challengeId, payload, evaluation }) {
  return {
    attemptId: attempt.attemptId,
    challengeId,
    tests: attempt.tests,
    testResults: payload.testResults,
    evaluation,
    referenceSolution: attempt.referenceSolution,
  };
}

/** The 'recovered' submission shown when the stored evaluation was found. */
export function buildRecovered({ item, attempt, payload }) {
  return {
    phase: 'recovered',
    item,
    testsPassed: countPassed(payload.testResults),
    testsTotal: attempt.tests.length,
  };
}

/** Failure box for a failed evaluation POST: { message, actions }. */
export function evaluationOutcome(error) {
  return {
    message: errorMessage(error),
    actions: [...(isRetryable(error) ? ['retryEvaluation'] : []), 'listLink'],
  };
}

/** The result may be stored but could not be loaded. */
export function unknownOutcome(userId) {
  return {
    message: MESSAGES.resultMaybeSaved,
    actions: ['retryEvaluation', ...(userId ? ['progressLink'] : []), 'listLink'],
  };
}

/**
 * Anonymous students cannot look an attempt up. One more POST is offered after maybe-saved,
 * none after a 409 or once the re-POST budget is spent.
 */
export function anonymousOutcome(error, reposted) {
  const retry = !isAlreadyEvaluated(error) && !reposted;
  return {
    message: MESSAGES.resultMaybeSaved,
    actions: [...(retry ? ['retryEvaluation'] : []), 'listLink'],
  };
}

/** The evaluation was not stored and the re-POST budget is spent. */
export const NOT_SAVED_OUTCOME = { message: MESSAGES.resultNotSaved, actions: ['listLink'] };
