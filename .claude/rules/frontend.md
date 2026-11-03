---
paths:
  - "client/**"
---

# Frontend rules

## Structure

- `src/pages/` - ChallengeList, ChallengePage, ResultView, Dashboard
- `src/components/` - CodeEditor, AnswerForm, HintPanel, TestResults, ScoreBreakdown
- `src/workers/testRunner.worker.js` - the only place user code runs
- `src/api/` - every call to the server goes through here; base URL from `import.meta.env.VITE_API_URL`

## Rules

- Function components and hooks only. Keep server state in the page, pass it down as props.
- Never call the LLM API or Supabase from the client. Only the Express API.
- Styling with Tailwind classes only. No inline style objects except for computed values.

## Running tests in the browser

- Load Pyodide from `public/pyodide/` (local copy), never a CDN, so the demo works offline.
- Start loading Pyodide when the app opens, not when the user clicks "Pokreni testove".
- Keep one long-lived worker with Pyodide loaded. If a run takes over 3 s, terminate that worker, report a `timeout` result and start a fresh one (see `useTestRunner` in the `react-patterns` skill).
- Compare results as JSON values: Python `None` equals JSON `null`, lists compare by value.
- Before submit, only visible tests run. After `POST /api/attempts` returns, run all tests on the fixed code, and run the student's edge case on both the original code and the reference solution. Send those results to `POST /api/attempts/:id/evaluation`.

## UI

- Code editor: dark theme, line numbers, clickable gutter to select bug lines, "Vrati original" button.
- Test status shows color and an icon, never color alone.
- Tests and AI evaluation show a loading state with a short message.
- AI feedback is labelled "Pomoćna AI procjena". When `feedbackSource` is `fallback`, label it "Procjena bez AI-ja".
- One primary action per screen. Text contrast at least 4.5:1. Everything reachable by keyboard.
- Challenge screen targets laptop and desktop. Challenge list and results also work on a phone.
