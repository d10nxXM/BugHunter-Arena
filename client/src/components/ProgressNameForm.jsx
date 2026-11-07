import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';
import { USER_CHANGED_MESSAGE } from '../context/UserProvider.jsx';

const MIN = 2;
const MAX = 32;
import Button from './ui/Button.jsx';

/** Validation message for a display name, or null when it is valid (2-32 trimmed). */
function validate(name) {
  const length = name.trim().length;
  if (length === 0) return 'Enter a name.';
  if (length < MIN) return `The name needs at least ${MIN} characters.`;
  if (length > MAX) return `The name can have at most ${MAX} characters.`;
  return null;
}

/** ApiError messages and USER_CHANGED_MESSAGE are texts that are safe to show. */
function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message === USER_CHANGED_MESSAGE) return USER_CHANGED_MESSAGE;
  return 'The name was not saved. Please try again.';
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
    <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          Display name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className={`min-h-12 w-full rounded-[10px] border bg-bg px-3.5 text-[15px] text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            error ? 'border-hard' : 'border-border-strong'
          }`}
        />
        <p id={hintId} className="text-[13px] text-subtle">
          {MIN} to {MAX} characters. No password and no email.
        </p>
        {error && (
          <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-hard">
            <span aria-hidden="true">✕</span>
            {error}
          </p>
        )}
      </div>
      {!persisted && (
        <p className="text-sm text-amber">
          The name only lasts while this page is open, because the browser does not allow saving.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          aria-disabled={pending || undefined}
          className="aria-disabled:cursor-wait aria-disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button
            variant="secondary"
            onClick={() => {
              if (!pending) onCancel();
            }}
            aria-disabled={pending || undefined}
            className="aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            Cancel
          </Button>
        )}
      </div>
      <p role="status" className="sr-only">
        {pending ? 'Saving the name…' : ''}
      </p>
    </form>
  );
}
