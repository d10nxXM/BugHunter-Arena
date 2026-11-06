import Button from '../components/ui/Button.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="font-mono text-sm text-subtle">$ cd ./404</p>
      <h1
        tabIndex={-1}
        className="font-display text-[34px] font-bold tracking-tight text-heading focus:outline-none"
      >
        Page not found
      </h1>
      <p className="text-muted">This page does not exist. The bugs are elsewhere.</p>
      <Button to={paths.problems}>Back to problems</Button>
    </div>
  );
}
