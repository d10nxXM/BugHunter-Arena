import { test, expect } from './support/fixtures.js';
import { ChallengePage, INFINITE_LOOP } from './pages/ChallengePage.js';

test.describe('journey 4: infinite loop', () => {
  test('while True is interrupted after about 3 s, the page stays responsive, a normal run works after', async ({
    page,
  }) => {
    const challenge = new ChallengePage(page);
    await challenge.open();

    await challenge.replaceCode(INFINITE_LOOP);
    // The editor really holds the loop (visible text in Monaco's view lines).
    await expect(page.getByText('while True:').first()).toBeVisible();

    const started = Date.now();
    await challenge.runVisibleTests();
    await expect(page.getByText('Running tests…')).toBeVisible();

    // The worker is busy, the page is not: the line gutter still reacts while the loop runs.
    await challenge.selectLine(1);

    await expect(
      page.getByText('The tests were stopped after 3 s. The code is probably stuck in an endless loop.'),
    ).toBeVisible({ timeout: 15_000 });
    const elapsed = Date.now() - started;
    expect(elapsed, 'interrupted no earlier than the 3 s limit').toBeGreaterThanOrEqual(2_500);
    expect(elapsed, 'interrupted within a sane time after the limit').toBeLessThan(12_000);

    await expect(page.getByText('Timed out (3 s)')).toHaveCount(2);
    await expect(page.getByText('0 of 2 visible tests passed.')).toBeVisible();

    // A normal run after the interruption works (the worker is restarted).
    await page.getByRole('button', { name: 'Reset to original' }).click();
    await challenge.waitForRunner();
    await challenge.runVisibleTests();
    await expect(page.getByText('2 of 2 visible tests passed.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Timed out (3 s)')).toHaveCount(0);
  });
});
