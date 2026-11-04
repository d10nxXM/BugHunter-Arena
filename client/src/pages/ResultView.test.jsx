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
  const table = screen.getByRole('table', { name: 'Bodovi po dijelovima' });
  return within(table).getByRole('row', { name: new RegExp(label) });
}

describe('ResultView', () => {
  it('shows the AI result with score 89, labels and the negative hint penalty', () => {
    renderResult({ state: makeState() });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1');
    expect(document.title).toBe('Rezultat · BugHunter Arena');
    expect(screen.getByText(/89 \/ 100/)).toBeInTheDocument();

    expect(breakdownRow('Pronalaženje linije s greškom')).toHaveTextContent('4040');
    expect(breakdownRow('Objašnjenje')).toHaveTextContent('2430');
    expect(breakdownRow('Granični slučaj')).toHaveTextContent('2020');
    expect(breakdownRow('Ispravka koda')).toHaveTextContent('1010');
    const penalty = breakdownRow('Kazna za nagovještaje');
    expect(within(penalty).getAllByRole('cell')[0]).toHaveTextContent('-5');
    expect(within(penalty).getAllByRole('cell')[1]).toHaveTextContent('do -20');
    expect(breakdownRow('Ukupno')).toHaveTextContent('89');

    expect(screen.getByText('Pomoćna AI procjena')).toBeInTheDocument();
    expect(screen.queryByText('Procjena bez AI-ja')).not.toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.feedback)).toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.detected_misconception)).toBeInTheDocument();
    expect(screen.getByText(evaluationAi.feedback.practice_tip)).toBeInTheDocument();
    expect(screen.getByText('Kvalitet objašnjenja: 8 / 10')).toBeInTheDocument();
    expect(screen.getByText('Prošlo 4 od 4 testova.')).toBeInTheDocument();
  });

  it('labels the fallback result "Procjena bez AI-ja" with score 74', () => {
    renderResult({ state: makeState({ evaluation: evaluationFallback }) });

    expect(screen.getByText(/74 \/ 100/)).toBeInTheDocument();
    expect(screen.getByText('Procjena bez AI-ja')).toBeInTheDocument();
    expect(screen.queryByText('Pomoćna AI procjena')).not.toBeInTheDocument();
    expect(breakdownRow('Objašnjenje')).toHaveTextContent('930');
    expect(screen.getByText('Objašnjenje nije potpuno tačno.')).toBeInTheDocument();
    expect(screen.getByText(evaluationFallback.feedback.feedback)).toBeInTheDocument();
    expect(screen.queryByText('Savjet za vježbu')).not.toBeInTheDocument();
  });

  it('labels demo feedback as a recorded AI answer', () => {
    renderResult({
      state: makeState({ evaluation: { ...evaluationAi, feedbackSource: 'demo' } }),
    });
    expect(screen.getByText('Pomoćna AI procjena (demo)')).toBeInTheDocument();
  });

  it('shows "Rezultat nije dostupan." with a link back when there is no state', () => {
    renderResult({ state: undefined });

    expect(screen.getByRole('heading', { level: 1, name: 'Rezultat' })).toBeInTheDocument();
    expect(screen.getByText('Rezultat nije dostupan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nazad na izazov' })).toHaveAttribute(
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

    expect(screen.getByText('Rezultat nije dostupan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nazad na izazov' })).toHaveAttribute(
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

    const table = screen.getByRole('table', { name: 'Rezultati testova' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('vidljivi');
    expect(rows[0]).toHaveTextContent('Prošao');
    expect(rows[1]).toHaveTextContent('Pao');
    expect(rows[2]).toHaveTextContent('skriveni');
    expect(rows[2]).toHaveTextContent('Prekinut (3 s)');
    expect(rows[2]).not.toHaveTextContent('Prošao');
    expect(rows[3]).toHaveTextContent('Pao');
    expect(rows[3]).toHaveTextContent('Greška: ZeroDivisionError: division by zero');
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
    const rows = within(screen.getByRole('table', { name: 'Rezultati testova' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Prekinut (3 s)');
    expect(rows[2]).toHaveTextContent('Nije pokrenut');
  });

  it('shows the reference solution read-only and the next-step links', () => {
    renderResult({ state: makeState() });

    expect(screen.getByRole('heading', { level: 2, name: 'Referentno rješenje' })).toBeVisible();
    const code = screen.getByText(attemptCreated.referenceSolution);
    expect(code.closest('pre')).not.toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Pokušaj ponovo' })).toHaveAttribute(
      'href',
      '/challenges/find-max',
    );
    expect(screen.getByRole('link', { name: 'Moj napredak' })).toHaveAttribute('href', '/progress');
  });

  it('omits the solution section when the state has no referenceSolution', () => {
    renderResult({ state: makeState({ referenceSolution: undefined }) });
    expect(screen.queryByText('Referentno rješenje')).not.toBeInTheDocument();
  });

  it('shows the challenge title and links the next challenge in list order', async () => {
    renderResult({ state: makeState() });

    expect(await screen.findByText('Izazov: Najveći element liste')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sljedeći izazov: Zbir liste' })).toHaveAttribute(
      'href',
      '/challenges/sum-list',
    );
    expect(screen.getByRole('link', { name: 'Svi izazovi' })).toHaveAttribute('href', '/');
  });

  it('offers only "Svi izazovi" for the last challenge', async () => {
    getChallenges.mockResolvedValue([...TWO_CHALLENGES].reverse());
    renderResult({ state: makeState() });

    expect(await screen.findByText('Izazov: Najveći element liste')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sljedeći izazov/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Svi izazovi' })).toBeInTheDocument();
  });

  it('falls back to the id and "Svi izazovi" when the list fails to load', async () => {
    getChallenges.mockRejectedValue(new ApiError('x', { code: 'NETWORK_ERROR' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderResult({ state: makeState() });

    await waitFor(() => expect(getChallenges).toHaveBeenCalled());
    expect(screen.getByText('find-max')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sljedeći izazov/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Svi izazovi' })).toBeInTheDocument();
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
    expect(screen.getByText('Rezultat nije dostupan.')).toBeInTheDocument();
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
    const row = screen.getByRole('row', { name: /Kazna za nagovještaje/ });
    const cell = within(row).getAllByRole('cell')[0];
    expect(cell).toHaveTextContent(/^0$/);
    expect(cell).not.toHaveClass('text-red-800');
  });

  it('shows a negative hint penalty in red', () => {
    render(<ScoreBreakdown score={89} breakdown={evaluationAi.breakdown} />);
    const row = screen.getByRole('row', { name: /Kazna za nagovještaje/ });
    expect(within(row).getAllByRole('cell')[0]).toHaveClass('text-red-800');
  });
});
