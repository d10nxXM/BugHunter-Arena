// Runs the whole suite N times in a row (default 5), each time with fresh servers.
// Playwright's --repeat-each keeps one server for all repeats, and the API's rate limiter
// (100 requests per 10 minutes per IP) would then return 429 after about two full runs.
import { spawnSync } from 'node:child_process';

const times = Number(process.argv[2] ?? 5);
const extra = process.argv.slice(3);
let failed = 0;
for (let i = 1; i <= times; i += 1) {
  console.log(`\n=== run ${i} of ${times} ===`);
  const result = spawnSync('npx', ['playwright', 'test', '--reporter=list', ...extra], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) failed += 1;
}
console.log(`\n${times - failed} of ${times} runs passed`);
process.exit(failed === 0 ? 0 : 1);
