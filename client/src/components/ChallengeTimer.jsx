import { useEffect, useState } from 'react';

function format(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * Elapsed time since the challenge opened (FR-15). Not a live region: a ticking clock would
 * flood screen readers. Stops at stoppedAt (the moment the answer was submitted).
 */
export default function ChallengeTimer({ startedAt, stoppedAt = null }) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (stoppedAt !== null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stoppedAt]);

  const elapsed = (stoppedAt ?? now) - startedAt;
  return (
    <p className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-sm text-muted">
      <span aria-hidden="true" className={stoppedAt === null ? 'text-accent' : 'text-subtle'}>
        ⏱
      </span>
      <span>Time: </span>
      <time dateTime={`PT${Math.max(0, Math.floor(elapsed / 1000))}S`} className="text-heading">
        {format(elapsed)}
      </time>
      {stoppedAt !== null && <span> (stopped)</span>}
    </p>
  );
}
