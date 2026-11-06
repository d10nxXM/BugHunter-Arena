// Every tone keeps its text >= 4.5:1 on its own background.
const TONES = {
  neutral: 'bg-surface-3 text-muted',
  accent: 'bg-accent-soft text-accent',
  amber: 'bg-amber-soft text-amber',
  danger: 'bg-hard-soft text-hard',
};

/** Small rounded label. `mono` uses JetBrains Mono (languages, tags, counters). */
export default function Badge({
  tone = 'neutral',
  mono = false,
  className = '',
  children,
  ...rest
}) {
  const toneClass = TONES[tone] ?? TONES.neutral;
  const font = mono ? 'font-mono font-medium' : 'font-semibold';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${font} ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
