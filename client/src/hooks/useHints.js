import { useEffect, useRef, useState } from 'react';
import { requestHint } from '../api/client.js';
import { errorMessage } from '../lib/submitErrors.js';
import { EXPLANATION_MAX, MAX_SELECTED_LINES, MESSAGES } from '../lib/submitConstants.js';

/**
 * Hints, one level at a time (POST /api/challenges/:id/hints). Returns
 * { hints, loading, error, maxLevel, request() }. A hint that arrives after the answer is
 * locked (`editable` false) is dropped, so the reported hint count matches what was shown.
 */
export function useHints({ challenge, getSignal, editable, selectedLines, explanation }) {
  const [hints, setHints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const editableRef = useRef(editable);
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  const maxLevel = Math.min(3, Number.isInteger(challenge.hintCount) ? challenge.hintCount : 3);

  async function request() {
    const level = hints.length + 1;
    if (loading || !editable || level > maxLevel) return;
    const signal = getSignal();
    setLoading(true);
    setError(null);
    try {
      const currentAnswer = {
        selectedLines: selectedLines.slice(0, MAX_SELECTED_LINES),
        explanation: explanation.slice(0, EXPLANATION_MAX),
      };
      const data = await requestHint(challenge.id, { level, currentAnswer }, { signal });
      if (typeof data?.hint !== 'string' || data.hint.trim() === '') {
        throw new Error(MESSAGES.hintMissing);
      }
      if (signal.aborted || !editableRef.current) return;
      const hint = { level, hint: data.hint, source: data.source };
      setHints((prev) => (prev.length === level - 1 ? [...prev, hint] : prev));
    } catch (caught) {
      if (!signal.aborted) setError(errorMessage(caught));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  return { hints, loading, error, maxLevel, request };
}
