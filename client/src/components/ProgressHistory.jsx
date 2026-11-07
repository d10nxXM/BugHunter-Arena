import {
  challengeName,
  formatDateTime,
  formatDuration,
  SOURCE_LABELS,
} from '../lib/progressFormat.js';
import { isSolved } from '../lib/xp.js';
import { buttonClass } from './ui/buttonClass.js';

const TH = 'px-4 py-3 font-mono text-xs font-medium text-subtle uppercase';

/**
 * GET /api/attempts history with a "Load more" button. Data lives in UserProgress.
 * @param {{
 *   items: Array<{ id: string, challengeId: string, status: string, score: number | null,
 *     feedbackSource: string | null, hintsUsed: number, durationSec: number, createdAt: string }>,
 *   titles: Map<string, string>,
 *   hasMore: boolean,
 *   loadingMore: boolean,
 *   loadMoreError: string | null,
 *   announcement: string,
 *   onLoadMore: () => void,
 *   endRef: import('react').Ref<HTMLParagraphElement>,
 * }} props
 */
export default function ProgressHistory({
  items,
  titles,
  hasMore,
  loadingMore,
  loadMoreError,
  announcement,
  onLoadMore,
  endRef,
}) {
  if (items.length === 0) {
    return <p className="text-muted">No attempts yet.</p>;
  }

  return (
    <>
      <div className="-mx-6 overflow-x-auto border-y border-border">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <caption className="sr-only">Attempts, newest first</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className={`${TH} pl-6`}>
                Challenge
              </th>
              <th scope="col" className={TH}>
                Time
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Score
              </th>
              <th scope="col" className={TH}>
                Assessment
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Hints
              </th>
              <th scope="col" className={`${TH} pr-6 text-right`}>
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const scored = typeof item.score === 'number';
              const scoreColor = !scored
                ? 'text-subtle'
                : isSolved(item.score)
                  ? 'text-accent'
                  : 'text-amber';
              return (
                <tr key={item.id} className="border-t border-surface-2">
                  <th scope="row" className="py-3 pr-4 pl-6 font-semibold text-heading">
                    {challengeName(titles, item.challengeId)}
                  </th>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums ${scoreColor}`}
                  >
                    {scored ? `${item.score} / 100` : 'Not scored'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {SOURCE_LABELS[item.feedbackSource] ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted tabular-nums">
                    {item.hintsUsed ?? '—'}
                  </td>
                  <td className="py-3 pr-6 pl-4 text-right font-mono whitespace-nowrap text-muted tabular-nums">
                    {formatDuration(item.durationSec)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-start gap-2">
        {loadMoreError && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-hard">
            <span aria-hidden="true">⚠</span>
            {loadMoreError}
          </p>
        )}
        {hasMore ? (
          // aria-disabled, not disabled: a disabled button would drop focus to the body.
          <button
            type="button"
            onClick={() => {
              if (!loadingMore) onLoadMore();
            }}
            aria-disabled={loadingMore || undefined}
            className={buttonClass({
              variant: 'secondary',
              size: 'sm',
              className: 'aria-disabled:cursor-wait aria-disabled:opacity-60',
            })}
          >
            {loadingMore ? 'Loading…' : loadMoreError ? 'Try again' : 'Load more'}
          </button>
        ) : (
          <p ref={endRef} tabIndex={-1} className="text-sm text-subtle focus:outline-none">
            No more attempts.
          </p>
        )}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    </>
  );
}
