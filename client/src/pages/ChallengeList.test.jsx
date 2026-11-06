import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getChallenges, getProgress } from '../api/client.js';
import { useUser } from '../hooks/useUser.js';
import ChallengeList from './ChallengeList.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenges: vi.fn(),
  getProgress: vi.fn(),
}));
vi.mock('../hooks/useUser.js', () => ({ useUser: vi.fn() }));

const USER = { userId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' };

const CHALLENGES = [
  {
    id: 'find-max',
    title: 'Largest number in a list',
    language: 'python',
    difficulty: 'easy',
    bugCategory: 'Wrong initialization',
  },
  {
    id: 'remove-negatives',
    title: 'Remove negative numbers',
    language: 'python',
    difficulty: 'medium',
    bugCategory: 'Modifying a collection while iterating',
  },
  {
    id: 'binary-search',
    title: 'Binary search',
    language: 'python',
    difficulty: 'hard',
    bugCategory: 'Off-by-one error',
  },
];

const PROGRESS = {
  totalScore: 129,
  solved: 1,
  attempted: 2,
  averageDurationSec: 200,
  perChallenge: [
    { challengeId: 'find-max', bestScore: 89, attempts: 2 },
    { challengeId: 'binary-search', bestScore: 40, attempts: 1 },
  ],
  weakCategories: [],
};

function renderList() {
  return render(
    <MemoryRouter>
      <ChallengeList />
    </MemoryRouter>,
  );
}

function titles() {
  const table = screen.queryByRole('table', { name: 'Problems' });
  if (!table) return [];
  return within(table)
    .getAllByRole('link')
    .map((a) => a.textContent);
}

beforeEach(() => {
  vi.mocked(getChallenges).mockReset().mockResolvedValue(CHALLENGES);
  vi.mocked(getProgress).mockReset().mockResolvedValue(PROGRESS);
  vi.mocked(useUser).mockReturnValue({ user: null, persisted: true });
});
afterEach(() => vi.restoreAllMocks());

describe('Problems page', () => {
  it('shows one focusable h1 and a loading status while the list loads', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    renderList();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Problems');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Loading problems…')).toBeInTheDocument();
    expect(document.title).toBe('Problems · BugHunter Arena');
  });

  it('lists every problem with number, link, language, bug class, difficulty and XP', async () => {
    renderList();
    const link = await screen.findByRole('link', { name: 'Largest number in a list' });
    expect(link).toHaveAttribute('href', '/challenges/find-max');
    const row = link.closest('tr');
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('Python')).toBeInTheDocument();
    expect(within(row).getByText('Wrong initialization')).toBeInTheDocument();
    expect(within(row).getByText('Easy')).toBeInTheDocument();
    expect(within(row).getByText('100 XP')).toBeInTheDocument();
    expect(titles()).toHaveLength(3);
    expect(screen.getByText('Showing 3 problems')).toBeInTheDocument();
  });

  it('builds the category chips from the data', async () => {
    renderList();
    const group = await screen.findByRole('group', { name: 'Bug class' });
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual([
      'All',
      'Modifying a collection while iterating',
      'Off-by-one error',
      'Wrong initialization',
    ]);
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderList();
    const group = await screen.findByRole('group', { name: 'Bug class' });
    const chip = within(group).getByRole('button', { name: 'Off-by-one error' });
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Binary search']);
    expect(screen.getByText('Showing 1 problem')).toBeInTheDocument();
  });

  it('filters by difficulty', async () => {
    const user = userEvent.setup();
    renderList();
    const group = await screen.findByRole('group', { name: 'Difficulty' });
    const medium = within(group).getByRole('button', { name: 'Medium' });
    await user.click(medium);
    expect(medium).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(titles()).toEqual(['Remove negative numbers']);
  });

  it('combines category and difficulty filters', async () => {
    const user = userEvent.setup();
    renderList();
    const cats = await screen.findByRole('group', { name: 'Bug class' });
    const diffs = screen.getByRole('group', { name: 'Difficulty' });
    await user.click(within(cats).getByRole('button', { name: 'Wrong initialization' }));
    await user.click(within(diffs).getByRole('button', { name: 'Easy' }));
    expect(titles()).toEqual(['Largest number in a list']);
    await user.click(within(diffs).getByRole('button', { name: 'Hard' }));
    expect(titles()).toEqual([]);
  });

  it('searches by title and by bug class', async () => {
    const user = userEvent.setup();
    renderList();
    const search = await screen.findByLabelText('Search problems');
    await user.type(search, 'binary');
    expect(titles()).toEqual(['Binary search']);
    await user.clear(search);
    await user.type(search, 'COLLECTION');
    expect(titles()).toEqual(['Remove negative numbers']);
  });

  it('shows an empty state whose reset button clears every filter', async () => {
    const user = userEvent.setup();
    renderList();
    const search = await screen.findByLabelText('Search problems');
    await user.click(
      within(screen.getByRole('group', { name: 'Difficulty' })).getByRole('button', {
        name: 'Hard',
      }),
    );
    await user.type(search, 'nothing matches this');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/No problems match these filters/)).toBeInTheDocument();
    expect(screen.getByText('Showing 0 problems')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(titles()).toHaveLength(3);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(
      within(screen.getByRole('group', { name: 'Difficulty' })).getByRole('button', {
        name: 'All',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the error with a retry', async () => {
    getChallenges
      .mockRejectedValueOnce(
        new ApiError('The server is not available right now.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(CHALLENGES);
    const user = userEvent.setup();
    renderList();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server is not available right now.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Binary search' })).toBeInTheDocument();
    expect(getChallenges).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  describe('as a guest', () => {
    it('shows the guest card, no status icons and does not fetch progress', async () => {
      renderList();
      await screen.findByRole('table', { name: 'Problems' });
      expect(
        screen.getByText(/Play as a guest or create an account to track progress/),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
        'href',
        '/signup',
      );
      expect(screen.queryByText('Solved')).not.toBeInTheDocument();
      expect(screen.queryByText('Attempted')).not.toBeInTheDocument();
      expect(getProgress).not.toHaveBeenCalled();
    });
  });

  describe('with a user', () => {
    beforeEach(() => {
      vi.mocked(useUser).mockReturnValue({ user: USER, persisted: true });
    });

    it('shows solved and attempted status with text and the best XP', async () => {
      renderList();
      const solvedRow = (await screen.findByText('Solved')).closest('tr');
      expect(within(solvedRow).getByRole('link')).toHaveTextContent('Largest number in a list');
      expect(within(solvedRow).getByText('89 / 100')).toBeInTheDocument();
      const attemptedRow = screen.getByText('Attempted').closest('tr');
      expect(within(attemptedRow).getByRole('link')).toHaveTextContent('Binary search');
      expect(within(attemptedRow).getByText('40 / 100')).toBeInTheDocument();
      const untouched = screen.getByRole('link', { name: 'Remove negative numbers' }).closest('tr');
      expect(within(untouched).getByText('Not attempted')).toBeInTheDocument();
      expect(within(untouched).getByText('100 XP')).toBeInTheDocument();
      expect(getProgress).toHaveBeenCalledWith(USER.userId, expect.anything());
    });

    it('shows solved counts per difficulty and the rank', async () => {
      renderList();
      const card = (
        await screen.findByRole('heading', { level: 2, name: 'Your progress' })
      ).closest('section');
      expect(await within(card).findByText('/ 3 solved')).toBeInTheDocument();
      expect(within(card).getByRole('progressbar', { name: 'Easy' })).toHaveAttribute(
        'aria-valuetext',
        '1 of 1 solved',
      );
      expect(within(card).getByRole('progressbar', { name: 'Hard' })).toHaveAttribute(
        'aria-valuetext',
        '0 of 1 solved',
      );
      // 89 + 40 = 129 XP -> Hunter (100), 71 XP to Exterminator (200).
      expect(within(card).getByText('Hunter')).toBeInTheDocument();
      expect(within(card).getByText('129 XP')).toBeInTheDocument();
      expect(within(card).getByText('71 XP to Exterminator')).toBeInTheDocument();
    });

    it('keeps the table without icons when progress fails to load', async () => {
      getProgress.mockRejectedValue(new ApiError('down', { code: 'NETWORK_ERROR' }));
      renderList();
      expect(await screen.findByText(/Your progress could not be loaded/)).toBeInTheDocument();
      expect(titles()).toHaveLength(3);
      expect(screen.queryByText('Solved')).not.toBeInTheDocument();
      expect(screen.queryByText('Attempted')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
