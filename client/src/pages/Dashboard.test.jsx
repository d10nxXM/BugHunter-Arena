import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createUser, getAttempts, getChallenges, getProgress } from '../api/client.js';
import {
  attemptsPage,
  challengeList,
  progress,
  progressEmpty,
  userCreated,
} from '../api/mocks/fixtures.js';
import { USER_STORAGE_KEY } from '../context/UserContext.js';
import AuthProvider from '../context/AuthProvider.jsx';
import UserProvider from '../context/UserProvider.jsx';
import Dashboard from './Dashboard.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createUser: vi.fn(),
    getProgress: vi.fn(),
    getAttempts: vi.fn(),
    getChallenges: vi.fn(),
  };
});

const USER = { userId: userCreated.id, displayName: 'dion' };

function storeUser(user = USER) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function renderDashboard() {
  return render(
    <UserProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      </AuthProvider>
    </UserProvider>,
  );
}

/** count attempts, newest first, with distinct ids and createdAt values. */
function makeAttempts(count, start = 0) {
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return {
      ...attemptsPage[0],
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      createdAt: `2026-11-03T10:${String(59 - (n % 60)).padStart(2, '0')}:00.000000+00:00`,
      score: n === 0 ? null : 50,
      status: n === 0 ? 'submitted' : 'evaluated',
      feedbackSource: n === 0 ? null : 'fallback',
    };
  });
}

beforeEach(() => {
  localStorage.clear();
  getChallenges.mockResolvedValue(challengeList);
  getProgress.mockResolvedValue(progress);
  getAttempts.mockResolvedValue(attemptsPage);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard without a user', () => {
  it('renders the h1 and a labelled name form, and loads nothing', () => {
    renderDashboard();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Your dashboard' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(getProgress).not.toHaveBeenCalled();
    expect(getAttempts).not.toHaveBeenCalled();
  });

  it('validates the name length and focuses the field', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const input = screen.getByLabelText('Display name');

    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.type(input, ' a ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The name needs at least 2 characters.');

    await user.clear(input);
    await user.type(input, 'x'.repeat(33));
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The name can have at most 32 characters.');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates the user with the trimmed name, then shows progress and focuses it', async () => {
    createUser.mockResolvedValue(userCreated);
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText('Display name'), '  dion  ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('heading', { name: 'Hunter' })).toHaveFocus();
    expect(createUser).toHaveBeenCalledWith('dion');
    expect(screen.getByText('dion')).toBeInTheDocument();
    expect(await screen.findByText('241')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(userCreated.id, expect.anything());
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual({
      userId: userCreated.id,
      displayName: 'dion',
    });
  });

  it('shows the ApiError message and keeps the form when creating fails', async () => {
    createUser.mockRejectedValue(
      new ApiError('The server is not available right now.', { code: 'NETWORK_ERROR' }),
    );
    const user = userEvent.setup();
    renderDashboard();

    const input = screen.getByLabelText('Display name');
    await user.type(input, 'dion');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server is not available right now.',
    );
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it('shows a generic message for an unexpected error', async () => {
    createUser.mockRejectedValue(new TypeError('boom'));
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText('Display name'), 'dion');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The name was not saved. Please try again.',
    );
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});

describe('Dashboard with a user', () => {
  beforeEach(() => storeUser());

  it('shows XP, rank, bugs found, solve time, skills and misses', async () => {
    renderDashboard();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome back, dion' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Loading your progress…')).toBeInTheDocument();

    const xp = await screen.findByText('Total XP');
    expect(xp.nextSibling).toHaveTextContent('241');
    expect(screen.getByText('Rank').nextSibling).toHaveTextContent('Exterminator');
    expect(screen.getByText('59 XP to Arena Legend')).toBeInTheDocument();
    expect(screen.getByText('Bugs found').nextSibling).toHaveTextContent('3');
    expect(await screen.findByText('1 easy · 0 medium · 0 hard')).toBeInTheDocument();
    expect(screen.getByText('Avg. solve time').nextSibling).toHaveTextContent('3 min 32 s');
    expect(screen.getByText('Progress loaded.')).toHaveAttribute('role', 'status');

    const skills = screen.getByRole('region', { name: 'Skills by bug class' });
    expect(skills).toHaveTextContent('Wrong initialization');
    expect(skills).toHaveTextContent('1 / 1');
    expect(skills).toHaveTextContent('2 misses: worth practising');
    // Every listed challenge is solved, so there is nothing to continue or recommend.
    expect(screen.getByRole('heading', { name: 'All bugs squashed' })).toBeInTheDocument();
    expect(screen.getByText('Nothing left to recommend. Nice hunting.')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(USER.userId, expect.anything());
  });

  it('shows the empty state for an unknown user (zeros)', async () => {
    getProgress.mockResolvedValue(progressEmpty);
    getAttempts.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText(/You have no attempts yet/)).toBeInTheDocument();
    expect(screen.getByText('Total XP').nextSibling).toHaveTextContent('0');
    expect(
      await screen.findByRole('heading', { name: 'Start your next hunt' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start hunt' })).toHaveAttribute(
      'href',
      '/challenges/find-max',
    );
    expect(await screen.findByText('No attempts yet.')).toBeInTheDocument();
  });

  it('shows an error with retry for progress, and loads again on retry', async () => {
    getProgress
      .mockRejectedValueOnce(
        new ApiError('The server is not responding. Please try again.', { code: 'TIMEOUT' }),
      )
      .mockResolvedValueOnce(progress);
    const user = userEvent.setup();
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server is not responding. Please try again.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toHaveFocus();

    expect(await screen.findByText('Total XP')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error with retry for the history', async () => {
    getAttempts
      .mockRejectedValueOnce(
        new ApiError('The server is not available right now.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(attemptsPage);
    const user = userEvent.setup();
    renderDashboard();

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Attempt history' })).toHaveFocus();

    const table = await screen.findByRole('table', { name: 'Attempts, newest first' });
    expect(within(table).getByText('89 / 100')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(2);
  });

  it('pages the history with "Load more" using cursor and cursorId, and stops at the end', async () => {
    const first = makeAttempts(20);
    const second = makeAttempts(3, 20);
    getAttempts.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const user = userEvent.setup();
    renderDashboard();

    const table = await screen.findByRole('table', { name: 'Attempts, newest first' });
    expect(within(table).getAllByRole('row')).toHaveLength(21);
    expect(within(table).getByText('Not scored')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenNthCalledWith(
      1,
      { userId: USER.userId, limit: 20 },
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    const end = await screen.findByText('No more attempts.');
    expect(end).toHaveFocus();
    expect(within(table).getAllByRole('row')).toHaveLength(24);
    expect(getAttempts).toHaveBeenNthCalledWith(
      2,
      {
        userId: USER.userId,
        limit: 20,
        cursor: first[19].createdAt,
        cursorId: first[19].id,
      },
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(2);
  });

  it('shows no "Load more" when the first page is short', async () => {
    renderDashboard();
    expect(await screen.findByText('No more attempts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps loaded rows and offers retry when loading more fails', async () => {
    getAttempts
      .mockResolvedValueOnce(makeAttempts(20))
      .mockRejectedValueOnce(
        new ApiError('The server is not responding. Please try again.', { code: 'TIMEOUT' }),
      )
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is not responding.');
    const table = screen.getByRole('table', { name: 'Attempts, newest first' });
    expect(within(table).getAllByRole('row')).toHaveLength(21);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No more attempts.')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(3);
  });

  it('falls back to challenge ids when titles fail to load', async () => {
    getChallenges.mockRejectedValue(new ApiError('x', { code: 'NETWORK_ERROR' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderDashboard();
    const table = await screen.findByRole('table', { name: 'Attempts, newest first' });
    expect(within(table).getByText('find-max')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recommended for you' })).not.toBeInTheDocument();
  });

  it('removes the name with clearUser and shows the form again', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Remove name' }));
    const warning = screen.getByText(
      'After removing the name you will no longer see your progress so far.',
    );
    expect(warning).toHaveFocus();
    expect(localStorage.getItem(USER_STORAGE_KEY)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Yes, remove the name' }));

    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your name' })).toHaveFocus();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText('Total XP')).not.toBeInTheDocument();
  });

  it('changes the name by creating a new user and reloads progress for it', async () => {
    const newId = '11111111-2222-4333-8444-555555555555';
    createUser.mockResolvedValue({ id: newId, displayName: 'novo' });
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Change name' }));
    const input = screen.getByLabelText('Display name');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('dion');
    await user.clear(input);
    await user.type(input, 'novo');
    await user.click(screen.getByRole('button', { name: 'Save new name' }));

    expect(await screen.findByRole('heading', { name: 'Hunter' })).toHaveFocus();
    expect(screen.getByText('novo')).toBeInTheDocument();
    await waitFor(() => expect(getProgress).toHaveBeenLastCalledWith(newId, expect.anything()));
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(newId);
  });

  it('keeps the old user when changing the name fails, and cancel restores the view', async () => {
    createUser.mockRejectedValue(new ApiError('Invalid input.', { code: 'VALIDATION_ERROR' }));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Change name' }));
    await user.type(screen.getByLabelText('Display name'), '2');
    await user.click(screen.getByRole('button', { name: 'Save new name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid input.');
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(USER.userId);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Hunter' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Change name' })).toBeInTheDocument();
  });

  it('cancels removing the name and keeps the user', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Remove name' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { name: 'Hunter' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Remove name' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(USER.userId);
  });

  it('closes the form without creating a user when the name is unchanged', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Change name' }));
    const input = screen.getByLabelText('Display name');
    await user.clear(input);
    await user.type(input, '  dion ');
    await user.click(screen.getByRole('button', { name: 'Save new name' }));

    expect(await screen.findByRole('heading', { name: 'Hunter' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Change name' })).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
    expect(getProgress).toHaveBeenCalledTimes(1);
  });

  it('keeps "Cancel" inactive while a new name is being saved', async () => {
    let resolve;
    createUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Change name' }));
    await user.type(screen.getByLabelText('Display name'), '2');
    await user.click(screen.getByRole('button', { name: 'Save new name' }));

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await user.click(cancel);
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();

    resolve({ id: '11111111-2222-4333-8444-555555555555', displayName: 'dion2' });
    expect(await screen.findByText('dion2')).toBeInTheDocument();
  });

  it('shows an error state when progress is not an object', async () => {
    getProgress.mockResolvedValue('not json');
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The data could not be loaded. Please try again.');
    expect(screen.queryByText('Total XP')).not.toBeInTheDocument();
  });

  it('shows the error state when progress lacks finite attempted, solved and totalScore', async () => {
    getProgress.mockResolvedValue({});
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The data could not be loaded. Please try again.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Total XP')).not.toBeInTheDocument();
  });

  it('ignores a createUser result that arrives after unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolve;
    createUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    const { unmount } = renderDashboard();
    await screen.findByText('Total XP');

    await user.click(screen.getByRole('button', { name: 'Change name' }));
    await user.type(screen.getByLabelText('Display name'), '2');
    await user.click(screen.getByRole('button', { name: 'Save new name' }));
    unmount();
    resolve({ id: '11111111-2222-4333-8444-555555555555', displayName: 'dion2' });
    await new Promise((r) => setTimeout(r, 0));

    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual(USER);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('announces a loaded page and keeps "Load more" focusable while loading', async () => {
    let resolveSecond;
    getAttempts.mockResolvedValueOnce(makeAttempts(20)).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveSecond = r;
        }),
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    const busy = screen.getByRole('button', { name: 'Loading…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    await user.click(busy);
    expect(getAttempts).toHaveBeenCalledTimes(2);

    resolveSecond(makeAttempts(20, 20));
    expect(await screen.findByText('Loaded 20 more attempts.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus();
  });

  it('puts the challenge first in the history and labels each feedback source', async () => {
    getAttempts.mockResolvedValue([
      { ...attemptsPage[0], id: '00000000-0000-4000-8000-000000000001' },
      {
        ...attemptsPage[0],
        id: '00000000-0000-4000-8000-000000000002',
        feedbackSource: 'fallback',
      },
      { ...attemptsPage[0], id: '00000000-0000-4000-8000-000000000003', feedbackSource: 'demo' },
    ]);
    renderDashboard();

    const table = await screen.findByRole('table', { name: 'Attempts, newest first' });
    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent('Challenge');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Largest number in a list');
    expect(rows[0]).toHaveTextContent('AI-assisted assessment');
    expect(rows[1]).toHaveTextContent('Assessed without AI');
    expect(rows[2]).toHaveTextContent('AI-assisted assessment (demo)');
  });
});
