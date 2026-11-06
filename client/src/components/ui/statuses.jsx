const CHECK = <path d="M20 6L9 17l-5-5" />;
const CROSS = (
  <>
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </>
);
const CLOCK = (
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2 2" />
  </>
);
const ALERT = (
  <>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4" />
    <path d="M12 17.5v.5" />
  </>
);
const CIRCLE = <circle cx="12" cy="12" r="8" />;

/** Status -> icon, color and default text. Every status has its own icon shape and text. */
export const STATUSES = {
  passed: { icon: CHECK, color: 'text-accent', label: 'Passed' },
  solved: { icon: CHECK, color: 'text-accent', label: 'Solved' },
  failed: { icon: CROSS, color: 'text-hard', label: 'Failed' },
  error: { icon: ALERT, color: 'text-hard', label: 'Error' },
  timeout: { icon: CLOCK, color: 'text-amber', label: 'Timed out' },
  attempted: { icon: CLOCK, color: 'text-amber', label: 'Attempted' },
  pending: { icon: CIRCLE, color: 'text-subtle', label: 'Not started' },
};
