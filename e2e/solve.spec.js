import { test, expect } from './support/fixtures.js';
import { ChallengeListPage } from './pages/ChallengeListPage.js';
import { ChallengePage, FIND_MAX_TITLE } from './pages/ChallengePage.js';
import { ResultPage } from './pages/ResultPage.js';

test.describe('journey 1: solve find_max (DEMO_MODE=true)', () => {
  test('list, editor, visible tests, line, one hint, answer, result with breakdown', async ({
    page,
    net,
  }) => {
    const list = new ChallengeListPage(page);
    await list.open();
    await list.openChallenge(FIND_MAX_TITLE);
    await expect(page).toHaveURL(/\/challenges\/find-max$/);

    const challenge = new ChallengePage(page);
    await challenge.waitForRunner();
    await expect(challenge.editor).toBeAttached();

    // Pyodide comes only from our own /pyodide/ (the fixture also asserts this at teardown).
    expect(net.pyodideRequests.length).toBeGreaterThan(0);
    for (const url of net.pyodideRequests) expect(new URL(url).pathname).toMatch(/^\/pyodide\//);

    // The original code passes both visible tests (the bug shows only on hidden ones).
    await challenge.runVisibleTests();
    await expect(page.getByText('2 od 2 vidljivih testova je prošlo.')).toBeVisible();

    await challenge.solveFindMax({ hints: 1 });

    const result = new ResultPage(page);
    await result.expectScore(89);
    expect(await result.breakdownValues()).toEqual({
      lineIdentification: 40,
      explanation: 24,
      edgeCase: 20,
      fix: 10,
      hintPenalty: -5,
    });
    await expect(page.getByText('Prošlo 4 od 4 testova.')).toBeVisible();
    await expect(page.getByText('Pomoćna AI procjena (demo)')).toBeVisible();

    // Locked now: the reference solution is allowed to appear, but only after POST /api/attempts.
    const attemptIndex = net.apiCalls.findIndex(
      (c) => c.method === 'POST' && c.path === '/api/attempts',
    );
    expect(attemptIndex).toBeGreaterThan(-1);
    expect(net.apiCalls[attemptIndex].body).toContain('referenceSolution');
  });

  test('without hints the score is 94', async ({ page }) => {
    const challenge = new ChallengePage(page);
    await challenge.open();
    await challenge.solveFindMax({ hints: 0 });
    const result = new ResultPage(page);
    await result.expectScore(94);
    expect((await result.breakdownValues()).hintPenalty).toBe(0);
    await expect(page.getByText('Prošlo 4 od 4 testova.')).toBeVisible();
  });
});

test.describe('journey 5: validation', () => {
  test('explanation under 20 characters cannot be submitted', async ({ page, net }) => {
    const challenge = new ChallengePage(page);
    await challenge.open();
    await challenge.selectLine(2);
    await challenge.fillAnswer({ explanation: 'prekratko', args: '[-8, -3, -10]', expected: '-3' });
    await challenge.submit();

    await expect(page.getByText('Objašnjenje mora imati najmanje 20 karaktera.')).toBeVisible();
    await expect(challenge.explanation).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/challenges\/find-max$/);
    expect(net.apiCalls.some((c) => c.method === 'POST' && c.path === '/api/attempts')).toBe(false);
  });
});
