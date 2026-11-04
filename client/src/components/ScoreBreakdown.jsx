// Shows the score breakdown computed by the server (docs/SCORING.md). Never computes points.

const ROWS = [
  { key: 'lineIdentification', label: 'Pronalaženje linije s greškom', max: '40' },
  { key: 'explanation', label: 'Objašnjenje', max: '30' },
  { key: 'edgeCase', label: 'Granični slučaj', max: '20' },
  { key: 'fix', label: 'Ispravka koda', max: '10' },
  { key: 'hintPenalty', label: 'Kazna za nagovještaje', max: 'do -20' },
];

function formatPoints(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

/**
 * @param {{
 *   score: number,
 *   breakdown: { lineIdentification: number, explanation: number, edgeCase: number, fix: number, hintPenalty: number },
 * }} props
 */
export default function ScoreBreakdown({ score, breakdown }) {
  return (
    <table className="w-full max-w-xl border-collapse text-left">
      <caption className="sr-only">Bodovi po dijelovima</caption>
      <thead>
        <tr className="border-b border-slate-300 text-sm text-slate-700">
          <th scope="col" className="py-2 pr-4 font-semibold">
            Dio
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-semibold">
            Bodovi
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            Maksimum
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(({ key, label, max }) => {
          const value = breakdown?.[key];
          const negative = key === 'hintPenalty' && typeof value === 'number' && value < 0;
          return (
            <tr key={key} className="border-b border-slate-200">
              <th scope="row" className="py-2 pr-4 font-normal">
                {label}
              </th>
              <td
                className={`py-2 pr-4 text-right font-mono tabular-nums ${
                  negative ? 'text-red-800' : 'text-slate-900'
                }`}
              >
                {formatPoints(value)}
              </td>
              <td className="py-2 text-right font-mono text-slate-700 tabular-nums">{max}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="py-2 pr-4 font-bold">
            Ukupno
          </th>
          <td className="py-2 pr-4 text-right font-mono font-bold tabular-nums">
            {formatPoints(score)}
          </td>
          <td className="py-2 text-right font-mono text-slate-700 tabular-nums">100</td>
        </tr>
      </tfoot>
    </table>
  );
}
