import { Link } from 'react-router';
import { paths } from '../paths.js';
import { OUTCOME_ID, RECOVERED_HEADING_ID } from '../lib/submitConstants.js';

const LINK =
  'text-sky-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const BUTTON =
  'rounded border border-slate-500 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 focus-visible:outline-none';

const FEEDBACK_SOURCE_LABEL = {
  ai: 'Pomoćna AI procjena',
  demo: 'Pomoćna AI procjena',
  fallback: 'Procjena bez AI-ja',
};

const BUTTON_LABELS = {
  resubmit: 'Pošalji ponovo',
  retryTests: 'Pokreni testove ponovo',
  retryEvaluation: 'Pošalji rezultat ponovo',
};

function Recovered({ item, testsPassed, testsTotal }) {
  return (
    <section
      aria-labelledby={RECOVERED_HEADING_ID}
      className="rounded border-l-4 border-green-700 bg-green-50 px-3 py-2 text-green-950"
    >
      <h2
        id={RECOVERED_HEADING_ID}
        tabIndex={-1}
        className="text-lg font-semibold focus:outline-none"
      >
        <span aria-hidden="true">✓ </span>
        Rezultat je sačuvan
      </h2>
      <p className="mt-1">
        Bodovi: <strong>{item.score}</strong> od 100. Testovi: {testsPassed} od {testsTotal} je
        prošlo.
      </p>
      {FEEDBACK_SOURCE_LABEL[item.feedbackSource] && (
        <p className="text-sm">{FEEDBACK_SOURCE_LABEL[item.feedbackSource]}</p>
      )}
      <p className="mt-1 text-sm">Tekst povratne informacije nije moguće ponovo učitati.</p>
      <p className="mt-2">
        <Link to={paths.dashboard} className={LINK}>
          Pogledaj svoj napredak
        </Link>
      </p>
    </section>
  );
}

/**
 * The outcome of a failed or recovered submission. The failure box is an alert, and the flow
 * moves focus to it so screen readers land on it.
 *
 * @param {{ submission: object, onAction: (action: string) => void }} props
 */
export default function ChallengeSubmissionOutcome({ submission, onAction }) {
  if (submission.phase === 'recovered') return <Recovered {...submission} />;
  if (!submission.message) return null;

  const actions = submission.actions ?? [];
  return (
    <section
      id={OUTCOME_ID}
      role="alert"
      tabIndex={-1}
      aria-label="Stanje predaje"
      className="rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
    >
      <p>
        <span aria-hidden="true">⚠ </span>
        {submission.message}
      </p>
      {actions.includes('progressLink') && (
        <p className="mt-1">
          <Link to={paths.dashboard} className={LINK}>
            Pogledaj svoj napredak
          </Link>
        </p>
      )}
      {actions.includes('listLink') && (
        <p className="mt-1">
          <Link to={paths.problems} className={LINK}>
            Nazad na izazove
          </Link>
        </p>
      )}
      {actions
        .filter((action) => BUTTON_LABELS[action])
        .map((action) => (
          <button
            key={action}
            type="button"
            className={`mt-2 mr-2 ${BUTTON}`}
            onClick={() => onAction(action)}
          >
            {BUTTON_LABELS[action]}
          </button>
        ))}
    </section>
  );
}
