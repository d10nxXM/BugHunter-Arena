/** Points subtracted per hint level (docs/SCORING.md). */
const HINT_PENALTIES = { 1: 5, 2: 5, 3: 10 };

const BUTTON =
  'rounded bg-sky-800 px-3 py-2 font-medium text-white hover:bg-sky-900 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-400';

/**
 * Hints, one level at a time. State lives in ChallengeWorkspace (useHints): the count is reported in the attempt.
 *
 * @param {{
 *   hints: Array<{ level: number, hint: string, source: string }>,
 *   maxLevel: number,
 *   loading: boolean,
 *   error: string | null,
 *   disabled: boolean,
 *   onRequest: () => void,
 * }} props
 */
export default function HintPanel({ hints, maxLevel, loading, error, disabled, onRequest }) {
  const nextLevel = hints.length + 1;
  const exhausted = nextLevel > maxLevel;

  let status = '';
  if (loading) status = 'Učitavam savjet…';
  else if (hints.length > 0) status = `Prikazan je savjet ${hints.length}.`;

  return (
    <section
      aria-labelledby="hints-heading"
      className="rounded border border-slate-200 bg-white p-4"
    >
      <h2 id="hints-heading" className="text-lg font-semibold">
        Savjeti
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        Svaki savjet umanjuje bodove: prvi i drugi po 5, treći 10.
      </p>

      {hints.length > 0 && (
        <ol className="mt-3 space-y-2">
          {hints.map((h) => (
            <li key={h.level} className="rounded bg-sky-50 px-3 py-2 text-slate-900">
              <p className="text-sm font-semibold">
                Savjet {h.level} (−{HINT_PENALTIES[h.level]} bodova)
                {h.source === 'ai' && <span className="font-normal"> · AI savjet</span>}
              </p>
              <p className="whitespace-pre-wrap">{h.hint}</p>
            </li>
          ))}
        </ol>
      )}

      <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-700">
        {status}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900"
        >
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}

      {maxLevel === 0 ? (
        <p className="mt-3 text-sm text-slate-700">Ovaj izazov nema savjete.</p>
      ) : exhausted ? (
        <p className="mt-3 text-sm text-slate-700">Iskoristio si sve savjete.</p>
      ) : (
        <button
          type="button"
          className={`mt-3 ${BUTTON}`}
          disabled={disabled || loading}
          onClick={onRequest}
        >
          {loading
            ? 'Učitavam savjet…'
            : `Zatraži savjet ${nextLevel} (−${HINT_PENALTIES[nextLevel]} bodova)`}
        </button>
      )}
    </section>
  );
}
