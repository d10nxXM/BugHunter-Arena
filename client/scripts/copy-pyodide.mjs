// Copies the Pyodide core files from node_modules/pyodide to public/pyodide/
// so the test-runner worker can load Python without a CDN.
// Runs on predev and prebuild. Uses node:fs and node:path only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(clientDir, 'node_modules', 'pyodide');
const targetDir = path.join(clientDir, 'public', 'pyodide');
const markerFile = path.join(targetDir, '.pyodide-version');

// Pyodide 0.28+ ships the Emscripten loader as pyodide.asm.mjs (older releases used pyodide.asm.js).
const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

function fail(message) {
  console.error(`[pyodide:copy] ${message}`);
  process.exit(1);
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return -1;
  }
}

let version;
try {
  version = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8')).version;
} catch {
  fail(`Pyodide package not found in ${sourceDir}. Run "npm install" in client/ first.`);
}

const missing = FILES.filter((file) => sizeOf(path.join(sourceDir, file)) <= 0);
if (missing.length > 0) {
  fail(`Pyodide ${version} is missing files: ${missing.join(', ')}.`);
}

function readMarker() {
  try {
    return fs.readFileSync(markerFile, 'utf8').trim();
  } catch {
    return null;
  }
}

// Up to date only when the marker matches and every copied file has the source's (non-zero) size.
const upToDate =
  readMarker() === version &&
  FILES.every((file) => {
    const size = sizeOf(path.join(sourceDir, file));
    return size > 0 && sizeOf(path.join(targetDir, file)) === size;
  });

if (upToDate) {
  console.log(`[pyodide:copy] public/pyodide/ is up to date (pyodide ${version}).`);
  process.exit(0);
}

// Drop the marker first, so an interrupted copy is never reported as up to date.
try {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.rmSync(markerFile, { force: true });
} catch (error) {
  fail(`Cannot prepare ${targetDir}: ${error.message}`);
}

for (const file of FILES) {
  try {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  } catch (error) {
    fail(`Copying ${file} failed: ${error.message}`);
  }
}

try {
  fs.writeFileSync(markerFile, `${version}\n`);
} catch (error) {
  fail(`Writing the version marker failed: ${error.message}`);
}
console.log(
  `[pyodide:copy] Copied ${FILES.length} files of pyodide ${version} to public/pyodide/.`,
);
