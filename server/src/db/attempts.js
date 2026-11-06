import { db } from './client.js';

// Postgres foreign key violation (attempts.user_id / challenge_id).
export const FK_VIOLATION = '23503';

// Explicit column lists. The student's text (explanation, fixed_code) is
// selected only where the evaluation needs it.
export const EVALUATION_COLUMNS =
  'id, challenge_id, user_id, selected_lines, explanation, edge_case, fixed_code, hints_used, status';
export const SUMMARY_COLUMNS =
  'id, challenge_id, status, score, score_breakdown, feedback_source, hints_used, duration, created_at';

/**
 * Stores a new attempt (status 'submitted') and returns its id. Throws an
 * error with `cause.code === FK_VIOLATION` if the user does not exist.
 */
export async function insertAttempt(row) {
  const { data, error } = await db
    .from('attempts')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error('insertAttempt failed', { cause: error });
  return data.id;
}

/** The attempt as needed for evaluation, or null. */
export async function getAttemptForEvaluation(id) {
  const { data, error } = await db
    .from('attempts')
    .select(EVALUATION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new Error('getAttemptForEvaluation failed', { cause: error });
  return data ?? null;
}

/**
 * Stores the evaluation only if the attempt is still 'submitted' (one atomic
 * conditional update). Returns true if this call evaluated it, false if it
 * was already evaluated (or does not exist).
 */
export async function completeEvaluation(id, fields) {
  const { data, error } = await db
    .from('attempts')
    .update({ ...fields, status: 'evaluated' })
    .eq('id', id)
    .eq('status', 'submitted')
    .select('id')
    .maybeSingle();
  if (error) throw new Error('completeEvaluation failed', { cause: error });
  return data !== null;
}

// Only these shapes may be interpolated into the PostgREST or() string.
const CURSOR_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attempt summaries of one user, newest first (created_at desc, then id
 * desc); optionally one challenge. At most `limit` rows, always applied.
 * Uses attempts_user_id_created_at_idx (user_id, created_at desc, id desc).
 *
 * Keyset paging: `before` (an ISO timestamp) with `beforeId` keeps rows
 * ordered after that item: created_at < before, or created_at = before and
 * id < beforeId, so ties are neither skipped nor repeated. `before` alone
 * keeps a strict `created_at <` (a row equal to the cursor is skipped).
 * Both values are interpolated into the PostgREST filter string, so this
 * function fails closed: it throws unless `before` is an ISO 8601 datetime
 * with an offset and `beforeId` is a UUID (callers also validate with Zod).
 * The timestamp is double-quoted because it contains ':' and '+'. It is
 * passed through as a string and never round-tripped through Date, which
 * would lose microseconds.
 *
 * Performance note: the cursor is applied as a filter on the ordered scan,
 * not as an index range, so a very deep page reads and discards the rows
 * before it. If that gets slow, the escape hatch is an RPC (SQL function)
 * using a row-value comparison: (created_at, id) < (before, beforeId).
 */
export async function listAttemptSummaries(
  userId,
  { challengeId, before, beforeId, limit = 1000 } = {},
) {
  let query = db.from('attempts').select(SUMMARY_COLUMNS).eq('user_id', userId);
  if (challengeId) query = query.eq('challenge_id', challengeId);
  if (before && beforeId) {
    if (!CURSOR_TIMESTAMP.test(before) || !UUID.test(beforeId)) {
      throw new Error('listAttemptSummaries: invalid cursor');
    }
    query = query.or(
      `created_at.lt."${before}",and(created_at.eq."${before}",id.lt.${beforeId})`,
    );
  } else if (before) {
    query = query.lt('created_at', before);
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error('listAttemptSummaries failed', { cause: error });
  return data ?? [];
}

/**
 * challenge id -> { title, language, difficulty, bugCategory }, public fields
 * only, for the profile.
 */
export async function getChallengeMeta() {
  const { data, error } = await db
    .from('challenges')
    .select('id, title, language, difficulty, bug_category');
  if (error) throw new Error('getChallengeMeta failed', { cause: error });
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        title: row.title,
        language: row.language,
        difficulty: row.difficulty,
        bugCategory: row.bug_category,
      },
    ]),
  );
}

/** challenge id -> public bug category, for the dashboard. */
export async function getChallengeCategories() {
  const { data, error } = await db
    .from('challenges')
    .select('id, bug_category');
  if (error) throw new Error('getChallengeCategories failed', { cause: error });
  return new Map((data ?? []).map((row) => [row.id, row.bug_category]));
}
