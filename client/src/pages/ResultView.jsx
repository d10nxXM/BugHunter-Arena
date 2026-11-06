import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { getChallenges } from '../api/client.js';
import ResultFeedback from '../components/ResultFeedback.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import TestResults from '../components/TestResults.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isFeedbackSource } from '../lib/progressFormat.js';
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
    Number.isFinite(evaluation.score) &&
    evaluation.breakdown !== null &&
    typeof evaluation.breakdown === 'object' &&
    isFeedbackSource(evaluation.feedbackSource)
  );
}

const EMPTY_CONTEXT = { forId: null, title: null, nextId: null, nextTitle: null };

/**
 * Loads the challenge list for this challenge's title and the next challenge in list order.
 * Both are optional: while loading, on error, or for the last challenge, nextId is null.
 */
function useChallengeContext(id, enabled) {
  const [context, setContext] = useState(EMPTY_CONTEXT);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    getChallenges({ signal: controller.signal })
      .then((list) => {
        if (!Array.isArray(list)) return;
        const index = list.findIndex((c) => c?.id === id);
        const next = index >= 0 ? list[index + 1] : undefined;
        setContext({
          forId: id,
          title: index >= 0 ? (list[index].title ?? null) : null,
          nextId: next?.id ?? null,
          nextTitle: next?.title ?? null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        // Cosmetic: the page keeps the id and the "Svi izazovi" link.
        if (import.meta.env.DEV) console.warn('[result] challenge list not loaded');
      });
    return () => controller.abort();
  }, [id, enabled]);

  // Ignore a result loaded for another id.
  return context.forId === id ? context : EMPTY_CONTEXT;
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
  const valid = isResultState(state, id);
  const challenge = useChallengeContext(id, valid);

  if (!valid) {
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
        Izazov: {challenge.title ? challenge.title : <span className="font-mono">{id}</span>}
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
        <Link to={paths.dashboard} className={LINK}>
          Moj napredak
        </Link>
        {challenge.nextId && (
          <Link to={paths.challenge(challenge.nextId)} className={LINK}>
            Sljedeći izazov: {challenge.nextTitle ?? challenge.nextId}
          </Link>
        )}
        <Link to={paths.problems} className={LINK}>
          Svi izazovi
        </Link>
      </nav>
    </>
  );
}
