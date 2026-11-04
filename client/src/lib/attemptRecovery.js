// Recovery of a stored attempt (docs/API.md, "Timeouts and retries").
import { ApiError, getAttempts, nextAttemptsPage } from '../api/client.js';
import { MESSAGES } from './submitConstants.js';

/** Page size when searching GET /api/attempts for one attempt. */
export const ATTEMPTS_PAGE_SIZE = 50;
/** Upper bound on pages read while recovering. */
export const MAX_ATTEMPT_PAGES = 40;
/** Total time allowed for the whole search. */
export const RECOVERY_DEADLINE_MS = 15000;

/**
 * Pages GET /api/attempts?userId=&challengeId= (cursor + cursorId) until the item whose id is
 * attemptId is found. Returns it, or null when the list ends, the cursor stops advancing, or
 * MAX_ATTEMPT_PAGES were read. Never falls back to the newest item.
 * The caller's signal aborts everything. When the total deadline passes, the pending request
 * is aborted and the call rejects with an AbortError while the caller's signal is not aborted,
 * so the caller can tell "gave up" from "unmounted".
 */
export async function findAttemptById({
  userId,
  challengeId,
  attemptId,
  signal,
  deadlineMs = RECOVERY_DEADLINE_MS,
}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    let page = { cursor: undefined, cursorId: undefined };
    for (let i = 0; i < MAX_ATTEMPT_PAGES && page; i += 1) {
      const items = await getAttempts(
        {
          userId,
          challengeId,
          limit: ATTEMPTS_PAGE_SIZE,
          cursor: page.cursor,
          cursorId: page.cursorId,
        },
        { signal: controller.signal },
      );
      if (!Array.isArray(items)) {
        throw new ApiError(MESSAGES.badEvaluation, { status: 200, code: 'BAD_RESPONSE' });
      }
      const match = items.find((item) => item?.id === attemptId);
      if (match) return match;
      const next = nextAttemptsPage(items, ATTEMPTS_PAGE_SIZE);
      // A cursor that does not advance would repeat the same page until the page limit.
      if (next && next.cursorId === page.cursorId && next.cursor === page.cursor) return null;
      page = next;
    }
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
