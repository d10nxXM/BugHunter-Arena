import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

function Boom() {
  throw new Error('TypeError at /src/secret.js:12');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Sadržaj</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Sadržaj')).toBeInTheDocument();
  });

  it('shows the fixed message without error details', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Došlo je do greške.');
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });

  it('"Učitaj ponovo" reloads the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Učitaj ponovo' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
