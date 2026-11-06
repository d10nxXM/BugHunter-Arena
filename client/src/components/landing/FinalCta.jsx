import { paths } from '../../paths.js';
import Button from '../ui/Button.jsx';
import { Container } from './SectionHeading.jsx';

export default function FinalCta() {
  return (
    <section aria-labelledby="cta-heading">
      <Container className="py-20 sm:py-28">
        <div className="flex flex-col items-center gap-6 rounded-[20px] border border-border-strong bg-surface bg-[radial-gradient(#1a2330_1px,transparent_1px)] bg-size-[24px_24px] px-6 py-14 text-center sm:px-8 sm:py-18">
          <p className="font-mono text-[15px] text-accent">$ ./start_hunt.sh</p>
          <h2
            id="cta-heading"
            className="max-w-[760px] font-display text-[34px] leading-[1.05] font-bold tracking-[-0.03em] text-heading sm:text-5xl lg:text-[56px]"
          >
            One bug is hiding. Can you find it?
          </h2>
          <p className="max-w-[560px] text-lg leading-relaxed text-muted">
            Create a free account to keep your XP, or jump in as a guest and solve your first
            challenge in a few minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Button to={paths.signup} className="min-h-[52px] rounded-[10px] px-7 text-base">
              Create free account
            </Button>
            <Button
              to={paths.problems}
              variant="secondary"
              className="min-h-[52px] rounded-[10px] bg-surface px-6.5 text-base"
            >
              Start as guest
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
