import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getChallenges } from '../api/client.js';
import { challengeList } from '../api/mocks/fixtures.js';
import ChallengeList from './ChallengeList.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenges: vi.fn(),
}));

function renderList() {
  return render(
    <MemoryRouter>
      <ChallengeList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getChallenges).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ChallengeList', () => {
  it('shows one h1 and a loading status while the list loads', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    renderList();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent('Učitavanje izazova…');
    expect(document.title).toBe('Izazovi · BugHunter Arena');
  });

  it('lists challenges with difficulty and category, linked to the challenge', async () => {
    getChallenges.mockResolvedValue(challengeList);
    renderList();
    const link = await screen.findByRole('link', { name: 'Largest number in a list' });
    expect(link).toHaveAttribute('href', '/challenges/find-max');
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('easy')).toBeInTheDocument();
    expect(within(item).getByText('Wrong initialization')).toBeInTheDocument();
    expect(within(item).getByText('Python')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    getChallenges.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('Još nema izazova.')).toBeInTheDocument();
  });

  it('shows the error message and retries', async () => {
    getChallenges
      .mockRejectedValueOnce(
        new ApiError('Server trenutno nije dostupan.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(challengeList);
    const user = userEvent.setup();
    renderList();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server trenutno nije dostupan.');
    await user.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }));
    expect(
      await screen.findByRole('link', { name: 'Largest number in a list' }),
    ).toBeInTheDocument();
    expect(getChallenges).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
