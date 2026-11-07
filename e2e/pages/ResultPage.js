import { expect } from '@playwright/test';

export class ResultPage {
  constructor(page) {
    this.page = page;
    this.breakdown = page.getByRole('table', { name: 'Points per part' });
  }

  async expectScore(total) {
    await expect(this.page.getByText(`Total: ${total} / 100`)).toBeVisible();
  }

  /** One breakdown row as a number. `label` is the row header text. */
  async row(label) {
    const row = this.breakdown.getByRole('row').filter({
      has: this.page.getByRole('rowheader', { name: label, exact: true }),
    });
    return Number((await row.getByRole('cell').first().innerText()).trim());
  }

  async breakdownValues() {
    return {
      lineIdentification: await this.row('Finding the bug line'),
      explanation: await this.row('Explanation'),
      edgeCase: await this.row('Edge case'),
      fix: await this.row('Code fix'),
      hintPenalty: await this.row('Hint penalty'),
    };
  }
}
