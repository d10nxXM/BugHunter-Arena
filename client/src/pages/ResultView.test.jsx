import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getChallenges } from '../api/client.js';
import {
  attemptCreated,
  challengeList,
  evaluationAi,
  evaluationFallback,
} from '../api/mocks/fixtures.js';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import ResultView from './ResultView.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getChallenges: vi.fn() };
});

const TWO_CHALLENGES = [
  ...challengeList,
  { ...challengeList[0], id: 'sum-list', title: 'Zbir liste' },
];

beforeEach(() => {
  getChallenges.mockResolvedValue(TWO_CHALLENGES);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const ALL_PASSED = [
  { id: 't1', passed: true, actual: 5, error: null },
  { id: 't2', passed: true, actual: 7, error: null },
  { id: 't3', passed: true, actual: -3, error: null },
  { id: 't4', passed: true, actual: null, error: null },
];

function makeState(overrides = {}) {
  return {
    attemptId: attemptCreated.attemptId,
    challengeId: 'find-max',
    tests: attemptCreated.tests,
    testResults: ALL_PASSED,
    referenceSolution: attemptCreated.referenceSolution,
    evaluation: evaluationAi,
    ...overrides,
  };
}

function renderResult({ path = '/challenges/find-max/result', state } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/challenges/:id/result" element={<ResultView />} />
        <Route path="/challenges/:id" element={<h1>Izazov</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function breakdownRow(label) {
  const table = screen.getByRole('table', { name: 'Points per part' });
  return within(table).getByRole('row', { name: new RegExp(label) });
}

describe('ResultView', () => {
  it('shows the AI result with score 89, labels and the negative hint penalty', () => {
    renderResult({ state: makeState() });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1');
    expect(document.title).toBe('Result · BugHunter Arena');
    expect(screen.getByText(/89 \/ 100/)).toBeInTheDocument();

    expect(breakdownRow('Finding the bug line')).toHaveTextContent('4040');
    expect(breakdownRow('Explanation')).toHaveTextContent('2430');
    expect(breakdownRow('Edge case')).toHaveTextContent('2020');
    expect(breakdownRow('Code fix')).toHaveTextContent('1010');
    const penalty = breakdownRow('Hint penalty');
    expect(within(penalty).getAllByRole('cell')[0]).toHaveTextContent('-5');
    expect(within(penalty).getAllByRole('cell')[1]).toHaveTextContent('up to -20');
    expect(breakdownRow('Total')).toHaveTextContent('89');

    expect(screen.getByText('AI-assisted assessment')).toBeInTheDocument();
    expect(screen.queryByText('Assessed without AI')).not.toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.feedback)).toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.detected_misconception)).toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.practice_tip)).toBeInTheDocument();
    expect(screen.getByText('Explanation quality: 8 / 10')).toBeInTheDocument();
    expect(screen.getByText('4 of 4 tests passed.')).toBeInTheDocument();
  });

  it('labels the fallback result "Assessed without AI" with score 74', () => {
    renderResult({ state: makeState({ evaluation: evaluationFallback }) });

    expect(screen.getByText(/74 \/ 100/)).toBeInTheDocument();
    expect(screen.getByText('Assessed without AI')).toBeInTheDocument();
    expect(screen.queryByText('AI-assisted assessment')).not.toBeInTheDocument();
    expect(breakdownRow('Explanation')).toHaveTextContent('930');
    expect(screen.getByText('Your explanation is not fully correct.')).toBeInTheDocument();
    expect(screen.getByText(evaluationFallback.feedback.feedback)).toBeInTheDocument();
    expect(screen.queryByText('Practice tip')).not.toBeInTheDocument();
  });

  it('labels demo feedback as a recorded AI answer', () => {
    renderResult({
      state: makeState({ evaluation: { ...evaluationAi, feedbackSource: 'demo' } }),
    });
    expect(screen.getByText('AI-assisted assessment (demo)')).toBeInTheDocument();
  });

  it('shows "This result is not available." with a link back when there is no state', () => {
    renderResult({ state: undefined });

    expect(screen.getByRole('heading', { level: 1, name: 'Result' })).toBeInTheDocument();
    expect(screen.getByText('This result is not available.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the challenge' })).toHaveAttribute(
      'href',
      '/challenges/find-max',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('does not show a result for another challenge', () => {
    renderResult({
      path: '/challenges/other-one/result',
      state: makeState(),
    });

    expect(screen.getByText('This result is not available.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the challenge' })).toHaveAttribute(
      'href',
      '/challenges/other-one',
    );
    expect(screen.queryByText(/89 \/ 100/)).not.toBeInTheDocument();
  });

  it('renders AI feedback containing HTML as plain text', () => {
    const evil = '<script>alert(1)</script><b>bold</b>';
    const { container } = renderResult({
      state: makeState({
        evaluation: {
          ...evaluationAi,
          feedback: { ...evaluationAi.feedback, feedback: evil, practice_tip: '<img src=x>' },
        },
      }),
    });

    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(screen.getByText('<img src=x>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows visible and hidden tests with pass, fail and timeout by text and icon', () => {
    renderResult({
      state: makeState({
        testResults: [
          { id: 't1', passed: true, actual: 5, error: null },
          { id: 't2', passed: false, actual: 0, error: null },
          { id: 't3', passed: false, actual: null, error: 'timeout' },
          { id: 't4', passed: false, actual: null, error: 'ZeroDivisionError: division by zero' },
        ],
      }),
    });

    const table = screen.getByRole('table', { name: 'Test results' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('visible');
    expect(rows[0]).toHaveTextContent('Passed');
    expect(rows[1]).toHaveTextContent('Failed');
    expect(rows[2]).toHaveTextContent('hidden');
    expect(rows[2]).toHaveTextContent('Timed out (3 s)');
    expect(rows[2]).not.toHaveTextContent('Passed');
    expect(rows[3]).toHaveTextContent('Failed');
    expect(rows[3]).toHaveTextContent('Error: ZeroDivisionError: division by zero');
    expect(rows[2]).toHaveTextContent('[-8,-3,-10]');
    // Icons are decorative next to the text.
    for (const row of rows) {
      expect(row.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('treats passed true with a timeout error as a timeout', () => {
    renderResult({
      state: makeState({ testResults: [{ id: 't1', passed: true, error: 'timeout' }] }),
    });
    const rows = within(screen.getByRole('table', { name: 'Test results' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Timed out (3 s)');
    expect(rows[2]).toHaveTextContent('Not run');
  });

  it('shows the reference solution read-only and the next-step links', () => {
    renderResult({ state: makeState() });

    expect(screen.getByRole('heading', { level: 2, name: 'Reference solution' })).toBeVisible();
    const code = screen.getByText(attemptCreated.referenceSolution);
    expect(code.closest('pre')).not.toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/challenges/find-max',
    );
    expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('omits the solution section when the state has no referenceSolution', () => {
    renderResult({ state: makeState({ referenceSolution: undefined }) });
    expect(screen.queryByText('Reference solution')).not.toBeInTheDocument();
  });

  it('shows the challenge title and links the next challenge in list order', async () => {
    renderResult({ state: makeState() });

    expect(await screen.findByText('Largest number in a list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next challenge: Zbir liste' })).toHaveAttribute(
      'href',
      '/challenges/sum-list',
    );
    expect(screen.getByRole('link', { name: 'All problems' })).toHaveAttribute('href', '/problems');
  });

  it('offers only "Svi izazovi" for the last challenge', async () => {
    getChallenges.mockResolvedValue([...TWO_CHALLENGES].reverse());
    renderResult({ state: makeState() });

    expect(await screen.findByText('Largest number in a list')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Next challenge/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All problems' })).toBeInTheDocument();
  });

  it('falls back to the id and "Svi izazovi" when the list fails to load', async () => {
    getChallenges.mockRejectedValue(new ApiError('x', { code: 'NETWORK_ERROR' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderResult({ state: makeState() });

    await waitFor(() => expect(getChallenges).toHaveBeenCalled());
    expect(screen.getByText('find-max')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Next challenge/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All problems' })).toBeInTheDocument();
  });

  it('aborts the challenge list request on unmount', () => {
    getChallenges.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderResult({ state: makeState() });
    const { signal } = getChallenges.mock.calls[0][0];
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('does not load the challenge list when the result is unavailable', () => {
    renderResult({ state: undefined });
    expect(getChallenges).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown feedbackSource', { feedbackSource: 'gpt' }],
    ['a missing feedbackSource', { feedbackSource: undefined }],
    ['a string score', { score: '89' }],
    ['a NaN score', { score: Number.NaN }],
  ])('treats %s as unavailable', (_, change) => {
    renderResult({ state: makeState({ evaluation: { ...evaluationAi, ...change } }) });
    expect(screen.getByText('This result is not available.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('ScoreBreakdown', () => {
  it('shows a zero hint penalty as "0" without the negative color', () => {
    render(
      <ScoreBreakdown
        score={94}
        breakdown={{ ...evaluationAi.breakdown, hintPenalty: 0, explanation: 24 }}
      />,
    );
    const row = screen.getByRole('row', { name: /Hint penalty/ });
    const cell = within(row).getAllByRole('cell')[0];
    expect(cell).toHaveTextContent(/^0$/);
    expect(cell).not.toHaveClass('text-hard');
  });

  it('shows a negative hint penalty in red', () => {
    render(<ScoreBreakdown score={89} breakdown={evaluationAi.breakdown} />);
    const row = screen.getByRole('row', { name: /Hint penalty/ });
    expect(within(row).getAllByRole('cell')[0]).toHaveClass('text-hard');
  });
});
