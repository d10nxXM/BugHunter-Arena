import { progressPercent } from './progress.js';

const FILLS = {
  accent: 'bg-accent',
  easy: 'bg-easy',
  medium: 'bg-medium',
  hard: 'bg-hard',
  amber: 'bg-amber',
};

/**
 * Thin progress bar. `label` is its accessible name (required, since the bar has no visible text
 * of its own); `valueText` overrides the announced value, e.g. "58 of 140 solved".
 */
export default function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = 'accent',
  className = '',
}) {
  const percent = progressPercent(value, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${percent}%`}
      className={`h-1.5 w-full overflow-hidden rounded-[3px] bg-track ${className}`}
    >
      {/* Width is computed, so it is the one allowed inline style. */}
      <div
        className={`h-full rounded-[3px] ${FILLS[tone] ?? FILLS.accent}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
