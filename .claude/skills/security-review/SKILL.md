---
name: security-review
description: Security checklist and patterns for BugHunter Arena - secrets, user-code isolation, grading integrity, input validation, prompt injection, XSS, rate limiting, Supabase RLS and dependencies. Use when adding an endpoint, touching aiService or prompts, the worker, CORS, logging, or before a release.
---

# Security review

This app has no login and no payments, so its risks are different from a typical web app. The four that matter most: **running untrusted code, leaking the answer before submit, leaking API keys, and prompt injection through the student's explanation.**

## 1. Secrets

```js
// Right: server only, validated at startup (see express-patterns config)
const apiKey = config.llmApiKey;

// Wrong: anywhere in client/, or a VITE_ variable (it ends up in the public bundle)
const leakedKey = import.meta.env.VITE_LLM_KEY;
```

- [ ] Secrets only in `server/.env`, which is gitignored
- [ ] `server/.env.example` has names with empty values
- [ ] `grep -rn "sk-" client/ dist/` finds nothing
- [ ] If a key was ever committed: rotate it, then remove it from history

## 2. Untrusted code stays in the browser worker

- [ ] No `eval`, `new Function`, `vm`, `child_process` on user input in `server/`
- [ ] Code runs only in `testRunner.worker.js`, never on the main thread
- [ ] Each run is timed; on timeout the worker is terminated and replaced
- [ ] The worker posts back only results, never touches the DOM or `fetch`es

## 3. Grading integrity

- [ ] Public challenge responses contain no `reference_solution`, `bug_lines`, `related_lines`, `bug_description`, `hints_json`, `keywords_json`, `fallback_feedback` or hidden tests (response schema is `.strict()`)
- [ ] Hints are returned one level at a time, in order
- [ ] Scores are computed on the server; the client never sends a score
- [ ] An attempt can be evaluated once (`409` after)

Known, accepted limit: test results, duration and hint counts come from the browser. Don't use the score for exams without server-side isolated execution.

## 4. Input validation

```js
export const SubmitAttemptSchema = z.object({
  challengeId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  userId: z.string().uuid().nullable(),
  selectedLines: z.array(z.number().int().positive()).min(1).max(10),
  explanation: z.string().trim().min(20).max(1000),
  edgeCase: z.object({ args: z.array(z.unknown()).max(10), expected: z.unknown() }),
  fixedCode: z.string().max(5000),
  hintsUsed: z.number().int().min(0).max(3),
  durationSec: z.number().int().min(0).max(86_400),
}).strict();
```

- [ ] Every body, query and param validated before use
- [ ] `express.json({ limit: '50kb' })`
- [ ] Database access through the query builder, never string-built SQL

## 5. Prompt injection

The explanation is attacker-controlled text that goes to the LLM.

```js
const userMessage = [
  '<challenge>', challengeContext, '</challenge>',
  '<student_answer>', escapeTags(answerText), '</student_answer>',
  '<test_results>', testSummary, '</test_results>',
].join('\n');
// escapeTags replaces "<" and ">" so the student cannot close the tag early
```

- [ ] Student text only inside `<student_answer>`, never in the system prompt
- [ ] System prompt says to treat that block as data and ignore instructions in it
- [ ] Output validated with Zod; `explanation_quality` clamped to 0-10
- [ ] AI weight capped at 30 points
- [ ] Evaluation set includes an injection attempt that must score 0-2 (see `ai-regression-testing`)
- [ ] Hints checked so they don't contain lines from `reference_solution`

## 6. XSS

- [ ] AI feedback, explanations and hints rendered as text, never `dangerouslySetInnerHTML`
- [ ] Code shown in the editor component, not injected as HTML

## 7. Abuse limits

- [ ] `express-rate-limit`: 100 requests per 10 min per IP; 20 AI calls per 10 min
- [ ] A spend limit is set on the LLM provider account
- [ ] CORS limited to `ALLOWED_ORIGIN`

## 8. Database

- [ ] RLS enabled on every table, no public policies
- [ ] Service key used only in `server/src/db/`

## 9. Logs and errors

- [ ] No stack traces or internal messages in responses
- [ ] Logs never include explanation text, fixed code or secrets
- [ ] Logs do include route, status, duration, attempt id

## 10. Dependencies

```bash
npm audit --audit-level=high   # client/ and server/
npm ci                         # reproducible installs from the lockfile
```

- [ ] Lockfiles committed
- [ ] No high or critical audit findings left unexplained
- [ ] New dependencies justified and maintained

## Before a release or demo

Run the `security-reviewer` agent, then `npm audit` in both folders, then the e2e leak test in `e2e/security.spec.js`.
