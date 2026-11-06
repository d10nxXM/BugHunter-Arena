import { ALL, DIFFICULTIES } from './filters.js';
import { difficultyClass, difficultyLabel } from '../../lib/labels.js';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function chipClass(on) {
  const state = on
    ? 'border-accent bg-accent-soft text-heading'
    : 'border-border-strong bg-surface text-muted hover:text-heading';
  return `min-h-10 rounded-full border px-3.5 text-sm font-medium ${state} ${FOCUS}`;
}

/** Bug class toggle chips ("All" plus every category in the data). */
export function CategoryChips({ categories, value, onChange }) {
  const options = [{ key: ALL, label: 'All' }, ...categories.map((c) => ({ key: c, label: c }))];
  return (
    <div role="group" aria-label="Bug class" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={chipClass(value === o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Difficulty segmented control: All / Easy / Medium / Hard as toggle buttons. */
export function DifficultyFilter({ value, onChange }) {
  const options = [ALL, ...DIFFICULTIES];
  return (
    <div
      role="group"
      aria-label="Difficulty"
      className="flex overflow-hidden rounded-[10px] border border-border-strong"
    >
      {options.map((key) => {
        const on = value === key;
        const color = key === ALL ? 'text-heading' : difficultyClass(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={`min-h-11 px-4 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              on
                ? `bg-track font-semibold ${color}`
                : 'bg-surface font-medium text-subtle hover:text-heading'
            }`}
          >
            {key === ALL ? 'All' : difficultyLabel(key)}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled search field (title or bug class). */
export function SearchField({ value, onChange, inputRef }) {
  return (
    <div className="flex min-h-11 flex-[1_1_260px] items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-subtle"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <label htmlFor="problem-search" className="sr-only">
        Search problems
      </label>
      <input
        ref={inputRef}
        id="problem-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by title or bug class"
        className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-heading placeholder:text-subtle focus:outline-none"
      />
    </div>
  );
}
