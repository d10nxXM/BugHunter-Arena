import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  getChallengeHints: vi.fn(),
  getPublicChallenge: vi.fn(),
  listPublicChallenges: vi.fn(),
}));
vi.mock('../db/challenges.js', () => m);

const { getWrittenHint, getPublic, listPublic } =
  await import('./challengeService.js');

beforeEach(() => vi.resetAllMocks());

describe('getWrittenHint', () => {
  it.each([1, 2, 3])('returns level %i hint, source written', async (level) => {
    m.getChallengeHints.mockResolvedValue({ id: 'x', hints: ['a', 'b', 'c'] });
    expect(await getWrittenHint('x', level)).toEqual({
      level,
      hint: ['a', 'b', 'c'][level - 1],
      source: 'written',
    });
  });

  it('throws 404 NOT_FOUND for an unknown challenge', async () => {
    m.getChallengeHints.mockResolvedValue(null);
    await expect(getWrittenHint('x', 1)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Challenge not found.',
    });
  });

  it('throws a plain error when the hint is missing or empty', async () => {
    m.getChallengeHints.mockResolvedValue({ id: 'x', hints: ['a', ''] });
    await expect(getWrittenHint('x', 2)).rejects.toThrow(/no written hint/);
    await expect(getWrittenHint('x', 3)).rejects.toThrow(/no written hint/);
  });
});

describe('getPublic / listPublic', () => {
  it('getPublic throws 404 when missing, else returns the challenge', async () => {
    m.getPublicChallenge.mockResolvedValueOnce(null);
    await expect(getPublic('x')).rejects.toMatchObject({ status: 404 });
    m.getPublicChallenge.mockResolvedValueOnce({ id: 'x' });
    expect(await getPublic('x')).toEqual({ id: 'x' });
  });

  it('listPublic passes the list through', async () => {
    m.listPublicChallenges.mockResolvedValue([{ id: 'x' }]);
    expect(await listPublic()).toEqual([{ id: 'x' }]);
  });
});
