import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePageTitle } from './usePageTitle.js';

describe('usePageTitle', () => {
  it('sets and updates the document title', () => {
    const { rerender, unmount } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Problems' },
    });
    expect(document.title).toBe('Problems · BugHunter Arena');
    rerender({ title: 'Result' });
    expect(document.title).toBe('Result · BugHunter Arena');
    unmount();
    expect(document.title).toBe('BugHunter Arena');
  });

  it('uses the app name alone without a title', () => {
    renderHook(() => usePageTitle(''));
    expect(document.title).toBe('BugHunter Arena');
  });
});
