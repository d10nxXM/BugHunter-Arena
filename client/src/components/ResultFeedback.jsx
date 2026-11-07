import { SOURCE_LABELS } from '../lib/progressFormat.js';
import Badge from './ui/Badge.jsx';

// AI or fallback feedback for one attempt. Every field is untrusted text: it is rendered only as
// React text children, never as HTML, markdown or Monaco content.

const SOURCE = {
  ai: {
    label: SOURCE_LABELS.ai,
    tone: 'accent',
    note: 'The AI mentor assessed your explanation. The AI affects at most 30 of 100 points.',
  },
  demo: {
    label: SOURCE_LABELS.demo,
    tone: 'accent',
    note: 'Demo mode: a recorded AI mentor response is shown.',
  },
  fallback: {
    label: SOURCE_LABELS.fallback,
    tone: 'amber',
    note: 'The AI mentor is not available right now. Your explanation was scored by its key terms.',
  },
};

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * @param {{
 *   feedbackSource: 'ai' | 'fallback' | 'demo',
 *   feedback: {
 *     is_correct: boolean, explanation_quality: number, detected_misconception: string | null,
 *     needs_clarification: boolean, hint: string | null, feedback: string, practice_tip: string | null,
 *   },
 * }} props
 */
export default function ResultFeedback({ feedbackSource, feedback }) {
  const source = SOURCE[feedbackSource] ?? SOURCE.fallback;
  const main = text(feedback?.feedback);
  const misconception = text(feedback?.detected_misconception);
  const hint = text(feedback?.hint);
  const tip = text(feedback?.practice_tip);
  const quality = feedback?.explanation_quality;
  const correct = feedback?.is_correct === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p>
          <Badge tone={source.tone}>{source.label}</Badge>
        </p>
        <p className="text-[13px] text-subtle">{source.note}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p
          className={`inline-flex items-center gap-1.5 font-medium ${
            correct ? 'text-accent' : 'text-amber'
          }`}
        >
          <span aria-hidden="true">{correct ? '✓' : '!'}</span>
          {correct ? 'Your explanation is correct.' : 'Your explanation is not fully correct.'}
        </p>
        {typeof quality === 'number' && Number.isFinite(quality) && (
          <p className="font-mono text-sm text-muted">Explanation quality: {quality} / 10</p>
        )}
      </div>
      {feedback?.needs_clarification === true && (
        <p className="text-sm text-amber">Your explanation needs to be clearer.</p>
      )}

      {main && <p className="text-[15px] leading-relaxed whitespace-pre-line text-text">{main}</p>}

      {(misconception || hint || tip) && (
        <dl className="flex flex-col gap-3">
          {misconception && (
            <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
              <dt className="font-mono text-xs text-hard uppercase">Misconception spotted</dt>
              <dd className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-text">
                {misconception}
              </dd>
            </div>
          )}
          {hint && (
            <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
              <dt className="font-mono text-xs text-amber uppercase">Pointer</dt>
              <dd className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-text">
                {hint}
              </dd>
            </div>
          )}
          {tip && (
            <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
              <dt className="font-mono text-xs text-accent uppercase">Practice tip</dt>
              <dd className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-text">
                {tip}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
