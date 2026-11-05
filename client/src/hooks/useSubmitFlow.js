import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createAttempt } from '../api/client.js';
import { runSubmitTests } from '../lib/runnerPayload.js';
import { MESSAGES, OUTCOME_ID, SUBMIT_BUTTON_ID } from '../lib/submitConstants.js';
import {
  assertAttemptResponse,
  errorMessage,
  isMaybeSaved,
  reportFailure,
} from '../lib/submitErrors.js';
import { buildAttempt, buildResultState } from '../lib/submitSteps.js';
import { paths } from '../paths.js';
import { useEvaluationStep } from './useEvaluationStep.js';

/**
 * The submit flow after validation: POST /api/attempts, the browser runs (edge case on the
 * reference and the original, then every test on the fix), POST .../evaluation, navigation to
 * the result, and recovery per docs/API.md "Timeouts and retries" (useEvaluationStep).
 *
 * Returns { submission, stoppedAt, submit(body), retryTests(), retryEvaluation() }.
 * submission is { phase, message?, actions?, item?, testsPassed?, testsTotal? } (phases in
 * PHASES); actions are 'resubmit' | 'retryTests' | 'retryEvaluation' | 'progressLink' |
 * 'listLink'. body is the POST /api/attempts body without challengeId.
 */
export function useSubmitFlow({ challenge, safeRun, getSignal, requestFocus }) {
  const navigate = useNavigate();
  const [submission, setSubmission] = useState({ phase: 'idle' });
  const [stoppedAt, setStoppedAt] = useState(null);
  // The locked attempt and the payload sent for it, kept across retries of the later steps.
  const attemptRef = useRef(null);
  const payloadRef = useRef(null);
  const inFlightRef = useRef(false);

  function fail(phase, message, actions = []) {
    setSubmission({ phase, message, actions });
    requestFocus(OUTCOME_ID);
  }

  function finish(evaluation) {
    setSubmission({ phase: 'done' });
    navigate(paths.result(challenge.id), {
      state: buildResultState({
        attempt: attemptRef.current,
        challengeId: challenge.id,
        payload: payloadRef.current,
        evaluation,
      }),
    });
  }

  const evaluation = useEvaluationStep({
    challengeId: challenge.id,
    attemptRef,
    payloadRef,
    setSubmission,
    requestFocus,
    fail,
    finish,
  });

  async function runAndEvaluate(signal) {
    setSubmission({ phase: 'testing' });
    let payload;
    try {
      payload = await runSubmitTests({
        safeRun,
        challenge,
        attempt: attemptRef.current,
        signal,
      });
    } catch (error) {
      if (signal.aborted) return;
      reportFailure('browser test run', error);
      fail('testsFailed', `${MESSAGES.testsNotRun} ${errorMessage(error)}`, [
        'retryTests',
        'listLink',
      ]);
      return;
    }
    if (signal.aborted) return;
    payloadRef.current = payload;
    await evaluation.evaluate(signal);
  }

  /** Runs one step unless another is in flight (double clicks before the next render). */
  async function guarded(step) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const signal = getSignal();
    try {
      await step(signal);
    } catch (error) {
      if (signal.aborted) return;
      reportFailure('submit flow', error);
      if (attemptRef.current) fail('unknown', MESSAGES.generic, ['listLink']);
      else fail('createFailed', MESSAGES.generic);
    } finally {
      inFlightRef.current = false;
    }
  }

  function submit(body) {
    return guarded(async (signal) => {
      setSubmission({ phase: 'creating' });
      let created;
      try {
        created = assertAttemptResponse(
          await createAttempt({ challengeId: challenge.id, ...body }, { signal }),
        );
      } catch (error) {
        if (signal.aborted) return;
        reportFailure('POST /api/attempts', error);
        if (isMaybeSaved(error)) fail('createFailed', MESSAGES.attemptMaybeLost, ['resubmit']);
        else fail('createFailed', errorMessage(error));
        return;
      }
      if (signal.aborted) return;
      setStoppedAt(Date.now());
      evaluation.reset();
      attemptRef.current = buildAttempt(created, body);
      await runAndEvaluate(signal);
    });
  }

  function retryTests() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(runAndEvaluate);
  }

  /** With a user id and a maybe-saved failure, checks GET /api/attempts first (useEvaluationStep). */
  function retryEvaluation() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(evaluation.retry);
  }

  return { submission, stoppedAt, submit, retryTests, retryEvaluation };
}
