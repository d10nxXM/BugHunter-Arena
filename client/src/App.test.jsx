import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import Layout from './components/Layout.jsx';
import TestRunnerProvider, { RUNNER_UNAVAILABLE } from './components/TestRunnerProvider.jsx';
import { USER_STORAGE_KEY } from './context/UserContext.js';
import UserProvider from './context/UserProvider.jsx';
import { useTestRunner } from './hooks/useTestRunner.js';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Layout with test-only routes, for Suspense and error boundary cases. */
function renderLayout(path, routes) {
  return render(
    <UserProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>{routes}</Route>
        </Routes>
      </MemoryRouter>
    </UserProvider>,
  );
}

function Page({ title }) {
  return <h1 tabIndex={-1}>{title}</h1>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('App routes', () => {
  it.each([
    ['/', 'Izazovi'],
    ['/challenges/find-max', 'Izazov find-max'],
    ['/challenges/find-max/result', 'Rezultat'],
    ['/progress', 'Moj napredak'],
    ['/nema-ovoga', 'Stranica ne postoji'],
  ])('%s shows its h1 and title', async (path, heading) => {
    renderAt(path);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(heading);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toBe(`${heading} · BugHunter Arena`);
  });

  it('shows the challenge id from the URL', async () => {
    renderAt('/challenges/find-max');
    expect(await screen.findByText('find-max')).toBeInTheDocument();
  });

  it('unknown path links back to the challenges', async () => {
    renderAt('/a/b/c');
    const link = await screen.findByRole('link', { name: 'Nazad na izazove' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('has a skip link, named navigation links and a main landmark', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Preskoči na sadržaj' })).toHaveAttribute(
      'href',
      '#main',
    );
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    expect(within(nav).getByRole('link', { name: 'Izazovi' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Moj napredak' })).toHaveAttribute(
      'href',
      '/progress',
    );
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('does not steal focus on the first load', async () => {
    renderAt('/progress');
    await screen.findByRole('heading', { level: 1 });
    expect(document.activeElement).toBe(document.body);
  });

  it('navigating moves focus to the new h1', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Izazovi' });
    await user.click(screen.getByRole('link', { name: 'Moj napredak' }));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Moj napredak' });
    await expect.poll(() => document.activeElement).toBe(h1);
  });

  it('Tab goes skip link, logo, then the nav links', async () => {
    const user = userEvent.setup();
    renderAt('/progress');
    await screen.findByRole('heading', { level: 1 });
    await user.tab();
    expect(screen.getByRole('link', { name: 'Preskoči na sadržaj' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Izazovi' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Moj napredak' })).toHaveFocus();
  });

  it('shows the stored display name in the header', async () => {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ userId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' }),
    );
    renderAt('/');
    expect(await screen.findByText('dion')).toBeInTheDocument();
  });

  it('warns when data cannot be saved', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Podaci se neće sačuvati nakon zatvaranja stranice.',
    );
  });

  it('shows no storage warning normally', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/neće sačuvati/)).not.toBeInTheDocument();
  });
});

describe('Layout', () => {
  it('keeps the header and nav while a lazy page is loading', async () => {
    const Pending = lazy(() => new Promise(() => {}));
    renderLayout('/', <Route path="/" element={<Pending />} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Učitavanje…');
    expect(screen.getByRole('navigation', { name: 'Glavna navigacija' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toBeInTheDocument();
  });

  it('a throwing page shows the error message, nav survives, navigating resets it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Boom() {
      throw new Error('secret stack detail');
    }
    const user = userEvent.setup();
    renderLayout(
      '/',
      <>
        <Route path="/" element={<Boom />} />
        <Route path="/progress" element={<Page title="Moj napredak" />} />
      </>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Došlo je do greške.');
    expect(within(alert).getByRole('button', { name: 'Učitaj ponovo' })).toBeInTheDocument();
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Glavna navigacija' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Moj napredak' }));
    expect(await screen.findByRole('heading', { name: 'Moj napredak' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('focuses the h1 once a lazily loaded page appears after navigation', async () => {
    let resolvePage;
    const Later = lazy(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    const user = userEvent.setup();
    renderLayout(
      '/',
      <>
        <Route path="/" element={<Page title="Izazovi" />} />
        <Route path="/progress" element={<Later />} />
      </>,
    );
    await screen.findByRole('heading', { name: 'Izazovi' });
    await user.click(screen.getByRole('link', { name: 'Moj napredak' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Učitavanje…');
    resolvePage({ default: () => <Page title="Moj napredak" /> });
    const h1 = await screen.findByRole('heading', { name: 'Moj napredak' });
    await expect.poll(() => document.activeElement).toBe(h1);
  });
});

describe('TestRunnerProvider stub', () => {
  const wrapper = ({ children }) => <TestRunnerProvider>{children}</TestRunnerProvider>;

  it('is never ready and reports why', () => {
    const { result } = renderHook(() => useTestRunner(), { wrapper });
    expect(result.current.ready).toBe(false);
    expect(result.current.loadError).toBe(RUNNER_UNAVAILABLE);
  });

  it('run() rejects instead of returning fake results', async () => {
    const { result } = renderHook(() => useTestRunner(), { wrapper });
    await expect(
      result.current.run({ code: '', functionName: 'f', tests: [{ id: 't1' }] }),
    ).rejects.toThrow(RUNNER_UNAVAILABLE);
  });

  it('useTestRunner outside the provider throws a clear error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTestRunner())).toThrow(/inside <TestRunnerProvider>/);
  });
});
