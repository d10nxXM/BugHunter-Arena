import { EXPLANATION_MAX, EXPLANATION_MIN, FIELD_IDS } from '../lib/submitConstants.js';

const INPUT =
  'mt-1 block w-full rounded border border-slate-400 bg-white px-3 py-2 text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none disabled:bg-slate-100 aria-[invalid=true]:border-red-700';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-800">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  );
}

function describedBy(...ids) {
  return ids.filter(Boolean).join(' ') || undefined;
}

/**
 * Explanation and edge case, plus the "Predaj odgovor" button. Controlled: values and errors
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
  submitLabel = 'Predaj odgovor',
  submitNote = null,
}) {
  const length = values.explanation.trim().length;
  const ids = FIELD_IDS;

  return (
    <form
      noValidate
      aria-labelledby="answer-heading"
      className="rounded border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 id="answer-heading" className="text-lg font-semibold">
        Tvoj odgovor
      </h2>

      <div className="mt-3">
        <label htmlFor={ids.explanation} className="font-medium">
          Objašnjenje greške
        </label>
        <textarea
          id={ids.explanation}
          rows={6}
          maxLength={EXPLANATION_MAX + 200}
          value={values.explanation}
          onChange={(event) => onChange('explanation', event.target.value)}
          disabled={disabled}
          required
          aria-invalid={Boolean(errors.explanation)}
          aria-describedby={describedBy(
            `${ids.explanation}-help`,
            errors.explanation && `${ids.explanation}-error`,
          )}
          className={INPUT}
        />
        <p id={`${ids.explanation}-help`} className="mt-1 text-sm text-slate-700">
          Šta je pogrešno, zašto nastaje i kakva je posljedica ({EXPLANATION_MIN}–{EXPLANATION_MAX}{' '}
          karaktera). Uneseno: {length}.
        </p>
        <FieldError id={`${ids.explanation}-error`} message={errors.explanation} />
      </div>

      <fieldset className="mt-4">
        <legend className="font-medium">Granični slučaj</legend>
        <p id="answer-edge-help" className="text-sm text-slate-700">
          Ulaz koji otkriva grešku i rezultat koji bi ispravan kod vratio. Piši JSON: null umjesto
          None, true i false malim slovima.
        </p>

        <label htmlFor={ids.edgeArgs} className="mt-2 block text-sm font-medium">
          Argumenti poziva <span className="font-mono">{functionName}(…)</span>
        </label>
        <div className="flex items-center gap-1 font-mono">
          <span aria-hidden="true">{functionName}(</span>
          <input
            id={ids.edgeArgs}
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={values.edgeArgs}
            onChange={(event) => onChange('edgeArgs', event.target.value)}
            disabled={disabled}
            required
            aria-invalid={Boolean(errors.edgeArgs)}
            aria-describedby={describedBy(
              'answer-edge-help',
              `${ids.edgeArgs}-help`,
              errors.edgeArgs && `${ids.edgeArgs}-error`,
            )}
            className={INPUT}
          />
          <span aria-hidden="true">)</span>
        </div>
        <p id={`${ids.edgeArgs}-help`} className="mt-1 text-sm text-slate-700">
          Argumenti odvojeni zarezom, npr. <code className="font-mono">[-8, -3, -10]</code>.
        </p>
        <FieldError id={`${ids.edgeArgs}-error`} message={errors.edgeArgs} />

        <label htmlFor={ids.edgeExpected} className="mt-3 block text-sm font-medium">
          Očekivani rezultat
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
          aria-invalid={Boolean(errors.edgeExpected)}
          aria-describedby={describedBy(
            `${ids.edgeExpected}-help`,
            errors.edgeExpected && `${ids.edgeExpected}-error`,
          )}
          className={`${INPUT} font-mono`}
        />
        <p id={`${ids.edgeExpected}-help`} className="mt-1 text-sm text-slate-700">
          JSON vrijednost, npr. <code className="font-mono">-3</code> ili{' '}
          <code className="font-mono">null</code>.
        </p>
        <FieldError id={`${ids.edgeExpected}-error`} message={errors.edgeExpected} />
      </fieldset>

      <button
        type="submit"
        disabled={submitDisabled}
        aria-describedby={submitNote ? 'answer-submit-note' : undefined}
        className="mt-4 rounded bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {submitLabel}
      </button>
      {submitNote && (
        <p id="answer-submit-note" className="mt-2 text-sm text-slate-700">
          {submitNote}
        </p>
      )}
    </form>
  );
}
