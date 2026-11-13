import { describe, expect, it } from 'vitest';
import { difficultyClass, difficultyLabel, languageLabel, normalizeDifficulty } from './labels.js';

describe('difficulty labels', () => {
  it.each([
    ['easy', 'easy', 'Easy', 'text-easy'],
    ['medium', 'medium', 'Medium', 'text-medium'],
    ['hard', 'hard', 'Hard', 'text-hard'],
    ['HARD', 'hard', 'Hard', 'text-hard'],
  ])('%s', (value, key, label, cls) => {
    expect(normalizeDifficulty(value)).toBe(key);
    expect(difficultyLabel(value)).toBe(label);
    expect(difficultyClass(value)).toBe(cls);
  });

  it('unknown values stay readable and neutral', () => {
    expect(normalizeDifficulty('extreme')).toBeNull();
    expect(difficultyLabel('extreme')).toBe('extreme');
    expect(difficultyClass('extreme')).toBe('text-muted');
    expect(difficultyLabel(undefined)).toBe('Unknown');
    expect(difficultyLabel('')).toBe('Unknown');
    expect(normalizeDifficulty(3)).toBeNull();
  });
});

describe('languageLabel', () => {
  it.each([
    ['python', 'Python'],
    ['javascript', 'JavaScript'],
    ['Python', 'Python'],
    ['go', 'go'],
    ['', 'Unknown'],
    [null, 'Unknown'],
  ])('%j -> %s', (value, label) => {
    expect(languageLabel(value)).toBe(label);
  });
});
