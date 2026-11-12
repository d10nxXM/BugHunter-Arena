import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api/client.js';

function isLeaderboard(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    Array.isArray(data.entries) &&
    Number.isFinite(data.total)
  );
}

/**
 * Loads GET /api/leaderboard. Returns { status: 'loading' | 'ready' | 'error', data, retry },
 * where `data` is the response when ready.
 */
export function useLeaderboard(limit) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, status: 'loading', data: null });
  const key = `${limit}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    getLeaderboard({ limit }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(
          isLeaderboard(data)
            ? { key, status: 'ready', data }
            : { key, status: 'error', data: null },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ key, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [limit, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (result.key !== key) return { status: 'loading', data: null, retry };
  return { ...result, retry };
}
