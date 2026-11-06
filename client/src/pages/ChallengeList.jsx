import { useEffect, useMemo, useRef, useState } from 'react';
import { getChallenges } from '../api/client.js';
import {
  CategoryChips,
  DifficultyFilter,
  SearchField,
} from '../components/problems/ProblemFilters.jsx';
import ProblemsTable from '../components/problems/ProblemsTable.jsx';
import ProgressAside from '../components/problems/ProgressAside.jsx';
import { ALL, categoriesOf, filterChallenges } from '../components/problems/filters.js';
import Button from '../components/ui/Button.jsx';
import { useChallengeStatuses } from '../hooks/useChallengeStatuses.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

const LOAD_ERROR = 'The problems could not be loaded.';

/** The /problems page: filterable list of challenges plus the user's progress. */
export default function ChallengeList() {
  usePageTitle('Problems');
  const [reloadCount, setReloadCount] = useState(0);
  const [load, setLoad] = useState({ key: null });
  const [category, setCategory] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const progress = useChallengeStatuses();

  useEffect(() => {
    const controller = new AbortController();
    getChallenges({ signal: controller.signal })
      .then((challenges) => {
        if (!Array.isArray(challenges)) {
          setLoad({ key: reloadCount, status: 'error', message: LOAD_ERROR });
          return;
        }
        setLoad({ key: reloadCount, status: 'ready', challenges });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoad({ key: reloadCount, status: 'error', message: error?.message || LOAD_ERROR });
      });
    return () => controller.abort();
  }, [reloadCount]);

  const current = load.key === reloadCount ? load : { status: 'loading' };
  const challenges = current.status === 'ready' ? current.challenges : null;

  const categories = useMemo(() => categoriesOf(challenges), [challenges]);
  // A category from an older list that no longer exists falls back to "All".
  const activeCategory = category === ALL || categories.includes(category) ? category : ALL;

  const rows = useMemo(() => {
    if (!challenges) return [];
    const numbered = challenges.map((challenge, i) => ({ challenge, number: i + 1 }));
    const visible = new Set(
      filterChallenges(challenges, { category: activeCategory, difficulty, query }),
    );
    return numbered.filter((r) => visible.has(r.challenge));
  }, [challenges, activeCategory, difficulty, query]);

  function resetFilters() {
    setCategory(ALL);
    setDifficulty(ALL);
    setQuery('');
    // The reset button disappears with the empty state; keep focus near the filters.
    searchRef.current?.focus();
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[13px] text-subtle">$ ls ./problems</p>
          <h1
            tabIndex={-1}
            className="font-display text-[34px] font-bold tracking-tight text-heading focus:outline-none"
          >
            Problems
          </h1>
        </div>

        {current.status === 'loading' && (
          <p role="status" className="text-muted">
            Loading problems…
          </p>
        )}

        {current.status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-[14px] border border-hard-soft bg-hard-soft px-4 py-3 text-hard"
          >
            <p>
              <span aria-hidden="true">⚠ </span>
              {current.message}
            </p>
            <Button variant="secondary" size="sm" onClick={() => setReloadCount((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}

        {challenges && challenges.length === 0 && (
          <p className="text-muted">There are no problems yet.</p>
        )}

        {challenges && challenges.length > 0 && (
          <>
            <CategoryChips categories={categories} value={activeCategory} onChange={setCategory} />
            <div className="flex flex-wrap items-center gap-3">
              <SearchField value={query} onChange={setQuery} inputRef={searchRef} />
              <DifficultyFilter value={difficulty} onChange={setDifficulty} />
            </div>

            <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
              {rows.length > 0 ? (
                <ProblemsTable rows={rows} progressById={progress.byId} />
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-[15px] text-subtle">
                  <p>No problems match these filters. Try another bug class or difficulty.</p>
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filters
                  </Button>
                </div>
              )}
            </div>
            <p role="status" className="text-sm text-subtle">
              Showing {rows.length} {rows.length === 1 ? 'problem' : 'problems'}
            </p>
          </>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <ProgressAside challenges={challenges} progress={progress} />
      </aside>
    </div>
  );
}
