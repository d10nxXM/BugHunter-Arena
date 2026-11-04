import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createAttempt, submitEvaluation } from '../api/client.js';
import { lookupAttempt } from '../lib/attemptRecovery.js';
import { runSubmitTests } from '../lib/runnerPayload.js';
import {
  MESSAGES,
  OUTCOME_ID,
  RECOVERED_HEADING_ID,
  SUBMIT_BUTTON_ID,
} from '../lib/submitConstants.js';
import {
  assertAttemptResponse,
  assertEvaluationResponse,
  errorMessage,
  isAbortError,
  isAlreadyEvaluated,
  isMaybeSaved,
  reportFailure,
} from '../lib/submitErrors.js';
import {
  NOT_SAVED_OUTCOME,
  anonymousOutcome,
  buildAttempt,
  buildRecovered,
  buildResultState,
  evaluationOutcome,
  unknownOutcome,
} from '../lib/submitSteps.js';
import { paths } from '../paths.js';

const EVALUATION_ROUTE = 'POST /api/attempts/:id/evaluation';

/**
 * The submit flow after validation: POST /api/attempts, the browser runs (edge case on the
 * reference and the original, then every test on the fix), POST .../evaluation, navigation to
 * the result, and recovery per docs/API.md "Timeouts and retries".
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
  // Evaluation is re-POSTed after recovery at most once per attempt, across manual retries.
  const repostedRef = useRef(false);
  // True after a failure that may have stored the evaluation (maybe saved, 409).
  const lookupNeededRef = useRef(false);

  function fail(phase, message, actions = []) {
    setSubmission({ phase, message, actions });
    requestFocus(OUTCOME_ID);
  }

  const failWith = (phase, { message, actions }) => fail(phase, message, actions);
  const failUnknown = () => failWith('unknown', unknownOutcome(attemptRef.current.userId));
  const failEvaluation = (error) => failWith('evalFailed', evaluationOutcome(error));

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

  /** POSTs the evaluation. Returns the checked response, or null after failing/aborting. */
  async function post(signal, onError) {
    try {
      return assertEvaluationResponse(
        await submitEvaluation(attemptRef.current.attemptId, payloadRef.current, { signal }),
      );
    } catch (error) {
      if (signal.aborted) return null;
      reportFailure(EVALUATION_ROUTE, error);
      // Only a maybe-saved failure or a 409 makes a lookup worthwhile (429 and 4xx stored nothing; a cut-off request is unknown).
      lookupNeededRef.current =
        isMaybeSaved(error) || isAlreadyEvaluated(error) || isAbortError(error);
      await onError(error);
      return null;
    }
  }

  /**
   * After an evaluation that may be stored, a 409, or a manual retry: looks the attempt up
   * (lib/attemptRecovery.js). Evaluated: shows the stored score. Still submitted: re-POSTs once
   * per attempt, then says the evaluation was not saved. Not found or search failed: shows the
   * maybe-saved message and never re-POSTs.
   */
  async function recover(signal) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'recovering' });
    const found = await lookupAttempt({
      userId: attempt.userId,
      challengeId: challenge.id,
      attemptId: attempt.attemptId,
      signal,
    });
    if (found.status === 'aborted') return;
    if (found.status === 'evaluated') {
      setSubmission(buildRecovered({ item: found.item, attempt, payload: payloadRef.current }));
      requestFocus(RECOVERED_HEADING_ID);
      return;
    }
    if (found.status === 'unknown') {
      failUnknown();
      return;
    }
    if (repostedRef.current) {
      failWith('unknown', NOT_SAVED_OUTCOME);
      return;
    }
    repostedRef.current = true;
    await evaluate(signal, true);
  }

  async function evaluate(signal, afterLookup = false) {
    setSubmission({ phase: 'evaluating' });
    const evaluation = await post(signal, async (error) => {
      if (!isMaybeSaved(error) && !isAlreadyEvaluated(error)) failEvaluation(error);
      else if (!attemptRef.current.userId) {
        failWith('evalFailed', anonymousOutcome(error, repostedRef.current));
      } else if (afterLookup && !isAlreadyEvaluated(error)) failEvaluation(error);
      else await recover(signal);
    });
    if (evaluation && !signal.aborted) finish(evaluation);
  }

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
    await evaluate(signal);
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
      repostedRef.current = false;
      lookupNeededRef.current = false;
      attemptRef.current = buildAttempt(created, body);
      await runAndEvaluate(signal);
    });
  }

  function retryTests() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(runAndEvaluate);
  }

  /**
   * With a user id and a maybe-saved failure, checks GET /api/attempts first. After 429 or
   * another known-not-stored failure, and for anonymous students, POSTs directly (an anonymous
   * re-POST after maybe-saved spends the single re-POST budget).
   */
  function retryEvaluation() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded((signal) => {
      if (attemptRef.current?.userId && lookupNeededRef.current) return recover(signal);
      if (lookupNeededRef.current) repostedRef.current = true;
      return evaluate(signal);
    });
  }

  return { submission, stoppedAt, submit, retryTests, retryEvaluation };
}
