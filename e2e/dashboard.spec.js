import { test, expect } from './support/fixtures.js';
import { ChallengePage } from './pages/ChallengePage.js';

test.describe('journey 3 and 6: dashboard', () => {
  test('set a name, see the attempt in history and progress, remove the name with confirmation', async ({
    page,
  }) => {
    const name = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Moj napredak' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Tvoje ime' })).toBeVisible();

    // Name validation message first.
    await page.getByLabel('Ime za prikaz').fill('a');
    await page.getByRole('button', { name: 'Sačuvaj ime' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Ime mora imati najmanje 2 znaka.' })).toBeVisible();

    await page.getByLabel('Ime za prikaz').fill(name);
    await page.getByRole('button', { name: 'Sačuvaj ime' }).click();
    await expect(page.getByText(`Ime: ${name}`)).toBeVisible();
    await expect(page.getByText('Još nemaš nijedan pokušaj.')).toBeVisible();
    await expect(page.getByText('Još nema pokušaja.')).toBeVisible();

    // One attempt, no hints (demo score 94), then back to the dashboard.
    const challenge = new ChallengePage(page);
    await challenge.open();
    await challenge.solveFindMax({ hints: 0 });
    await expect(page.getByText('Ukupno: 94 / 100')).toBeVisible();
    await page.getByRole('navigation', { name: 'Sljedeći korak' }).getByRole('link', { name: 'Moj napredak' }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByText(`Ime: ${name}`)).toBeVisible();

    const summary = page.getByRole('region', { name: 'Pregled' });
    await expect(summary).toContainText(/Riješeni izazovi\s*1(?!\d)/);
    const perChallenge = page.getByRole('table', { name: 'Najbolji rezultat i broj pokušaja po izazovu' });
    await expect(perChallenge.getByRole('row', { name: /Najveći element liste.*94 \/ 100.*1/ })).toBeVisible();

    const history = page.getByRole('table', { name: 'Pokušaji, od najnovijeg' });
    const row = history.getByRole('row', { name: /Najveći element liste/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('94 / 100');
    await expect(row).toContainText('Pomoćna AI procjena (demo)');

    // Remove the name: confirmation first, cancel keeps it, confirm removes it.
    await page.getByRole('button', { name: 'Ukloni ime' }).click();
    await expect(
      page.getByText('Nakon uklanjanja imena nećeš moći vidjeti dosadašnji napredak.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Odustani' }).click();
    await expect(page.getByText(`Ime: ${name}`)).toBeVisible();

    await page.getByRole('button', { name: 'Ukloni ime' }).click();
    await page.getByRole('button', { name: 'Da, ukloni ime' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Tvoje ime' })).toBeVisible();
    await expect(page.getByText(`Ime: ${name}`)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Istorija pokušaja' })).toHaveCount(0);
  });
});
