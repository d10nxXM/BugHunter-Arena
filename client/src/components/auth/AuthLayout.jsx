const PANEL =
  'flex min-w-0 flex-col justify-center gap-7 border-track bg-nav p-8 sm:p-12 ' +
  'bg-[radial-gradient(#1a2330_1px,transparent_1px)] bg-size-[28px_28px]';

/**
 * Two-panel frame of the Login and Create account mockups: the form, and a decorative side
 * panel (`aside`) that is hidden on narrow screens. `asideFirst` puts the panel on the left.
 */
export default function AuthLayout({ aside, asideFirst = false, children }) {
  const side = (
    <div className={`${PANEL} hidden lg:flex ${asideFirst ? 'border-r' : 'border-l'}`}>{aside}</div>
  );
  return (
    <div className="mx-auto grid max-w-[1100px] overflow-hidden rounded-[14px] border border-border bg-bg lg:grid-cols-2">
      {asideFirst && side}
      <div className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 sm:py-14">
        {children}
      </div>
      {!asideFirst && side}
    </div>
  );
}
