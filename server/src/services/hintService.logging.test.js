import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFindMaxRow } from '../../test/fixtures.js';

const mocks = vi.hoisted(() => ({
  getFullChallenge: vi.fn(),
  getWrittenHint: vi.fn(),
  aiGetHint: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  config: { aiStatus: 'available', demoMode: false },
}));
vi.mock('../lib/config.js', () => ({ config: mocks.config }));
vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));
vi.mock('../db/challenges.js', () => ({
  getFullChallenge: mocks.getFullChallenge,
}));
vi.mock('./challengeService.js', () => ({
  getWrittenHint: mocks.getWrittenHint,
}));
vi.mock('./aiService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getHint: mocks.aiGetHint,
}));

const { getHint } = await import('./hintService.js');
const row = loadFindMaxRow();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.aiStatus = 'available';
  mocks.config.demoMode = false;
  mocks.getFullChallenge.mockResolvedValue(row);
  mocks.getWrittenHint.mockResolvedValue({
    level: 1,
    hint: 'written',
    source: 'written',
  });
});

describe('hintService logging (S4, S5)', () => {
  it('a DB failure is logged as its own step at error level', async () => {
    mocks.getFullChallenge.mockRejectedValue(new Error('db down'));
    const result = await getHint('find-max', 1);
    expect(result.source).toBe('written');
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error.mock.calls[0][1]).toMatch(
      /loading the challenge/,
    );
    expect(mocks.aiGetHint).not.toHaveBeenCalled();
  });

  it('a provider 401 is logged at error with reason and status only', async () => {
    mocks.aiGetHint.mockRejectedValue(
      Object.assign(new Error('https://secret.example'), {
        kind: 'http',
        status: 401,
      }),
    );
    await getHint('find-max', 1);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    const [fields] = mocks.logger.error.mock.calls[0];
    expect(fields).toMatchObject({ reason: 'http', status: 401 });
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(
      'secret.example',
    );
  });

  it.each([
    [{ kind: 'timeout', status: null }],
    [{ kind: 'http', status: 429 }],
    [{ kind: 'http', status: 502 }],
  ])('%j is logged at warn', async (props) => {
    mocks.aiGetHint.mockRejectedValue(Object.assign(new Error('x'), props));
    await getHint('find-max', 1);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('demo mode without a recorded hint logs a warning and uses the written hint', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    const result = await getHint('unrecorded', 1);
    expect(result.source).toBe('written');
    expect(mocks.logger.warn).toHaveBeenCalled();
  });
});
