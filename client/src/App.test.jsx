import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routes', () => {
  it.each([
    ['/', 'Izazovi'],
    ['/challenges/find-max', 'Izazov find-max'],
    ['/challenges/find-max/result', 'Rezultat'],
    ['/progress', 'Moj napredak'],
    ['/nema-ovoga', 'Stranica ne postoji'],
  ])('%s shows its h1', async (path, heading) => {
    renderAt(path);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(heading);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the challenge id from the URL', async () => {
    renderAt('/challenges/find-max');
    expect(await screen.findByText('find-max')).toBeInTheDocument();
  });

  it('unknown path links back to the challenges', async () => {
    renderAt('/a/b/c');
    const link = await screen.findByRole('link', { name: 'Nazad na izazove' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('has named navigation links and a main landmark', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    expect(within(nav).getByRole('link', { name: 'Izazovi' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Moj napredak' })).toHaveAttribute(
      'href',
      '/progress',
    );
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('navigating moves focus to the new h1', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Izazovi' });
    await user.click(screen.getByRole('link', { name: 'Moj napredak' }));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Moj napredak' });
    await expect.poll(() => document.activeElement).toBe(h1);
  });

  it('Tab reaches the header links in order', async () => {
    const user = userEvent.setup();
    renderAt('/progress');
    const h1 = await screen.findByRole('heading', { level: 1 });
    await expect.poll(() => document.activeElement).toBe(h1);
    // From the focused h1, Shift+Tab goes back into the header.
    await user.tab({ shift: true });
    expect(screen.getByRole('link', { name: 'Moj napredak' })).toHaveFocus();
    document.activeElement.blur();
    await user.tab();
    expect(screen.getByRole('link', { name: 'BugHunter Arena' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Izazovi' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Moj napredak' })).toHaveFocus();
  });
});
