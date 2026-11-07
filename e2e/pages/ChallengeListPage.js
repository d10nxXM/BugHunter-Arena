import { expect } from '@playwright/test';

export class ChallengeListPage {
  constructor(page) {
    this.page = page;
  }

  async open() {
    await this.page.goto('/problems');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Problems' })).toBeVisible();
  }

  async openChallenge(title) {
    await this.page.getByRole('link', { name: title }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
}
