const NUMBER = new Intl.NumberFormat('en-US');

function count(value) {
  return Number.isFinite(value) ? NUMBER.format(value) : '0';
}

/** Stats strip: Total XP, Solved (of available) and Attempted, as a description list. */
export default function ProfileStats({ totalXp, solved, attempted, challengesAvailable }) {
  const stats = [
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
      <dl className="grid grid-cols-1 overflow-hidden rounded-[14px] border border-border bg-surface sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-border px-5.5 py-5 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0"
          >
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
