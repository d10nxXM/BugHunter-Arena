import { db } from './client.js';

// Postgres foreign key violation (attempts.user_id / challenge_id).
export const FK_VIOLATION = '23503';

// Explicit column lists. The student's text (explanation, fixed_code) is
// selected only where the evaluation needs it.
const EVALUATION_COLUMNS =
  'id, challenge_id, user_id, selected_lines, explanation, edge_case, fixed_code, hints_used, status';
const SUMMARY_COLUMNS =
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

/** Attempt summaries of one user, newest first; optionally one challenge. */
export async function listAttemptSummaries(userId, challengeId) {
  let query = db.from('attempts').select(SUMMARY_COLUMNS).eq('user_id', userId);
  if (challengeId) query = query.eq('challenge_id', challengeId);
  const { data, error } = await query.order('created_at', {
    ascending: false,
  });
  if (error) throw new Error('listAttemptSummaries failed', { cause: error });
  return data ?? [];
}

/** challenge id -> public bug category, for the dashboard. */
export async function getChallengeCategories() {
  const { data, error } = await db
    .from('challenges')
    .select('id, bug_category');
  if (error) throw new Error('getChallengeCategories failed', { cause: error });
  return new Map((data ?? []).map((row) => [row.id, row.bug_category]));
}
