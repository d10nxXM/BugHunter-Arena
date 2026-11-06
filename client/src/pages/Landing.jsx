import Button from '../components/ui/Button.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

// Placeholder hero. The full landing page (package F1) replaces the body of this component.
export default function Landing() {
  usePageTitle('');
  return (
    <section className="border-b border-track bg-[radial-gradient(#1a2330_1px,transparent_1px)] bg-size-[28px_28px]">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-7 px-6 pt-24 pb-26">
        <p className="flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 font-mono text-[13px] text-muted">
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          new_season --hunt=ai_code
        </p>
        <h1
          tabIndex={-1}
          className="max-w-3xl font-display text-5xl leading-[1.05] font-bold tracking-tight text-heading focus:outline-none sm:text-6xl"
        >
          AI writes the code. <span className="text-accent">You find the bugs.</span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted">
          Short challenges with one deliberate bug. Point at the broken line, explain why it fails,
          and fix it. An AI mentor gives hints, never the answer.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button to={paths.problems}>Start hunting</Button>
          <Button to={paths.dashboard} variant="secondary">
            View dashboard
          </Button>
        </div>
      </div>
    </section>
  );
}
