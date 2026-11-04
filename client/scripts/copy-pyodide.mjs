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

let version;
try {
  version = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8')).version;
} catch {
  fail(`Pyodide package not found in ${sourceDir}. Run "npm install" in client/ first.`);
}

const missing = FILES.filter((file) => !fs.existsSync(path.join(sourceDir, file)));
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

const upToDate =
  readMarker() === version && FILES.every((file) => fs.existsSync(path.join(targetDir, file)));

if (upToDate) {
  console.log(`[pyodide:copy] public/pyodide/ is up to date (pyodide ${version}).`);
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}
fs.writeFileSync(markerFile, `${version}\n`);
console.log(
  `[pyodide:copy] Copied ${FILES.length} files of pyodide ${version} to public/pyodide/.`,
);
