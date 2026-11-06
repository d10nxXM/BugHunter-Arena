import { STATUSES } from './statuses.jsx';

/**
 * Status as icon plus text, never color alone. The text is visible with `showLabel`, otherwise
 * visually hidden but read by screen readers. `label` overrides the default text.
 */
export default function StatusIcon({ status, label, showLabel = false, className = '' }) {
  const entry = STATUSES[status] ?? STATUSES.pending;
  const text = label ?? entry.label;
  return (
    <span className={`inline-flex items-center gap-1.5 ${entry.color} ${className}`}>
      <svg
        aria-hidden="true"
        focusable="false"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        {entry.icon}
      </svg>
      <span className={showLabel ? 'text-sm font-medium' : 'sr-only'}>{text}</span>
    </span>
  );
}
