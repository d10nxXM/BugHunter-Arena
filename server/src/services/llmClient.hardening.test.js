import { describe, it, expect, vi, afterEach } from 'vitest';

const cfg = vi.hoisted(() => ({
  config: {
    aiStatus: 'available',
    llmApiKey: 'SECRET-KEY',
    llmApiUrl: 'https://llm.example.test/v1/chat/completions',
    llmModel: 'test-model',
  },
}));
vi.mock('../lib/config.js', () => cfg);

const { complete } = await import('./llmClient.js');

const args = { system: 's', user: 'u', temperature: 0, maxTokens: 10 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('llmClient (S4)', () => {
  it('puts the HTTP status on the error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });
    const err = await complete({ ...args, timeoutMs: 1000 }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'http', status: 401 });
  });

  it('non-HTTP errors have a null status', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('x'));
    const err = await complete({ ...args, timeoutMs: 1000 }).catch((e) => e);
    expect(err.status).toBeNull();
  });

  it('a non-JSON 200 body is kind invalid_body, not network', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in <html>');
      },
    });
    const err = await complete({ ...args, timeoutMs: 1000 }).catch((e) => e);
    expect(err.kind).toBe('invalid_body');
    expect(err.message).not.toContain('<html>');
  });

  it.each([0, -5, NaN, undefined])(
    'clamps timeoutMs %s to at least 1 ms',
    async (timeoutMs) => {
      vi.useFakeTimers();
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const assertion = expect(
        complete({ ...args, timeoutMs }),
      ).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(2);
      await assertion;
    },
  );
});
