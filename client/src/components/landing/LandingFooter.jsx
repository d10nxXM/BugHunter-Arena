import { Link } from 'react-router';
import { paths } from '../../paths.js';
import { Container } from './SectionHeading.jsx';

const LINKS = [
  { to: paths.problems, label: 'Problems' },
  { to: paths.dashboard, label: 'Dashboard' },
  { to: paths.login, label: 'Log in' },
];

/** Landing footer. Links only to routes that exist. */
export default function LandingFooter() {
  return (
    <footer className="border-t border-track">
      <Container className="flex flex-wrap justify-between gap-8 py-12">
        <div className="flex max-w-[300px] flex-col gap-3">
          <p className="font-display text-lg font-bold text-heading">
            BugHunter <span className="text-accent">Arena</span>
          </p>
          <p className="text-sm leading-relaxed text-subtle">
            Train your eye for bugs: find them, explain them, fix them.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="mb-2.5 font-mono text-xs text-subtle">PLATFORM</p>
          <ul className="flex flex-col gap-1 text-sm">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="inline-block rounded py-1 text-muted hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container className="border-t border-surface-3 pt-5 pb-8 text-[13px] text-subtle">
        © 2026 BugHunter Arena
      </Container>
    </footer>
  );
}
