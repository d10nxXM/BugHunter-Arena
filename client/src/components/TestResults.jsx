// Per-test results after submit. Status is shown by text and icon, never by color alone.

const STATUS = {
  passed: {
    text: 'Prošao',
    icon: '✓',
    className: 'border-emerald-700 bg-emerald-50 text-emerald-900',
  },
  failed: { text: 'Pao', icon: '✗', className: 'border-red-700 bg-red-50 text-red-900' },
  timeout: {
    text: 'Prekinut (3 s)',
    icon: '⏱',
    className: 'border-amber-700 bg-amber-50 text-amber-900',
  },
  missing: {
    text: 'Nije pokrenut',
    icon: '–',
    className: 'border-slate-500 bg-slate-100 text-slate-800',
  },
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

/**
 * @param {{
 *   tests: Array<{ id: string, args: unknown[], expected: unknown, visible: boolean }>,
 *   results: Array<{ id: string, passed: boolean, actual?: unknown, error?: string | null }>,
 * }} props
 */
export default function TestResults({ tests, results }) {
  const byId = new Map((results ?? []).map((r) => [r.id, r]));

  if (!tests?.length) {
    return <p className="text-slate-700">Nema testova za prikaz.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Rezultati testova</caption>
        <thead>
          <tr className="border-b border-slate-300 text-slate-700">
            <th scope="col" className="py-2 pr-4 font-semibold">
              Test
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Ulaz
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Očekivano
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Dobijeno
            </th>
            <th scope="col" className="py-2 font-semibold">
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
              <tr key={test.id} className="border-b border-slate-200 align-top">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <span className="font-mono">{test.id}</span>
                  <span className="block text-xs text-slate-700">
                    {test.visible ? 'vidljivi' : 'skriveni'}
                  </span>
                </th>
                <td className="py-2 pr-4 font-mono break-all">{formatArgs(test.args)}</td>
                <td className="py-2 pr-4 font-mono break-all">{formatValue(test.expected)}</td>
                <td className="py-2 pr-4 font-mono break-all">
                  {result ? formatValue(result.actual) : '—'}
                  {errorText && (
                    <span className="mt-1 block font-sans text-xs whitespace-pre-wrap text-red-900">
                      Greška: {errorText}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium whitespace-nowrap ${status.className}`}
                  >
                    <span aria-hidden="true">{status.icon}</span>
                    {status.text}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
