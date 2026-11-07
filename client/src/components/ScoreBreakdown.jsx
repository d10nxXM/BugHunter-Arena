// Shows the score breakdown computed by the server (docs/SCORING.md). Never computes points.
import { progressPercent } from './ui/progress.js';

const ROWS = [
  { key: 'lineIdentification', label: 'Finding the bug line', max: '40', points: 40 },
  { key: 'explanation', label: 'Explanation', max: '30', points: 30 },
  { key: 'edgeCase', label: 'Edge case', max: '20', points: 20 },
  { key: 'fix', label: 'Code fix', max: '10', points: 10 },
  { key: 'hintPenalty', label: 'Hint penalty', max: 'up to -20', points: null },
];

function formatPoints(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

/** Decorative bar under a row label; the numbers in the row carry the meaning. */
function RowBar({ value, max }) {
  const percent = progressPercent(value, max);
  const tone = percent >= 100 ? 'bg-accent' : percent > 0 ? 'bg-amber' : 'bg-track';
  return (
    <span
      aria-hidden="true"
      className="mt-2 block h-1 w-full overflow-hidden rounded-[2px] bg-track"
    >
      {/* Width is computed, so it is the one allowed inline style. */}
      <span className={`block h-full rounded-[2px] ${tone}`} style={{ width: `${percent}%` }} />
    </span>
  );
}

/**
 * @param {{
 *   score: number,
 *   breakdown: { lineIdentification: number, explanation: number, edgeCase: number, fix: number, hintPenalty: number },
 * }} props
 */
export default function ScoreBreakdown({ score, breakdown }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Points per part</caption>
      <thead>
        <tr className="border-b border-border font-mono text-xs text-subtle uppercase">
          <th scope="col" className="pt-1 pr-4 pb-3 font-medium">
            Part
          </th>
          <th scope="col" className="pt-1 pr-4 pb-3 text-right font-medium">
            Points
          </th>
          <th scope="col" className="pt-1 pb-3 text-right font-medium">
            Max
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(({ key, label, max, points }) => {
          const value = breakdown?.[key];
          const negative = key === 'hintPenalty' && typeof value === 'number' && value < 0;
          return (
            <tr key={key} className="border-b border-surface-2">
              <th scope="row" className="py-3 pr-4 font-normal text-text">
                {label}
                {points !== null && <RowBar value={value} max={points} />}
              </th>
              <td
                className={`py-3 pr-4 text-right align-top font-mono font-semibold tabular-nums ${
                  negative ? 'text-hard' : 'text-heading'
                }`}
              >
                {formatPoints(value)}
              </td>
              <td className="py-3 text-right align-top font-mono text-subtle tabular-nums">
                {max}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-3.5 pr-4 font-display text-base font-bold text-heading">
            Total
          </th>
          <td className="pt-3.5 pr-4 text-right font-mono text-base font-bold text-accent tabular-nums">
            {formatPoints(score)}
          </td>
          <td className="pt-3.5 text-right font-mono text-subtle tabular-nums">100</td>
        </tr>
      </tfoot>
    </table>
  );
}
