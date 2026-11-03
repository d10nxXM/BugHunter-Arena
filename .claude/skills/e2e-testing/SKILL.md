---
name: e2e-testing
description: Playwright end-to-end tests for BugHunter Arena - config that starts client and server, page objects, locators, testing the real Pyodide worker, network checks for leaks, and flaky-test handling. Use when writing or fixing tests in e2e/.
---

# E2E testing with Playwright

## Setup (repo root)

```bash
npm init -y
npm i -D @playwright/test
npx playwright install chromium firefox
```

```js
// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,            // Pyodide's first load is slow
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    { command: 'npm run dev', cwd: 'server', port: 3000, env: { DEMO_MODE: 'true' }, reuseExistingServer: true },
    { command: 'npm run dev', cwd: 'client', port: 5173, reuseExistingServer: true },
  ],
});
```

`DEMO_MODE=true` makes AI feedback deterministic so scores can be asserted exactly.

## Layout

```
e2e/
├── pages/
│   ├── ChallengeListPage.js
│   ├── ChallengePage.js
│   └── ResultPage.js
├── solve.spec.js
├── hints.spec.js
├── fallback.spec.js
└── security.spec.js
```

## Page object

```js
// e2e/pages/ChallengePage.js
import { expect } from '@playwright/test';

export class ChallengePage {
  constructor(page) { this.page = page; }

  async open(id) {
    await this.page.goto(`/challenges/${id}`);
    await expect(this.page.getByRole('button', { name: /pokreni testove/i })).toBeEnabled({ timeout: 30_000 }); // Pyodide ready
  }
  async selectLine(n) { await this.page.getByRole('button', { name: `Linija ${n}` }).click(); }
  async explain(text) { await this.page.getByLabel(/objašnjenje/i).fill(text); }
  async edgeCase(input, expected) {
    await this.page.getByLabel(/ulaz/i).fill(input);
    await this.page.getByLabel(/očekivani rezultat/i).fill(expected);
  }
  async fixCode(code) {
    const editor = this.page.getByRole('textbox', { name: /editor koda/i });
    await editor.click();
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.insertText(code);
  }
  async submit() { await this.page.getByRole('button', { name: /predaj odgovor/i }).click(); }
}
```

## A journey

```js
import { test, expect } from '@playwright/test';
import { ChallengePage } from './pages/ChallengePage.js';

test('student solves find_max without hints', async ({ page }) => {
  const challenge = new ChallengePage(page);
  await challenge.open('find-max');
  await challenge.selectLine(2);
  await challenge.explain('max_value počinje od 0, pa za samo negativne brojeve funkcija vraća 0 koja nije u listi.');
  await challenge.edgeCase('[-8, -3, -10]', '-3');
  await challenge.fixCode(FIXED_FIND_MAX);
  await challenge.submit();

  await expect(page.getByTestId('total-score')).toHaveText('94');
  await expect(page.getByText(/4 od 4 testa/i)).toBeVisible();
});
```

## Security check: nothing leaks before submit

```js
test('no hidden data reaches the browser before submit', async ({ page }) => {
  const bodies = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/') && res.request().method() === 'GET') bodies.push(await res.text());
  });
  await new ChallengePage(page).open('find-max');
  const all = bodies.join('\n');
  for (const secret of ['reference_solution', 'referenceSolution', 'bug_lines', 'keywords_json', 'fallback_feedback', '"t3"', '"t4"']) {
    expect(all).not.toContain(secret);
  }
});
```

## Rules

- Locators: `getByRole`, `getByLabel`, then `getByTestId`. No CSS chains or XPath.
- Wait for conditions with `expect(...)`, never `page.waitForTimeout`.
- Independent tests: each creates what it needs.
- Every new test passes `npx playwright test --repeat-each=5` before it counts as done.

## Flaky tests

Common causes here: Pyodide still loading (wait for the run button to be enabled), dev server cold start (`webServer` handles it), animation on the result screen (assert on final text, not on transitions). Quarantine with `test.fixme(true, 'reason')` and report it; never just delete it.
