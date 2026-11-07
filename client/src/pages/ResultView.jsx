import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { getChallenges } from '../api/client.js';
import ResultFeedback from '../components/ResultFeedback.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import TestResults from '../components/TestResults.jsx';
import Button from '../components/ui/Button.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isFeedbackSource } from '../lib/progressFormat.js';
import { isSolved, SOLVED_MIN_SCORE } from '../lib/xp.js';
import { paths } from '../paths.js';

const LINK =
  'rounded font-medium text-muted underline-offset-4 hover:text-heading hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const H1 = 'font-display text-[34px] font-bold tracking-tight text-heading focus:outline-none';

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
        // Cosmetic: the page keeps the id and the "All problems" link.
        if (import.meta.env.DEV) console.warn('[result] challenge list not loaded');
      });
    return () => controller.abort();
  }, [id, enabled]);

  // Ignore a result loaded for another id.
  return context.forId === id ? context : EMPTY_CONTEXT;
}

function Heading() {
  return (
    <div className="flex flex-col gap-1.5">
      <p aria-hidden="true" className="font-mono text-[13px] text-subtle">
        $ cat ./result
      </p>
      <h1 tabIndex={-1} className={H1}>
        Result
      </h1>
    </div>
  );
}

function Section({ id, title, className = '', children }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5 sm:p-6 ${className}`}
    >
      <h2 id={id} className="font-display text-[19px] font-semibold text-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Score ring: decorative; the number next to it is the text. */
function ScoreRing({ score, solved }) {
  const fraction = Math.min(1, Math.max(0, score / 100));
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 120"
      className="size-28 shrink-0 -rotate-90 sm:size-32"
    >
      <circle
        cx="60"
        cy="60"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="9"
        className="stroke-track"
      />
      <circle
        cx="60"
        cy="60"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${RING_LENGTH * fraction} ${RING_LENGTH}`}
        className={solved ? 'stroke-accent' : 'stroke-amber'}
      />
    </svg>
  );
}

export default function ResultView() {
  usePageTitle('Result');
  const { id } = useParams();
  const { state } = useLocation();
  const valid = isResultState(state, id);
  const challenge = useChallengeContext(id, valid);

  if (!valid) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Heading />
        <p className="text-muted">This result is not available.</p>
        <Button to={paths.challenge(id)} variant="secondary">
          Back to the challenge
        </Button>
      </div>
    );
  }

  const { evaluation } = state;
  const tests = Array.isArray(state.tests) ? state.tests : [];
  const testResults = Array.isArray(state.testResults) ? state.testResults : [];
  const solved = isSolved(evaluation.score);
  const hasTestCount =
    typeof evaluation.testsPassed === 'number' && typeof evaluation.testsTotal === 'number';
  const hasSolution = typeof state.referenceSolution === 'string' && state.referenceSolution !== '';
  // One primary action: the next challenge once this one is solved, otherwise another try.
  const nextFirst = solved && challenge.nextId;

  return (
    <div className="flex flex-col gap-6">
      <Heading />

      <section
        aria-label="Score"
        className={`flex flex-wrap items-center gap-6 rounded-[14px] border p-5 sm:p-7 ${
          solved ? 'border-accent/30 bg-accent-soft/50' : 'border-amber/30 bg-amber-soft/50'
        }`}
      >
        <ScoreRing score={evaluation.score} solved={solved} />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <p className="text-sm text-muted">
            Challenge:{' '}
            {challenge.title ? (
              <span className="text-heading">{challenge.title}</span>
            ) : (
              <span className="font-mono text-heading">{id}</span>
            )}
          </p>
          <p className="font-display text-4xl font-bold text-heading tabular-nums sm:text-5xl">
            <span className="sr-only">Total: </span>
            {evaluation.score} / 100
          </p>
          <p
            className={`inline-flex items-center gap-1.5 font-medium ${solved ? 'text-accent' : 'text-amber'}`}
          >
            <span aria-hidden="true">{solved ? '✓' : '!'}</span>
            {solved
              ? 'Bug squashed. This counts as solved.'
              : `Not solved yet: you need at least ${SOLVED_MIN_SCORE} points.`}
          </p>
          {hasTestCount && (
            <p className="font-mono text-sm text-muted">
              {evaluation.testsPassed} of {evaluation.testsTotal} tests passed.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Section id="result-score" title="Points">
          <ScoreBreakdown score={evaluation.score} breakdown={evaluation.breakdown} />
          <p className="text-[13px] text-subtle">
            Your solving time does not change the points. The server computes them.
          </p>
        </Section>

        <Section id="result-feedback" title="Feedback">
          <ResultFeedback
            feedbackSource={evaluation.feedbackSource}
            feedback={evaluation.feedback}
          />
        </Section>
      </div>

      <Section id="result-tests" title="Tests">
        <TestResults tests={tests} results={testResults} />
      </Section>

      {hasSolution && (
        <Section id="result-solution" title="Reference solution">
          <pre className="overflow-x-auto rounded-[12px] border border-border bg-bg p-4 font-mono text-sm leading-relaxed text-text">
            <code>{state.referenceSolution}</code>
          </pre>
        </Section>
      )}

      <nav aria-label="Next step" className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {nextFirst ? (
          <>
            <Button to={paths.challenge(challenge.nextId)}>
              Next challenge: {challenge.nextTitle ?? challenge.nextId}
            </Button>
            <Button to={paths.challenge(id)} variant="secondary">
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button to={paths.challenge(id)}>Try again</Button>
            {challenge.nextId && (
              <Button to={paths.challenge(challenge.nextId)} variant="secondary">
                Next challenge: {challenge.nextTitle ?? challenge.nextId}
              </Button>
            )}
          </>
        )}
        <Link to={paths.dashboard} className={LINK}>
          My dashboard
        </Link>
        <Link to={paths.problems} className={LINK}>
          All problems
        </Link>
      </nav>
    </div>
  );
}
