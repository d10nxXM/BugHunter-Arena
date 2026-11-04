import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Returns requestFocus(id): focuses the element with that id after the next render. */
export function useFocusRequest() {
  const targetRef = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!targetRef.current) return;
    document.getElementById(targetRef.current)?.focus();
    targetRef.current = null;
  }, [tick]);
  return useCallback((id) => {
    targetRef.current = id;
    setTick((n) => n + 1);
  }, []);
}
