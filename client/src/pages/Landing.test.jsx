import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getChallenges } from '../api/client.js';
import { RANKS } from '../lib/xp.js';
import Landing from './Landing.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenges: vi.fn(),
}));

const CHALLENGES = Array.from({ length: 8 }, (_, i) => ({
  id: `c-${i + 1}`,
  title: `Challenge ${i + 1}`,
  language: 'python',
  difficulty: ['easy', 'medium', 'hard'][i % 3],
  bugCategory: i % 2 ? 'Off-by-one error' : 'Wrong initialization',
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getChallenges).mockReset();
});

describe('Landing', () => {
  it('renders the hero with one focusable h1 and the calls to action', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    renderLanding();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Find the bug. Explain it. Fix it.');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('link', { name: 'Start hunting' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.getByRole('link', { name: 'Browse problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.getByRole('link', { name: 'Create free account' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: 'Start as guest' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
    expect(screen.getByText('Loading challenges…')).toBeInTheDocument();
    expect(document.title).toBe('BugHunter Arena');
  });

  it('shows the four steps, the ranks from lib/xp.js and the coming-soon arena', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    renderLanding();
    for (const step of [
      'Pick a challenge',
      'Flag the bug',
      'Submit the fix',
      'Earn XP & rank up',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: step })).toBeInTheDocument();
    }
    for (const rank of RANKS) {
      expect(screen.getByRole('heading', { level: 3, name: rank.name })).toBeInTheDocument();
      expect(screen.getByText(rank.description)).toBeInTheDocument();
    }
    expect(
      screen.getByText('Duels, weekly hunts and leaderboards are coming soon.'),
    ).toBeInTheDocument();
  });

  it('shows up to six live challenges linked to the challenge page', async () => {
    getChallenges.mockResolvedValue(CHALLENGES);
    renderLanding();
    const table = await screen.findByRole('table', { name: 'Challenges' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 6);
    expect(within(table).getByRole('link', { name: 'Challenge 1' })).toHaveAttribute(
      'href',
      '/challenges/c-1',
    );
    expect(within(table).queryByText('Challenge 7')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('Python')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Wrong initialization')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Easy')).toBeInTheDocument();
    expect(within(rows[1]).getByText('100 XP max')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
  });

  it('hides the table and keeps the page working when the list fails to load', async () => {
    getChallenges.mockRejectedValue(new ApiError('down', { code: 'NETWORK_ERROR' }));
    renderLanding();
    expect(
      await screen.findByText('The challenge list could not be loaded right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start hunting' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all problems' })).toBeInTheDocument();
  });

  it('footer links only to existing routes', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    renderLanding();
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    const hrefs = within(footer)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/problems', '/dashboard', '/login']);
    expect(screen.getByText('© 2026 BugHunter Arena')).toBeInTheDocument();
  });
});
