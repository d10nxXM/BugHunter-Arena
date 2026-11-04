import { Link, useLocation, useParams } from 'react-router';
import ResultFeedback from '../components/ResultFeedback.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import TestResults from '../components/TestResults.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const LINK = `text-sky-800 underline underline-offset-4 ${FOCUS_RING}`;
const PRIMARY = `inline-block rounded bg-sky-800 px-4 py-2 font-semibold text-white hover:bg-sky-900 ${FOCUS_RING} focus-visible:ring-offset-2`;

/** True when state is a ResultState (src/paths.js) for this challenge. */
function isResultState(state, id) {
  if (state === null || typeof state !== 'object') return false;
  if (state.challengeId !== id) return false;
  const evaluation = state.evaluation;
  return (
    evaluation !== null &&
    typeof evaluation === 'object' &&
    typeof evaluation.score === 'number' &&
    evaluation.breakdown !== null &&
    typeof evaluation.breakdown === 'object'
  );
}

function Heading() {
  return (
    <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
      Rezultat
    </h1>
  );
}

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ResultView() {
  usePageTitle('Rezultat');
  const { id } = useParams();
  const { state } = useLocation();

  if (!isResultState(state, id)) {
    return (
      <>
        <Heading />
        <p className="mt-2 text-slate-800">Rezultat nije dostupan.</p>
        <p className="mt-4">
          <Link to={paths.challenge(id)} className={LINK}>
            Nazad na izazov
          </Link>
        </p>
      </>
    );
  }

  const { evaluation } = state;
  const tests = Array.isArray(state.tests) ? state.tests : [];
  const testResults = Array.isArray(state.testResults) ? state.testResults : [];

  return (
    <>
      <Heading />
      <p className="mt-2 text-slate-700">
        Izazov <span className="font-mono">{id}</span>
      </p>
      <p className="mt-4 text-3xl font-bold">Ukupno: {evaluation.score} / 100</p>

      <Section id="result-score" title="Bodovi">
        <ScoreBreakdown score={evaluation.score} breakdown={evaluation.breakdown} />
        <p className="mt-2 text-sm text-slate-700">
          Vrijeme rješavanja ne utiče na bodove. Bodove računa server.
        </p>
      </Section>

      <Section id="result-feedback" title="Povratna informacija">
        <ResultFeedback feedbackSource={evaluation.feedbackSource} feedback={evaluation.feedback} />
      </Section>

      <Section id="result-tests" title="Testovi">
        {typeof evaluation.testsPassed === 'number' &&
          typeof evaluation.testsTotal === 'number' && (
            <p className="mb-3">
              Prošlo {evaluation.testsPassed} od {evaluation.testsTotal} testova.
            </p>
          )}
        <TestResults tests={tests} results={testResults} />
      </Section>

      {typeof state.referenceSolution === 'string' && state.referenceSolution !== '' && (
        <Section id="result-solution" title="Referentno rješenje">
          <pre className="overflow-x-auto rounded border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-slate-100">
            <code>{state.referenceSolution}</code>
          </pre>
        </Section>
      )}

      <nav aria-label="Sljedeći korak" className="mt-8 flex flex-wrap items-center gap-4">
        <Link to={paths.challenge(id)} className={PRIMARY}>
          Pokušaj ponovo
        </Link>
        <Link to={paths.progress} className={LINK}>
          Moj napredak
        </Link>
        <Link to={paths.home} className={LINK}>
          Svi izazovi
        </Link>
      </nav>
    </>
  );
}
