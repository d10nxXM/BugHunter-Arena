import { useState } from 'react';
import { useHints } from '../hooks/useHints.js';
import { useRunnerGate } from '../hooks/useRunnerGate.js';
import { useSubmitFlow } from '../hooks/useSubmitFlow.js';
import { useTestRunner } from '../hooks/useTestRunner.js';
import { useUser } from '../hooks/useUser.js';
import { validateAnswer } from '../lib/answerValidation.js';
import { toRunnerTests, toTestResults } from '../lib/runnerPayload.js';
import { FIELD_IDS, FIELD_ORDER, PHASES, SUBMIT_BUTTON_ID } from '../lib/submitConstants.js';
import { errorMessage } from '../lib/submitErrors.js';
import AnswerForm from './AnswerForm.jsx';
import ChallengeCodePanel from './ChallengeCodePanel.jsx';
import { useFocusRequest, useUnmountSignal } from './ChallengeHooks.js';
import ChallengeSubmissionOutcome from './ChallengeSubmissionOutcome.jsx';
import ChallengeTimer from './ChallengeTimer.jsx';
import HintPanel from './HintPanel.jsx';

/** The solve screen for one loaded challenge; remounted (keyed) per challenge. */
export default function ChallengeWorkspace({ challenge, startedAt }) {
  const { user } = useUser();
  const runner = useTestRunner();
  const safeRun = useRunnerGate(runner);
  const getSignal = useUnmountSignal();
  const requestFocus = useFocusRequest();
  const flow = useSubmitFlow({ challenge, safeRun, getSignal, requestFocus });

  const [code, setCode] = useState(challenge.code);
  const [selectedLines, setSelectedLines] = useState([]);
  const [values, setValues] = useState({ explanation: '', edgeArgs: '', edgeExpected: '' });
  const [errors, setErrors] = useState({});
  const [visibleRun, setVisibleRun] = useState({ status: 'idle' });

  const phase = PHASES[flow.submission.phase];
  const editable = phase.editable;
  const hints = useHints({
    challenge,
    getSignal,
    editable,
    selectedLines,
    explanation: values.explanation,
  });

  const sideBusy = hints.loading || visibleRun.status === 'running';
  const submitBlocked = !editable || !runner.ready || phase.busy || sideBusy;

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

  async function handleRunVisible() {
    if (!runner.ready || !editable || visibleRun.status === 'running') return;
    const signal = getSignal();
    const ranCode = code;
    setVisibleRun({ status: 'running' });
    try {
      const output = await safeRun(
        {
          code: ranCode,
          functionName: challenge.functionName,
          tests: toRunnerTests(challenge.visibleTests),
        },
        { signal },
      );
      const results = toTestResults(challenge.visibleTests, output?.results);
      if (!signal.aborted) {
        setVisibleRun({
          status: 'done',
          code: ranCode,
          results,
          timedOut: Boolean(output.timedOut),
        });
      }
    } catch (error) {
      if (!signal.aborted) setVisibleRun({ status: 'error', message: errorMessage(error) });
    }
  }

  function handleSubmit() {
    if (submitBlocked) return;
    const { errors: found, edgeCase } = validateAnswer({ selectedLines, code, ...values });
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      requestFocus(FIELD_IDS[firstInvalid]);
      return;
    }
    flow.submit({
      userId: user?.userId ?? null,
      selectedLines,
      explanation: values.explanation,
      edgeCase,
      fixedCode: code,
      hintsUsed: hints.hints.length,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    });
  }

  function handleOutcomeAction(action) {
    if (action === 'retryTests') flow.retryTests();
    else if (action === 'retryEvaluation') flow.retryEvaluation();
    else if (action === 'resubmit') {
      requestFocus(SUBMIT_BUTTON_ID);
      handleSubmit();
    }
  }

  let submitNote = null;
  if (!runner.ready) submitNote = 'Predaja je moguća kada se pokretač testova učita.';
  else if (editable && sideBusy) submitNote = 'Sačekaj da se završe testovi ili savjet.';

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>Jezik: {challenge.language}</span>
        <span>Težina: {challenge.difficulty}</span>
        <span>Kategorija: {challenge.bugCategory}</span>
        <ChallengeTimer startedAt={startedAt} stoppedAt={flow.stoppedAt} />
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="task-heading">
            <h2 id="task-heading" className="text-lg font-semibold">
              Zadatak
            </h2>
            <p className="mt-1 whitespace-pre-wrap">{challenge.description}</p>
          </section>
          <ChallengeCodePanel
            challenge={challenge}
            code={code}
            onCodeChange={changeCode}
            selectedLines={selectedLines}
            onToggleLine={toggleLine}
            editable={editable}
            errors={errors}
            runner={runner}
            visibleRun={visibleRun}
            onRunVisible={handleRunVisible}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <AnswerForm
            values={values}
            errors={errors}
            onChange={(field, value) => {
              setValues((prev) => ({ ...prev, [field]: value }));
              clearError(field);
            }}
            onSubmit={handleSubmit}
            functionName={challenge.functionName}
            disabled={!editable}
            submitDisabled={submitBlocked}
            submitNote={submitNote}
          />
          <div role="status" aria-live="polite" className="font-medium">
            {phase.status}
          </div>
          <ChallengeSubmissionOutcome submission={flow.submission} onAction={handleOutcomeAction} />
          <HintPanel
            hints={hints.hints}
            maxLevel={hints.maxLevel}
            loading={hints.loading}
            error={hints.error}
            disabled={!editable}
            onRequest={hints.request}
          />
        </div>
      </div>
    </>
  );
}
