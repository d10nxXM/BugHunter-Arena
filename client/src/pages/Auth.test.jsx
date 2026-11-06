import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getMe, login, logout, signup } from '../api/client.js';
import * as f from '../api/mocks/fixtures.js';
import Layout from '../components/Layout.jsx';
import AuthProvider from '../context/AuthProvider.jsx';
import { USER_STORAGE_KEY } from '../context/UserContext.js';
import UserProvider from '../context/UserProvider.jsx';
import { readSession, writeSession } from '../lib/session.js';
import Login from './Login.jsx';
import Signup from './Signup.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, login: vi.fn(), signup: vi.fn(), logout: vi.fn(), getMe: vi.fn() };
});

const session = { ...f.authSession, expiresAt: Math.floor(Date.now() / 1000) + 3600 };

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderAt(path) {
  return render(
    <UserProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="*" element={<Where />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </UserProvider>,
  );
}

const apiError = (status, body) =>
  new ApiError(body.error.message, { status, code: body.error.code });

beforeEach(() => {
  localStorage.clear();
  login.mockReset();
  signup.mockReset();
  logout.mockReset().mockResolvedValue(null);
  getMe.mockReset().mockResolvedValue(f.me);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Login', () => {
  it('has one focusable h1 and labelled fields, without the cut items', () => {
    renderAt('/login');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Log in');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByText(/GitHub|Google|Forgot password|Keep me logged in/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('shows validation messages and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in, sets the user and goes to the problems page', async () => {
    login.mockResolvedValue({ session, user: f.accountUser });
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), ' hunter@example.com ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/problems');
    expect(login).toHaveBeenCalledWith(
      { email: 'hunter@example.com', password: 'correct-horse-battery' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual({
      userId: f.accountUser.id,
      displayName: 'null_pointer',
    });
    // Header now shows the avatar link to the profile and "Log out".
    expect(screen.getByRole('link', { name: 'Your profile (@null_pointer)' })).toHaveAttribute(
      'href',
      '/u/null_pointer',
    );
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it.each([
    [401, f.errorInvalidCredentials, 'Invalid email or password.'],
    [429, f.errorRateLimited, 'Too many attempts. Wait a few minutes and try again.'],
    [503, f.errorAuthUnavailable, /Accounts are not available right now/],
  ])('shows the %i server error', async (status, body, text) => {
    login.mockRejectedValue(apiError(status, body));
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), 'hunter@example.com');
    await user.type(screen.getByLabelText('Password'), 'whatever-it-is');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(readSession()).toBeNull();
  });

  it('sends a visitor who is already logged in to their profile', () => {
    writeSession({ ...session, user: f.accountUser });
    renderAt('/login');
    expect(screen.getByTestId('where')).toHaveTextContent('/u/null_pointer');
  });
});

describe('Signup', () => {
  async function fill(user, { handle, email, password }) {
    if (handle) await user.type(screen.getByLabelText('Hunter handle'), handle);
    if (email) await user.type(screen.getByLabelText('Email'), email);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('has one focusable h1 and none of the cut items', () => {
    renderAt('/signup');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Create your hunter account');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText(/Shown on your public profile/)).toBeInTheDocument();
    expect(screen.queryByText(/GitHub|Google|main language|Terms|leaderboards/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it.each([
    [{ handle: 'ab', email: 'a@b.co', password: 'long-enough-pw' }, 'Use 3 to 20 letters'],
    [{ handle: 'bad-handle!', email: 'a@b.co', password: 'long-enough-pw' }, 'Use 3 to 20'],
    [{ handle: 'admin', email: 'a@b.co', password: 'long-enough-pw' }, 'This handle is reserved'],
    [{ handle: 'hunter', email: 'nope', password: 'long-enough-pw' }, 'Enter a valid email'],
    [{ handle: 'hunter', email: 'a@b.co', password: 'short' }, 'Use at least 10 characters.'],
    [{ handle: 'hunter', email: 'a@b.co', password: 'x'.repeat(73) }, 'Use at most 72 characters.'],
  ])('validates %o', async (values, message) => {
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, values);
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it('creates the account with a lowercased handle and logs in', async () => {
    signup.mockResolvedValue({ session, user: { ...f.accountUser, handle: 'new_hunter' } });
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, {
      handle: 'New_Hunter',
      email: 'new@example.com',
      password: 'long-enough-pw',
    });
    expect(await screen.findByTestId('where')).toHaveTextContent('/problems');
    expect(signup.mock.calls[0][0]).toEqual({
      handle: 'new_hunter',
      email: 'new@example.com',
      password: 'long-enough-pw',
      claimUserId: null,
    });
    expect(screen.getByRole('link', { name: 'Your profile (@new_hunter)' })).toBeInTheDocument();
  });

  it('409 HANDLE_TAKEN marks the handle field', async () => {
    signup.mockRejectedValue(apiError(409, f.errorHandleTaken));
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, { handle: 'taken', email: 'a@b.co', password: 'long-enough-pw' });
    expect(await screen.findByText(/This handle is already taken/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hunter handle')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Hunter handle')).toHaveFocus();
  });

  it('409 EMAIL_TAKEN marks the email field and offers to log in', async () => {
    signup.mockRejectedValue(apiError(409, f.errorEmailTaken));
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, { handle: 'hunter', email: 'a@b.co', password: 'long-enough-pw' });
    expect(await screen.findByText(/An account with this email already exists/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Log in instead' })).toHaveAttribute('href', '/login');
  });

  it('429 is shown as a form error', async () => {
    signup.mockRejectedValue(apiError(429, f.errorRateLimited));
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, { handle: 'hunter', email: 'a@b.co', password: 'long-enough-pw' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/);
  });

  it('a timeout says the server is waking up', async () => {
    signup.mockRejectedValue(new ApiError('slow', { code: 'TIMEOUT' }));
    const user = userEvent.setup();
    renderAt('/signup');
    await fill(user, { handle: 'hunter', email: 'a@b.co', password: 'long-enough-pw' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/waking up/);
  });
});

describe('header and kill switch', () => {
  it('logout from the header returns to "Log in"', async () => {
    writeSession({ ...session, user: f.accountUser });
    const user = userEvent.setup();
    renderAt('/anything');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(readSession()).toBeNull();
    expect(logout).toHaveBeenCalledWith(session.accessToken);
  });

  it('VITE_AUTH_ENABLED=false hides the login link and turns the forms into a notice', () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'false');
    renderAt('/login');
    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.getByText(/Accounts are not available right now/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});
