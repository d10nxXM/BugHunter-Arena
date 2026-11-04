import { useEffect, useId, useRef } from 'react';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';

/** Inline confirm step before "Ukloni ime". The warning gets focus when it appears. */
export default function ProgressRemoveConfirm({ onConfirm, onCancel }) {
  const warningId = useId();
  const warningRef = useRef(null);

  useEffect(() => {
    warningRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby={warningId}
      className="rounded border border-amber-700 bg-amber-50 p-3"
    >
      <p
        id={warningId}
        ref={warningRef}
        tabIndex={-1}
        className="font-medium text-amber-900 focus:outline-none"
      >
        Nakon uklanjanja imena nećeš moći vidjeti dosadašnji napredak.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded bg-red-800 px-3 py-1.5 font-semibold text-white hover:bg-red-900 ${FOCUS_RING} focus-visible:ring-offset-2`}
        >
          Da, ukloni ime
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded border border-slate-500 bg-white px-3 py-1.5 hover:bg-slate-100 ${FOCUS_RING}`}
        >
          Odustani
        </button>
      </div>
    </div>
  );
}
