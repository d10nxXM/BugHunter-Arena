// Display helpers for the result screen and the progress dashboard. Formatting only, no scoring.

/** "3 min 32 s", "45 s", or "—" for a missing value. */
export function formatDuration(totalSec) {
  if (typeof totalSec !== 'number' || !Number.isFinite(totalSec) || totalSec < 0) return '—';
  const sec = Math.round(totalSec);
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('sr-Latn-ME', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Local date and time for an ISO 8601 timestamp, or the raw text when it does not parse. */
export function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso ?? '—') : DATE_FORMAT.format(date);
}

/** Labels for feedbackSource ('ai' | 'fallback' | 'demo'), the same on every screen. */
export const SOURCE_LABELS = {
  ai: 'Pomoćna AI procjena',
  demo: 'Pomoćna AI procjena (demo)',
  fallback: 'Procjena bez AI-ja',
};

/** True for a feedbackSource value from docs/API.md. */
export function isFeedbackSource(value) {
  return Object.hasOwn(SOURCE_LABELS, value);
}

/** Challenge title from the list, or the id when the title is unknown. */
export function challengeName(titles, challengeId) {
  return titles?.get(challengeId) ?? challengeId;
}
