import ChallengeTestSummary from './ChallengeTestSummary.jsx';
import { countPassed } from '../lib/runnerPayload.js';
import { FIELD_IDS } from '../lib/submitConstants.js';
import CodeEditor from './CodeEditor.jsx';
import Badge from './ui/Badge.jsx';
import Button from './ui/Button.jsx';
import Notice from './ui/Notice.jsx';

const H2 = 'font-display text-[19px] font-semibold text-heading';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p
      id={id}
      tabIndex={-1}
      className="flex items-start gap-1.5 text-sm text-hard focus:outline-none max-sm:px-4"
    >
      <span aria-hidden="true">✕</span>
      {message}
    </p>
  );
}

/** Python file name for the editor's title bar, e.g. "find_max.py". */
function fileNameOf(functionName) {
  return typeof functionName === 'string' && functionName ? `${functionName}.py` : undefined;
}

/**
 * Code, line selection and the visible-test run. visibleRun is
 * { status: 'idle' | 'running' | 'done' | 'error', code?, results?, timedOut?, message? }.
 */
export default function ChallengeCodePanel({
  challenge,
  code,
  onCodeChange,
  selectedLines,
  onToggleLine,
  editable,
  errors,
  runner,
  visibleRun,
  onRunVisible,
}) {
  const runBlocked = !runner.ready || !editable || visibleRun.status === 'running';
  let status = '';
  if (visibleRun.status === 'running') status = 'Running tests…';
  else if (visibleRun.status === 'done') {
    status = `${countPassed(visibleRun.results)} of ${challenge.visibleTests.length} visible tests passed.`;
  }
  const stale = visibleRun.status === 'done' && visibleRun.code !== code;

  return (
    <section aria-labelledby="code-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="code-heading" className={H2}>
          Code
        </h2>
        <p className="text-sm text-muted">
          Click a line number to flag it as suspicious, then fix the code in the editor.
        </p>
      </div>

      {/* Full width on phones: the editor reaches the screen edges. */}
      <div className="-mx-4 sm:mx-0">
        <CodeEditor
          key={challenge.id}
          code={code}
          originalCode={challenge.code}
          onChange={onCodeChange}
          selectedLines={selectedLines}
          onToggleLine={onToggleLine}
          readOnly={!editable}
          fileName={fileNameOf(challenge.functionName)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {selectedLines.length > 0 ? (
          <>
            <span className="text-muted">Flagged lines:</span>
            {selectedLines.map((n) => (
              <Badge key={n} tone="amber" mono>
                {n}
              </Badge>
            ))}
          </>
        ) : (
          <span className="text-subtle">No lines flagged yet.</span>
        )}
      </div>
      <FieldError id={FIELD_IDS.lines} message={errors.lines} />
      <FieldError id={FIELD_IDS.code} message={errors.code} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={runBlocked} onClick={onRunVisible}>
          <span aria-hidden="true">▷</span>
          Run visible tests
        </Button>
        {!runner.loadError && !runner.ready && (
          <p className="text-sm text-subtle">
            <span aria-hidden="true" className="mr-1.5 inline-block animate-pulse text-amber">
              ●
            </span>
            Loading the test runner…
          </p>
        )}
        <p role="status" aria-live="polite" className="text-sm font-medium text-text">
          {status}
        </p>
      </div>

      {runner.loadError && (
        <Notice tone="danger">
          <p>{runner.loadError}</p>
        </Notice>
      )}
      {visibleRun.status === 'error' && (
        <Notice role="alert" tone="danger">
          <p>The tests did not run. {visibleRun.message}</p>
        </Notice>
      )}
      {stale && (
        <p className="text-sm text-subtle">These results are for an earlier version of the code.</p>
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
  );
}
