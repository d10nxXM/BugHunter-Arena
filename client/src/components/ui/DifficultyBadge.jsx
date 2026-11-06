import { difficultyClass, difficultyLabel, normalizeDifficulty } from '../../lib/labels.js';

const BACKGROUNDS = { easy: 'bg-accent-soft', medium: 'bg-amber-soft', hard: 'bg-hard-soft' };

/**
 * Difficulty as text plus color (the text carries the meaning, color is extra).
 * `plain` drops the pill background, as in the Problems table.
 */
export default function DifficultyBadge({ difficulty, plain = false, className = '' }) {
  const key = normalizeDifficulty(difficulty);
  const color = difficultyClass(difficulty);
  const box = plain ? '' : `rounded-md px-2.5 py-1 text-xs ${BACKGROUNDS[key] ?? 'bg-surface-3'}`;
  return (
    <span className={`inline-flex items-center font-semibold ${color} ${box} ${className}`}>
      {difficultyLabel(difficulty)}
    </span>
  );
}
