import { initials, monthYear } from '../../lib/profileFormat.js';

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/**
 * Identity block: avatar initials, the page's h1 (@handle), rank pill and "Hunting since".
 * `rankName` and `memberSince` may be missing while the profile loads.
 */
export default function ProfileHeader({ handle, rankName, memberSince, actions }) {
  const since = monthYear(memberSince);
  return (
    <section aria-label="Hunter" className="flex flex-wrap items-end gap-6">
      <div
        aria-hidden="true"
        className="flex size-[120px] shrink-0 items-center justify-center rounded-3xl border-3 border-accent bg-accent-soft font-display text-[42px] font-bold text-accent"
      >
        {initials(handle)}
      </div>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            tabIndex={-1}
            className="font-mono text-[30px] font-bold break-all text-heading focus:outline-none"
          >
            @{handle}
          </h1>
          {rankName && (
            <span className="rounded-full border border-amber/40 bg-amber-soft px-3 py-1 text-[13px] font-bold text-amber">
              <span className="sr-only">Rank: </span>
              {rankName}
            </span>
          )}
        </div>
        {since && (
          <p className="flex items-center gap-1.5 text-sm text-subtle">
            <CalendarIcon />
            Hunting since {since}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2.5 pb-1">{actions}</div>}
    </section>
  );
}
