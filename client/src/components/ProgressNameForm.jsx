import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';
import { USER_CHANGED_MESSAGE } from '../context/UserProvider.jsx';

const MIN = 2;
const MAX = 32;
const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';

/** Montenegrin validation message for a display name, or null when it is valid (2-32 trimmed). */
function validate(name) {
  const length = name.trim().length;
  if (length === 0) return 'Unesi ime.';
  if (length < MIN) return `Ime mora imati najmanje ${MIN} znaka.`;
  if (length > MAX) return `Ime može imati najviše ${MAX} znaka.`;
  return null;
}

/** ApiError messages and USER_CHANGED_MESSAGE are Montenegrin texts that are safe to show. */
function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message === USER_CHANGED_MESSAGE) return USER_CHANGED_MESSAGE;
  return 'Ime nije sačuvano. Pokušaj ponovo.';
}

/**
 * Display-name form (FR-21).
 * @param {{
 *   onSubmit: (displayName: string, options: { signal: AbortSignal }) => Promise<unknown>,
 *   submitLabel: string,
 *   initialName?: string,
 *   onCancel?: () => void,
 *   persisted: boolean,
 *   focusOnMount?: boolean,
 * }} props
 */
export default function ProgressNameForm({
  onSubmit,
  submitLabel,
  initialName = '',
  onCancel,
  persisted,
  focusOnMount = false,
}) {
  const id = useId();
  const inputId = `${id}-name`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const invalid = validate(name);
    if (invalid) {
      setError(invalid);
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPending(true);
    try {
      await onSubmit(name.trim(), { signal: controller.signal });
    } catch (caught) {
      if (controller.signal.aborted || caught?.name === 'AbortError') return;
      setError(messageOf(caught));
      setPending(false);
      inputRef.current?.focus();
      return;
    }
    if (!controller.signal.aborted) setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-3">
      <div>
        <label htmlFor={inputId} className="block font-medium">
          Ime za prikaz
        </label>
        <p id={hintId} className="text-sm text-slate-700">
          Od {MIN} do {MAX} znaka. Bez lozinke i bez e-pošte.
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className={`mt-1 w-full rounded border border-slate-500 bg-white px-3 py-2 ${FOCUS_RING}`}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
      {!persisted && (
        <p className="text-sm text-amber-900">
          Ime će važiti samo dok je stranica otvorena, jer preglednik ne dozvoljava čuvanje.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          aria-disabled={pending || undefined}
          className={`rounded bg-sky-800 px-4 py-2 font-semibold text-white hover:bg-sky-900 aria-disabled:opacity-70 ${FOCUS_RING} focus-visible:ring-offset-2`}
        >
          {pending ? 'Čuvanje…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              if (!pending) onCancel();
            }}
            aria-disabled={pending || undefined}
            className={`rounded border border-slate-500 px-4 py-2 aria-disabled:opacity-70 ${FOCUS_RING}`}
          >
            Odustani
          </button>
        )}
      </div>
      <p role="status" className="sr-only">
        {pending ? 'Čuvanje imena…' : ''}
      </p>
    </form>
  );
}
