import { useEffect, useState } from 'react';
import { getProfile } from '../api/client.js';

/**
 * The exact leaderboard position of an account, from `globalPosition` on
 * GET /api/profiles/:handle. Returns { status: 'idle' | 'loading' | 'ready' | 'error', position },
 * where `position` is a number or null (not ranked) when ready. A null handle (guest) requests
 * nothing and stays 'idle'.
 */
export function useGlobalPosition(handle) {
  const [result, setResult] = useState({ handle: null, status: 'loading', position: null });

  useEffect(() => {
    if (handle === null) return undefined;
    const controller = new AbortController();
    getProfile(handle, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const raw = data?.globalPosition;
        const valid = raw === null || (Number.isInteger(raw) && raw > 0);
        setResult(
          valid
            ? { handle, status: 'ready', position: raw }
            : { handle, status: 'error', position: null },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ handle, status: 'error', position: null });
      });
    return () => controller.abort();
  }, [handle]);

  if (handle === null) return { status: 'idle', position: null };
  if (result.handle !== handle) return { status: 'loading', position: null };
  return result;
}
