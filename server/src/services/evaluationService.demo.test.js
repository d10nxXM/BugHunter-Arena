import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  files: {},
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  config: { aiStatus: 'demo', demoMode: true, aiTimeoutMs: 15000 },
}));
vi.mock('../lib/config.js', () => ({ config: mocks.config }));
vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync: (path, ...rest) =>
      String(path).endsWith('demo-responses.json')
        ? mocks.files.demo()
        : actual.readFileSync(path, ...rest),
  };
});

const entry = {
  evaluation: {
    explanation_quality: 8,
    detected_misconception: null,
    needs_clarification: false,
    hint: null,
    feedback: 'Dobro.',
    practice_tip: null,
  },
  hints: ['a', 'b', 'c'],
};

async function freshModule() {
  vi.resetModules();
  return import('./evaluationService.js');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDemoEntry', () => {
  it('S1: ids like "constructor" and "__proto__" are not entries', async () => {
    mocks.files.demo = () => JSON.stringify({ 'find-max': entry });
    const { getDemoEntry } = await freshModule();
    expect(getDemoEntry('find-max')).not.toBeNull();
    for (const id of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(getDemoEntry(id)).toBeNull();
    }
    expect(getDemoEntry(undefined)).toBeNull();
  });

  it('S1: evaluateExplanation falls back for "constructor"', async () => {
    mocks.files.demo = () => JSON.stringify({ 'find-max': entry });
    const { evaluateExplanation } = await freshModule();
    const result = await evaluateExplanation({
      challenge: { id: 'constructor' },
      answer: { explanation: 'x' },
    });
    expect(result.source).toBe('fallback');
  });

  it('S6: an invalid entry is dropped, valid ones stay, only paths are logged', async () => {
    mocks.files.demo = () =>
      JSON.stringify({
        good: entry,
        bad: {
          ...entry,
          hints: ['only one', 'SECRET-VALUE'],
        },
      });
    const { getDemoEntry } = await freshModule();
    expect(getDemoEntry('good')).not.toBeNull();
    expect(getDemoEntry('bad')).toBeNull();
    const logged = JSON.stringify(mocks.logger.error.mock.calls);
    expect(logged).toContain('hints');
    expect(logged).not.toContain('SECRET-VALUE');
  });

  it('S6: an unreadable file logs the error code and yields no entries', async () => {
    mocks.files.demo = () => {
      throw Object.assign(new Error('C:\\secret\\path'), { code: 'ENOENT' });
    };
    const { getDemoEntry } = await freshModule();
    expect(getDemoEntry('find-max')).toBeNull();
    const logged = JSON.stringify(mocks.logger.error.mock.calls);
    expect(logged).toContain('ENOENT');
    expect(logged).not.toContain('secret');
  });

  it('S6: invalid JSON yields no entries', async () => {
    mocks.files.demo = () => '{ nope';
    const { getDemoEntry } = await freshModule();
    expect(getDemoEntry('find-max')).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
