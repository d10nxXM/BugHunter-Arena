import { describe, it, expect } from 'vitest';
import {
  evaluateWithKeywords,
  DEFAULT_FALLBACK_FEEDBACK,
} from './fallbackService.js';
import { loadFindMaxRow } from '../../test/fixtures.js';

const challenge = loadFindMaxRow();
const run = (explanation, ch = challenge) =>
  evaluateWithKeywords({ challenge: ch, answer: { explanation } });

describe('evaluateWithKeywords (docs/SCORING.md)', () => {
  it.each([
    ['nothing relevant', 0, false],
    ['ne radi za negativne brojeve', 3, false],
    ['početna vrijednost, negativni', 7, true],
    ['početna vrijednost, negativni, prazna lista', 10, true],
  ])('%s -> %i', (text, quality, correct) => {
    const result = run(text);
    expect(result.explanation_quality).toBe(quality);
    expect(result.is_correct).toBe(correct);
  });

  it('returns the documented fixed values and the challenge feedback', () => {
    expect(run('x')).toEqual({
      is_correct: false,
      explanation_quality: 0,
      detected_misconception: null,
      needs_clarification: false,
      hint: null,
      feedback: challenge.fallback_feedback,
      practice_tip: null,
    });
  });

  it('uses the generic text when fallback_feedback is blank', () => {
    expect(run('x', { ...challenge, fallback_feedback: '  ' }).feedback).toBe(
      DEFAULT_FALLBACK_FEEDBACK,
    );
  });

  it('ignores blank stems', () => {
    expect(
      run('abc', { keywords_json: [[''], ['  ']] }).explanation_quality,
    ).toBe(0);
  });

  it('does not throw on missing input', () => {
    expect(evaluateWithKeywords().explanation_quality).toBe(0);
  });
});
