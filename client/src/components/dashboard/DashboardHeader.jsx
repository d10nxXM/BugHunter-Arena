/** Page header of /dashboard: the "$ whoami" line, the h1 and an optional action on the right. */
export default function DashboardHeader({ name, title, action = null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p aria-hidden="true" className="font-mono text-[13px] break-all text-subtle">
          $ whoami → {name ?? 'guest'}
        </p>
        <h1
          tabIndex={-1}
          className="font-display text-[30px] font-bold tracking-tight wrap-break-word text-heading focus:outline-none sm:text-[34px]"
        >
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}
