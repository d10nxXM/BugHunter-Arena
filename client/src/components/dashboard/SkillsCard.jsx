import Card from '../ui/Card.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';

/**
 * "Skills by bug class": solved challenges per category, from skillsByCategory()
 * (src/lib/dashboard.js). Categories with misses get a "practice" note.
 */
export default function SkillsCard({ skills }) {
  return (
    <Card as="section" aria-labelledby="skills-heading" className="flex flex-col gap-4 p-6">
      <h2 id="skills-heading" className="font-display text-[19px] font-semibold text-heading">
        Skills by bug class
      </h2>
      {skills.length === 0 ? (
        <p className="text-sm text-muted">No bug classes yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {skills.map((s) => (
            <li key={s.category} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-text">{s.category}</span>
                <span className="shrink-0 font-mono text-subtle">
                  {s.solved} / {s.total}
                </span>
              </div>
              <ProgressBar
                value={s.solved}
                max={s.total}
                label={s.category}
                valueText={`${s.solved} of ${s.total} solved`}
              />
              {s.misses > 0 && (
                <p className="text-xs text-amber">
                  <span aria-hidden="true">⚑ </span>
                  {s.misses} {s.misses === 1 ? 'miss' : 'misses'}: worth practising
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
