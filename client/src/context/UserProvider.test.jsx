import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createUser } from '../api/client.js';
import { useUser } from '../hooks/useUser.js';
import { USER_STORAGE_KEY } from './UserContext.js';
import UserProvider, { USER_CHANGED_MESSAGE } from './UserProvider.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createUser: vi.fn(),
}));

const stored = { userId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' };
const other = { userId: '0b7e1a2c-3d4e-4f50-9a6b-7c8d9e0f1a2b', displayName: 'ana' };

function Probe() {
  const { user, persisted, setUser, clearUser } = useUser();
  return (
    <>
      <p>{user ? `${user.displayName}:${user.userId}` : 'nema korisnika'}</p>
      <p>{persisted ? 'sačuvano' : 'nije sačuvano'}</p>
      <button type="button" onClick={() => setUser(other)}>
        postavi
      </button>
      <button type="button" onClick={clearUser}>
        obriši
      </button>
    </>
  );
}

function renderProbe() {
  return render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );
}

const wrapper = ({ children }) => <UserProvider>{children}</UserProvider>;

function blockStorage(...methods) {
  for (const method of methods) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error('blocked');
    });
  }
}

beforeEach(() => {
  localStorage.clear();
  createUser.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('UserProvider', () => {
  it('starts empty without a stored user', () => {
    renderProbe();
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    expect(screen.getByText('sačuvano')).toBeInTheDocument();
  });

  it('reads the stored user', () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(stored));
    renderProbe();
    expect(screen.getByText(`dion:${stored.userId}`)).toBeInTheDocument();
  });

  it('writes and clears the user', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'postavi' }));
    expect(screen.getByText(`ana:${other.userId}`)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual(other);
    await user.click(screen.getByRole('button', { name: 'obriši' }));
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['{not json'],
    ['"just a string"'],
    ['{"userId":1}'],
    ['{"userId":"u-2","displayName":"ana"}'],
  ])('drops an invalid value %s', (raw) => {
    localStorage.setItem(USER_STORAGE_KEY, raw);
    renderProbe();
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it('persisted is false and the user still works when storage throws', async () => {
    blockStorage('getItem', 'setItem', 'removeItem');
    const user = userEvent.setup();
    renderProbe();
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    expect(screen.getByText('nije sačuvano')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'postavi' }));
    expect(screen.getByText(`ana:${other.userId}`)).toBeInTheDocument();
    expect(screen.getByText('nije sačuvano')).toBeInTheDocument();
  });

  it('setUser returns whether the user was saved', () => {
    const { result } = renderHook(() => useUser(), { wrapper });
    let saved;
    act(() => {
      saved = result.current.setUser(other);
    });
    expect(saved).toBe(true);
    expect(result.current.persisted).toBe(true);

    blockStorage('setItem');
    act(() => {
      saved = result.current.setUser(stored);
    });
    expect(saved).toBe(false);
    expect(result.current.persisted).toBe(false);
    expect(result.current.user).toEqual(stored);
  });

  it('keeps function identities stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useUser(), { wrapper });
    const first = result.current;
    rerender();
    act(() => {
      result.current.setUser(other);
    });
    expect(result.current.setUser).toBe(first.setUser);
    expect(result.current.clearUser).toBe(first.clearUser);
    expect(result.current.ensureUser).toBe(first.ensureUser);
  });

  it('useUser outside the provider throws a clear error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useUser())).toThrow(/inside <UserProvider>/);
  });
});

describe('ensureUser', () => {
  it('returns the stored user without calling the API', async () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useUser(), { wrapper });
    await expect(result.current.ensureUser('neko')).resolves.toEqual(stored);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates, stores and returns a user when there is none', async () => {
    createUser.mockResolvedValue({ id: other.userId, displayName: 'ana' });
    const { result } = renderHook(() => useUser(), { wrapper });
    let created;
    await act(async () => {
      created = await result.current.ensureUser('ana');
    });
    // The shared request gets no caller signal, only the client's own timeout.
    expect(createUser).toHaveBeenCalledWith('ana');
    expect(created).toEqual(other);
    expect(result.current.user).toEqual(other);
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual(other);
  });

  it('two calls at once create one user', async () => {
    createUser.mockResolvedValue({ id: other.userId, displayName: 'ana' });
    const { result } = renderHook(() => useUser(), { wrapper });
    await act(async () => {
      await Promise.all([result.current.ensureUser('ana'), result.current.ensureUser('ana')]);
    });
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('a caller abort rejects only that caller; the other still gets the user', async () => {
    let finish;
    createUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    const controller = new AbortController();
    const first = result.current.ensureUser('ana', { signal: controller.signal });
    const second = result.current.ensureUser('ana');
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    await act(async () => {
      finish({ id: other.userId, displayName: 'ana' });
      await expect(second).resolves.toEqual(other);
    });
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(result.current.user).toEqual(other);
  });

  it('a later call still resolves from the request an aborted caller started', async () => {
    let finish;
    createUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    const controller = new AbortController();
    const aborted = result.current.ensureUser('ana', { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });

    const later = result.current.ensureUser('ana');
    await act(async () => {
      finish({ id: other.userId, displayName: 'ana' });
      await expect(later).resolves.toEqual(other);
    });
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('an already aborted signal rejects at once without a request', async () => {
    const { result } = renderHook(() => useUser(), { wrapper });
    const controller = new AbortController();
    controller.abort();
    await expect(
      result.current.ensureUser('ana', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('clearUser during an in-flight ensureUser leaves the user cleared', async () => {
    let finish;
    createUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    const pending = result.current.ensureUser('ana');
    act(() => {
      result.current.clearUser();
    });
    await act(async () => {
      finish({ id: other.userId, displayName: 'ana' });
      await expect(pending).rejects.toThrow(USER_CHANGED_MESSAGE);
    });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it('setUser during an in-flight ensureUser wins over the created user', async () => {
    let finish;
    createUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useUser(), { wrapper });
    const pending = result.current.ensureUser('ana');
    act(() => {
      result.current.setUser(stored);
    });
    await act(async () => {
      finish({ id: other.userId, displayName: 'ana' });
      await expect(pending).resolves.toEqual(stored);
    });
    expect(result.current.user).toEqual(stored);
  });

  it('propagates an ApiError and stores nothing', async () => {
    const error = new ApiError('Neispravan unos.', { status: 400, code: 'VALIDATION_ERROR' });
    createUser.mockRejectedValue(error);
    const { result } = renderHook(() => useUser(), { wrapper });
    await act(async () => {
      await expect(result.current.ensureUser('a')).rejects.toBe(error);
    });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });
});
