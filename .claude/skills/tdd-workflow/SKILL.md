---
name: tdd-workflow
description: Test-first workflow for BugHunter Arena with Vitest - red, green, refactor, mocking Supabase and the LLM, supertest for routes, and coverage targets. Use when implementing a server service or route, fixing a bug, or refactoring logic that has tests.
---

# TDD workflow

## Setup (server/)

```bash
npm i -D vitest @vitest/coverage-v8 supertest
npm pkg set 'scripts.test=vitest run' 'scripts.test:watch=vitest' 'scripts.coverage=vitest run --coverage'
```

Tests live next to the code: `src/services/scoringService.test.js`, `src/routes/attempts.test.js`. Export `app` from a module separate from `listen` (`src/app.js` vs `src/index.js`) so supertest can import it.

## The cycle

1. **Write the journey.** "As a student who marks only a related line, I get 20 points for identification."
2. **Write the failing test.**
3. **Run it and watch it fail** for the expected reason.
4. **Implement the smallest change** that passes.
5. **Run all tests.** Green.
6. **Refactor** with tests green.
7. **Check coverage** for the touched files.

For a bug: write the test that reproduces it first. It must fail before the fix and pass after.

## Unit test: pure service

```js
// src/services/scoringService.test.js
import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoringService.js';
import findMax from '../../data/challenges/find-max.json';

const base = {
  challenge: findMax,
  attempt: { selectedLines: [2], edgeCase: { args: [[-8, -3, -10]], expected: -3 }, fixedCode: 'def find_max(numbers): ...', hintsUsed: 1 },
  explanationQuality: 8,
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null },
  testResults: [
    { id: 't1', passed: true }, { id: 't2', passed: true },
    { id: 't3', passed: true }, { id: 't4', passed: true },
  ],
};

describe('calculateScore', () => {
  it('matches the worked example in docs/SCORING.md (89)', () => {
    expect(calculateScore(base).total).toBe(89);
  });

  it('gives 20 for a related line only', () => {
    const r = calculateScore({ ...base, attempt: { ...base.attempt, selectedLines: [4] } });
    expect(r.breakdown.lineIdentification).toBe(20);
  });

  it('gives 0 for an edge case that does not expose the bug', () => {
    const r = calculateScore({ ...base, edgeCaseCheck: { originalOutput: 5, referenceOutput: 5, error: null } });
    expect(r.breakdown.edgeCase).toBe(0);
  });

  it('never goes below 0', () => {
    const r = calculateScore({ ...base, attempt: { ...base.attempt, selectedLines: [6], hintsUsed: 3 }, explanationQuality: 0, testResults: [] });
    expect(r.total).toBe(0);
  });
});
```

## Mocking external services

Mock at the module boundary, never the real network.

```js
import { vi } from 'vitest';

vi.mock('../db/attempts.js', () => ({
  insertAttempt: vi.fn().mockResolvedValue({ id: 'a1' }),
  getAttempt: vi.fn(),
  markEvaluated: vi.fn(),
}));

vi.mock('../services/llmClient.js', () => ({
  complete: vi.fn(),
}));

// LLM timeout -> fallback
complete.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
// invalid JSON then valid -> one retry
complete.mockResolvedValueOnce('not json').mockResolvedValueOnce(JSON.stringify(validFeedback));
```

## Route test with supertest

```js
import request from 'supertest';
import { app } from '../app.js';

it('returns 409 when evaluating twice', async () => {
  getAttempt.mockResolvedValue({ id: 'a1', status: 'evaluated' });
  const res = await request(app).post('/api/attempts/a1/evaluation').send(validEvaluationBody);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('ALREADY_EVALUATED');
});
```

## Coverage targets

| Area | Target |
| --- | --- |
| `scoringService`, `fallbackService`, schemas | 90%+ lines and branches |
| Other services and routes | 80%+ |
| React components | Behavior coverage of the cases in `react-testing`, no percentage chase |

## Mistakes to avoid

- Testing private helpers instead of the public function.
- One test asserting ten unrelated things.
- Tests that pass with the implementation deleted (assert too little).
- Shared mutable fixtures; reset mocks with `vi.clearAllMocks()` in `beforeEach`.
- Real LLM calls in tests: slow, flaky and cost money.

## Evidence

When you finish, report: tests added (names), the failing run before the change, the passing run after, and coverage for the touched files.
