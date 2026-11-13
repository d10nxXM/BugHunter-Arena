---
name: react-testing
description: Component and hook tests for BugHunter Arena's client with Vitest, React Testing Library and user-event - query priority, async UI, mocking src/api, and what belongs in Playwright instead. Use when writing or fixing tests under client/.
---

# React testing

## Setup (client/)

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm pkg set 'scripts.test=vitest run'
```

```js
// client/vite.config.js (excerpt; the real file also has server, preview, worker and optimizeDeps)
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ...server, preview, worker and optimizeDeps: see client/vite.config.js...
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    globals: false,
  },
});
```

```js
// client/src/test/setup.js
import '@testing-library/jest-dom/vitest';
```

## Core principle

Test what the student sees and does, not component internals. If a refactor keeps the UI the same, tests should still pass.

## Query priority

1. `getByRole('button', { name: 'Submit answer' })`
2. `getByLabelText(/explain the bug/i)`
3. `getByText(...)` for non-interactive text
4. `getByTestId` only when nothing above works

`getBy*` throws when missing, `queryBy*` returns null (use for "is not shown"), `findBy*` waits (use for async).

## Interaction

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

test('submit is disabled until the explanation is long enough', async () => {
  const user = userEvent.setup();
  render(<AnswerForm onSubmit={vi.fn()} />);

  const submit = screen.getByRole('button', { name: 'Submit answer' });
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText(/explain the bug/i), 'max_value starts at zero so negative numbers do not work');
  expect(submit).toBeEnabled();
});
```

Use `userEvent`, not `fireEvent`, for anything a user does.

## Mocking the server

Mock `src/api/` at the module boundary. Mock data must match `docs/API.md` exactly (see `api-contract`).

```jsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ApiError, getChallenge } from '../api/client.js';

// Keeps the real ApiError and replaces only the server call.
vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenge: vi.fn().mockResolvedValue(findMaxPublic), // fixture from docs/API.md example
}));

test('shows an error when the challenge fails to load', async () => {
  getChallenge.mockRejectedValueOnce(new ApiError('Challenge not found.', { status: 404, code: 'NOT_FOUND' }));
  render(<ChallengePage id="missing" />);
  expect(await screen.findByText(/challenge not found/i)).toBeInTheDocument();
});
```

Mock the worker hook (`useTestRunner`) in component tests; the real worker and Pyodide are covered by Playwright.

## What to test here

| Component | Cases |
| --- | --- |
| CodeEditor gutter | Clicking a line number selects and deselects it; keyboard selection works |
| AnswerForm | Length validation, edge-case input, submit disabled while sending |
| HintPanel | Shows penalty, levels in order, no fourth hint |
| ResultView | Score breakdown, test table with icon and text status, "Procjena bez AI-ja" label for fallback |
| Error and loading states | Every async component shows both |

## Unit test vs Playwright

Component tests: one component's behavior with mocked data. Playwright (`e2e-testing`): the real worker, Pyodide, the server, and the full flow across pages. Don't try to run Pyodide in jsdom.

## Anti-patterns

- Snapshot tests of whole pages: they break on every style change and prove nothing.
- Asserting on state variables or class names instead of what's visible.
- `waitFor` around something that should use `findBy*`.
- Mocks whose shape differs from the real API.
