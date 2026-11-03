import { z } from 'zod';

/** Clamp to 0-10 and round: scoring uses round(quality * 3). */
function clampQuality(value) {
  return Math.min(10, Math.max(0, Math.round(value)));
}

const nullableText = (max) => z.string().trim().min(1).max(max).nullable();

/**
 * The seven feedback fields the LLM must return (docs/API.md). Unknown keys
 * are dropped. An out-of-range quality is clamped, not rejected.
 * `is_correct` is always derived from the clamped quality (>= 7, as in
 * docs/SCORING.md), so the model's own value is accepted but ignored.
 */
export const EvaluationOutputSchema = z
  .object({
    is_correct: z.boolean().optional(),
    explanation_quality: z.number().finite().transform(clampQuality),
    detected_misconception: nullableText(300),
    needs_clarification: z.boolean(),
    hint: nullableText(300),
    feedback: z.string().trim().min(1).max(1200),
    practice_tip: nullableText(400),
  })
  .transform((value) => ({
    ...value,
    is_correct: value.explanation_quality >= 7,
  }));

/** The LLM answers a hint request with { "hint": "<one sentence>" }. */
export const HintOutputSchema = z.object({
  hint: z.string().trim().min(1).max(300),
});

/** One recorded entry of data/demo-responses.json. */
export const DemoEntrySchema = z.object({
  evaluation: EvaluationOutputSchema,
  hints: z.array(HintOutputSchema.shape.hint).length(3),
});

/** data/demo-responses.json: recorded answers keyed by challenge id. */
export const DemoResponsesSchema = z.record(z.string(), DemoEntrySchema);

/**
 * What evaluateExplanation returns from any source (ai, fallback or demo),
 * checked by attemptService before scoring; anything else becomes the keyword
 * fallback. Limits match EvaluationOutputSchema; feedback allows the longer
 * written fallback_feedback of a challenge.
 */
export const EvaluationResultSchema = z.object({
  source: z.enum(['ai', 'fallback', 'demo']),
  is_correct: z.boolean(),
  explanation_quality: z.number().finite().min(0).max(10),
  detected_misconception: z.string().max(300).nullable(),
  needs_clarification: z.boolean(),
  hint: z.string().max(300).nullable(),
  feedback: z.string().min(1).max(2000),
  practice_tip: z.string().max(400).nullable(),
});
