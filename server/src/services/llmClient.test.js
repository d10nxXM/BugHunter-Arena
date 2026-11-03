import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cfg = vi.hoisted(() => ({
  config: {
    aiStatus: 'available',
    llmApiKey: 'SECRET-KEY',
    llmApiUrl: 'https://llm.example.test/v1/chat/completions',
    llmModel: 'test-model',
  },
}));
vi.mock('../lib/config.js', () => cfg);

const { complete, LlmError } = await import('./llmClient.js');

const args = {
  system: 'sys',
  user: 'usr',
  temperature: 0.1,
  maxTokens: 400,
  timeoutMs: 1000,
};

function okResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

beforeEach(() => {
  cfg.config.aiStatus = 'available';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('llmClient.complete', () => {
  it('posts an OpenAI-compatible request and returns the message content', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse('{"a":1}'));
    await expect(complete(args)).resolves.toBe('{"a":1}');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(cfg.config.llmApiUrl);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer SECRET-KEY');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });
  });

  it.each(['unavailable', 'demo'])(
    'never calls fetch when aiStatus is %s',
    async (status) => {
      cfg.config.aiStatus = status;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await expect(complete(args)).rejects.toMatchObject({
        kind: 'unavailable',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('aborts on timeout and reports kind timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const promise = complete({ ...args, timeoutMs: 500 });
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });

  it('reports http errors without the key or URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 });
    const err = await complete(args).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe('http');
    expect(err.message).not.toContain('SECRET-KEY');
    expect(err.message).not.toContain('llm.example.test');
  });

  it('reports network errors without leaking the host', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed', {
        cause: { code: 'ECONNREFUSED', message: 'llm.example.test' },
      }),
    );
    const err = await complete(args).catch((e) => e);
    expect(err.kind).toBe('network');
    expect(err.message).toContain('ECONNREFUSED');
    expect(err.message).not.toContain('llm.example.test');
  });

  it.each([
    ['no choices', {}],
    ['null content', { choices: [{ message: { content: null } }] }],
    ['blank content', { choices: [{ message: { content: '  ' } }] }],
  ])('reports kind empty for %s', async (_name, payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    await expect(complete(args)).rejects.toMatchObject({ kind: 'empty' });
  });
});
