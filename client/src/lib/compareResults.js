/**
 * Compares a test's actual result with its expected result as JSON values (docs/SCORING.md):
 * - `null` equals only `null` (Python `None` arrives as `null`).
 * - Numbers compare by value (`1 == 1.0`), and only finite numbers match.
 * - Booleans equal only booleans (`true != 1`). Strings compare by value.
 * - Arrays compare element by element, in order. Plain objects need the same keys, in any order.
 * - NaN, Infinity, `undefined`, sets, maps, dates, functions and other non-JSON values never match.
 *
 * Pure function, no side effects.
 */
const MAX_DEPTH = 200;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function equal(a, b, depth) {
  if (depth > MAX_DEPTH) return false;

  if (a === null || b === null) return a === null && b === null;

  if (typeof a === 'number' || typeof b === 'number') {
    return (
      typeof a === 'number' &&
      typeof b === 'number' &&
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      a === b
    );
  }

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return typeof a === 'boolean' && typeof b === 'boolean' && a === b;
  }

  if (typeof a === 'string' || typeof b === 'string') {
    return typeof a === 'string' && typeof b === 'string' && a === b;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!equal(a[i], b[i], depth + 1)) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.hasOwn(b, key)) return false;
      if (!equal(a[key], b[key], depth + 1)) return false;
    }
    return true;
  }

  // undefined, bigint, symbol, function, Set, Map, Date, class instances: not JSON values.
  return false;
}

export function compareResults(actual, expected) {
  return equal(actual, expected, 0);
}

export default compareResults;
