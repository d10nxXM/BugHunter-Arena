/** Percentage 0-100 of value / max, rounded; 0 for a missing or non-positive max. */
export function progressPercent(value, max) {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (v / m) * 100)));
}
