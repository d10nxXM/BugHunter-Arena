import { test, expect, HINTS } from './support/fixtures.js';
import { ChallengePage } from './pages/ChallengePage.js';

test.describe('journey 2 (hints): one level per request', () => {
  test('three levels in order, penalties shown, a fourth is impossible', async ({ page, net }) => {
    const challenge = new ChallengePage(page);
    await challenge.open();

    await expect(page.getByRole('button', { name: /^Request hint 1 \(−5 points\)$/ })).toBeVisible();
    await challenge.requestHint(1);
    await expect(page.getByText(/^Hint 1 \(−5 points\)/)).toBeVisible();
    await expect(page.getByText(HINTS[0], { exact: true })).toBeVisible();
    // Level 2 and 3 are not on the page yet.
    await expect(page.getByText(HINTS[1], { exact: true })).toHaveCount(0);
    await expect(page.getByText(HINTS[2], { exact: true })).toHaveCount(0);

    await expect(page.getByRole('button', { name: /^Request hint 2 \(−5 points\)$/ })).toBeVisible();
    await challenge.requestHint(2);
    await expect(page.getByText(/^Hint 2 \(−5 points\)/)).toBeVisible();
    await expect(page.getByText(HINTS[2], { exact: true })).toHaveCount(0);

    await expect(
      page.getByRole('button', { name: /^Request hint 3 \(−10 points\)$/ }),
    ).toBeVisible();
    await challenge.requestHint(3);
    await expect(page.getByText(/^Hint 3 \(−10 points\)/)).toBeVisible();

    // No fourth request is possible.
    await expect(page.getByRole('button', { name: /^Request hint/ })).toHaveCount(0);
    await expect(page.getByText('You have used every hint.')).toBeVisible();

    const hintCalls = net.apiCalls.filter(
      (c) => c.method === 'POST' && c.path === '/api/challenges/find-max/hints',
    );
    expect(hintCalls.map((c) => JSON.parse(c.requestBody).level)).toEqual([1, 2, 3]);
    expect(hintCalls.map((c) => JSON.parse(c.body).level)).toEqual([1, 2, 3]);
    expect(hintCalls.every((c) => c.status === 200)).toBe(true);
  });
});
