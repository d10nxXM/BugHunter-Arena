import StatusIcon from './ui/StatusIcon.jsx';

// Per-test results after submit. Status is shown by text and icon, never by color alone.

const STATUS = {
  passed: { text: 'Passed', icon: 'passed' },
  failed: { text: 'Failed', icon: 'failed' },
  timeout: { text: 'Timed out (3 s)', icon: 'timeout' },
  missing: { text: 'Not run', icon: 'pending' },
};

/** Same rule as docs/SCORING.md: passed only when passed is true and error is not "timeout". */
function statusOf(result) {
  if (!result) return 'missing';
  if (result.error === 'timeout') return 'timeout';
  return result.passed === true ? 'passed' : 'failed';
}

function formatValue(value) {
  if (value === undefined) return '—';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args) {
  return Array.isArray(args) ? args.map(formatValue).join(', ') : formatValue(args);
}

const TH = 'px-4 py-3 font-mono text-xs font-medium text-subtle uppercase';

/**
 * @param {{
 *   tests: Array<{ id: string, args: unknown[], expected: unknown, visible: boolean }>,
 *   results: Array<{ id: string, passed: boolean, actual?: unknown, error?: string | null }>,
 * }} props
 */
export default function TestResults({ tests, results }) {
  const byId = new Map((results ?? []).map((r) => [r.id, r]));

  if (!tests?.length) {
    return <p className="text-muted">There are no tests to show.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <caption className="sr-only">Test results</caption>
        <thead className="bg-surface-2">
          <tr>
            <th scope="col" className={TH}>
              Test
            </th>
            <th scope="col" className={TH}>
              Input
            </th>
            <th scope="col" className={TH}>
              Expected
            </th>
            <th scope="col" className={TH}>
              Got
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => {
            const result = byId.get(test.id);
            const status = STATUS[statusOf(result)];
            const errorText =
              result?.error && result.error !== 'timeout' ? String(result.error) : null;
            return (
              <tr key={test.id} className="border-t border-surface-2 align-top">
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="font-mono text-text">{test.id}</span>
                  <span className="block text-xs text-subtle">
                    {test.visible ? 'visible' : 'hidden'}
                  </span>
                </th>
                <td className="px-4 py-3 font-mono break-all text-muted">
                  {formatArgs(test.args)}
                </td>
                <td className="px-4 py-3 font-mono break-all text-muted">
                  {formatValue(test.expected)}
                </td>
                <td className="px-4 py-3 font-mono break-all text-text">
                  {result ? formatValue(result.actual) : '—'}
                  {errorText && (
                    <span className="mt-1 block font-sans text-xs whitespace-pre-wrap text-hard">
                      Error: {errorText}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusIcon status={status.icon} label={status.text} showLabel />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
