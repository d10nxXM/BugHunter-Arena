/** Mono kicker ("// how_it_works") above a section h2. `id` goes on the h2 for aria-labelledby. */
export default function SectionHeading({ kicker, id, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      <p className="font-mono text-sm text-accent">{kicker}</p>
      <h2
        id={id}
        className="font-display text-[32px] leading-tight font-bold tracking-tight text-heading sm:text-[40px] lg:text-[46px]"
      >
        {children}
      </h2>
    </div>
  );
}

/** Centered page column used by every landing section. */
export function Container({ className = '', children }) {
  return (
    <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-6 ${className}`}>{children}</div>
  );
}
