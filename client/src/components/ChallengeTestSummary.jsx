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
  if (result.error === 'timeout') {
    return {
      icon: '⏱',
      text: 'Prekinut (3 s)',
      className: 'border-amber-600 bg-amber-50 text-amber-900',
    };
  }
  if (result.passed) {
    return { icon: '✓', text: 'Prošao', className: 'border-green-700 bg-green-50 text-green-900' };
  }
  return { icon: '✗', text: 'Pao', className: 'border-red-700 bg-red-50 text-red-900' };
}

/**
 * @param {{ functionName: string, tests: Array<{ id: string, args: unknown[], expected: unknown }>,
 *   results: Array<{ id: string, passed: boolean, actual: unknown, error?: string | null }>,
 *   timedOut: boolean }} props
 */
export default function ChallengeTestSummary({ functionName, tests, results, timedOut }) {
  const byId = new Map(results.map((r) => [r.id, r]));

  return (
    <div className="mt-3">
      {timedOut && (
        <p className="text-amber-900">
          <span aria-hidden="true">⏱ </span>
          Testovi su prekinuti nakon 3 s. Kod se vjerovatno vrti u beskonačnoj petlji.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {tests.map((test) => {
          const result = byId.get(test.id);
          if (!result) return null;
          const s = status(result);
          return (
            <li key={test.id} className={`rounded border-l-4 px-3 py-2 text-sm ${s.className}`}>
              <p className="font-semibold">
                <span aria-hidden="true">{s.icon} </span>
                {s.text}
              </p>
              <p className="font-mono break-all">
                {functionName}({test.args.map(show).join(', ')})
              </p>
              <p>
                Očekivano: <code className="font-mono">{show(test.expected)}</code>; dobijeno:{' '}
                <code className="font-mono">{show(result.actual)}</code>
              </p>
              {result.error && result.error !== 'timeout' && (
                <p className="font-mono break-all">Greška: {result.error}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
