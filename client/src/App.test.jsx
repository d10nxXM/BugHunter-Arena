import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import Layout from './components/Layout.jsx';
import { HEADING_WAIT_MS } from './hooks/useFocusHeadingOnNavigation.js';
import TestRunnerProvider, { RUNNER_UNAVAILABLE } from './components/TestRunnerProvider.jsx';
import { USER_STORAGE_KEY } from './context/UserContext.js';
import AuthProvider from './context/AuthProvider.jsx';
import UserProvider from './context/UserProvider.jsx';
import { useTestRunner } from './hooks/useTestRunner.js';

// The challenge route lazy-loads ChallengePage, which imports Monaco. Fake it so the route loads
// fast under jsdom.
vi.mock('./workers/monacoSetup.js', async () => ({
  monaco: (await import('./test-utils/fakeMonaco.js')).fakeMonaco,
}));

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
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Layout />}>{routes}</Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
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
    ['/problems', 'Problems'],
    ['/challenges/find-max', 'Challenge find-max'],
    ['/challenges/find-max/result', 'Result'],
    ['/dashboard', 'Your dashboard', 'Dashboard'],
    ['/login', 'Log in'],
    ['/signup', 'Create your hunter account', 'Create account'],
    ['/no-such-page', 'Page not found'],
  ])('%s shows its h1 and title', async (path, heading, title = heading) => {
    renderAt(path);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(heading);
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toBe(`${title} · BugHunter Arena`);
  });

  it('/ is the landing page with a link to the problems', async () => {
    renderAt('/');
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Find the bug. Explain it. Fix it.');
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toBe('BugHunter Arena');
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Start hunting' })).toHaveAttribute(
      'href',
      '/problems',
    );
  });

  it('/progress redirects to the dashboard', async () => {
    renderAt('/progress');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Your dashboard');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('/profile without a session redirects to the login page', async () => {
    renderAt('/profile');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Log in');
  });

  it('shows the challenge id from the URL', async () => {
    renderAt('/challenges/find-max');
    expect(await screen.findByText('find-max')).toBeInTheDocument();
  });

  it('unknown path links back to the problems', async () => {
    renderAt('/a/b/c');
    const link = await screen.findByRole('link', { name: 'Back to problems' });
    expect(link).toHaveAttribute('href', '/problems');
  });

  it('has a skip link, named navigation links, account actions and a main landmark', async () => {
    renderAt('/problems');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(within(nav).getByRole('link', { name: 'Problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(within(nav).getByRole('link', { name: 'Problems' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Planned sections are visible but not links yet.
    expect(within(nav).queryByRole('link', { name: /Arena|Leaderboard/ })).not.toBeInTheDocument();
    expect(within(nav).getByText('Arena')).toBeInTheDocument();
    expect(within(nav).getByText('Leaderboard')).toBeInTheDocument();
    expect(within(nav).getAllByText('Soon')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Start hunting' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('does not steal focus on the first load', async () => {
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1 });
    expect(document.activeElement).toBe(document.body);
  });

  it('navigating moves focus to the new h1', async () => {
    const user = userEvent.setup();
    renderAt('/problems');
    await screen.findByRole('heading', { level: 1, name: 'Problems' });
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Your dashboard' });
    await expect.poll(() => document.activeElement).toBe(h1);
  });

  it('Tab goes skip link, logo, menu button, nav links, then the account actions', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1 });
    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
    for (const name of ['Dashboard', 'Problems', 'Log in', 'Start hunting']) {
      await user.tab();
      expect(within(screen.getByRole('banner')).getByRole('link', { name })).toHaveFocus();
    }
  });

  it('the menu button opens the menu, Escape closes it and navigating closes it', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1 });
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'site-menu');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('site-menu')).toHaveClass('flex');
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();

    await user.click(button);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Problems' }));
    await screen.findByRole('heading', { level: 1, name: 'Problems' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('regression: the menu stays closed when you come back to the page it was opened on', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1 });
    const button = screen.getByRole('button', { name: 'Menu' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });

    await user.click(button);
    await user.click(within(nav).getByRole('link', { name: 'Problems' }));
    await screen.findByRole('heading', { level: 1, name: 'Problems' });
    await user.click(within(nav).getByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('heading', { level: 1, name: /dashboard|Welcome back/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('a menu link to the current page closes the menu', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard');
    await screen.findByRole('heading', { level: 1 });
    const button = screen.getByRole('button', { name: 'Menu' });

    await user.click(button);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Dashboard' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
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
      'Your data will not be saved after you close this page.',
    );
  });

  it('shows no storage warning normally', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/will not be saved/)).not.toBeInTheDocument();
  });
});

describe('Layout', () => {
  it('keeps the header and nav while a lazy page is loading', async () => {
    const Pending = lazy(() => new Promise(() => {}));
    renderLayout('/', <Route path="/" element={<Pending />} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
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
        <Route path="/dashboard" element={<Page title="Dashboard page" />} />
      </>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong.');
    expect(within(alert).getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
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
        <Route path="/" element={<Page title="Home page" />} />
        <Route path="/dashboard" element={<Later />} />
      </>,
    );
    await screen.findByRole('heading', { name: 'Home page' });
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    resolvePage({ default: () => <Page title="Dashboard page" /> });
    const h1 = await screen.findByRole('heading', { name: 'Dashboard page' });
    await expect.poll(() => document.activeElement).toBe(h1);
  });
});

describe('Layout late h1', () => {
  function deferredPage() {
    let resolvePage;
    const Later = lazy(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    return {
      Later,
      resolve: () => resolvePage({ default: () => <Page title="Dashboard page" /> }),
    };
  }

  afterEach(() => vi.useRealTimers());

  it(`gives up after ${HEADING_WAIT_MS} ms, so a very late h1 does not take focus`, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const page = deferredPage();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderLayout(
      '/',
      <>
        <Route path="/" element={<Page title="Home page" />} />
        <Route path="/dashboard" element={<page.Later />} />
      </>,
    );
    await screen.findByRole('heading', { name: 'Home page' });
    const link = screen.getByRole('link', { name: 'Dashboard' });
    await user.click(link);
    await screen.findByRole('status');

    await act(async () => {
      vi.advanceTimersByTime(HEADING_WAIT_MS + 100);
    });
    page.resolve();
    const h1 = await screen.findByRole('heading', { name: 'Dashboard page' });
    expect(document.activeElement).not.toBe(h1);
    expect(link).toHaveFocus();
  });

  it('does not take focus when the user moved focus while the page loaded', async () => {
    const page = deferredPage();
    const user = userEvent.setup();
    renderLayout(
      '/',
      <>
        <Route path="/" element={<Page title="Home page" />} />
        <Route path="/dashboard" element={<page.Later />} />
      </>,
    );
    await screen.findByRole('heading', { name: 'Home page' });
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('status');
    const logo = screen.getByRole('link', { name: 'BugHunter Arena' });
    act(() => logo.focus());

    page.resolve();
    const h1 = await screen.findByRole('heading', { name: 'Dashboard page' });
    expect(document.activeElement).not.toBe(h1);
    expect(logo).toHaveFocus();
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
