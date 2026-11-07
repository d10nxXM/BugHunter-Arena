import Notice from './ui/Notice.jsx';
import StatusIcon from './ui/StatusIcon.jsx';

// Inline pass/fail list for the visible tests run before submitting. The full result table on
// the result page belongs to ResultView (worker F).

function show(value) {
  if (value === undefined) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function status(result) {
  if (result.error === 'timeout') return { key: 'timeout', text: 'Timed out (3 s)' };
  if (result.passed) return { key: 'passed', text: 'Passed' };
  return { key: 'failed', text: 'Failed' };
}

const ROW_BORDER = {
  passed: 'border-l-accent',
  failed: 'border-l-hard',
  timeout: 'border-l-amber',
};

/**
 * @param {{ functionName: string, tests: Array<{ id: string, args: unknown[], expected: unknown }>,
 *   results: Array<{ id: string, passed: boolean, actual: unknown, error?: string | null }>,
 *   timedOut: boolean }} props
 */
export default function ChallengeTestSummary({ functionName, tests, results, timedOut }) {
  const byId = new Map(results.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col gap-3">
      {timedOut && (
        <Notice tone="amber" icon="⏱">
          <p>The tests were stopped after 3 s. The code is probably stuck in an endless loop.</p>
        </Notice>
      )}
      <ul className="flex flex-col gap-2">
        {tests.map((test) => {
          const result = byId.get(test.id);
          if (!result) return null;
          const s = status(result);
          return (
            <li
              key={test.id}
              className={`flex flex-col gap-1.5 rounded-[10px] border border-l-[3px] border-border bg-bg px-3.5 py-3 text-sm ${ROW_BORDER[s.key]}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 font-mono break-all text-heading">
                  {functionName}({test.args.map(show).join(', ')})
                </p>
                <StatusIcon status={s.key} label={s.text} showLabel />
              </div>
              <p className="text-muted">
                Expected <code className="font-mono text-text">{show(test.expected)}</code>, got{' '}
                <code className="font-mono text-text">{show(result.actual)}</code>
              </p>
              {result.error && result.error !== 'timeout' && (
                <p className="font-mono text-[13px] break-all text-hard">Error: {result.error}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
