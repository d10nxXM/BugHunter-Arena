import { test, expect } from './support/fixtures.js';
import { ChallengePage } from './pages/ChallengePage.js';
import { ResultPage } from './pages/ResultPage.js';

// Runs against the "fallback" project: the server has DEMO_MODE=false and an LLM URL that
// refuses connections, so every AI call fails and the non-AI fallback must finish the flow.
test.describe('journey 3 (AI unavailable): fallback', () => {
  test('hint and evaluation complete without the LLM and say so', async ({ page, net }) => {
    const challenge = new ChallengePage(page);
    await challenge.open();
    await challenge.solveFindMax({ hints: 1 });

    const result = new ResultPage(page);
    await expect(page.getByText('Assessed without AI', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The AI mentor is not available right now. Your explanation was scored by its key terms.'),
    ).toBeVisible();

    // Keyword fallback: all three groups match -> quality 10 -> 30 points. 40 + 30 + 20 + 10 - 5.
    expect(await result.breakdownValues()).toEqual({
      lineIdentification: 40,
      explanation: 30,
      edgeCase: 20,
      fix: 10,
      hintPenalty: -5,
    });
    await result.expectScore(95);
    await expect(page.getByText('4 of 4 tests passed.')).toBeVisible();

    const hint = net.apiCalls.find((c) => c.path === '/api/challenges/find-max/hints');
    expect(JSON.parse(hint.body).source).toBe('written');
    const evaluation = net.apiCalls.find((c) => c.path.endsWith('/evaluation'));
    expect(evaluation.status).toBe(200);
    expect(JSON.parse(evaluation.body).feedbackSource).toBe('fallback');
  });
});
