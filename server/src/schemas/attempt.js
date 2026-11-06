import { z } from 'zod';

// Request schemas for attempts, evaluation, progress and users (docs/API.md).
// Unknown keys are stripped.

const ChallengeIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const IdSchema = z.guid();

/** POST /api/attempts. */
export const CreateAttemptSchema = z.object({
  challengeId: ChallengeIdSchema,
  userId: IdSchema.nullable().default(null),
  // Duplicates are removed, so [2, 2, 2, 2] is one line.
  selectedLines: z
    .array(z.int().positive())
    .min(1)
    .max(10)
    .transform((lines) => [...new Set(lines)]),
  explanation: z
    .string()
    .trim()
    .min(20, { message: 'Explanation must be at least 20 characters.' })
    .max(1000),
  edgeCase: z.object({
    args: z.array(z.json()),
    expected: z.json(),
  }),
  fixedCode: z.string().max(5000),
  hintsUsed: z.int().min(0).max(3),
  durationSec: z.number().finite().min(0),
});

const TestResultSchema = z.object({
  id: z.string().min(1).max(64),
  passed: z.boolean(),
  actual: z.json().optional(),
  error: z.string().max(200).nullable().optional(),
});

/** POST /api/attempts/:id/evaluation. */
export const EvaluationSchema = z.object({
  testResults: z.array(TestResultSchema).max(100),
  edgeCaseCheck: z.object({
    originalOutput: z.json(),
    referenceOutput: z.json(),
    error: z.string().max(200).nullable().optional(),
  }),
});

/** Path params of /api/attempts/:id/evaluation. */
export const AttemptIdParamsSchema = z.object({ id: IdSchema });

/** GET /api/progress?userId= */
export const ProgressQuerySchema = z.object({ userId: IdSchema });

/**
 * GET /api/attempts?userId=&challengeId=&limit=&cursor=&cursorId=
 * `cursor` is the createdAt of the last item of the previous page (ISO 8601
 * with Z or an offset); `cursorId` is its id. With both, the next page holds
 * attempts ordered after that item (earlier createdAt, or equal createdAt and
 * smaller id). `cursor` alone keeps the strict createdAt < behaviour.
 * `cursorId` without `cursor` is a validation error.
 */
export const AttemptListQuerySchema = z
  .object({
    userId: IdSchema,
    challengeId: ChallengeIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.iso.datetime({ offset: true }).optional(),
    cursorId: IdSchema.optional(),
  })
  .refine((q) => q.cursorId === undefined || q.cursor !== undefined, {
    message: 'cursorId requires cursor',
    path: ['cursorId'],
  });

/** POST /api/users. */
export const CreateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(32),
});
