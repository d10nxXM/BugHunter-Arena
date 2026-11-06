import { useEffect, useMemo, useState } from 'react';
import { getProgress } from '../api/client.js';
import { isSolved } from '../lib/xp.js';
import { useUser } from './useUser.js';

const EMPTY = [];

function isEntry(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.challengeId === 'string' &&
    item.challengeId !== ''
  );
}

/** 'solved' | 'attempted' | null for one perChallenge entry (or undefined when never tried). */
export function challengeStatus(entry) {
  if (!entry) return null;
  if (isSolved(entry.bestScore)) return 'solved';
  return 'attempted';
}

/**
 * Per-challenge progress of the current user, for status icons and XP.
 * Fetches GET /api/progress only when a user exists. Any failure degrades to "no progress"
 * (status 'error', empty list), so the caller can still show its table.
 *
 * @returns {{ status: 'guest' | 'loading' | 'ready' | 'error',
 *   perChallenge: Array<{ challengeId: string, bestScore: number | null, attempts: number }>,
 *   byId: Map<string, { challengeId: string, bestScore: number | null, attempts: number }> }}
 */
export function useChallengeStatuses() {
  const { user } = useUser();
  const userId = user?.userId ?? null;
  const [result, setResult] = useState({ userId: null, status: 'loading', perChallenge: EMPTY });

  useEffect(() => {
    if (!userId) return undefined;
    const controller = new AbortController();
    getProgress(userId, { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data?.perChallenge)) {
          setResult({ userId, status: 'error', perChallenge: EMPTY });
          return;
        }
        setResult({ userId, status: 'ready', perChallenge: data.perChallenge.filter(isEntry) });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) console.warn('[problems] progress not loaded');
        setResult({ userId, status: 'error', perChallenge: EMPTY });
      });
    return () => controller.abort();
  }, [userId]);

  let current;
  if (!userId) current = { status: 'guest', perChallenge: EMPTY };
  else if (result.userId === userId) current = result;
  else current = { status: 'loading', perChallenge: EMPTY };

  const { status, perChallenge } = current;
  const byId = useMemo(() => new Map(perChallenge.map((e) => [e.challengeId, e])), [perChallenge]);
  return { status, perChallenge, byId };
}
