// Every tone keeps its text >= 4.5:1 on its own background.
const TONES = {
  danger: 'border-hard/40 bg-hard-soft text-hard',
  amber: 'border-amber/40 bg-amber-soft text-amber',
  accent: 'border-accent/40 bg-accent-soft text-accent',
  neutral: 'border-border bg-surface-3 text-muted',
};

const ICONS = { danger: '⚠', amber: '⚠', accent: '✓', neutral: 'ℹ' };

/**
 * Message box: icon plus text, never color alone. `as` picks the element (p, div, section...);
 * extra props (role, id, tabIndex...) go to it. `icon={null}` hides the icon.
 */
export default function Notice({
  tone = 'danger',
  as: Element = 'div',
  icon,
  className = '',
  children,
  ...rest
}) {
  const toneClass = TONES[tone] ?? TONES.danger;
  const glyph = icon === undefined ? ICONS[tone] : icon;
  return (
    <Element
      className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-sm ${toneClass} ${className}`}
      {...rest}
    >
      {glyph && (
        <span aria-hidden="true" className="leading-5">
          {glyph}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 leading-5">{children}</div>
    </Element>
  );
}
