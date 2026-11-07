import { challengeName, formatDateTime } from '../../lib/progressFormat.js';
import { isSolved } from '../../lib/xp.js';
import Card from '../ui/Card.jsx';

const LIMIT = 5;

function describe(item, titles) {
  const name = `“${challengeName(titles, item.challengeId)}”`;
  if (typeof item.score !== 'number')
    return { text: `Submitted ${name} · not scored`, dot: 'bg-subtle' };
  if (isSolved(item.score)) return { text: `Solved ${name} · ${item.score} pts`, dot: 'bg-accent' };
  return { text: `Tried ${name} · ${item.score} pts`, dot: 'bg-amber' };
}

/** The newest attempts as a short feed. `items` is GET /api/attempts, newest first. */
export default function RecentActivity({ items, titles }) {
  const recent = items.slice(0, LIMIT);
  return (
    <Card as="section" aria-labelledby="activity-heading" className="flex flex-col gap-3.5 p-6">
      <h2 id="activity-heading" className="font-display text-[19px] font-semibold text-heading">
        Recent activity
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {recent.map((item) => {
            const { text, dot } = describe(item, titles);
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-[7px] size-2 flex-none rounded-full ${dot}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm wrap-break-word text-text">{text}</p>
                  <p className="mt-0.5 text-xs text-subtle">{formatDateTime(item.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
