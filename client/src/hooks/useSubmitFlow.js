import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createAttempt, submitEvaluation } from '../api/client.js';
import {
  EDGE_CASE_TEST_ID,
  MESSAGES,
  OUTCOME_ID,
  RECOVERED_HEADING_ID,
  SUBMIT_BUTTON_ID,
  assertAttemptResponse,
  assertEvaluationResponse,
  countPassed,
  errorMessage,
  findAttemptById,
  isAlreadyEvaluated,
  isMaybeSaved,
  isRetryable,
  reportFailure,
  toEdgeCaseCheck,
  toRunnerTests,
  toTestResults,
} from '../components/ChallengeSubmitFlow.js';
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
    const state = {
      attemptId: attempt.attemptId,
      challengeId: challenge.id,
      tests: attempt.tests,
      testResults: payloadRef.current.testResults,
      evaluation,
      referenceSolution: attempt.referenceSolution,
    };
    navigate(paths.result(challenge.id), { state });
  }

  async function runSubmitTests(attempt, signal) {
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

  async function postEvaluation(signal) {
    const attemptId = attemptRef.current.attemptId;
    return assertEvaluationResponse(await submitEvaluation(attemptId, payloadRef.current, { signal }));
  }

  /** After an evaluation that may be stored, or a 409. Re-POSTs at most once per chain. */
  async function recover(signal, repostAllowed) {
    const attempt = attemptRef.current;
    if (!attempt.userId) {
      fail('evalFailed', MESSAGES.resultMaybeSaved, ['retryEvaluation', 'listLink']);
      return;
    }
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
    if (item?.status === 'evaluated') {
      const { testResults } = payloadRef.current;
      setSubmission({
        phase: 'recovered',
        item,
        testsPassed: countPassed(testResults),
        testsTotal: attempt.tests.length,
      });
      requestFocus(RECOVERED_HEADING_ID);
      return;
    }
    if (!item || !repostAllowed) {
      failUnknown();
      return;
    }
    setSubmission({ phase: 'evaluating' });
    try {
      const evaluation = await postEvaluation(signal);
      if (!signal.aborted) finish(evaluation);
    } catch (error) {
      if (signal.aborted) return;
      if (isAlreadyEvaluated(error)) {
        await recover(signal, false);
        return;
      }
      reportFailure(EVALUATION_ROUTE, error);
      failEvaluation(error);
    }
  }

  async function evaluate(signal) {
    setSubmission({ phase: 'evaluating' });
    try {
      const evaluation = await postEvaluation(signal);
      if (!signal.aborted) finish(evaluation);
    } catch (error) {
      if (signal.aborted) return;
      if (isMaybeSaved(error) || isAlreadyEvaluated(error)) {
        await recover(signal, true);
        return;
      }
      failEvaluation(error);
    }
  }

  async function runAndEvaluate(signal) {
    setSubmission({ phase: 'testing' });
    let payload;
    try {
      payload = await runSubmitTests(attemptRef.current, signal);
    } catch (error) {
      if (signal.aborted) return;
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
    try {
      await step(getSignal());
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
        if (isMaybeSaved(error)) fail('createFailed', MESSAGES.attemptMaybeLost, ['resubmit']);
        else fail('createFailed', errorMessage(error));
        return;
      }
      if (signal.aborted) return;
      setStoppedAt(Date.now());
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

  function retryEvaluation() {
    requestFocus(SUBMIT_BUTTON_ID);
    return guarded(evaluate);
  }

  return { submission, stoppedAt, submit, retryTests, retryEvaluation };
}
