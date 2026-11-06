import { normalizeDifficulty } from '../../lib/labels.js';

/** Value of the "All" option in the category and difficulty filters. */
export const ALL = 'all';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Distinct, non-empty bug categories in the list, sorted alphabetically. */
export function categoriesOf(challenges) {
  const set = new Set();
  for (const c of challenges ?? []) {
    if (typeof c?.bugCategory === 'string' && c.bugCategory.trim() !== '') {
      set.add(c.bugCategory);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Challenges matching every filter. `query` matches the title or the bug category,
 * case-insensitively; an empty query matches everything.
 */
export function filterChallenges(challenges, { category = ALL, difficulty = ALL, query = '' }) {
  const needle = query.trim().toLowerCase();
  return (challenges ?? []).filter((c) => {
    if (category !== ALL && c.bugCategory !== category) return false;
    if (difficulty !== ALL && normalizeDifficulty(c.difficulty) !== difficulty) return false;
    if (needle === '') return true;
    const title = typeof c.title === 'string' ? c.title.toLowerCase() : '';
    const cat = typeof c.bugCategory === 'string' ? c.bugCategory.toLowerCase() : '';
    return title.includes(needle) || cat.includes(needle);
  });
}
