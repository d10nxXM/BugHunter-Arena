import { rankFor } from '../../lib/xp.js';
import ProgressBar from '../ui/ProgressBar.jsx';

/**
 * "Next rank" card. Names and XP to go come from the server's `rank`
 * ({ name, xp, nextName, xpToNext }); the bar's fill uses the tiers in src/lib/xp.js.
 */
export default function RankProgress({ rank, totalXp }) {
  const xp = Number.isFinite(rank?.xp) ? rank.xp : totalXp;
  const local = rankFor(xp);
  const nextName = rank ? rank.nextName : (local.next?.name ?? null);
  const xpToNext = Number.isFinite(rank?.xpToNext) ? rank.xpToNext : local.toNext;

  return (
    <section
      aria-labelledby="next-rank-heading"
      className="flex flex-col gap-3 rounded-[14px] border border-amber/30 bg-[#17130c] p-6"
    >
      <h2 id="next-rank-heading" className="font-mono text-xs text-amber uppercase">
        Next rank
      </h2>
      {nextName ? (
        <>
          <p className="font-display text-[22px] font-bold text-heading">{nextName}</p>
          <ProgressBar
            value={local.pct}
            label={`Progress to ${nextName}`}
            valueText={`${xpToNext} XP to ${nextName}`}
            tone="amber"
            className="h-2"
          />
          <p className="text-sm text-muted">{xpToNext} XP to go</p>
        </>
      ) : (
        <p className="font-display text-[22px] font-bold text-heading">Top rank reached</p>
      )}
    </section>
  );
}
