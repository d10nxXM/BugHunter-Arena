---
name: frontend-a11y
description: Accessibility for BugHunter Arena's React UI - labelled forms, keyboard-selectable code lines, live regions for test and AI results, focus management, status without color alone, contrast. Use when building or reviewing forms, the code editor gutter, results, dialogs or any interactive component.
---

# Frontend accessibility

Target: WCAG 2.2 AA. Text contrast at least 4.5:1, everything usable by keyboard, nothing communicated by color alone (NFR-12).

## Forms: explanation and edge case

```jsx
<form onSubmit={handleSubmit} noValidate>
  <label htmlFor="explanation">Explain the bug</label>
  <textarea
    id="explanation"
    value={explanation}
    onChange={(e) => setExplanation(e.target.value)}
    aria-describedby="explanation-help explanation-error"
    aria-invalid={Boolean(errors.explanation)}
    required
  />
  <p id="explanation-help">What is wrong, why it happens and what it causes (20–1000 characters).</p>
  {errors.explanation && <p id="explanation-error" role="alert">{errors.explanation}</p>}
</form>
```

- Every input has a visible `<label>`. Placeholders are not labels.
- Help and error text connected with `aria-describedby`; invalid fields have `aria-invalid`.
- On a failed submit, move focus to the first invalid field.

## Selecting code lines

The gutter is the core interaction, so it must work without a mouse.

```jsx
<button
  type="button"
  className="line-number"
  aria-pressed={selected.includes(n)}
  aria-label={`Line ${n}`}
  onClick={() => toggleLine(n)}
>
  {n}
</button>
```

- Each line number is a real `button` with `aria-pressed`.
- Visible focus ring (`focus-visible:ring-2`); never `outline: none` without a replacement.
- Selected lines are marked with a background **and** an icon or border, not color only.
- The editor itself must not trap keyboard focus: document the key to leave it (Monaco: Ctrl+M toggles Tab trapping, or Esc then Tab).

## Async results

```jsx
<div aria-live="polite" aria-busy={running}>
  {running ? 'Running tests…' : `${passed} of ${total} tests passed.`}
</div>
```

- Test runs, AI evaluation and hint loading announce their state with a polite live region.
- Errors that block the user use `role="alert"`.

## Test status

| Status | Visual | Text |
| --- | --- | --- |
| Passed | green + check icon | "Passed" |
| Failed | red + cross icon | "Failed" |
| Timeout | amber + clock icon | "Timed out (3 s)" |

Icons get `aria-hidden="true"` when the text already says the same; otherwise an `aria-label`.

## Focus management

- After "Submit answer", move focus to the result heading (`<h2 tabIndex={-1} ref={headingRef}>`).
- Dialogs (e.g. confirm reset to original code) trap focus while open, close on Esc, and return focus to the button that opened them.
- Route changes move focus to the new page's `<h1>`.

## Semantic structure

- One `<h1>` per page, headings in order without skipping levels.
- `<main>`, `<nav>`, `<header>` landmarks.
- Tables of test results use `<table>`, `<th scope="col">`.
- Links navigate, buttons act. No clickable `div`.

## Motion

Respect `prefers-reduced-motion` for score animations (Tailwind `motion-reduce:` variants).

## Checks

- `npm i -D eslint-plugin-jsx-a11y` and enable its recommended rules in `client/eslint.config.js`.
- Tab through the whole solve flow without a mouse before calling a UI change done.
- Optional in component tests: `vitest-axe` for automated checks on key components.

## Checklist

- [ ] All inputs labelled; errors announced and linked
- [ ] Code lines selectable by keyboard with visible focus
- [ ] Status never by color alone
- [ ] Live regions for tests, AI and hints
- [ ] Focus moved to results after submit
- [ ] Contrast 4.5:1 in both editor and page themes
