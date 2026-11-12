import { useLeaderboard } from '../../hooks/useLeaderboard.js';
import TopHunters from '../leaderboard/TopHunters.jsx';
import Badge from '../ui/Badge.jsx';
import { SwordsIcon } from './icons.jsx';
import SectionHeading, { Container } from './SectionHeading.jsx';

/** How many hunters the landing card lists (the mockup shows five). */
const TOP = 5;

/**
 * Arena section: the real top hunters from GET /api/leaderboard, and one honest
 * "coming soon" card for the planned multiplayer features (no fake data).
 */
export default function ArenaTeaser() {
  const board = useLeaderboard(TOP);
  return (
    <section aria-labelledby="arena-heading">
      <Container className="py-20 sm:py-26">
        <SectionHeading kicker="// arena" id="arena-heading" className="mb-10">
          Hunt solo today. Go head to head soon.
        </SectionHeading>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-[14px] border border-border bg-surface p-7">
            <SwordsIcon className="text-amber" />
            <p className="min-w-0 flex-1 text-[17px] text-text">
              Duels and weekly hunts are coming soon.
            </p>
            <Badge tone="amber" mono>
              Soon
            </Badge>
          </div>
          <TopHunters state={board} />
        </div>
      </Container>
    </section>
  );
}
