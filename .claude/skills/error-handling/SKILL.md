---
name: error-handling
description: Error handling for BugHunter Arena - AppError and the error middleware, wrapping causes, timeouts and the AI fallback chain, retries, client-side error states and English user messages. Use when writing try/catch, fallbacks, retries, error responses or error UI.
---

# Error handling

## Principles

1. **Fail loudly inside, gracefully outside.** Log the real cause with context; show the student a short, useful message.
2. **A fallback must be visible.** If the AI failed and keywords were used, the response says `feedbackSource: "fallback"` and the UI says so.
3. **Never swallow.** No empty `catch`, no `.catch(() => null)` without a log and a signal to the caller.
4. **Keep the cause.** `throw new Error('evaluation failed', { cause: err })`.

## Server: typed errors

```js
// server/src/lib/AppError.js
export class AppError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.status = status;   // HTTP status
    this.code = code;       // code from docs/API.md
  }
}

// usage
if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Attempt not found.');
if (attempt.status === 'evaluated') throw new AppError(409, 'ALREADY_EVALUATED', 'Attempt already evaluated.');
```

Routes call `next(err)`; the error middleware (in `express-patterns`) turns `AppError` into the documented shape and anything else into `500 INTERNAL_ERROR`.

## The AI fallback chain

Expected failures of the AI are not errors for the student. They follow a fixed chain:

```js
// server/src/services/evaluationService.js
export async function evaluateExplanation(context) {
  if (config.demoMode) return { source: 'demo', ...demoResponseFor(context.challengeId) };

  try {
    const feedback = await aiService.evaluateAnswer(context); // timeout + Zod + one retry inside
    return { source: 'ai', ...feedback };
  } catch (err) {
    log.warn({ err, attemptId: context.attemptId, reason: err.name }, 'AI evaluation failed, using fallback');
    return { source: 'fallback', ...fallbackService.evaluate(context) };
  }
}
```

- Timeouts use `AbortController` with `AI_TIMEOUT_MS`.
- Retry only on invalid JSON, once. Do not retry timeouts or 4xx responses.
- Log the fallback at `warn` (expected), unexpected bugs at `error`.

## Retries elsewhere

Supabase calls are not retried automatically: a failure is reported as `500` and logged. If retries are added later, use exponential backoff (e.g. 200 ms, 400 ms, 800 ms with jitter), at most 3 attempts, only for network errors and 5xx, never for validation errors.

## Client: every async view has three states

```jsx
if (state.status === 'loading') return <Spinner label="Loading the challenge…" />;
if (state.status === 'error') return <ErrorMessage message={state.error.message} onRetry={reload} />;
return <ChallengeView challenge={state.data} />;
```

- Clear stale data when entering the error state.
- Network failure (no response) gets its own message: "The server is not reachable. Check your connection and try again."
- Validation errors (`VALIDATION_ERROR`) are shown next to the field, not as a page error.
- An error boundary at the route level catches render crashes and shows a "Something went wrong." screen with a reload button.

## Test-runner errors

- A Python exception in student code is a **test result**, not an app error: `{ passed: false, actual: null, error: "ZeroDivisionError: division by zero" }`. Show it in the test table.
- A timeout is `error: "timeout"` and the UI says the code probably has an infinite loop.
- A Pyodide load failure is an app error: show a clear message and a retry button.

## User-facing messages

| Situation | Message (English) |
| --- | --- |
| Too short explanation | Explanation must be at least 20 characters. |
| Rate limited | Too many requests. Wait a moment and try again. |
| Server error | Something went wrong. Please try again. |
| AI fallback | Assessed without AI: the explanation was scored by key terms. |
| Test timeout | The test stopped after 3 seconds. Check whether the code has an infinite loop. |

Messages say what happened and what to do, never expose stack traces, codes or internal names.

## Checklist

- [ ] No empty or value-swallowing catch
- [ ] Every outbound call has a timeout
- [ ] Fallbacks set `feedbackSource` / `source` and are logged at `warn`
- [ ] Errors keep their `cause`
- [ ] Every async UI has loading, error and success states
- [ ] Messages are English and actionable
