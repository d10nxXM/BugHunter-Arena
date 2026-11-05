import { useRef } from 'react';
import { submitEvaluation } from '../api/client.js';
import { lookupAttempt } from '../lib/attemptRecovery.js';
import { RECOVERED_HEADING_ID } from '../lib/submitConstants.js';
import {
  evaluationFailureStep,
  needsLookup,
  recoveryStep,
  retryEvaluationStep,
} from '../lib/submitDecisions.js';
import { assertEvaluationResponse, reportFailure } from '../lib/submitErrors.js';
import {
  NOT_SAVED_OUTCOME,
  anonymousOutcome,
  buildRecovered,
  evaluationOutcome,
  unknownOutcome,
} from '../lib/submitSteps.js';

const EVALUATION_ROUTE = 'POST /api/attempts/:id/evaluation';

/**
 * The evaluation step of useSubmitFlow: POST .../evaluation and the recovery per docs/API.md
 * "Timeouts and retries" (decisions in lib/submitDecisions.js). attemptRef and payloadRef are
 * owned by useSubmitFlow; fail(phase, message, actions) shows the failure box and finish(evaluation)
 * navigates to the result. Returns { evaluate(signal), retry(signal), reset() }.
 */
export function useEvaluationStep({
  challengeId,
  attemptRef,
  payloadRef,
  setSubmission,
  requestFocus,
  fail,
  finish,
}) {
  // Evaluation is re-POSTed after recovery at most once per attempt, across manual retries.
  const repostedRef = useRef(false);
  // True after a failure that may have stored the evaluation (maybe saved, 409).
  const lookupNeededRef = useRef(false);

  const failWith = (phase, { message, actions }) => fail(phase, message, actions);

  /** Looks the attempt up (lib/attemptRecovery.js) and shows, re-POSTs or fails. */
  async function recover(signal) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'recovering' });
    const found = await lookupAttempt({
      userId: attempt.userId,
      challengeId,
      attemptId: attempt.attemptId,
      signal,
    });
    const step = recoveryStep({ status: found.status, reposted: repostedRef.current });
    if (step === 'aborted') return;
    if (step === 'recovered') {
      setSubmission(buildRecovered({ item: found.item, attempt, payload: payloadRef.current }));
      requestFocus(RECOVERED_HEADING_ID);
    } else if (step === 'unknown') {
      failWith('unknown', unknownOutcome(attempt.userId));
    } else if (step === 'notSaved') {
      failWith('unknown', NOT_SAVED_OUTCOME);
    } else {
      repostedRef.current = true;
      await evaluate(signal, true);
    }
  }

  async function onPostError(error, signal, afterLookup) {
    const step = evaluationFailureStep({ error, userId: attemptRef.current.userId, afterLookup });
    if (step === 'fail') failWith('evalFailed', evaluationOutcome(error));
    else if (step === 'anonymous') {
      failWith('evalFailed', anonymousOutcome(error, repostedRef.current));
    } else await recover(signal);
  }

  async function evaluate(signal, afterLookup = false) {
    setSubmission({ phase: 'evaluating' });
    let evaluation;
    try {
      evaluation = assertEvaluationResponse(
        await submitEvaluation(attemptRef.current.attemptId, payloadRef.current, { signal }),
      );
    } catch (error) {
      if (signal.aborted) return;
      reportFailure(EVALUATION_ROUTE, error);
      lookupNeededRef.current = needsLookup(error);
      await onPostError(error, signal, afterLookup);
      return;
    }
    if (!signal.aborted) finish(evaluation);
  }

  /** A manual retry: looks up first or POSTs directly (retryEvaluationStep). */
  function retry(signal) {
    const step = retryEvaluationStep({
      userId: attemptRef.current?.userId,
      lookupNeeded: lookupNeededRef.current,
    });
    if (step.lookup) return recover(signal);
    if (step.spendRepost) repostedRef.current = true;
    return evaluate(signal);
  }

  /** Called for each new attempt. */
  function reset() {
    repostedRef.current = false;
    lookupNeededRef.current = false;
  }

  return { evaluate, retry, reset };
}
