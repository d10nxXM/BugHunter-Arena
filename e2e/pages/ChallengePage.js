import { expect } from '@playwright/test';

export const FIND_MAX_TITLE = 'Largest number in a list';

export const FIXED_FIND_MAX = `def find_max(numbers):
    if not numbers:
        return None
    max_value = numbers[0]
    for number in numbers[1:]:
        if number > max_value:
            max_value = number
    return max_value`;

export const INFINITE_LOOP = `def find_max(numbers):
    while True:
        pass`;

// Matches all three keyword groups of the fallback evaluation (cause, condition, fix).
export const GOOD_EXPLANATION =
  'The initialization max_value = 0 is wrong: when every number is negative, the function returns 0, which is not in the list. It should start from the first element, numbers[0].';

export class ChallengePage {
  constructor(page) {
    this.page = page;
    this.runButton = page.getByRole('button', { name: 'Run visible tests' });
    this.submitButton = page.getByRole('button', { name: 'Submit answer' });
    this.editor = page.getByRole('textbox', { name: 'Code editor' });
    this.explanation = page.getByLabel('Explain the bug');
    this.edgeArgs = page.getByLabel(/^Arguments for/);
    this.edgeExpected = page.getByLabel('Expected result');
  }

  async open(id = 'find-max') {
    await this.page.goto(`/challenges/${id}`);
    await this.waitForRunner();
  }

  /** The run button stays disabled until Pyodide has loaded in the worker. */
  async waitForRunner() {
    await expect(this.runButton).toBeEnabled({ timeout: 45_000 });
    await expect(this.page.getByText('Loading the test runner')).toHaveCount(0);
  }

  line(n) {
    return this.page.getByRole('button', { name: `Line ${n}`, exact: true });
  }

  async selectLine(n) {
    await this.line(n).click();
    await expect(this.line(n)).toHaveAttribute('aria-pressed', 'true');
  }

  /** Replaces the whole editor content with exactly `code` (drops Monaco's auto-indent). */
  async replaceCode(code) {
    await this.editor.focus();
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.press('Delete');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (i > 0) {
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.press('Shift+Home');
        await this.page.keyboard.press('Delete');
      }
      await this.page.keyboard.insertText(lines[i]);
    }
  }

  async fillAnswer({ explanation, args, expected }) {
    await this.explanation.fill(explanation);
    await this.edgeArgs.fill(args);
    await this.edgeExpected.fill(expected);
  }

  async runVisibleTests() {
    await this.runButton.click();
  }

  async requestHint(level) {
    await this.page.getByRole('button', { name: new RegExp(`^Request hint ${level} `) }).click();
    await expect(this.page.getByText(new RegExp(`^Hint ${level} \\(`))).toBeVisible();
  }

  async submit() {
    await this.submitButton.click();
  }

  /** The whole find_max solution: line, hints, answer, fix, submit. Ends on the result page. */
  async solveFindMax({ hints = 0 } = {}) {
    await this.selectLine(2);
    for (let level = 1; level <= hints; level += 1) await this.requestHint(level);
    await this.fillAnswer({ explanation: GOOD_EXPLANATION, args: '[-8, -3, -10]', expected: '-3' });
    await this.replaceCode(FIXED_FIND_MAX);
    await this.submit();
    await expect(this.page).toHaveURL(/\/challenges\/find-max\/result$/, { timeout: 60_000 });
  }
}
