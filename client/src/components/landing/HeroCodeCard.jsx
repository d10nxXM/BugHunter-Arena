import { CheckIcon } from './icons.jsx';

// A made-up example, not one of the seeded challenges: an off-by-one in a pagination helper.
const KW = 'text-[#c792ea]';
const FN = 'text-[#82aaff]';
const NUM = 'text-[#f78c6c]';

const LINES = [
  [['def', KW], [' '], ['paginate', FN], ['(items, page, size):']],
  [['    # return one page of results', 'text-subtle']],
  [['    start = page * size']],
  null, // the bug line, rendered separately
  [['    '], ['return', KW], [' items[start:end]']],
  [],
  [
    ['print', FN],
    ['(paginate('],
    ['list', NUM],
    ['('],
    ['range', FN],
    ['('],
    ['10', NUM],
    [')), '],
    ['0', NUM],
    [', '],
    ['3', NUM],
    ['))'],
  ],
];

function LineNumber({ n, className = 'text-subtle' }) {
  return (
    <span aria-hidden="true" className={`w-8 flex-none select-none ${className}`}>
      {n}
    </span>
  );
}

/** Decorative code card in the hero: an example bug and its confirmed result. */
export default function HeroCodeCard() {
  return (
    <figure className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
      <figcaption className="sr-only">
        Example challenge: a paginate function with an off-by-one bug on line 4.
      </figcaption>
      <div className="overflow-hidden rounded-[14px] border border-border-strong bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <div aria-hidden="true" className="flex gap-2">
            <span className="size-[11px] rounded-full bg-border-strong" />
            <span className="size-[11px] rounded-full bg-border-strong" />
            <span className="size-[11px] rounded-full bg-border-strong" />
          </div>
          <span className="font-mono text-[13px] text-subtle">paginate.py · example</span>
          <span className="rounded border border-amber/40 px-2 py-0.5 font-mono text-xs font-bold text-amber">
            EASY
          </span>
        </div>
        <pre className="overflow-x-auto py-4.5 font-mono text-[14.5px] leading-[1.85]">
          <code className="block min-w-max">
            {LINES.map((tokens, i) => {
              const n = i + 1;
              if (tokens === null) {
                return (
                  <span
                    key={n}
                    className="flex items-center border-l-[3px] border-amber bg-amber-soft pr-4.5 pl-[15px]"
                  >
                    <LineNumber n={n} className="text-amber" />
                    <span className="flex-1 whitespace-pre">
                      {'    end = start + size '}
                      <span className="text-amber underline decoration-amber decoration-wavy underline-offset-4">
                        + 1
                      </span>
                    </span>
                    <span className="ml-4 rounded bg-amber px-1.5 py-px font-sans text-[11px] font-bold text-bg">
                      BUG
                    </span>
                  </span>
                );
              }
              return (
                <span key={n} className="flex px-4.5">
                  <LineNumber n={n} />
                  <span className="whitespace-pre">
                    {tokens.map(([text, cls], j) => (
                      <span key={j} className={cls}>
                        {text}
                      </span>
                    ))}
                  </span>
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <div className="flex items-center gap-4 rounded-xl border border-border-strong bg-surface px-4.5 py-4">
        <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-accent-soft">
          <CheckIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-heading">
            Bug confirmed: off-by-one on line 4
          </p>
          <p className="mt-0.5 text-sm text-subtle">
            The slice returns size + 1 items. Fix: end = start + size
          </p>
        </div>
        <p className="font-mono text-lg font-bold text-accent">+90 XP</p>
      </div>
    </figure>
  );
}
