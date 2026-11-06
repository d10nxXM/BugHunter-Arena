const INPUT =
  'min-h-12 w-full rounded-[10px] border bg-surface px-3.5 text-[15px] text-heading ' +
  'placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent';

/**
 * Labelled text input for the auth forms. The hint and the error are linked with
 * aria-describedby; an error sets aria-invalid and shows an icon plus text (not color alone).
 * `prefix` is shown before the input (the "@" of the handle). `ref` reaches the input.
 */
export default function AuthField({
  id,
  label,
  hint,
  error,
  prefix,
  className = '',
  ref,
  ...inputProps
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const border = error ? 'border-hard' : 'border-border-strong';

  const input = (
    <input
      id={id}
      ref={ref}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={
        prefix
          ? `min-h-11 min-w-0 flex-1 bg-transparent pr-3.5 pl-1 font-mono text-[15px] text-heading placeholder:text-subtle focus:outline-none`
          : `${INPUT} ${border}`
      }
      {...inputProps}
    />
  );

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {prefix ? (
        <div
          className={`flex min-h-12 items-center rounded-[10px] border bg-surface pl-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${border}`}
        >
          <span aria-hidden="true" className="font-mono text-[15px] text-subtle">
            {prefix}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-hard">
          <span aria-hidden="true">✕</span>
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[13px] text-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}
