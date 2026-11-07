import { test, expect } from './support/fixtures.js';
import { ChallengePage, FIND_MAX_TITLE } from './pages/ChallengePage.js';

test.describe('journey 3 and 6: dashboard', () => {
  test('set a name, see the attempt in history and progress, remove the name with confirmation', async ({
    page,
  }) => {
    const name = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    // The old /progress URL still lands on the dashboard.
    await page.goto('/progress');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Your dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Your name' })).toBeVisible();

    // Name validation message first.
    await page.getByLabel('Display name').fill('a');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The name needs at least 2 characters.' }),
    ).toBeVisible();

    await page.getByLabel('Display name').fill(name);
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Welcome back, ${name}` }),
    ).toBeVisible();
    await expect(page.getByText(`Name: ${name}`)).toBeVisible();
    await expect(page.getByText('You have no attempts yet.')).toBeVisible();
    await expect(page.getByText('No attempts yet.', { exact: true })).toBeVisible();

    // One attempt, no hints (demo score 94), then back to the dashboard.
    const challenge = new ChallengePage(page);
    await challenge.open();
    await challenge.solveFindMax({ hints: 0 });
    await expect(page.getByText('Total: 94 / 100')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Next step' })
      .getByRole('link', { name: 'My dashboard' })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Name: ${name}`)).toBeVisible();

    const summary = page.getByRole('region', { name: 'Overview' });
    // The tile is <dt>Bugs found</dt><dd>1</dd><dd>1 easy · …</dd> with no whitespace between.
    await expect(summary).toContainText(/Bugs found\s*1\s*1 easy · 0 medium · 0 hard/);
    await expect(summary).toContainText(/Total XP\s*94(?!\d)/);

    const history = page.getByRole('table', { name: 'Attempts, newest first' });
    const row = history.getByRole('row', { name: new RegExp(FIND_MAX_TITLE) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('94 / 100');
    await expect(row).toContainText('AI-assisted assessment (demo)');

    // Remove the name: confirmation first, cancel keeps it, confirm removes it.
    await page.getByRole('button', { name: 'Remove name' }).click();
    await expect(
      page.getByText('After removing the name you will no longer see your progress so far.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(`Name: ${name}`)).toBeVisible();

    await page.getByRole('button', { name: 'Remove name' }).click();
    await page.getByRole('button', { name: 'Yes, remove the name' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Your name' })).toBeVisible();
    await expect(page.getByText(`Name: ${name}`)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Attempt history' })).toHaveCount(0);
  });
});
