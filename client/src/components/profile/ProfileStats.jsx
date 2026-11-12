const NUMBER = new Intl.NumberFormat('en-US');

function count(value) {
  return Number.isFinite(value) ? NUMBER.format(value) : '0';
}

/** "#3" for a leaderboard position; "—" (read as "Not ranked yet") when not ranked or unknown. */
function position(value) {
  if (Number.isInteger(value) && value > 0) return `#${NUMBER.format(value)}`;
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">Not ranked yet</span>
    </>
  );
}

/**
 * Stats strip: Global rank, Total XP, Solved (of available) and Attempted, as a description list.
 * `globalPosition` is null for an account that is not on the leaderboard yet.
 */
export default function ProfileStats({
  globalPosition = null,
  totalXp,
  solved,
  attempted,
  challengesAvailable,
}) {
  const stats = [
    { label: 'Global rank', value: position(globalPosition) },
    { label: 'Total XP', value: count(totalXp) },
    {
      label: 'Solved',
      value: count(solved),
      extra: Number.isFinite(challengesAvailable) ? `/ ${count(challengesAvailable)}` : null,
    },
    { label: 'Attempted', value: count(attempted) },
  ];
  return (
    <section aria-label="Stats">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface px-5.5 py-5">
            <dt className="font-mono text-xs text-subtle uppercase">{stat.label}</dt>
            <dd className="mt-1.5 font-display text-[28px] font-bold text-heading">
              {stat.value}
              {stat.extra && <span className="ml-1.5 text-xl text-subtle">{stat.extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
