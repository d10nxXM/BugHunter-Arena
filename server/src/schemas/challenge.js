import { z } from 'zod';

// Mirrors the check constraints on the challenges table.
export const LanguageSchema = z.enum(['python', 'javascript']);
export const DifficultySchema = z.enum(['lako', 'srednje', 'teško']);

const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const ChallengeIdSchema = z.string().regex(ID_PATTERN);
const text = z.string().min(1);

// ---- Public responses. Strict: an extra field is a bug and fails loudly. ----

/** Item of GET /api/challenges. */
export const ChallengeSummarySchema = z.strictObject({
  id: ChallengeIdSchema,
  title: text,
  language: LanguageSchema,
  difficulty: DifficultySchema,
  bugCategory: text,
});

export const ChallengeListSchema = z.array(ChallengeSummarySchema);

/** A visible test as sent before the attempt is locked. */
export const VisibleTestSchema = z.strictObject({
  id: text,
  args: z.array(z.json()),
  expected: z.json(),
});

/** GET /api/challenges/:id. */
export const ChallengePublicSchema = z.strictObject({
  id: ChallengeIdSchema,
  title: text,
  description: text,
  language: LanguageSchema,
  difficulty: DifficultySchema,
  bugCategory: text,
  functionName: text,
  code: text,
  visibleTests: z.array(VisibleTestSchema),
  hintCount: z.int().nonnegative(),
});

// ---- Request params ----

export const ChallengeIdParamsSchema = z.object({
  id: ChallengeIdSchema,
});

// ---- Challenge file in data/challenges/*.json (used by the seed) ----

const lineNumber = z.int().positive();

const ChallengeTestSchema = z.strictObject({
  id: text,
  args: z.array(z.json()),
  expected: z.json(),
  visible: z.boolean(),
  failsOnOriginal: z.boolean().optional(),
});

const TestsSchema = z.array(ChallengeTestSchema).superRefine((tests, ctx) => {
  const visible = tests.filter((t) => t.visible).length;
  const hidden = tests.length - visible;
  if (visible < 2) {
    ctx.addIssue({ code: 'custom', message: 'needs at least 2 visible tests' });
  }
  if (hidden < 1) {
    ctx.addIssue({ code: 'custom', message: 'needs at least 1 hidden test' });
  }
  const ids = tests.map((t) => t.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'test ids must be unique' });
  }
});

// Same cap as `feedback` in EvaluationResultSchema (schemas/aiOutput.js), so
// the keyword fallback built from this text always passes it.
export const FALLBACK_FEEDBACK_MAX = 2000;

export const ChallengeFileSchema = z.strictObject({
  id: ChallengeIdSchema,
  title: text,
  description: text,
  language: LanguageSchema,
  function_name: text,
  difficulty: DifficultySchema,
  code: text,
  bug_lines: z.array(lineNumber).min(1),
  related_lines: z.array(lineNumber),
  bug_category: text,
  bug_description: text,
  reference_solution: text,
  tests_json: TestsSchema,
  hints_json: z.array(text).length(3),
  keywords_json: z.array(z.array(text).min(1)).length(3),
  fallback_feedback: text.max(FALLBACK_FEEDBACK_MAX),
});
