import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

/** Shown on /login, /signup and profiles when accounts are switched off (VITE_AUTH_ENABLED=false). */
export default function AccountPlaceholder({ title }) {
  usePageTitle(title);
  return (
    <Card as="section" className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1
        tabIndex={-1}
        className="font-display text-3xl font-bold tracking-tight text-heading focus:outline-none"
      >
        {title}
      </h1>
      <p className="text-muted">
        Accounts are not available right now. You can still solve problems as a guest; your progress
        is kept in this browser.
      </p>
      <Button to={paths.problems} className="self-start">
        Start hunting
      </Button>
    </Card>
  );
}
