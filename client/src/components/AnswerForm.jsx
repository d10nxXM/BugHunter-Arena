import {
  EXPLANATION_MAX,
  EXPLANATION_MIN,
  FIELD_IDS,
  SUBMIT_BUTTON_ID,
} from '../lib/submitConstants.js';
import Button from './ui/Button.jsx';

const INPUT =
  'block w-full rounded-[10px] border border-border-strong bg-bg px-3.5 py-2.5 text-[15px] text-heading ' +
  'placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-hard';
const LABEL = 'text-sm font-medium text-text';
const HELP = 'text-[13px] leading-relaxed text-subtle';
const CODE = 'rounded bg-surface-3 px-1 font-mono text-[12.5px] text-muted';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-hard">
      <span aria-hidden="true">✕</span>
      {message}
    </p>
  );
}

function describedBy(...ids) {
  return ids.filter(Boolean).join(' ') || undefined;
}

/**
 * Explanation and edge case, plus the "Submit answer" button. Controlled: values and errors
 * live in ChallengeWorkspace.
 *
 * @param {{
 *   values: { explanation: string, edgeArgs: string, edgeExpected: string },
 *   errors: { explanation?: string, edgeArgs?: string, edgeExpected?: string },
 *   onChange: (field: 'explanation' | 'edgeArgs' | 'edgeExpected', value: string) => void,
 *   onSubmit: () => void,
 *   functionName: string,
 *   disabled: boolean,
 *   submitDisabled: boolean,
 *   submitLabel?: string,
 *   submitNote?: string | null,
 * }} props
 */
export default function AnswerForm({
  values,
  errors,
  onChange,
  onSubmit,
  functionName,
  disabled,
  submitDisabled,
  submitLabel = 'Submit answer',
  submitNote = null,
}) {
  const length = values.explanation.trim().length;
  const ids = FIELD_IDS;
  const lengthOk = length >= EXPLANATION_MIN && length <= EXPLANATION_MAX;

  return (
    <form
      noValidate
      aria-labelledby="answer-heading"
      className="flex flex-col gap-5 rounded-[14px] border border-border bg-surface p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 id="answer-heading" className="font-display text-[19px] font-semibold text-heading">
          Your answer
        </h2>
        <p className="text-sm text-muted">Explain the bug, then prove it with an edge case.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.explanation} className={LABEL}>
            Explain the bug
          </label>
          <span
            aria-hidden="true"
            className={`font-mono text-xs ${lengthOk ? 'text-accent' : 'text-subtle'}`}
          >
            {length} / {EXPLANATION_MAX}
          </span>
        </div>
        <textarea
          id={ids.explanation}
          rows={6}
          maxLength={EXPLANATION_MAX + 200}
          value={values.explanation}
          onChange={(event) => onChange('explanation', event.target.value)}
          disabled={disabled}
          required
          placeholder="What is wrong, why it happens, and what goes wrong as a result…"
          aria-invalid={Boolean(errors.explanation)}
          aria-describedby={describedBy(
            `${ids.explanation}-help`,
            errors.explanation && `${ids.explanation}-error`,
          )}
          className={`${INPUT} min-h-36 resize-y leading-relaxed`}
        />
        <p id={`${ids.explanation}-help`} className={HELP}>
          What is wrong, why it happens and what it causes ({EXPLANATION_MIN}–{EXPLANATION_MAX}{' '}
          characters). Entered: {length}.
        </p>
        <FieldError id={`${ids.explanation}-error`} message={errors.explanation} />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[12px] border border-border bg-bg/40 p-4">
        <legend className="px-1 text-sm font-medium text-text">Edge case</legend>
        <p id="answer-edge-help" className={HELP}>
          An input that exposes the bug and the result the correct code would return. Write JSON:
          <code className={CODE}>null</code> instead of <code className={CODE}>None</code>,{' '}
          <code className={CODE}>true</code> and <code className={CODE}>false</code> in lower case.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.edgeArgs} className={LABEL}>
            Arguments for <span className="font-mono text-accent">{functionName}(…)</span>
          </label>
          <div className="flex items-center gap-1.5 font-mono text-sm text-subtle">
            <span aria-hidden="true" className="shrink-0">
              {functionName}(
            </span>
            <input
              id={ids.edgeArgs}
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={values.edgeArgs}
              onChange={(event) => onChange('edgeArgs', event.target.value)}
              disabled={disabled}
              required
              placeholder="[-8, -3, -10]"
              aria-invalid={Boolean(errors.edgeArgs)}
              aria-describedby={describedBy(
                'answer-edge-help',
                `${ids.edgeArgs}-help`,
                errors.edgeArgs && `${ids.edgeArgs}-error`,
              )}
              className={`${INPUT} min-w-0 font-mono text-sm`}
            />
            <span aria-hidden="true" className="shrink-0">
              )
            </span>
          </div>
          <p id={`${ids.edgeArgs}-help`} className={HELP}>
            Comma-separated arguments, e.g. <code className={CODE}>[-8, -3, -10]</code>.
          </p>
          <FieldError id={`${ids.edgeArgs}-error`} message={errors.edgeArgs} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.edgeExpected} className={LABEL}>
            Expected result
          </label>
          <input
            id={ids.edgeExpected}
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={values.edgeExpected}
            onChange={(event) => onChange('edgeExpected', event.target.value)}
            disabled={disabled}
            required
            placeholder="-3"
            aria-invalid={Boolean(errors.edgeExpected)}
            aria-describedby={describedBy(
              `${ids.edgeExpected}-help`,
              errors.edgeExpected && `${ids.edgeExpected}-error`,
            )}
            className={`${INPUT} font-mono text-sm`}
          />
          <p id={`${ids.edgeExpected}-help`} className={HELP}>
            A JSON value, e.g. <code className={CODE}>-3</code> or{' '}
            <code className={CODE}>null</code>.
          </p>
          <FieldError id={`${ids.edgeExpected}-error`} message={errors.edgeExpected} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button
          id={SUBMIT_BUTTON_ID}
          type="submit"
          disabled={submitDisabled}
          aria-describedby={submitNote ? 'answer-submit-note' : undefined}
          className="w-full"
        >
          {submitLabel}
          <span aria-hidden="true">→</span>
        </Button>
        {submitNote && (
          <p id="answer-submit-note" className="text-center text-[13px] text-subtle">
            {submitNote}
          </p>
        )}
      </div>
    </form>
  );
}
