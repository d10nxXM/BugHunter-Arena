import { challengeName, formatDateTime, formatDuration, SOURCE_LABELS } from './ProgressFormat.js';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';

/**
 * GET /api/attempts history with a "Učitaj još" button. Data lives in the page.
 * @param {{
 *   items: Array<{ id: string, challengeId: string, status: string, score: number | null,
 *     feedbackSource: string | null, hintsUsed: number, durationSec: number, createdAt: string }>,
 *   titles: Map<string, string>,
 *   hasMore: boolean,
 *   loadingMore: boolean,
 *   loadMoreError: string | null,
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
  onLoadMore,
  endRef,
}) {
  if (items.length === 0) {
    return <p className="text-slate-700">Još nema pokušaja.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Pokušaji, od najnovijeg</caption>
          <thead>
            <tr className="border-b border-slate-300 text-slate-700">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Vrijeme
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Izazov
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Rezultat
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Procjena
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Nagovještaji
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Trajanje
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const evaluated = typeof item.score === 'number';
              return (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {challengeName(titles, item.challengeId)}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {evaluated ? `${item.score} / 100` : 'Nije ocijenjen'}
                  </td>
                  <td className="py-2 pr-4">{SOURCE_LABELS[item.feedbackSource] ?? '—'}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{item.hintsUsed ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatDuration(item.durationSec)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        {loadMoreError && (
          <p role="alert" className="mb-2 text-red-800">
            {loadMoreError}
          </p>
        )}
        {hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={`rounded border border-sky-800 px-4 py-2 font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-70 ${FOCUS_RING}`}
          >
            {loadingMore ? 'Učitavanje…' : loadMoreError ? 'Pokušaj ponovo' : 'Učitaj još'}
          </button>
        ) : (
          <p ref={endRef} tabIndex={-1} className="text-slate-700 focus:outline-none">
            Nema više pokušaja.
          </p>
        )}
        <p role="status" className="sr-only">
          {loadingMore ? 'Učitavanje pokušaja…' : ''}
        </p>
      </div>
    </>
  );
}
