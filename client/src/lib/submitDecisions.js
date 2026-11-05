// Pure recovery decisions for the submit flow, per docs/API.md "Timeouts and retries".
// The hooks (useSubmitFlow, useEvaluationStep) act on them; nothing here has side effects.
import { isAbortError, isAlreadyEvaluated, isMaybeSaved } from './submitErrors.js';

/**
 * After a failed evaluation POST: whether a later retry should look the attempt up first.
 * Only a maybe-saved failure, a 409 or a cut-off request (AbortError) may have stored it;
 * 429 and other 4xx stored nothing.
 */
export function needsLookup(error) {
  return isMaybeSaved(error) || isAlreadyEvaluated(error) || isAbortError(error);
}

/**
 * What to do after an evaluation POST failed:
 * - 'fail': show the error (not maybe saved and not 409, or a maybe-saved re-POST after a lookup)
 * - 'anonymous': no user id, so no lookup is possible
 * - 'recover': look the attempt up
 */
export function evaluationFailureStep({ error, userId, afterLookup }) {
  if (!isMaybeSaved(error) && !isAlreadyEvaluated(error)) return 'fail';
  if (!userId) return 'anonymous';
  if (afterLookup && !isAlreadyEvaluated(error)) return 'fail';
  return 'recover';
}

/**
 * What to do with a lookupAttempt() result (lib/attemptRecovery.js):
 * 'aborted', 'recovered' (evaluated), 'unknown' (not found or search failed), or for a
 * still-submitted attempt 'repost' once per attempt and 'notSaved' after that.
 */
export function recoveryStep({ status, reposted }) {
  if (status === 'aborted') return 'aborted';
  if (status === 'evaluated') return 'recovered';
  if (status === 'unknown') return 'unknown';
  return reposted ? 'notSaved' : 'repost';
}

/**
 * A manual "Pošalji rezultat ponovo": with a user id and a possibly stored evaluation, look it
 * up first. Otherwise POST directly; an anonymous re-POST after a possibly stored evaluation
 * spends the single re-POST budget. Returns { lookup, spendRepost }.
 */
export function retryEvaluationStep({ userId, lookupNeeded }) {
  if (userId && lookupNeeded) return { lookup: true, spendRepost: false };
  return { lookup: false, spendRepost: lookupNeeded };
}
