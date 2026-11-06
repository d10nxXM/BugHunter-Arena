// Class strings for button-styled elements, shared by Button and links that should look like one.

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-sans font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-easy',
  secondary: 'border border-border-strong bg-transparent text-heading hover:bg-surface-3',
  ghost: 'bg-transparent text-muted hover:text-heading',
};

const SIZES = {
  sm: 'min-h-10 px-3.5 text-sm',
  md: 'min-h-11 px-5 text-[15px]',
};

/** Class string for a button-styled element. Exported so links in other components can match. */
export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const s = SIZES[size] ?? SIZES.md;
  return `${BASE} ${v} ${s} ${className}`.trim();
}
