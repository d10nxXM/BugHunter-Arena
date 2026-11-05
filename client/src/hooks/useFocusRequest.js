import { useCallback, useEffect, useRef, useState } from 'react';

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
