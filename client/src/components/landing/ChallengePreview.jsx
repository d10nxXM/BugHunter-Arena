import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getChallenges } from '../../api/client.js';
import { languageLabel } from '../../lib/labels.js';
import { MAX_CHALLENGE_XP } from '../../lib/xp.js';
import { paths } from '../../paths.js';
import DifficultyBadge from '../ui/DifficultyBadge.jsx';
import { ArrowRightIcon } from './icons.jsx';
import SectionHeading, { Container } from './SectionHeading.jsx';

const PREVIEW_ROWS = 6;

const TH = 'border-b border-border px-5 py-4 font-medium';
const TD = 'border-b border-surface-2 px-5 py-4';

const LINK_FOCUS =
  'rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Live preview of the challenge list (GET /api/challenges), at most PREVIEW_ROWS rows. */
export default function ChallengePreview() {
  const [load, setLoad] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    getChallenges({ signal: controller.signal })
      .then((list) => {
        if (!Array.isArray(list)) {
          setLoad({ status: 'error' });
          return;
        }
        setLoad({ status: 'ready', challenges: list.slice(0, PREVIEW_ROWS) });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoad({ status: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="challenges-heading" className="border-y border-track bg-nav">
      <Container className="py-20 sm:py-26">
        <SectionHeading kicker="// challenges" id="challenges-heading" className="mb-9">
          A growing library of broken code
        </SectionHeading>

        {/* A polite live region, not role="status": the header may already hold one. */}
        <div aria-live="polite">
          {load.status === 'loading' && <p className="text-muted">Loading challenges…</p>}
          {load.status === 'error' && (
            <p className="text-muted">
              <span aria-hidden="true">⚠ </span>
              The challenge list could not be loaded right now.
            </p>
          )}
          {load.status === 'ready' && load.challenges.length === 0 && (
            <p className="text-muted">No challenges yet.</p>
          )}
        </div>

        {load.status === 'ready' && load.challenges.length > 0 && (
          <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-[15px]">
              <caption className="sr-only">Challenges</caption>
              <thead>
                <tr className="text-left font-mono text-xs tracking-[0.06em] text-subtle uppercase">
                  <th scope="col" className={TH}>
                    Challenge
                  </th>
                  <th scope="col" className={TH}>
                    Language
                  </th>
                  <th scope="col" className={TH}>
                    Bug class
                  </th>
                  <th scope="col" className={TH}>
                    Difficulty
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Reward
                  </th>
                </tr>
              </thead>
              <tbody>
                {load.challenges.map((c) => (
                  <tr key={c.id}>
                    <td className={TD}>
                      <Link
                        to={paths.challenge(c.id)}
                        className={`font-semibold text-heading hover:underline ${LINK_FOCUS}`}
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className={`${TD} font-mono text-[13px] text-muted`}>
                      {languageLabel(c.language)}
                    </td>
                    <td className={`${TD} text-muted`}>{c.bugCategory}</td>
                    <td className={TD}>
                      <DifficultyBadge difficulty={c.difficulty} plain />
                    </td>
                    <td className={`${TD} text-right font-mono text-text`}>
                      {MAX_CHALLENGE_XP} XP max
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Link
            to={paths.problems}
            className={`flex items-center gap-2 px-4.5 py-3 text-[15px] font-semibold text-accent hover:underline ${LINK_FOCUS}`}
          >
            View all problems
            <ArrowRightIcon size={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
