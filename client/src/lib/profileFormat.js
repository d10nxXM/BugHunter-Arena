// Display helpers for the hunter profile and the header avatar.

/** Up to two uppercase initials of a handle: "null_pointer" -> "NP", "dion" -> "DI". */
export function initials(handle) {
  const text = String(handle ?? '').replace(/^@/, '');
  const parts = text.split(/[_\d]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const word = parts[0] ?? text;
  return (word.slice(0, 2) || '?').toUpperCase();
}

function toDate(iso) {
  if (typeof iso !== 'string' || iso === '') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Mar 2026" for an ISO timestamp, or null when it is missing or invalid. */
export function monthYear(iso) {
  const date = toDate(iso);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today", "Yesterday", "3 days ago" (up to 6), otherwise "3 Nov 2026". Compares calendar days in
 * the viewer's time zone. Empty string for a missing or invalid timestamp.
 */
export function relativeDay(iso, now = new Date()) {
  const date = toDate(iso);
  if (!date) return '';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
