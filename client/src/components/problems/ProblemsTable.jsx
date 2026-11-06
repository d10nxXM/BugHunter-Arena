import { Link } from 'react-router';
import { challengeStatus } from '../../hooks/useChallengeStatuses.js';
import { languageLabel } from '../../lib/labels.js';
import { entryXp, MAX_CHALLENGE_XP } from '../../lib/xp.js';
import { paths } from '../../paths.js';
import DifficultyBadge from '../ui/DifficultyBadge.jsx';
import StatusIcon from '../ui/StatusIcon.jsx';

const TH = 'border-b border-border px-4.5 py-3.5 font-medium';
const TD = 'border-b border-surface-2 px-4.5 py-3.5';

/**
 * Problems table. `rows` are { challenge, number } (number = position in the full list);
 * `progressById` maps challengeId -> perChallenge entry.
 */
export default function ProblemsTable({ rows, progressById }) {
  return (
    <table className="w-full min-w-[700px] border-collapse text-[15px]">
      <caption className="sr-only">Problems</caption>
      <thead>
        <tr className="text-left font-mono text-xs tracking-[0.06em] text-subtle uppercase">
          <th scope="col" className={`${TH} w-12`}>
            Status
          </th>
          <th scope="col" className={`${TH} w-10`}>
            #
          </th>
          <th scope="col" className={TH}>
            Title
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
            XP
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ challenge, number }) => {
          const entry = progressById.get(challenge.id);
          const status = challengeStatus(entry);
          return (
            <tr key={challenge.id} className="hover:bg-surface-3">
              <td className={TD}>
                {status ? (
                  <StatusIcon status={status} />
                ) : (
                  <span className="sr-only">Not attempted</span>
                )}
              </td>
              <td className={`${TD} font-mono text-[13px] text-subtle`}>{number}</td>
              <td className={TD}>
                <Link
                  to={paths.challenge(challenge.id)}
                  className="rounded font-semibold text-heading underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {challenge.title}
                </Link>
              </td>
              <td className={`${TD} font-mono text-[13px] text-muted`}>
                {languageLabel(challenge.language)}
              </td>
              <td className={`${TD} text-muted`}>{challenge.bugCategory}</td>
              <td className={TD}>
                <DifficultyBadge difficulty={challenge.difficulty} plain />
              </td>
              <td className={`${TD} text-right font-mono whitespace-nowrap text-text`}>
                {entry ? `${entryXp(entry)} / ${MAX_CHALLENGE_XP}` : `${MAX_CHALLENGE_XP} XP`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
