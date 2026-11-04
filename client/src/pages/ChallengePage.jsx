import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { createAttempt, getChallenge, requestHint, submitEvaluation } from '../api/client.js';
import AnswerForm from '../components/AnswerForm.jsx';
import ChallengeTestSummary from '../components/ChallengeTestSummary.jsx';
import ChallengeTimer from '../components/ChallengeTimer.jsx';
import {
  EDGE_CASE_TEST_ID,
  FIELD_IDS,
  FIELD_ORDER,
  MAX_SELECTED_LINES,
  MESSAGES,
  assertAttemptResponse,
  assertEvaluationResponse,
  countPassed,
  findAttemptById,
  isAbortError,
  isAlreadyEvaluated,
  isMaybeSaved,
  toEdgeCaseCheck,
  toRunnerTests,
  toTestResults,
  validateAnswer,
} from '../components/ChallengeSubmitFlow.js';
import CodeEditor from '../components/CodeEditor.jsx';
import HintPanel from '../components/HintPanel.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useTestRunner } from '../hooks/useTestRunner.js';
import { useUser } from '../hooks/useUser.js';
import { paths } from '../paths.js';

const LINK =
  'text-sky-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const SECONDARY_BUTTON =
  'rounded border border-slate-500 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-500';
const ALERT =
  'rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900 focus:outline-none';

/** After a run that timed out, how long to wait for the runner to report "not ready". */
const RESTART_GRACE_MS = 1000;
/** Longest wait for the runner to become ready during submit (fresh worker loads Pyodide). */
const RUNNER_WAIT_MS = 35000;
const RUNNER_WAIT_MESSAGE = 'Pokretač testova nije spreman.';

const FEEDBACK_SOURCE_LABEL = {
  ai: 'Pomoćna AI procjena',
  demo: 'Pomoćna AI procjena',
  fallback: 'Procjena bez AI-ja',
};

const SUBMIT_STATUS = {
  creating: 'Šaljem odgovor…',
  testing: 'Pokrećem sve testove na tvom kodu…',
  evaluating: 'Računam bodove i čekam pomoćnu AI procjenu. Ovo može potrajati do 20 sekundi…',
  recovering: 'Provjeravam da li je rezultat sačuvan…',
  done: 'Rezultat je spreman.',
};

function abortReason(signal) {
  return signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Returns waitForRunner({ afterTimeout, signal }): resolves once the runner is ready. After a run
 * that timed out, the runner restarts its worker (ready goes false, then true), so it first waits
 * for that, giving up on seeing "not ready" after RESTART_GRACE_MS. Rejects on loadError, after
 * RUNNER_WAIT_MS, or on abort.
 */
function useRunnerGate(ready, loadError) {
  const stateRef = useRef({ ready, loadError });
  const waitersRef = useRef(new Set());

  useEffect(() => {
    stateRef.current = { ready, loadError };
    for (const check of [...waitersRef.current]) check();
  }, [ready, loadError]);

  return useCallback(
    ({ afterTimeout = false, signal } = {}) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortReason(signal));
          return;
        }
        let sawNotReady = !afterTimeout;
        let settled = false;
        const timers = [];
        const onAbort = () => finish(() => reject(abortReason(signal)));
        function finish(settle) {
          if (settled) return;
          settled = true;
          waitersRef.current.delete(check);
          timers.forEach(clearTimeout);
          signal?.removeEventListener('abort', onAbort);
          settle();
        }
        function check() {
          const state = stateRef.current;
          if (!state.ready) {
            sawNotReady = true;
            if (state.loadError) finish(() => reject(new Error(state.loadError)));
            return;
          }
          if (sawNotReady) finish(resolve);
        }
        waitersRef.current.add(check);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (afterTimeout) {
          timers.push(
            setTimeout(() => {
              sawNotReady = true;
              check();
            }, RESTART_GRACE_MS),
          );
        }
        timers.push(
          setTimeout(() => finish(() => reject(new Error(RUNNER_WAIT_MESSAGE))), RUNNER_WAIT_MS),
        );
        check();
      }),
    [],
  );
}

/** One AbortController for the page's lifetime; aborted on unmount. */
function useUnmountSignal() {
  const controllerRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort();
  }, []);
  return useCallback(() => controllerRef.current?.signal ?? new AbortController().signal, []);
}

/** Moves focus to an element by id after the next render. */
function useFocusRequest() {
  const targetRef = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!targetRef.current) return;
    document.getElementById(targetRef.current)?.focus();
    targetRef.current = null;
  }, [tick]);
  return useCallback((id) => {
    targetRef.current = id;
    setTick((n) => n + 1);
  }, []);
}

function ChallengeWorkspace({ challenge, startedAt }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { ready, loadError, run } = useTestRunner();
  const waitForRunner = useRunnerGate(ready, loadError);
  const getSignal = useUnmountSignal();
  const requestFocus = useFocusRequest();

  const [code, setCode] = useState(challenge.code);
  const [selectedLines, setSelectedLines] = useState([]);
  const [values, setValues] = useState({ explanation: '', edgeArgs: '', edgeExpected: '' });
  const [errors, setErrors] = useState({});
  const [hints, setHints] = useState([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState(null);
  const [visibleRun, setVisibleRun] = useState({ status: 'idle' });
  const [submission, setSubmission] = useState({ phase: 'idle' });
  const [stoppedAt, setStoppedAt] = useState(null);

  // The locked attempt and the results sent for it; kept across retries of the later steps.
  const attemptRef = useRef(null);
  const payloadRef = useRef(null);

  const editable = submission.phase === 'idle' || submission.phase === 'createFailed';
  const maxHintLevel = Math.min(3, Number.isInteger(challenge.hintCount) ? challenge.hintCount : 3);

  function clearError(field) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function toggleLine(line) {
    if (!editable) return;
    setSelectedLines((lines) =>
      lines.includes(line)
        ? lines.filter((n) => n !== line)
        : [...lines, line].sort((a, b) => a - b),
    );
    clearError('lines');
  }

  function changeCode(next) {
    if (!editable) return;
    setCode(next);
    clearError('code');
  }

  function changeValue(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearError(field);
  }

  async function handleRunVisible() {
    if (!ready || !editable || visibleRun.status === 'running') return;
    const signal = getSignal();
    setVisibleRun({ status: 'running' });
    try {
      const output = await run({
        code,
        functionName: challenge.functionName,
        tests: toRunnerTests(challenge.visibleTests),
      });
      const results = toTestResults(challenge.visibleTests, output?.results);
      if (signal.aborted) return;
      setVisibleRun({ status: 'done', results, timedOut: Boolean(output.timedOut) });
    } catch (error) {
      if (signal.aborted) return;
      setVisibleRun({ status: 'error', message: error?.message || RUNNER_WAIT_MESSAGE });
    }
  }

  async function handleHint() {
    const level = hints.length + 1;
    if (hintLoading || !editable || level > maxHintLevel) return;
    const signal = getSignal();
    setHintLoading(true);
    setHintError(null);
    try {
      const data = await requestHint(
        challenge.id,
        {
          level,
          currentAnswer: {
            selectedLines: selectedLines.slice(0, MAX_SELECTED_LINES),
            explanation: values.explanation.slice(0, 1000),
          },
        },
        { signal },
      );
      if (typeof data?.hint !== 'string' || data.hint.trim() === '') {
        throw new Error('Savjet nije stigao. Pokušaj ponovo.');
      }
      setHints((prev) =>
        prev.length === level - 1
          ? [...prev, { level, hint: data.hint, source: data.source }]
          : prev,
      );
    } catch (error) {
      if (signal.aborted) return;
      setHintError(
        isAbortError(error) ? MESSAGES.interrupted : error?.message || 'Savjet nije stigao.',
      );
    } finally {
      if (!signal.aborted) setHintLoading(false);
    }
  }

  function fail(phase, message, extra = {}) {
    setSubmission({ phase, message, ...extra });
    requestFocus('submit-alert');
  }

  function finish(evaluation) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'done' });
    // ResultState (src/paths.js) plus referenceSolution.
    const state = {
      attemptId: attempt.attemptId,
      challengeId: challenge.id,
      tests: attempt.tests,
      testResults: payloadRef.current.testResults,
      evaluation,
      // Not in the ResultState typedef yet (paths.js is frozen); ResultView (F) reads it.
      referenceSolution: attempt.referenceSolution,
    };
    navigate(paths.result(challenge.id), { state });
  }

  /** Runs the edge case on the reference and the original, then every test on the fix. */
  async function runSubmitTests(attempt, signal) {
    const runTests = async (testCode, tests, afterTimeout) => {
      await waitForRunner({ afterTimeout, signal });
      const output = await run({ code: testCode, functionName: challenge.functionName, tests });
      if (!output || !Array.isArray(output.results)) throw new Error(MESSAGES.incompleteResults);
      return output;
    };
    const edgeTest = [
      { id: EDGE_CASE_TEST_ID, args: attempt.edgeCase.args, expected: attempt.edgeCase.expected },
    ];
    // The student's fix runs last: it is the most likely to time out and restart the worker.
    const reference = await runTests(attempt.referenceSolution, edgeTest, false);
    const original = await runTests(challenge.code, edgeTest, Boolean(reference.timedOut));
    const fixed = await runTests(
      attempt.code,
      toRunnerTests(attempt.tests),
      Boolean(original.timedOut),
    );
    return {
      testResults: toTestResults(attempt.tests, fixed.results),
      edgeCaseCheck: toEdgeCaseCheck(original, reference),
    };
  }

  /** Recovery after an evaluation that may be stored, or a 409 (docs/API.md). */
  async function recover(signal, repostAllowed) {
    const attempt = attemptRef.current;
    if (!attempt.userId) {
      fail('unknown', MESSAGES.resultMaybeSaved, { withProgressLink: false });
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
    } catch {
      if (signal.aborted) return;
      fail('unknown', MESSAGES.resultMaybeSaved, { withProgressLink: true });
      return;
    }
    if (signal.aborted) return;

    if (item?.status === 'evaluated') {
      const testResults = payloadRef.current.testResults;
      setSubmission({
        phase: 'recovered',
        item,
        testsPassed: countPassed(testResults),
        testsTotal: attempt.tests.length,
      });
      requestFocus('recovered-heading');
      return;
    }

    if (item && repostAllowed) {
      setSubmission({ phase: 'evaluating' });
      try {
        const evaluation = assertEvaluationResponse(
          await submitEvaluation(attempt.attemptId, payloadRef.current, { signal }),
        );
        if (signal.aborted) return;
        finish(evaluation);
        return;
      } catch (error) {
        if (signal.aborted) return;
        if (isAlreadyEvaluated(error)) {
          await recover(signal, false);
          return;
        }
      }
    }
    fail('unknown', MESSAGES.resultMaybeSaved, { withProgressLink: true });
  }

  async function evaluate(signal) {
    const attempt = attemptRef.current;
    setSubmission({ phase: 'evaluating' });
    try {
      const evaluation = assertEvaluationResponse(
        await submitEvaluation(attempt.attemptId, payloadRef.current, { signal }),
      );
      if (signal.aborted) return;
      finish(evaluation);
    } catch (error) {
      if (signal.aborted) return;
      if (isMaybeSaved(error) || isAlreadyEvaluated(error)) {
        await recover(signal, true);
        return;
      }
      fail('evalFailed', isAbortError(error) ? MESSAGES.interrupted : error?.message);
    }
  }

  async function runAndEvaluate() {
    const signal = getSignal();
    const attempt = attemptRef.current;
    setSubmission({ phase: 'testing' });
    let payload;
    try {
      payload = await runSubmitTests(attempt, signal);
    } catch (error) {
      if (signal.aborted) return;
      fail(
        'testsFailed',
        `Testovi nisu pokrenuti, pa rezultat nije poslat. ${error?.message ?? ''}`,
      );
      return;
    }
    if (signal.aborted) return;
    payloadRef.current = payload;
    await evaluate(signal);
  }

  async function handleSubmit() {
    if (!editable || !ready) return;
    const { errors: found, edgeCase } = validateAnswer({ selectedLines, code, ...values });
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      requestFocus(FIELD_IDS[firstInvalid]);
      return;
    }

    const signal = getSignal();
    const userId = user?.userId ?? null;
    const durationSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    setSubmission({ phase: 'creating' });
    let created;
    try {
      created = assertAttemptResponse(
        await createAttempt(
          {
            challengeId: challenge.id,
            userId,
            selectedLines,
            explanation: values.explanation,
            edgeCase,
            fixedCode: code,
            hintsUsed: hints.length,
            durationSec,
          },
          { signal },
        ),
      );
    } catch (error) {
      if (signal.aborted) return;
      if (isMaybeSaved(error)) {
        fail('createFailed', MESSAGES.attemptMaybeLost, { maybeSaved: true });
      } else {
        fail('createFailed', isAbortError(error) ? MESSAGES.interrupted : error?.message);
      }
      return;
    }
    if (signal.aborted) return;
    setStoppedAt(Date.now());
    attemptRef.current = {
      attemptId: created.attemptId,
      tests: created.tests,
      referenceSolution: created.referenceSolution,
      userId,
      code,
      edgeCase,
    };
    await runAndEvaluate();
  }

  const visiblePassed = visibleRun.status === 'done' ? countPassed(visibleRun.results) : 0;
  let visibleStatus = '';
  if (visibleRun.status === 'running') visibleStatus = 'Pokrećem testove…';
  else if (visibleRun.status === 'done') {
    visibleStatus = `${visiblePassed} od ${challenge.visibleTests.length} vidljivih testova je prošlo.`;
  }

  let submitNote = null;
  if (!ready) submitNote = 'Predaja je moguća kada se pokretač testova učita.';

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>Jezik: {challenge.language}</span>
        <span>Težina: {challenge.difficulty}</span>
        <span>Kategorija: {challenge.bugCategory}</span>
        <ChallengeTimer startedAt={startedAt} stoppedAt={stoppedAt} />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="task-heading">
            <h2 id="task-heading" className="text-lg font-semibold">
              Zadatak
            </h2>
            <p className="mt-1 whitespace-pre-wrap">{challenge.description}</p>
          </section>

          <section aria-labelledby="code-heading">
            <h2 id="code-heading" className="text-lg font-semibold">
              Kod
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Klikni broj linije da je označiš kao sumnjivu, zatim ispravi kod u editoru.
            </p>
            <div className="mt-2">
              <CodeEditor
                code={code}
                onChange={changeCode}
                selectedLines={selectedLines}
                onToggleLine={toggleLine}
                readOnly={!editable}
              />
            </div>
            <p className="mt-2 text-sm">
              {selectedLines.length > 0
                ? `Označene linije: ${selectedLines.join(', ')}`
                : 'Nijedna linija nije označena.'}
            </p>
            {errors.lines && (
              <p
                id={FIELD_IDS.lines}
                tabIndex={-1}
                className="mt-1 text-sm text-red-800 focus:outline-none"
              >
                <span aria-hidden="true">⚠ </span>
                {errors.lines}
              </p>
            )}
            {errors.code && (
              <p
                id={FIELD_IDS.code}
                tabIndex={-1}
                className="mt-1 text-sm text-red-800 focus:outline-none"
              >
                <span aria-hidden="true">⚠ </span>
                {errors.code}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={!ready || !editable || visibleRun.status === 'running'}
                onClick={handleRunVisible}
              >
                Pokreni vidljive testove
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={!editable || code === challenge.code}
                onClick={() => changeCode(challenge.code)}
              >
                Vrati original
              </button>
            </div>

            {loadError ? (
              <p className={`mt-2 ${ALERT}`}>
                <span aria-hidden="true">⚠ </span>
                {loadError}
              </p>
            ) : (
              !ready && <p className="mt-2 text-sm text-slate-700">Pokretač testova se učitava…</p>
            )}

            <p role="status" aria-live="polite" className="mt-2 font-medium">
              {visibleStatus}
            </p>
            {visibleRun.status === 'error' && (
              <p role="alert" className={`mt-2 ${ALERT}`}>
                <span aria-hidden="true">⚠ </span>
                Testovi nisu pokrenuti. {visibleRun.message}
              </p>
            )}
            {visibleRun.status === 'done' && (
              <ChallengeTestSummary
                functionName={challenge.functionName}
                tests={challenge.visibleTests}
                results={visibleRun.results}
                timedOut={visibleRun.timedOut}
              />
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <AnswerForm
            values={values}
            errors={errors}
            onChange={changeValue}
            onSubmit={handleSubmit}
            functionName={challenge.functionName}
            disabled={!editable}
            submitDisabled={!editable || !ready}
            submitNote={submitNote}
          />

          <div role="status" aria-live="polite" className="font-medium">
            {SUBMIT_STATUS[submission.phase] ?? ''}
          </div>

          <SubmissionOutcome
            submission={submission}
            onRetryCreate={handleSubmit}
            onRetryTests={runAndEvaluate}
            onRetryEvaluation={() => evaluate(getSignal())}
          />

          <HintPanel
            hints={hints}
            maxLevel={maxHintLevel}
            loading={hintLoading}
            error={hintError}
            disabled={!editable}
            onRequest={handleHint}
          />
        </div>
      </div>
    </>
  );
}

function SubmissionOutcome({ submission, onRetryCreate, onRetryTests, onRetryEvaluation }) {
  const { phase } = submission;

  if (phase === 'recovered') {
    const { item, testsPassed, testsTotal } = submission;
    return (
      <section
        aria-labelledby="recovered-heading"
        className="rounded border-l-4 border-green-700 bg-green-50 px-3 py-2 text-green-950"
      >
        <h2
          id="recovered-heading"
          tabIndex={-1}
          className="text-lg font-semibold focus:outline-none"
        >
          <span aria-hidden="true">✓ </span>
          Rezultat je sačuvan
        </h2>
        <p className="mt-1">
          Bodovi: <strong>{item.score}</strong> od 100. Testovi: {testsPassed} od {testsTotal} je
          prošlo.
        </p>
        {item.feedbackSource && (
          <p className="text-sm">{FEEDBACK_SOURCE_LABEL[item.feedbackSource] ?? ''}</p>
        )}
        <p className="mt-1 text-sm">Tekst povratne informacije nije moguće ponovo učitati.</p>
        <p className="mt-2">
          <Link to={paths.progress} className={LINK}>
            Pogledaj svoj napredak
          </Link>
        </p>
      </section>
    );
  }

  const alerts = {
    createFailed: submission.maybeSaved
      ? { action: onRetryCreate, label: 'Pošalji ponovo' }
      : { action: null },
    testsFailed: { action: onRetryTests, label: 'Pokreni testove ponovo' },
    evalFailed: { action: onRetryEvaluation, label: 'Pošalji rezultat ponovo' },
    unknown: { action: null },
  };
  const alert = alerts[phase];
  if (!alert) return null;

  return (
    <div id="submit-alert" role="alert" tabIndex={-1} className={ALERT}>
      <p>
        <span aria-hidden="true">⚠ </span>
        {submission.message || 'Došlo je do greške. Pokušaj ponovo.'}
      </p>
      {phase === 'unknown' && submission.withProgressLink && (
        <p className="mt-1">
          <Link to={paths.progress} className={LINK}>
            Pogledaj svoj napredak
          </Link>
        </p>
      )}
      {alert.action && (
        <button type="button" className={`mt-2 ${SECONDARY_BUTTON}`} onClick={alert.action}>
          {alert.label}
        </button>
      )}
    </div>
  );
}

function isPublicChallenge(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    typeof data.code === 'string' &&
    typeof data.functionName === 'string' &&
    Array.isArray(data.visibleTests)
  );
}

export default function ChallengePage() {
  const { id } = useParams();
  const [reloadCount, setReloadCount] = useState(0);
  const loadKey = `${id}\n${reloadCount}`;
  const [load, setLoad] = useState({ key: null });

  useEffect(() => {
    const controller = new AbortController();
    getChallenge(id, { signal: controller.signal })
      .then((challenge) => {
        if (!isPublicChallenge(challenge)) {
          setLoad({ key: loadKey, status: 'error', message: 'Izazov nije moguće prikazati.' });
          return;
        }
        setLoad({ key: loadKey, status: 'ready', challenge, startedAt: Date.now() });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error?.status === 404) {
          setLoad({ key: loadKey, status: 'notFound' });
          return;
        }
        setLoad({
          key: loadKey,
          status: 'error',
          message: error?.message || 'Izazov nije moguće učitati.',
        });
      });
    return () => controller.abort();
  }, [id, loadKey]);

  const current = load.key === loadKey ? load : { status: 'loading' };
  const ready = current.status === 'ready';
  usePageTitle(ready ? current.challenge.title : `Izazov ${id}`);

  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        {ready ? (
          current.challenge.title
        ) : (
          <>
            Izazov <span className="font-mono">{id}</span>
          </>
        )}
      </h1>

      {current.status === 'loading' && (
        <p role="status" className="mt-2 text-slate-700">
          Učitavanje izazova…
        </p>
      )}

      {current.status === 'notFound' && (
        <div role="alert" className={`mt-2 ${ALERT}`}>
          <p>
            <span aria-hidden="true">⚠ </span>
            Izazov ne postoji.
          </p>
          <p className="mt-1">
            <Link to={paths.home} className={LINK}>
              Nazad na izazove
            </Link>
          </p>
        </div>
      )}

      {current.status === 'error' && (
        <div role="alert" className={`mt-2 ${ALERT}`}>
          <p>
            <span aria-hidden="true">⚠ </span>
            {current.message}
          </p>
          <button
            type="button"
            className={`mt-2 ${SECONDARY_BUTTON}`}
            onClick={() => setReloadCount((n) => n + 1)}
          >
            Pokušaj ponovo
          </button>
        </div>
      )}

      {ready && (
        <ChallengeWorkspace
          key={loadKey}
          challenge={current.challenge}
          startedAt={current.startedAt}
        />
      )}
    </>
  );
}
