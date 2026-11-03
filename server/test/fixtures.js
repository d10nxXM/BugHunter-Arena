import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CHALLENGES_DIR = fileURLToPath(
  new URL('../data/challenges', import.meta.url),
);

const FIND_MAX_PATH = fileURLToPath(
  new URL('../data/challenges/find-max.json', import.meta.url),
);

/** The challenge file exactly as stored on disk. */
export function loadFindMaxFile() {
  return JSON.parse(readFileSync(FIND_MAX_PATH, 'utf8'));
}

/** The file plus the columns Postgres adds. This is what a full-row select returns. */
export function loadFindMaxRow() {
  return { ...loadFindMaxFile(), created_at: '2025-01-01T00:00:00Z' };
}

/** Copied from docs/API.md, GET /api/challenges. */
export const API_LIST_EXAMPLE = [
  {
    id: 'find-max',
    title: 'Najveći element liste',
    language: 'python',
    difficulty: 'lako',
    bugCategory: 'Pogrešna inicijalizacija',
  },
];

/** Copied from docs/API.md, GET /api/challenges/:id. */
export const API_DETAIL_EXAMPLE = {
  id: 'find-max',
  title: 'Najveći element liste',
  description:
    'Funkcija find_max vraća najveći broj iz liste. Za praznu listu vraća None.',
  language: 'python',
  difficulty: 'lako',
  bugCategory: 'Pogrešna inicijalizacija',
  functionName: 'find_max',
  code: 'def find_max(numbers):\n    max_value = 0\n    for number in numbers:\n        if number > max_value:\n            max_value = number\n    return max_value',
  visibleTests: [
    { id: 't1', args: [[2, 5, 1]], expected: 5 },
    { id: 't2', args: [[7]], expected: 7 },
  ],
  hintCount: 3,
};

/** Columns that must never be selected by a public query. */
export const HIDDEN_COLUMNS = [
  'reference_solution',
  'bug_lines',
  'related_lines',
  'bug_description',
  'hints_json',
  'keywords_json',
  'fallback_feedback',
];

/** Key names that must never appear anywhere in a public response (snake and camel case). */
export const HIDDEN_KEYS = [
  'reference_solution',
  'referenceSolution',
  'bug_lines',
  'bugLines',
  'related_lines',
  'relatedLines',
  'bug_description',
  'bugDescription',
  'keywords_json',
  'keywordsJson',
  'keywords',
  'hints_json',
  'hintsJson',
  'hints',
  'fallback_feedback',
  'fallbackFeedback',
  'tests_json',
  'testsJson',
  'failsOnOriginal',
  'fails_on_original',
  'visible',
  'tests',
];

export function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

export function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((child) => collectStrings(child, out));
  }
  return out;
}

/** Hidden string values taken from a challenge row. */
export function hiddenValues(row) {
  return [
    row.reference_solution,
    row.bug_description,
    row.fallback_feedback,
    ...row.hints_json,
    // Keyword stems that never appear in public fields. 'inicijaliz' is
    // excluded on purpose: the public bugCategory is "Pogrešna inicijalizacija".
    'prvi element',
  ];
}

/**
 * Asserts nothing hidden is in a parsed body or its raw text.
 * Takes `expect` so the failure points at the calling test.
 */
export function expectNoLeak(expect, res, row) {
  const keys = collectKeys(res.body);
  for (const hidden of HIDDEN_KEYS) {
    expect(keys.has(hidden), `key "${hidden}" leaked`).toBe(false);
  }

  const strings = collectStrings(res.body);
  const compact = res.text.replace(/\s/g, '');
  for (const value of hiddenValues(row)) {
    expect(strings, `value leaked: ${value}`).not.toContain(value);
    expect(res.text, `value leaked in text: ${value}`).not.toContain(
      JSON.stringify(value).slice(1, -1),
    );
  }
  expect(res.text).not.toContain('"t3"');
  expect(res.text).not.toContain('"t4"');
  expect(compact).not.toContain('[-8,-3,-10]');
  expect(compact).not.toContain('failsOnOriginal');
}
