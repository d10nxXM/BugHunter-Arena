import { languageLabel } from '../../lib/labels.js';
import ProgressBar from '../ui/ProgressBar.jsx';

/** Solved challenges per language, bars relative to the strongest language. */
export default function SolvedByLanguage({ languages }) {
  const list = (Array.isArray(languages) ? languages : []).filter((l) => l?.solved > 0);
  const max = Math.max(1, ...list.map((l) => l.solved));
  return (
    <section
      aria-labelledby="languages-heading"
      className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-surface p-6"
    >
      <h2 id="languages-heading" className="font-display text-[19px] font-semibold text-heading">
        Solved by language
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Nothing solved yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((item) => {
            const name = languageLabel(item.language);
            return (
              <li key={item.language} className="flex items-center gap-3">
                <span className="w-24 font-mono text-[13px] text-text">{name}</span>
                <ProgressBar
                  value={item.solved}
                  max={max}
                  label={name}
                  valueText={`${item.solved} solved`}
                  className="h-2 flex-1"
                />
                <span className="w-7 text-right font-mono text-[13px] text-subtle">
                  {item.solved}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
