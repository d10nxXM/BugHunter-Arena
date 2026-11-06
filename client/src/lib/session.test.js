import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_STORAGE_KEY,
  clearSession,
  isValidSession,
  readSession,
  subscribeSession,
  writeSession,
} from './session.js';

const user = {
  id: '0b8f4f8e-2c1a-4d3b-9e5f-7a6b5c4d3e2f',
  handle: 'null_pointer',
  displayName: 'null_pointer',
  memberSince: '2026-03-14T09:30:00.000Z',
};
const session = { accessToken: 'a', refreshToken: 'r', expiresAt: 1793961600, user };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('session storage', () => {
  it('uses the bha.session key and round-trips a session', () => {
    expect(SESSION_STORAGE_KEY).toBe('bha.session');
    expect(writeSession(session)).toEqual(session);
    expect(JSON.parse(localStorage.getItem('bha.session'))).toEqual(session);
    expect(readSession()).toEqual(session);
  });

  it('drops unknown fields and fills displayName from the handle', () => {
    const stored = writeSession({
      ...session,
      extra: 1,
      user: { id: user.id, handle: 'dion', email: 'x@example.com' },
    });
    expect(stored).toEqual({
      ...session,
      user: { id: user.id, handle: 'dion', displayName: 'dion', memberSince: null },
    });
    expect(localStorage.getItem('bha.session')).not.toContain('email');
  });

  it.each([
    ['no tokens', { ...session, accessToken: '' }],
    ['expiresAt as a string', { ...session, expiresAt: '1793961600' }],
    ['user id not a uuid', { ...session, user: { ...user, id: '42' } }],
    ['no user', { ...session, user: null }],
  ])('rejects %s', (_name, value) => {
    expect(isValidSession(value)).toBe(false);
    expect(writeSession(value)).toBeNull();
    expect(localStorage.getItem('bha.session')).toBeNull();
  });

  it('removes corrupt or invalid stored data', () => {
    localStorage.setItem('bha.session', '{not json');
    expect(readSession()).toBeNull();
    expect(localStorage.getItem('bha.session')).toBeNull();
    localStorage.setItem('bha.session', JSON.stringify({ accessToken: 'a' }));
    expect(readSession()).toBeNull();
    expect(localStorage.getItem('bha.session')).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSession()).toBeNull();
    expect(writeSession(session)).toEqual(session);
    expect(() => clearSession()).not.toThrow();
  });

  it('notifies listeners on write and clear, until unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    writeSession(session, 'login');
    clearSession('expired');
    unsubscribe();
    clearSession();
    expect(listener.mock.calls).toEqual([
      [session, 'login'],
      [null, 'expired'],
    ]);
  });

  it('notifies listeners when another tab changes bha.session', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'bha.user' }));
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(listener.mock.calls).toEqual([
      [session, 'storage'],
      [null, 'storage'],
    ]);
  });
});
