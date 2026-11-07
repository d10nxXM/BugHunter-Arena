import { useRef, useState } from 'react';
import { useFocusRequest } from '../hooks/useFocusRequest.js';
import { useHints } from '../hooks/useHints.js';
import { useRunnerGate } from '../hooks/useRunnerGate.js';
import { useSubmitFlow } from '../hooks/useSubmitFlow.js';
import { useTestRunner } from '../hooks/useTestRunner.js';
import { useUnmountSignal } from '../hooks/useUnmountSignal.js';
import { useUser } from '../hooks/useUser.js';
import { validateAnswer } from '../lib/answerValidation.js';
import { toRunnerTests, toTestResults } from '../lib/runnerPayload.js';
import { FIELD_IDS, FIELD_ORDER, PHASES, SUBMIT_BUTTON_ID } from '../lib/submitConstants.js';
import { errorMessage, reportFailure } from '../lib/submitErrors.js';
import AnswerForm from './AnswerForm.jsx';
import ChallengeCodePanel from './ChallengeCodePanel.jsx';
import ChallengeSubmissionOutcome from './ChallengeSubmissionOutcome.jsx';
import ChallengeTimer from './ChallengeTimer.jsx';
import HintPanel from './HintPanel.jsx';
import Badge from './ui/Badge.jsx';
import DifficultyBadge from './ui/DifficultyBadge.jsx';
import { languageLabel } from '../lib/labels.js';

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
  // Blocks a second run before the next render (double clicks).
  const runningRef = useRef(false);

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
    if (!runner.ready || !editable || runningRef.current) return;
    runningRef.current = true;
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
      if (!signal.aborted) {
        reportFailure('browser visible run', error);
        setVisibleRun({ status: 'error', message: errorMessage(error) });
      }
    } finally {
      runningRef.current = false;
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
  if (!runner.ready) submitNote = 'You can submit once the test runner has loaded.';
  else if (editable && sideBusy) submitNote = 'Wait for the tests or the hint to finish.';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge mono>{languageLabel(challenge.language)}</Badge>
        <DifficultyBadge difficulty={challenge.difficulty} />
        {challenge.bugCategory && <Badge>{challenge.bugCategory}</Badge>}
        <div className="ml-auto">
          <ChallengeTimer startedAt={startedAt} stoppedAt={flow.stoppedAt} />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="task-heading"
            className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-5 sm:p-6"
          >
            <h2 id="task-heading" className="font-mono text-xs text-subtle uppercase">
              Task
            </h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-text">
              {challenge.description}
            </p>
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
        <div className="flex min-w-0 flex-col gap-5">
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
          <div
            role="status"
            aria-live="polite"
            className={
              phase.status ? 'flex items-center gap-2.5 text-sm font-medium text-accent' : 'sr-only'
            }
          >
            {phase.busy && phase.status && (
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
              />
            )}
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
