import Badge from '../ui/Badge.jsx';
import { SwordsIcon } from './icons.jsx';
import SectionHeading, { Container } from './SectionHeading.jsx';

/** Planned multiplayer features: one honest "coming soon" card, no fake data. */
export default function ArenaTeaser() {
  return (
    <section aria-labelledby="arena-heading">
      <Container className="py-20 sm:py-26">
        <SectionHeading kicker="// arena" id="arena-heading" className="mb-10">
          Hunt solo today. Go head to head soon.
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-border bg-surface p-7">
          <SwordsIcon className="text-amber" />
          <p className="min-w-0 flex-1 text-[17px] text-text">
            Duels, weekly hunts and leaderboards are coming soon.
          </p>
          <Badge tone="amber" mono>
            Soon
          </Badge>
        </div>
      </Container>
    </section>
  );
}
