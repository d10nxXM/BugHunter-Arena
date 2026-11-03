import { readFileSync } from 'node:fs';
import { config } from '../lib/config.js';
import { complete } from './llmClient.js';
import {
  EvaluationOutputSchema,
  HintOutputSchema,
} from '../schemas/aiOutput.js';

const EVALUATION_PROMPT = readFileSync(
  new URL('../prompts/evaluation.md', import.meta.url),
  'utf8',
);
const HINT_PROMPT = readFileSync(
  new URL('../prompts/hint.md', import.meta.url),
  'utf8',
);

const EVALUATION_TEMPERATURE = 0.1;
const EVALUATION_MAX_TOKENS = 400;
const HINT_TEMPERATURE = 0.3;
const HINT_MAX_TOKENS = 80;
const HINT_TIMEOUT_MS = 8000;

/**
 * Output the model produced is unusable. `kind` is invalid_json, schema or
 * leaks_solution.
 */
export class AiOutputError extends Error {
  constructor(kind, message, options) {
    super(message, options);
    this.name = 'AiOutputError';
    this.kind = kind;
  }
}

/**
 * Log level and fields for a failed AI call. Config errors from the provider
 * (400/401/403/404) are "error"; timeouts, 429, 5xx and bad output are "warn".
 * Never includes the message, the URL, the key or any prompt text.
 */
export function describeAiFailure(err) {
  const status = Number.isInteger(err?.status) ? err.status : undefined;
  const level = [400, 401, 403, 404].includes(status) ? 'error' : 'warn';
  return { level, fields: { reason: err?.kind ?? err?.name, status } };
}

/** Student text is data: `<` and `>` cannot open or close a tag. */
export function escapeStudentText(value) {
  return String(value ?? '')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function numberLines(code) {
  return String(code ?? '')
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

/**
 * Challenge text for evaluation. Includes the expected bug; the reference
 * solution is never included.
 */
function evaluationChallengeBlock(challenge) {
  return [
    '<challenge>',
    `<task>${challenge.description ?? ''}</task>`,
    `<category>${challenge.bug_category ?? ''}</category>`,
    `<code>\n${numberLines(challenge.code)}\n</code>`,
    `<expected_bug>${challenge.bug_description ?? ''}</expected_bug>`,
    '</challenge>',
  ].join('\n');
}

/**
 * Challenge text for hints: only what the student already sees (task, code,
 * category). No bug description, bug lines, keywords or solution.
 */
function hintChallengeBlock(challenge) {
  return [
    '<challenge>',
    `<task>${challenge.description ?? ''}</task>`,
    `<category>${challenge.bug_category ?? ''}</category>`,
    `<code>\n${numberLines(challenge.code)}\n</code>`,
    '</challenge>',
  ].join('\n');
}

function parseJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiOutputError('invalid_json', 'LLM output is not valid JSON');
  }
}

function parseWith(schema, text) {
  const result = schema.safeParse(parseJson(text));
  if (!result.success) {
    throw new AiOutputError('schema', 'LLM output does not match the schema');
  }
  return result.data;
}

/**
 * Evaluates the explanation with the LLM.
 * Retries once, only when the output is not valid JSON/schema; timeouts and
 * HTTP errors are not retried. Both attempts share one AI_TIMEOUT_MS budget.
 * Only challenge content, test counts and the explanation are sent: no
 * attempt id, no user data.
 *
 * @throws LlmError | AiOutputError, the caller falls back.
 */
export async function evaluateAnswer({ challenge, answer, testSummary }) {
  const parts = [evaluationChallengeBlock(challenge ?? {})];
  const passed = testSummary?.testsPassed;
  const total = testSummary?.testsTotal;
  if (Number.isFinite(passed) && Number.isFinite(total)) {
    parts.push(
      `<test_results>${passed} of ${total} tests passed</test_results>`,
    );
  }
  parts.push(
    `<student_answer>${escapeStudentText(answer?.explanation)}</student_answer>`,
  );
  const user = parts.join('\n');

  const deadline = Date.now() + config.aiTimeoutMs;
  let firstError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (attempt > 0 && remaining < 1000) break;
    const text = await complete({
      system: EVALUATION_PROMPT,
      user,
      temperature: EVALUATION_TEMPERATURE,
      maxTokens: EVALUATION_MAX_TOKENS,
      timeoutMs: remaining,
    });
    try {
      return parseWith(EvaluationOutputSchema, text);
    } catch (err) {
      if (!(err instanceof AiOutputError)) throw err;
      if (firstError === undefined) {
        firstError = err;
      } else {
        // Both attempts failed: report the last kind, keep the first as cause.
        throw new AiOutputError(err.kind, err.message, { cause: firstError });
      }
    }
  }
  throw firstError;
}

const normalize = (line) => line.trim().replace(/\s+/g, ' ').toLowerCase();
const MIN_LINE_LENGTH = 3;
/** Blank lines and lines of only brackets/punctuation reveal nothing. */
const TRIVIAL_LINE = /^[\s()[\]{}:,;]*$/;

/**
 * True when the hint contains code formatting (backticks) or a line of the
 * reference solution. Lines that also appear in the original code, and
 * trivial lines, are skipped.
 */
export function revealsSolution(hint, challenge) {
  if (hint.includes('`')) return true;
  if (typeof challenge?.reference_solution !== 'string') return false;
  const original = new Set(
    String(challenge.code ?? '')
      .split('\n')
      .map(normalize),
  );
  const text = normalize(hint);
  return challenge.reference_solution
    .split('\n')
    .map(normalize)
    .some(
      (line) =>
        line.length >= MIN_LINE_LENGTH &&
        !TRIVIAL_LINE.test(line) &&
        !original.has(line) &&
        text.includes(line),
    );
}

/**
 * One-sentence hint for `level` (1-3). No retry; timeout is 8 s, or
 * AI_TIMEOUT_MS if that is lower.
 * `context`: `{ challenge, currentAnswer? }`, challenge is the full row.
 * The reference solution is used only to reject a hint that reveals it, and
 * is never sent to the model.
 *
 * @throws LlmError | AiOutputError, the caller uses the written hint.
 */
export async function getHint({ challenge, currentAnswer }, level) {
  const parts = [
    hintChallengeBlock(challenge),
    `<hint_level>${level}</hint_level>`,
    `<written_hint>${challenge.hints_json?.[level - 1] ?? ''}</written_hint>`,
  ];
  if (typeof currentAnswer?.explanation === 'string') {
    parts.push(
      `<student_answer>${escapeStudentText(currentAnswer.explanation)}</student_answer>`,
    );
  }

  const text = await complete({
    system: HINT_PROMPT,
    user: parts.join('\n'),
    temperature: HINT_TEMPERATURE,
    maxTokens: HINT_MAX_TOKENS,
    timeoutMs: Math.min(HINT_TIMEOUT_MS, config.aiTimeoutMs),
  });
  const { hint } = parseWith(HintOutputSchema, text);
  if (revealsSolution(hint, challenge)) {
    throw new AiOutputError(
      'leaks_solution',
      'hint reveals the reference solution',
    );
  }
  return hint;
}
