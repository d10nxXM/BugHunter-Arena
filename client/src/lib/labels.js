// Display labels for challenge metadata. The API sends difficulty as easy | medium | hard; the
// Montenegrin values (lako | srednje | teško) are still accepted while the server data is
// being translated.

const DIFFICULTY_ALIASES = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  lako: 'easy',
  srednje: 'medium',
  teško: 'hard',
};

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// Text color classes; each is >= 4.5:1 on the bg and surface tokens.
const DIFFICULTY_CLASSES = { easy: 'text-easy', medium: 'text-medium', hard: 'text-hard' };

const LANGUAGE_LABELS = { python: 'Python', javascript: 'JavaScript' };

/** Canonical difficulty (easy | medium | hard), or null for an unknown value. */
export function normalizeDifficulty(value) {
  if (typeof value !== 'string') return null;
  return DIFFICULTY_ALIASES[value.trim().toLowerCase()] ?? null;
}

/** "Easy" | "Medium" | "Hard"; an unknown value is shown as given (or "Unknown" when empty). */
export function difficultyLabel(value) {
  const key = normalizeDifficulty(value);
  if (key) return DIFFICULTY_LABELS[key];
  return typeof value === 'string' && value.trim() !== '' ? value : 'Unknown';
}

/** Tailwind text color class for a difficulty; neutral for an unknown value. */
export function difficultyClass(value) {
  const key = normalizeDifficulty(value);
  return key ? DIFFICULTY_CLASSES[key] : 'text-muted';
}

/** "Python" | "JavaScript"; an unknown language is shown as given. */
export function languageLabel(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Unknown';
  return LANGUAGE_LABELS[value.trim().toLowerCase()] ?? value;
}
