import { describe, expect, it } from 'vitest';
import { compareResults } from './compareResults.js';

describe('compareResults', () => {
  it.each([
    ['null equals null (Python None)', null, null],
    ['equal integers', 5, 5],
    ['integer equals float of the same value', 1, 1.0],
    ['negative numbers', -3, -3],
    ['zero and negative zero', 0, -0],
    ['equal strings', 'abc', 'abc'],
    ['empty string', '', ''],
    ['true', true, true],
    ['false', false, false],
    ['equal lists', [1, 2, 3], [1, 2, 3]],
    ['empty lists', [], []],
    ['nested lists', [[1], [2, [3, null]]], [[1], [2, [3, null]]]],
    ['objects with keys in another order', { a: 1, b: [2] }, { b: [2], a: 1 }],
    ['empty objects', {}, {}],
    ['objects with a null prototype', Object.assign(Object.create(null), { a: 1 }), { a: 1 }],
  ])('%s match', (_name, actual, expected) => {
    expect(compareResults(actual, expected)).toBe(true);
  });

  it.each([
    ['different numbers', 0, -3],
    ['wrong result for find-max on negatives', 0, -3],
    ['0 where null expected (find-max on [])', 0, null],
    ['null where 0 expected', null, 0],
    ['true and 1', true, 1],
    ['1 and true', 1, true],
    ['false and 0', false, 0],
    ['false and null', false, null],
    ['number and numeric string', 1, '1'],
    ['different strings', 'a', 'A'],
    ['lists in another order', [1, 2], [2, 1]],
    ['lists of different lengths', [1, 2], [1, 2, 3]],
    ['list and object', [], {}],
    ['object with an extra key', { a: 1, b: 2 }, { a: 1 }],
    ['object with a missing key', { a: 1 }, { a: 1, b: 2 }],
    ['object with an undefined value and a missing key', { a: 1, b: undefined }, { a: 1, c: 2 }],
    ['NaN and NaN', NaN, NaN],
    ['Infinity and Infinity', Infinity, Infinity],
    ['-Infinity and -Infinity', -Infinity, -Infinity],
    ['undefined and undefined', undefined, undefined],
    ['undefined and null', undefined, null],
    ['sets', new Set([1]), new Set([1])],
    ['maps', new Map([['a', 1]]), new Map([['a', 1]])],
    ['dates', new Date(0), new Date(0)],
    ['bigint and number', 1n, 1],
    ['functions', () => 1, () => 1],
    ['class instances', new (class A {})(), {}],
    ['nested NaN', [1, NaN], [1, NaN]],
  ])('%s do not match', (_name, actual, expected) => {
    expect(compareResults(actual, expected)).toBe(false);
  });

  it('does not loop forever on circular data', () => {
    const a = [];
    a.push(a);
    const b = [];
    b.push(b);
    expect(compareResults(a, b)).toBe(false);
  });
});
