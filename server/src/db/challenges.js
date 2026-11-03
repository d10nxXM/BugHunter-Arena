import { db } from './client.js';

/** Every challenge has exactly this many written hints (enforced by the seed). */
export const HINT_LEVELS = 3;

// Explicit public column lists. Never `*`, never a hidden column
// (reference_solution, bug_lines, related_lines, bug_description,
// hints_json, keywords_json, fallback_feedback).
const SUMMARY_COLUMNS = 'id, title, language, difficulty, bug_category';
// SERVER-ONLY column list (includes hidden columns). Used by getFullChallenge.
const FULL_COLUMNS =
  'id, title, description, language, function_name, code, bug_lines, related_lines, bug_category, bug_description, reference_solution, difficulty, tests_json, hints_json, keywords_json, fallback_feedback';
const DETAIL_COLUMNS =
  'id, title, description, language, difficulty, bug_category, function_name, code, tests_json';

/**
 * Written hints for POST /api/challenges/:id/hints: { hints: string[] } or
 * null. Selects only id and hints_json so the rest of the row is not loaded.
 */
export async function getChallengeHints(id) {
  const { data, error } = await db
    .from('challenges')
    .select('id, hints_json')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('getChallengeHints failed', { cause: error });
  if (!data) return null;
  return { hints: data.hints_json };
}

/**
 * SERVER-ONLY. The full stored row (solution, bug lines, hidden tests,
 * keywords, hints, fallback feedback), or null. Never use it in a public
 * route or return any part of it before the attempt is locked.
 */
export async function getFullChallenge(id) {
  const { data, error } = await db
    .from('challenges')
    .select(FULL_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('getFullChallenge failed', { cause: error });
  return data ?? null;
}

/** Challenge list for GET /api/challenges, ordered by created_at, then id. */
export async function listPublicChallenges() {
  const { data, error } = await db
    .from('challenges')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error('listPublicChallenges failed', { cause: error });

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    language: row.language,
    difficulty: row.difficulty,
    bugCategory: row.bug_category,
  }));
}

/**
 * Public view of one challenge for GET /api/challenges/:id, or null if it
 * does not exist. Only visible tests, each reduced to { id, args, expected }.
 */
export async function getPublicChallenge(id) {
  const { data, error } = await db
    .from('challenges')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('getPublicChallenge failed', { cause: error });
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    language: data.language,
    difficulty: data.difficulty,
    bugCategory: data.bug_category,
    functionName: data.function_name,
    code: data.code,
    visibleTests: (Array.isArray(data.tests_json) ? data.tests_json : [])
      .filter((test) => test.visible === true)
      .map((test) => ({
        id: test.id,
        args: test.args,
        expected: test.expected,
      })),
    hintCount: HINT_LEVELS,
  };
}
