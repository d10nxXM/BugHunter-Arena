import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The app must work offline: Pyodide and Monaco load from local files, never a CDN.
// Hostnames are built from parts so this file does not match itself.
const CDN_PATTERN = new RegExp(['jsdel' + 'ivr', 'un' + 'pkg', 'cdn' + 'js'].join('|'), 'i');

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function offenders(dir) {
  return filesUnder(dir)
    .filter((file) => CDN_PATTERN.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(clientDir, file));
}

describe('no CDN references', () => {
  it('client/src does not reference a public CDN', () => {
    expect(filesUnder(path.join(clientDir, 'src')).length).toBeGreaterThan(0);
    expect(offenders(path.join(clientDir, 'src'))).toEqual([]);
  });

  // dist/ exists only after `npm run build`; then its assets must be clean too.
  it('client/dist/assets (when built) does not reference a public CDN', () => {
    expect(offenders(path.join(clientDir, 'dist', 'assets'))).toEqual([]);
  });
});
