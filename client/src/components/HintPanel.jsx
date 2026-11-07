import { HINT_PENALTIES } from '../lib/submitConstants.js';
import Badge from './ui/Badge.jsx';
import Button from './ui/Button.jsx';
import Notice from './ui/Notice.jsx';

/**
 * Hints, one level at a time. State lives in ChallengeWorkspace (useHints): the count is reported in the attempt.
 *
 * @param {{
 *   hints: Array<{ level: number, hint: string, source: string }>,
 *   maxLevel: number,
 *   loading: boolean,
 *   error: string | null,
 *   disabled: boolean,
 *   onRequest: () => void,
 * }} props
 */
export default function HintPanel({ hints, maxLevel, loading, error, disabled, onRequest }) {
  const nextLevel = hints.length + 1;
  const exhausted = nextLevel > maxLevel;

  let status = '';
  if (loading) status = 'Loading hint…';
  else if (hints.length > 0) status = `Hint ${hints.length} is shown.`;

  return (
    <section
      aria-labelledby="hints-heading"
      className="flex flex-col gap-4 rounded-[14px] border border-amber/30 bg-[#17130c] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="hints-heading" className="font-display text-[19px] font-semibold text-heading">
            Hints
          </h2>
          {maxLevel > 0 && (
            <span className="font-mono text-xs text-amber">
              {Math.min(hints.length, maxLevel)} / {maxLevel} used
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          Each hint costs points: the first and second 5 each, the third 10.
        </p>
      </div>

      {hints.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {hints.map((h) => (
            <li
              key={h.level}
              className="flex flex-col gap-1.5 rounded-[10px] border border-amber/20 bg-bg/60 px-4 py-3"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber">
                Hint {h.level} (−{HINT_PENALTIES[h.level]} points)
                {h.source === 'ai' && (
                  <Badge tone="neutral" mono className="px-1.5 py-0.5 text-[11px]">
                    AI hint
                  </Badge>
                )}
              </p>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-text">{h.hint}</p>
            </li>
          ))}
        </ol>
      )}

      {/* Kept in the DOM while empty (sr-only), so the live region announces the first hint. */}
      <p role="status" aria-live="polite" className={status ? 'text-sm text-muted' : 'sr-only'}>
        {status}
      </p>

      {error && (
        <Notice role="alert" tone="danger">
          <p>{error}</p>
        </Notice>
      )}

      {maxLevel === 0 ? (
        <p className="text-sm text-subtle">This challenge has no hints.</p>
      ) : exhausted ? (
        <p className="text-sm text-subtle">You have used every hint.</p>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="self-start border-amber/40 text-amber hover:bg-amber-soft"
          disabled={disabled || loading}
          onClick={onRequest}
        >
          {loading
            ? 'Loading hint…'
            : `Request hint ${nextLevel} (−${HINT_PENALTIES[nextLevel]} points)`}
        </Button>
      )}
    </section>
  );
}
