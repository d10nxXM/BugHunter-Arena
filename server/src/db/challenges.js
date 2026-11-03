import { db } from './client.js';

/** Every challenge has exactly this many written hints (enforced by the seed). */
export const HINT_LEVELS = 3;

// Explicit public column lists. Never `*`, never a hidden column
// (reference_solution, bug_lines, related_lines, bug_description,
// hints_json, keywords_json, fallback_feedback).
const SUMMARY_COLUMNS = 'id, title, language, difficulty, bug_category';
const DETAIL_COLUMNS =
  'id, title, description, language, difficulty, bug_category, function_name, code, tests_json';

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
    visibleTests: data.tests_json
      .filter((test) => test.visible === true)
      .map((test) => ({
        id: test.id,
        args: test.args,
        expected: test.expected,
      })),
    hintCount: HINT_LEVELS,
  };
}
