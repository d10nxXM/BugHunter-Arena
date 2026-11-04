import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAttempts } from '../api/client.js';
import { findAttemptById } from './attemptRecovery.js';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAttempts: vi.fn(),
}));

const base = { userId: 'u', challengeId: 'c', attemptId: 'wanted' };

/** A request that never answers and rejects with an AbortError when its signal aborts. */
function hang(_query, options) {
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    );
  });
}

beforeEach(() => {
  getAttempts.mockReset();
});

describe('findAttemptById', () => {
  it('returns the item with the matching id', async () => {
    getAttempts.mockResolvedValueOnce([{ id: 'a' }, { id: 'wanted', status: 'evaluated' }]);
    const item = await findAttemptById({ ...base, signal: new AbortController().signal });
    expect(item).toEqual({ id: 'wanted', status: 'evaluated' });
  });

  it('aborts the pending request when the total deadline passes', async () => {
    getAttempts.mockImplementation(hang);
    const parent = new AbortController();
    await expect(
      findAttemptById({ ...base, signal: parent.signal, deadlineMs: 20 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(parent.signal.aborted).toBe(false);
  });

  it('rejects when the caller aborts', async () => {
    getAttempts.mockImplementation(hang);
    const parent = new AbortController();
    const pending = findAttemptById({ ...base, signal: parent.signal });
    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
