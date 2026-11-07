import { useEffect, useId, useRef } from 'react';
import Button from './ui/Button.jsx';

/** Inline confirm step before "Remove name". The warning gets focus when it appears. */
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
      className="flex flex-col gap-3 rounded-[10px] border border-amber/40 bg-amber-soft p-4"
    >
      <p
        id={warningId}
        ref={warningRef}
        tabIndex={-1}
        className="text-sm font-medium text-amber focus:outline-none"
      >
        <span aria-hidden="true">⚠ </span>
        After removing the name you will no longer see your progress so far.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button size="sm" onClick={onConfirm} className="bg-hard text-bg hover:bg-hard/85">
          Yes, remove the name
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
