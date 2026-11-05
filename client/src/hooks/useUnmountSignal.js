import { useCallback, useEffect, useRef } from 'react';

/** Returns getSignal(): the signal of one AbortController per mount, aborted on unmount. */
export function useUnmountSignal() {
  const controllerRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort();
  }, []);
  return useCallback(() => controllerRef.current?.signal ?? new AbortController().signal, []);
}
