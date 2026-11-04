import ChallengeTestSummary from './ChallengeTestSummary.jsx';
import { FIELD_IDS, countPassed } from './ChallengeSubmitFlow.js';
import CodeEditor from './CodeEditor.jsx';

const BUTTON =
  'rounded border border-slate-500 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-slate-500';
const NOTICE = 'rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} tabIndex={-1} className="mt-1 text-sm text-red-800 focus:outline-none">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  );
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
  if (visibleRun.status === 'running') status = 'Pokrećem testove…';
  else if (visibleRun.status === 'done') {
    status = `${countPassed(visibleRun.results)} od ${challenge.visibleTests.length} vidljivih testova je prošlo.`;
  }
  const stale = visibleRun.status === 'done' && visibleRun.code !== code;

  return (
    <section aria-labelledby="code-heading">
      <h2 id="code-heading" className="text-lg font-semibold">
        Kod
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        Klikni broj linije da je označiš kao sumnjivu, zatim ispravi kod u editoru.
      </p>
      <div className="mt-2">
        <CodeEditor
          key={challenge.id}
          code={code}
          originalCode={challenge.code}
          onChange={onCodeChange}
          selectedLines={selectedLines}
          onToggleLine={onToggleLine}
          readOnly={!editable}
        />
      </div>
      <p className="mt-2 text-sm">
        {selectedLines.length > 0
          ? `Označene linije: ${selectedLines.join(', ')}`
          : 'Nijedna linija nije označena.'}
      </p>
      <FieldError id={FIELD_IDS.lines} message={errors.lines} />
      <FieldError id={FIELD_IDS.code} message={errors.code} />

      <button
        type="button"
        className={`mt-3 ${BUTTON}`}
        aria-disabled={runBlocked}
        onClick={() => {
          if (!runBlocked) onRunVisible();
        }}
      >
        Pokreni vidljive testove
      </button>

      {runner.loadError ? (
        <p className={`mt-2 ${NOTICE}`}>
          <span aria-hidden="true">⚠ </span>
          {runner.loadError}
        </p>
      ) : (
        !runner.ready && (
          <p className="mt-2 text-sm text-slate-700">Pokretač testova se učitava…</p>
        )
      )}

      <p role="status" aria-live="polite" className="mt-2 font-medium">
        {status}
      </p>
      {visibleRun.status === 'error' && (
        <p role="alert" className={`mt-2 ${NOTICE}`}>
          <span aria-hidden="true">⚠ </span>
          Testovi nisu pokrenuti. {visibleRun.message}
        </p>
      )}
      {stale && <p className="mt-1 text-sm text-slate-700">Rezultat je za raniji kod.</p>}
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
