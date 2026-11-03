import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { HIDDEN_KEYS, loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null, complete: vi.fn() }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
vi.mock('../services/llmClient.js', () => ({ complete: state.complete }));

const { app } = await import('../app.js');
const { config } = await import('../lib/config.js');

const row = loadFindMaxRow();
const original = { ...config };

const post = (body) =>
  request(app).post('/api/challenges/find-max/hints').send(body);

beforeEach(() => {
  state.complete.mockReset();
  state.db = createFakeSupabase({ tables: { challenges: [row] } }).db;
  Object.assign(config, {
    aiStatus: 'available',
    llmApiKey: 'k',
    llmApiUrl: 'https://llm.example.test/v1',
    llmModel: 'm',
  });
});
afterEach(() => {
  Object.assign(config, original);
});

describe('POST /api/challenges/:id/hints with the AI', () => {
  it('returns the AI hint with source "ai" and nothing hidden', async () => {
    state.complete.mockResolvedValue(
      '{"hint":"Šta ako su svi brojevi u listi negativni?"}',
    );
    const res = await post({
      level: 2,
      currentAnswer: { selectedLines: [2], explanation: 'moje objašnjenje' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      level: 2,
      hint: 'Šta ako su svi brojevi u listi negativni?',
      source: 'ai',
    });
    for (const key of HIDDEN_KEYS) expect(res.body).not.toHaveProperty(key);
    expect(res.text).not.toContain('numbers[0]');
    const sent = JSON.stringify(state.complete.mock.calls[0][0]);
    expect(sent).toContain('moje objašnjenje');
    expect(sent).not.toContain('numbers[0]');
  });

  it('falls back to the written hint when the provider fails', async () => {
    state.complete.mockRejectedValue(
      Object.assign(new Error('timeout'), { kind: 'timeout' }),
    );
    const res = await post({ level: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      level: 1,
      hint: row.hints_json[0],
      source: 'written',
    });
  });

  it('uses the written hint when the AI hint reveals the solution', async () => {
    state.complete.mockResolvedValue(
      '{"hint":"Postavi max_value = numbers[0] na početku."}',
    );
    const res = await post({ level: 3 });
    expect(res.body.source).toBe('written');
    expect(res.body.hint).toBe(row.hints_json[2]);
    expect(res.text).not.toContain('numbers[0]');
  });

  it('never calls the provider when the AI is unavailable', async () => {
    config.aiStatus = 'unavailable';
    const res = await post({ level: 1 });
    expect(res.body.source).toBe('written');
    expect(state.complete).not.toHaveBeenCalled();
  });

  it('in demo mode returns the recorded hint without the provider', async () => {
    config.aiStatus = 'demo';
    config.demoMode = true;
    try {
      const res = await post({ level: 1 });
      expect(res.status).toBe(200);
      expect(res.body.hint).toBe(row.hints_json[0]);
      expect(res.body.source).toBe('demo');
      expect(state.complete).not.toHaveBeenCalled();
    } finally {
      config.demoMode = false;
    }
  });

  it('returns 404 for an unknown challenge', async () => {
    const res = await request(app)
      .post('/api/challenges/nope/hints')
      .send({ level: 1 });
    expect(res.status).toBe(404);
    expect(state.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['explanation over 1000 chars', { explanation: 'a'.repeat(1001) }],
    ['explanation not a string', { explanation: 5 }],
    ['selectedLines not an array', { selectedLines: 2 }],
    ['too many selectedLines', { selectedLines: Array(11).fill(1) }],
    ['non-positive line', { selectedLines: [0] }],
    ['currentAnswer not an object', 'text'],
  ])('rejects currentAnswer with %s', async (_name, currentAnswer) => {
    const res = await post({ level: 1, currentAnswer });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(state.complete).not.toHaveBeenCalled();
  });
});

describe('routes/hints.js tripwire', () => {
  it('references only hintService, never getFullChallenge', () => {
    const source = readFileSync(new URL('./hints.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/getFullChallenge/);
    expect(source).not.toMatch(/db\/challenges/);
    expect(source).toMatch(/hintService/);
  });
});
