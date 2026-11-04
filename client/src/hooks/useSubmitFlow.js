import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createAttempt, submitEvaluation } from '../api/client.js';
import { findAttemptById } from '../lib/attemptRecovery.js';
import { countPassed, runSubmitTests } from '../lib/runnerPayload.js';
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
  isAlreadyEvaluated,
  isMaybeSaved,
  isRetryable,
  reportFailure,
} from '../lib/submitErrors.js';
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

  function fail(phase, message, actions = []) {
    setSubmission({ phase, message, actions });
    requestFocus(OUTCOME_ID);
  }

  function failEvaluation(error) {
    fail('evalFailed', errorMessage(error), [
      ...(isRetryable(error) ? ['retryEvaluation'] : []),
      'listLink',
    ]);
  }

  function failUnknown() {
    fail('unknown', MESSAGES.resultMaybeSaved, [
      'retryEvaluation',
      ...(attemptRef.current.userId ? ['progressLink'] : []),
      'listLink',
    ]);
  }

  function finish(evaluation) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'done' });
    // ResultState (src/paths.js) plus referenceSolution, which ResultView (F) shows.
    navigate(paths.result(challenge.id), {
      state: {
        attemptId: attempt.attemptId,
        challengeId: challenge.id,
        tests: attempt.tests,
        testResults: payloadRef.current.testResults,
        evaluation,
        referenceSolution: attempt.referenceSolution,
      },
    });
  }

  /** POSTs the evaluation. Returns the checked response, or null after failing/aborting. */
  async function post(signal, onError) {
    try {
      return assertEvaluationResponse(
        await submitEvaluation(attemptRef.current.attemptId, payloadRef.current, { signal }),
      );
    } catch (error) {
      if (!signal.aborted) await onError(error);
      return null;
    }
  }

  /**
   * After an evaluation that may be stored, a 409, or a manual retry: looks the attempt up in
   * GET /api/attempts (by id, paging with cursor + cursorId). Evaluated: shows the stored score.
   * Still submitted: re-POSTs once per attempt. Not found, or the search failed or ran out of
   * time: shows the maybe-saved message and never re-POSTs.
   */
  async function recover(signal) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'recovering' });
    let item;
    try {
      item = await findAttemptById({
        userId: attempt.userId,
        challengeId: challenge.id,
        attemptId: attempt.attemptId,
        signal,
      });
    } catch (error) {
      if (signal.aborted) return;
      reportFailure('GET /api/attempts', error);
      failUnknown();
      return;
    }
    if (signal.aborted) return;
    if (item?.status === 'evaluated' && Number.isFinite(item.score)) {
      setSubmission({
        phase: 'recovered',
        item,
        testsPassed: countPassed(payloadRef.current.testResults),
        testsTotal: attempt.tests.length,
      });
      requestFocus(RECOVERED_HEADING_ID);
      return;
    }
    // Attempt not found (or not evaluable): the result may exist, so do not POST blindly.
    if (!item || repostedRef.current) {
      failUnknown();
      return;
    }
    repostedRef.current = true;
    setSubmission({ phase: 'evaluating' });
    const evaluation = await post(signal, async (error) => {
      reportFailure(EVALUATION_ROUTE, error);
      if (isAlreadyEvaluated(error)) await recover(signal);
      else failEvaluation(error);
    });
    if (evaluation && !signal.aborted) finish(evaluation);
  }

  async function evaluate(signal) {
    setSubmission({ phase: 'evaluating' });
    const evaluation = await post(signal, async (error) => {
      reportFailure(EVALUATION_ROUTE, error);
      if (!attemptRef.current.userId && (isMaybeSaved(error) || isAlreadyEvaluated(error))) {
        // Without a user id the attempt cannot be looked up.
        fail('evalFailed', MESSAGES.resultMaybeSaved, ['retryEvaluation', 'listLink']);
      } else if (isMaybeSaved(error) || isAlreadyEvaluated(error)) await recover(signal);
      else failEvaluation(error);
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
      attemptRef.current = {
        attemptId: created.attemptId,
        tests: created.tests,
        referenceSolution: created.referenceSolution,
        userId: body.userId,
        code: body.fixedCode,
        edgeCase: body.edgeCase,
      };
      await runAndEvaluate(signal);
    });
  }

  function retryTests() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(runAndEvaluate);
  }

  /** With a user id, checks GET /api/attempts first; anonymous students POST directly. */
  function retryEvaluation() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(attemptRef.current?.userId ? recover : evaluate);
  }

  return { submission, stoppedAt, submit, retryTests, retryEvaluation };
}
