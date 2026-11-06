// Decorative line icons for the landing page. All are aria-hidden; the text next to them carries
// the meaning.

function Icon({ size = 28, strokeWidth = 1.8, className = 'text-accent', children }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 6l-6 6 6 6" />
      <path d="M16 6l6 6-6 6" />
    </Icon>
  );
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M11 8v3" />
      <path d="M11 14h.01" />
    </Icon>
  );
}

export function PatchIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 12l2 2 4-4" />
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    </Icon>
  );
}

export function TrophyIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 6h3a3 3 0 0 1-3 4" />
      <path d="M7 6H4a3 3 0 0 0 3 4" />
    </Icon>
  );
}

export function SwordsIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

export function ArrowRightIcon(props) {
  return (
    <Icon size={18} strokeWidth={2.2} className="" {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Icon>
  );
}
