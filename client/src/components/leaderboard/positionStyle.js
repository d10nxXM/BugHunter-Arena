// Medal colors of the mockup's "Top hunters" card: gold, silver, bronze, then plain.
const MEDALS = {
  1: { text: 'text-amber', avatar: 'bg-amber-soft text-amber' },
  2: { text: 'text-[#c9d4e3]', avatar: 'bg-track text-[#c9d4e3]' },
  3: { text: 'text-[#e0a57a]', avatar: 'bg-[#2a1c14] text-[#e0a57a]' },
};
const PLAIN = { text: 'text-subtle', avatar: 'bg-surface-2 text-muted' };

/** Tailwind classes for a leaderboard position: { text, avatar }. */
export function positionStyle(position) {
  return MEDALS[position] ?? PLAIN;
}
