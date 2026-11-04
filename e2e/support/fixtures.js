import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

const challenge = JSON.parse(
  readFileSync(new URL('../../server/data/challenges/find-max.json', import.meta.url), 'utf8'),
);

// Keys that must never reach the browser before POST /api/attempts has locked the attempt
// (CLAUDE.md hard rule 3), in snake_case and camelCase.
const FORBIDDEN_KEYS = [
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
  'hints_json',
  'hintsJson',
  'fallback_feedback',
  'fallbackFeedback',
  'failsOnOriginal',
];

const hiddenTestIds = challenge.tests_json.filter((t) => !t.visible).map((t) => t.id);

/** Fragments of text that only exist in server-side secrets. */
const SECRET_TEXTS = [
  'numbers[1:]', // reference solution
  challenge.bug_description.slice(0, 30),
  challenge.fallback_feedback.slice(0, 30),
];

export const HINTS = challenge.hints_json;

function isApi(url) {
  return new URL(url).pathname.startsWith('/api/');
}

/**
 * Records every request and API response of a test. At teardown (all journeys) it asserts:
 *   - no request leaves the app origin (no CDN: jsdelivr, unpkg, ...),
 *   - everything Pyodide-related comes from the app origin under /pyodide/,
 *   - no API response before the first POST /api/attempts response holds a secret or a hidden test,
 *   - a hint response holds exactly the requested level and no other written hint.
 * Tests can read `net.apiCalls` (ordered by response) to make their own assertions.
 */
export const test = base.extend({
  net: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL).origin;
      const external = [];
      const pyodideRequests = [];
      const apiCalls = [];
      const pending = [];

      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return;
        if (new URL(url).origin !== origin) external.push(url);
        if (/pyodide/i.test(new URL(url).pathname) || /\.wasm(\?|$)/.test(url)) {
          pyodideRequests.push(url);
        }
      });

      page.on('response', (response) => {
        const request = response.request();
        if (!isApi(response.url())) return;
        const call = {
          method: request.method(),
          path: new URL(response.url()).pathname,
          status: response.status(),
          requestBody: request.postData(),
          body: null,
        };
        apiCalls.push(call);
        pending.push(
          response
            .text()
            .then((text) => {
              call.body = text;
            })
            .catch(() => {
              call.body = '';
            }),
        );
      });

      const net = { apiCalls, external, pyodideRequests };
      await use(net);

      await Promise.allSettled(pending);
      expect(external, 'requests to other origins (CDN?)').toEqual([]);
      for (const url of pyodideRequests) {
        expect(new URL(url).pathname, 'Pyodide files must come from /pyodide/').toMatch(
          /^\/pyodide\//,
        );
      }
      assertNoLeakBeforeAttempt(apiCalls);
    },
    { auto: true },
  ],
});

export { expect };

/** Responses before the first POST /api/attempts must contain no secret and no hidden test. */
export function assertNoLeakBeforeAttempt(apiCalls) {
  const firstAttempt = apiCalls.findIndex((c) => c.method === 'POST' && c.path === '/api/attempts');
  const before = firstAttempt === -1 ? apiCalls : apiCalls.slice(0, firstAttempt);
  for (const call of before) {
    const label = `${call.method} ${call.path}`;
    const body = call.body ?? '';
    for (const key of FORBIDDEN_KEYS) {
      expect(body, `${label} must not contain "${key}"`).not.toContain(`"${key}"`);
    }
    for (const id of hiddenTestIds) {
      expect(body, `${label} must not contain hidden test "${id}"`).not.toContain(`"${id}"`);
    }
    expect(body, `${label} must not contain a visible:false test`).not.toMatch(
      /"visible"\s*:\s*false/,
    );
    for (const text of SECRET_TEXTS) {
      expect(body, `${label} must not contain secret text`).not.toContain(text);
    }
    if (call.path === '/api/challenges/find-max' && call.method === 'GET') {
      const data = JSON.parse(body);
      expect(data.visibleTests.map((t) => t.id)).toEqual(['t1', 't2']);
    }
    if (call.method === 'POST' && call.path.endsWith('/hints')) {
      const level = JSON.parse(call.requestBody).level;
      const data = JSON.parse(body);
      expect(data.level, `${label} level`).toBe(level);
      HINTS.forEach((text, index) => {
        if (index + 1 !== level) expect(body).not.toContain(text);
      });
    }
  }
}
