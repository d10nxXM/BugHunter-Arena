import { languageLabel } from '../../lib/labels.js';
import { relativeDay } from '../../lib/profileFormat.js';
import { SOLVED_MIN_SCORE } from '../../lib/xp.js';
import { paths } from '../../paths.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import DifficultyBadge from '../ui/DifficultyBadge.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';

const LABEL = 'font-mono text-xs text-subtle uppercase';

/**
 * "Continue where you left off". `target` comes from continueTarget (src/lib/dashboard.js):
 * { kind: 'resume', challenge, entry, lastAt } | { kind: 'start', challenge } | null (all solved).
 */
export default function ContinueCard({ target, hasChallenges }) {
  if (!target) {
    return (
      <section
        aria-labelledby="continue-heading"
        className="flex flex-col gap-2 rounded-[14px] border border-accent/30 bg-accent-soft/40 p-6"
      >
        <h2 id="continue-heading" className={`${LABEL} text-accent`}>
          {hasChallenges ? 'All bugs squashed' : 'Nothing to continue'}
        </h2>
        <p className="text-muted">
          {hasChallenges
            ? 'You solved every challenge. New ones are on the way.'
            : 'The challenge list is not available right now.'}
        </p>
      </section>
    );
  }

  const { challenge } = target;
  const resume = target.kind === 'resume';
  const best = Number.isFinite(target.entry?.bestScore) ? target.entry.bestScore : null;
  const attempts = target.entry?.attempts ?? 0;
  const when = resume ? relativeDay(target.lastAt) : '';

  return (
    <section
      aria-labelledby="continue-heading"
      className="flex flex-wrap items-center gap-6 rounded-[14px] border border-border-strong bg-surface p-6 shadow-[inset_3px_0_0_var(--color-accent)]"
    >
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
        <h2 id="continue-heading" className={LABEL}>
          {resume ? 'Continue where you left off' : 'Start your next hunt'}
        </h2>
        <p className="font-display text-2xl font-bold wrap-break-word text-heading">
          {challenge.title || challenge.id}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge mono>{languageLabel(challenge.language)}</Badge>
          {challenge.bugCategory && <Badge>{challenge.bugCategory}</Badge>}
          <DifficultyBadge difficulty={challenge.difficulty} />
        </div>
        {resume && (
          <>
            <p className="text-sm text-muted">
              {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
              {best !== null && ` · best score ${best} (${SOLVED_MIN_SCORE} solves it)`}
              {when && ` · last try ${when.toLowerCase()}`}
            </p>
            {best !== null && (
              <ProgressBar
                value={best}
                max={SOLVED_MIN_SCORE}
                label="Best score toward solved"
                valueText={`${best} of ${SOLVED_MIN_SCORE} points needed to solve`}
              />
            )}
          </>
        )}
      </div>
      <Button to={paths.challenge(challenge.id)} variant="secondary" className="border-accent">
        {resume ? 'Resume hunt' : 'Start hunt'}
        <span aria-hidden="true">→</span>
      </Button>
    </section>
  );
}
