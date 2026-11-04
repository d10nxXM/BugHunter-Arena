import { expect } from '@playwright/test';

export class ResultPage {
  constructor(page) {
    this.page = page;
    this.breakdown = page.getByRole('table', { name: 'Bodovi po dijelovima' });
  }

  async expectScore(total) {
    await expect(this.page.getByText(`Ukupno: ${total} / 100`)).toBeVisible();
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
      lineIdentification: await this.row('Pronalaženje linije s greškom'),
      explanation: await this.row('Objašnjenje'),
      edgeCase: await this.row('Granični slučaj'),
      fix: await this.row('Ispravka koda'),
      hintPenalty: await this.row('Kazna za nagovještaje'),
    };
  }
}
