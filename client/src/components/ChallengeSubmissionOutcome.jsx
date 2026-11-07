import { Link } from 'react-router';
import { paths } from '../paths.js';
import { OUTCOME_ID, RECOVERED_HEADING_ID } from '../lib/submitConstants.js';
import { SOURCE_LABELS } from '../lib/progressFormat.js';
import Button from './ui/Button.jsx';

const LINK =
  'font-medium text-heading underline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded';

const FEEDBACK_SOURCE_LABEL = {
  ai: SOURCE_LABELS.ai,
  demo: SOURCE_LABELS.ai,
  fallback: SOURCE_LABELS.fallback,
};

const BUTTON_LABELS = {
  resubmit: 'Submit again',
  retryTests: 'Run the tests again',
  retryEvaluation: 'Send the result again',
};

function Recovered({ item, testsPassed, testsTotal }) {
  return (
    <section
      aria-labelledby={RECOVERED_HEADING_ID}
      className="flex flex-col gap-2 rounded-[14px] border border-accent/40 bg-accent-soft p-5 text-text"
    >
      <h2
        id={RECOVERED_HEADING_ID}
        tabIndex={-1}
        className="font-display text-lg font-semibold text-accent focus:outline-none"
      >
        <span aria-hidden="true">✓ </span>
        Your result is saved
      </h2>
      <p>
        Score: <strong className="text-heading">{item.score}</strong> of 100. Tests: {testsPassed}{' '}
        of {testsTotal} passed.
      </p>
      {FEEDBACK_SOURCE_LABEL[item.feedbackSource] && (
        <p className="text-sm text-muted">{FEEDBACK_SOURCE_LABEL[item.feedbackSource]}</p>
      )}
      <p className="text-sm text-muted">The feedback text could not be loaded again.</p>
      <p>
        <Link to={paths.dashboard} className={LINK}>
          See your progress
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
      aria-label="Submission status"
      className="flex flex-col gap-3 rounded-[14px] border border-hard/40 bg-hard-soft p-4 text-hard focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hard"
    >
      <p className="flex items-start gap-2">
        <span aria-hidden="true">⚠</span>
        {submission.message}
      </p>
      {(actions.includes('progressLink') || actions.includes('listLink')) && (
        <p className="flex flex-wrap gap-4 text-sm">
          {actions.includes('progressLink') && (
            <Link to={paths.dashboard} className={LINK}>
              See your progress
            </Link>
          )}
          {actions.includes('listLink') && (
            <Link to={paths.problems} className={LINK}>
              Back to problems
            </Link>
          )}
        </p>
      )}
      {actions.some((action) => BUTTON_LABELS[action]) && (
        <div className="flex flex-wrap gap-2">
          {actions
            .filter((action) => BUTTON_LABELS[action])
            .map((action) => (
              <Button key={action} variant="secondary" size="sm" onClick={() => onAction(action)}>
                {BUTTON_LABELS[action]}
              </Button>
            ))}
        </div>
      )}
    </section>
  );
}
