import { RANKS } from '../../lib/xp.js';
import SectionHeading, { Container } from './SectionHeading.jsx';

// Per tier, as in the mockup: name color and bar fill. The last tier gets the gold card.
const NAME_COLORS = ['text-muted', 'text-easy', 'text-amber', 'text-heading'];
const BAR_FILLS = ['bg-subtle', 'bg-easy', 'bg-amber', 'bg-hard'];

export default function RanksSection() {
  const last = RANKS.length - 1;
  return (
    <section aria-labelledby="ranks-heading" className="border-y border-track bg-nav">
      <Container className="py-20 sm:py-26">
        <SectionHeading kicker="// ranks" id="ranks-heading" className="mb-12">
          From larva to legend
        </SectionHeading>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {RANKS.map((rank, i) => {
            const top = i === last;
            const width = Math.round(((i + 1) / RANKS.length) * 100);
            return (
              <li
                key={rank.name}
                className={`flex flex-col gap-2.5 rounded-xl border p-6 ${
                  top ? 'border-amber/40 bg-amber-soft/50' : 'border-border bg-surface'
                }`}
              >
                <span className={`font-mono text-xs ${top ? 'text-amber' : 'text-subtle'}`}>
                  TIER {i + 1}
                </span>
                <h3
                  className={`font-display text-[22px] font-bold ${
                    NAME_COLORS[Math.min(i, NAME_COLORS.length - 1)]
                  }`}
                >
                  {rank.name}
                </h3>
                <div aria-hidden="true" className="h-1.5 rounded-[3px] bg-track">
                  {/* Width is computed, so it is the one allowed inline style. */}
                  <div
                    className={`h-1.5 rounded-[3px] ${BAR_FILLS[Math.min(i, BAR_FILLS.length - 1)]}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="text-sm text-muted">{rank.description}</p>
                <p className="font-mono text-xs text-subtle">from {rank.minXp} XP</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
