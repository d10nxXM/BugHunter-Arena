import { initials } from '../../lib/profileFormat.js';
import Badge from '../ui/Badge.jsx';
import HunterName from './HunterName.jsx';
import { positionStyle } from './positionStyle.js';

const TH = 'border-b border-border px-4.5 py-3.5 font-medium';
const TD = 'border-b border-surface-2 px-4.5 py-3.5';
const NUMBER = new Intl.NumberFormat('en-US');

/** Full leaderboard table. `ownHandle` (the logged-in account, or null) marks that row. */
export default function LeaderboardTable({ entries, ownHandle = null }) {
  return (
    <table className="w-full min-w-[560px] border-collapse text-[15px]">
      <caption className="sr-only">Hunters ranked by XP</caption>
      <thead>
        <tr className="text-left font-mono text-xs tracking-[0.06em] text-subtle uppercase">
          <th scope="col" className={`${TH} w-16`}>
            <span aria-hidden="true">#</span>
            <span className="sr-only">Position</span>
          </th>
          <th scope="col" className={TH}>
            Hunter
          </th>
          <th scope="col" className={TH}>
            Rank
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Solved
          </th>
          <th scope="col" className={`${TH} text-right`}>
            XP
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const style = positionStyle(entry.position);
          const own = entry.handle === ownHandle;
          return (
            <tr
              key={entry.handle}
              aria-current={own ? 'true' : undefined}
              className={own ? 'bg-accent-soft' : 'hover:bg-surface-3'}
            >
              <td className={`${TD} font-mono font-bold ${style.text}`}>{entry.position}</td>
              <th scope="row" className={`${TD} text-left font-normal`}>
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${style.avatar}`}
                  >
                    {initials(entry.handle)}
                  </span>
                  <HunterName handle={entry.handle} className="font-semibold text-heading" />
                  {own && (
                    <Badge tone="accent" mono>
                      <span aria-hidden="true">You</span>
                      <span className="sr-only">(you)</span>
                    </Badge>
                  )}
                </span>
              </th>
              <td className={`${TD} text-muted`}>{entry.rankName}</td>
              <td className={`${TD} text-right font-mono text-muted`}>
                {NUMBER.format(entry.solved)}
              </td>
              <td className={`${TD} text-right font-mono whitespace-nowrap text-text`}>
                {NUMBER.format(entry.totalXp)} XP
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
