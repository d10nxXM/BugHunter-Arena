import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFindMaxRow } from '../../test/fixtures.js';

const mocks = vi.hoisted(() => ({
  getFullChallenge: vi.fn(),
  getWrittenHint: vi.fn(),
  aiGetHint: vi.fn(),
  config: { aiStatus: 'available', demoMode: false, logLevel: 'silent' },
}));
vi.mock('../lib/config.js', () => ({ config: mocks.config }));
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
  mocks.getWrittenHint.mockImplementation(async (_id, level) => ({
    level,
    hint: row.hints_json[level - 1],
    source: 'written',
  }));
});

describe('hintService.getHint', () => {
  it('returns the AI hint when available', async () => {
    mocks.aiGetHint.mockResolvedValue('AI hint.');
    const answer = { explanation: 'x' };
    await expect(getHint('find-max', 2, answer)).resolves.toEqual({
      level: 2,
      hint: 'AI hint.',
      source: 'ai',
    });
    expect(mocks.aiGetHint).toHaveBeenCalledWith(
      { challenge: row, currentAnswer: answer },
      2,
    );
    expect(mocks.getWrittenHint).not.toHaveBeenCalled();
  });

  it('uses the written hint when the AI fails', async () => {
    mocks.aiGetHint.mockRejectedValue(new Error('timeout'));
    await expect(getHint('find-max', 1)).resolves.toMatchObject({
      level: 1,
      hint: row.hints_json[0],
      source: 'written',
    });
  });

  it('uses the written hint when loading the full row fails', async () => {
    mocks.getFullChallenge.mockRejectedValue(new Error('db'));
    const result = await getHint('find-max', 3);
    expect(result.source).toBe('written');
    expect(mocks.aiGetHint).not.toHaveBeenCalled();
  });

  it('defers an unknown challenge to getWrittenHint (404)', async () => {
    mocks.getFullChallenge.mockResolvedValue(null);
    mocks.getWrittenHint.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(getHint('nope', 1)).rejects.toThrow('NOT_FOUND');
    expect(mocks.aiGetHint).not.toHaveBeenCalled();
  });

  it('with the AI unavailable skips the full row and the AI', async () => {
    mocks.config.aiStatus = 'unavailable';
    const result = await getHint('find-max', 1);
    expect(result.source).toBe('written');
    expect(mocks.getFullChallenge).not.toHaveBeenCalled();
    expect(mocks.aiGetHint).not.toHaveBeenCalled();
  });

  it('in demo mode returns the recorded hint without the AI or the full row', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    const result = await getHint('find-max', 2);
    expect(result).toEqual({
      level: 2,
      hint: row.hints_json[1],
      source: 'demo',
    });
    expect(mocks.aiGetHint).not.toHaveBeenCalled();
    expect(mocks.getFullChallenge).not.toHaveBeenCalled();
  });

  it('in demo mode uses the written hint for an unrecorded challenge', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    const result = await getHint('other', 1);
    expect(result.source).toBe('written');
  });

  describe('onAiCall', () => {
    it('is called once, right before the AI hint', async () => {
      mocks.aiGetHint.mockResolvedValue('AI hint.');
      const onAiCall = vi.fn();
      await getHint('find-max', 1, undefined, { onAiCall });
      expect(onAiCall).toHaveBeenCalledTimes(1);
      expect(onAiCall.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.aiGetHint.mock.invocationCallOrder[0],
      );
    });

    it('is still called when the AI hint rejects', async () => {
      mocks.aiGetHint.mockRejectedValue(new Error('timeout'));
      const onAiCall = vi.fn();
      const result = await getHint('find-max', 1, undefined, { onAiCall });
      expect(result.source).toBe('written');
      expect(onAiCall).toHaveBeenCalledTimes(1);
      expect(onAiCall.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.aiGetHint.mock.invocationCallOrder[0],
      );
    });

    it('is not called in demo mode', async () => {
      mocks.config.demoMode = true;
      mocks.config.aiStatus = 'demo';
      const onAiCall = vi.fn();
      await getHint('find-max', 1, undefined, { onAiCall });
      await getHint('other', 1, undefined, { onAiCall });
      expect(onAiCall).not.toHaveBeenCalled();
    });

    it('is not called when the AI is unavailable', async () => {
      mocks.config.aiStatus = 'unavailable';
      const onAiCall = vi.fn();
      await getHint('find-max', 1, undefined, { onAiCall });
      expect(onAiCall).not.toHaveBeenCalled();
    });

    it('is not called when loading the challenge rejects', async () => {
      mocks.getFullChallenge.mockRejectedValue(new Error('db'));
      const onAiCall = vi.fn();
      await getHint('find-max', 1, undefined, { onAiCall });
      expect(onAiCall).not.toHaveBeenCalled();
    });

    it('is not called for an unknown challenge (null row)', async () => {
      mocks.getFullChallenge.mockResolvedValue(null);
      const onAiCall = vi.fn();
      await getHint('find-max', 1, undefined, { onAiCall });
      expect(onAiCall).not.toHaveBeenCalled();
    });

    it('is optional', async () => {
      mocks.aiGetHint.mockResolvedValue('AI hint.');
      await expect(getHint('find-max', 1)).resolves.toMatchObject({
        source: 'ai',
      });
    });
  });
});
