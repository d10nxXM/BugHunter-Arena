import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Button from './Button.jsx';
import { buttonClass } from './buttonClass.js';
import DifficultyBadge from './DifficultyBadge.jsx';
import { progressPercent } from './progress.js';
import ProgressBar from './ProgressBar.jsx';
import StatusIcon from './StatusIcon.jsx';
import { STATUSES } from './statuses.jsx';

describe('Button', () => {
  it('is a type="button" by default', () => {
    render(<Button>Run tests</Button>);
    expect(screen.getByRole('button', { name: 'Run tests' })).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit type', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('renders a router link with `to`', () => {
    render(
      <MemoryRouter>
        <Button to="/problems">Start hunting</Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Start hunting' })).toHaveAttribute(
      'href',
      '/problems',
    );
  });

  it('renders an anchor with `href`', () => {
    render(<Button href="#main">Skip</Button>);
    expect(screen.getByRole('link', { name: 'Skip' })).toHaveAttribute('href', '#main');
  });

  it('uses the variant classes', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('bg-accent');
    expect(buttonClass({ variant: 'secondary' })).toContain('border-border-strong');
    expect(buttonClass({ variant: 'nope' })).toContain('bg-accent');
  });
});

describe('DifficultyBadge', () => {
  it.each([
    ['easy', 'Easy', 'text-easy'],
    ['medium', 'Medium', 'text-medium'],
    ['hard', 'Hard', 'text-hard'],
  ])('%s shows text and color', (difficulty, text, cls) => {
    render(<DifficultyBadge difficulty={difficulty} />);
    expect(screen.getByText(text)).toHaveClass(cls);
  });
});

describe('ProgressBar', () => {
  it.each([
    [58, 140, 41],
    [0, 10, 0],
    [15, 10, 100],
    [-3, 10, 0],
    [5, 0, 0],
    [undefined, 10, 0],
  ])('progressPercent(%j, %j) = %i', (value, max, percent) => {
    expect(progressPercent(value, max)).toBe(percent);
  });

  it('exposes name, value and a computed width', () => {
    render(<ProgressBar value={58} max={140} label="Easy" valueText="58 of 140 solved" />);
    const bar = screen.getByRole('progressbar', { name: 'Easy' });
    expect(bar).toHaveAttribute('aria-valuenow', '41');
    expect(bar).toHaveAttribute('aria-valuetext', '58 of 140 solved');
    expect(bar.firstChild).toHaveStyle({ width: '41%' });
  });
});

describe('StatusIcon', () => {
  it.each(Object.entries(STATUSES))('%s has text, not only color', (status, { label }) => {
    const { container } = render(<StatusIcon status={status} />);
    expect(screen.getByText(label)).toHaveClass('sr-only');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the label when asked and accepts a custom one', () => {
    render(<StatusIcon status="timeout" label="Timed out after 3 s" showLabel />);
    expect(screen.getByText('Timed out after 3 s')).not.toHaveClass('sr-only');
  });

  it('falls back to pending for an unknown status', () => {
    render(<StatusIcon status="weird" />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });
});
