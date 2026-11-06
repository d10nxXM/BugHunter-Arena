import { paths } from '../../paths.js';
import Button from '../ui/Button.jsx';
import HeroCodeCard from './HeroCodeCard.jsx';
import { ArrowRightIcon } from './icons.jsx';
import { Container } from './SectionHeading.jsx';

const FACTS = ['Python', 'Tests run in your browser', 'Graded AI hints'];

/** Landing hero with the page's only h1. */
export default function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="border-b border-track bg-[radial-gradient(#1a2330_1px,transparent_1px)] bg-size-[28px_28px]"
    >
      <Container className="flex flex-wrap items-center gap-16 pt-16 pb-20 sm:pt-24 sm:pb-26">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-7">
          <p className="flex items-center gap-2 self-start rounded-full border border-border-strong bg-surface px-3 py-1.5 font-mono text-[13px] text-muted">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            bughunt --lang=python
          </p>
          <h1
            id="hero-heading"
            tabIndex={-1}
            className="font-display text-[42px] leading-[1.02] font-bold tracking-[-0.03em] text-heading focus:outline-none sm:text-6xl lg:text-[68px]"
          >
            Find the bug. <span className="text-accent">Explain it. Fix it.</span>
          </h1>
          <p className="max-w-[520px] text-lg leading-relaxed text-muted sm:text-[19px]">
            Short Python challenges, each with one deliberate bug. Select the broken line, explain
            why it fails and patch it. An AI mentor gives graded hints and checks your explanation,
            but never writes the fix for you. Earn XP and climb the ranks.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <Button to={paths.problems} className="min-h-[52px] rounded-[10px] px-6.5 text-base">
              Start hunting
              <ArrowRightIcon />
            </Button>
            <Button
              to={paths.problems}
              variant="secondary"
              className="min-h-[52px] rounded-[10px] bg-surface px-6.5 text-base"
            >
              Browse problems
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2.5 font-mono text-[13px] text-muted">
            {FACTS.map((fact) => (
              <li key={fact} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5">
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <HeroCodeCard />
      </Container>
    </section>
  );
}
