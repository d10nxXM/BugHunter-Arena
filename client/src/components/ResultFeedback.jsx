// AI or fallback feedback for one attempt. Every field is untrusted text: it is rendered only as
// React text children, never as HTML, markdown or Monaco content.

const SOURCE = {
  ai: {
    label: 'Pomoćna AI procjena',
    note: 'Procjenu objašnjenja je dao AI mentor. AI utiče na najviše 30 od 100 bodova.',
  },
  demo: {
    label: 'Pomoćna AI procjena (demo)',
    note: 'Demo režim: prikazan je unaprijed snimljen odgovor AI mentora.',
  },
  fallback: {
    label: 'Procjena bez AI-ja',
    note: 'AI mentor trenutno nije dostupan. Objašnjenje je ocijenjeno prema ključnim pojmovima.',
  },
};

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * @param {{
 *   feedbackSource: 'ai' | 'fallback' | 'demo',
 *   feedback: {
 *     is_correct: boolean, explanation_quality: number, detected_misconception: string | null,
 *     needs_clarification: boolean, hint: string | null, feedback: string, practice_tip: string | null,
 *   },
 * }} props
 */
export default function ResultFeedback({ feedbackSource, feedback }) {
  const source = SOURCE[feedbackSource] ?? SOURCE.fallback;
  const main = text(feedback?.feedback);
  const misconception = text(feedback?.detected_misconception);
  const hint = text(feedback?.hint);
  const tip = text(feedback?.practice_tip);
  const quality = feedback?.explanation_quality;
  const correct = feedback?.is_correct === true;

  return (
    <div className="space-y-3">
      <p>
        <span
          className={`inline-block rounded border px-2 py-0.5 text-sm font-semibold ${
            feedbackSource === 'fallback'
              ? 'border-amber-700 bg-amber-50 text-amber-900'
              : 'border-sky-700 bg-sky-50 text-sky-900'
          }`}
        >
          {source.label}
        </span>
      </p>
      <p className="text-sm text-slate-700">{source.note}</p>

      <p
        className={`inline-flex items-center gap-1 font-medium ${
          correct ? 'text-emerald-800' : 'text-amber-900'
        }`}
      >
        <span aria-hidden="true">{correct ? '✓' : '!'}</span>
        {correct ? 'Objašnjenje je tačno.' : 'Objašnjenje nije potpuno tačno.'}
      </p>
      {typeof quality === 'number' && Number.isFinite(quality) && (
        <p>Kvalitet objašnjenja: {quality} / 10</p>
      )}
      {feedback?.needs_clarification === true && (
        <p className="text-amber-900">Objašnjenje treba jasnije opisati.</p>
      )}

      {main && <p className="whitespace-pre-line">{main}</p>}

      {(misconception || hint || tip) && (
        <dl className="space-y-3">
          {misconception && (
            <div>
              <dt className="font-semibold">Uočena zabluda</dt>
              <dd className="whitespace-pre-line">{misconception}</dd>
            </div>
          )}
          {hint && (
            <div>
              <dt className="font-semibold">Smjernica</dt>
              <dd className="whitespace-pre-line">{hint}</dd>
            </div>
          )}
          {tip && (
            <div>
              <dt className="font-semibold">Savjet za vježbu</dt>
              <dd className="whitespace-pre-line">{tip}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
