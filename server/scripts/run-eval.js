// Evaluation set for the AI mentor: npm run eval [-- --runs 3]
// Calls the real LLM through aiService (costs money, not part of npm test).
// Prints a table and exits 1 on any miss, 2 when the LLM is not configured.
// Never prints the key, the URL or the prompt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../src/lib/config.js';
import { evaluateAnswer } from '../src/services/aiService.js';

const EVAL_PATH = fileURLToPath(
  new URL('../eval/explanations.json', import.meta.url),
);
const CHALLENGES_DIR = new URL('../data/challenges/', import.meta.url);

function parseRuns(argv) {
  const index = argv.indexOf('--runs');
  const value = index === -1 ? 3 : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--runs needs a positive integer');
  }
  return value;
}

/** Why a result misses the expected values, or null if it passes. */
function checkResult(result, expected) {
  const q = result.explanation_quality;
  if (q < expected.minQuality || q > expected.maxQuality) {
    return `quality ${q} outside ${expected.minQuality}-${expected.maxQuality}`;
  }
  for (const flag of ['is_correct', 'needs_clarification']) {
    if (flag in expected && result[flag] !== expected[flag]) {
      return `${flag} is ${result[flag]}`;
    }
  }
  return null;
}

async function runCase(testCase, challenge, testSummary) {
  try {
    const result = await evaluateAnswer({
      challenge,
      answer: { explanation: testCase.explanation },
      testSummary,
    });
    const miss = checkResult(result, testCase.expected);
    return { score: result.explanation_quality, miss };
  } catch (err) {
    const status = Number.isInteger(err?.status) ? ` ${err.status}` : '';
    return {
      score: 'ERR',
      miss: `call failed (${err?.kind ?? err?.name}${status})`,
    };
  }
}

async function main() {
  if (config.aiStatus !== 'available') {
    console.error(
      'LLM is not available (set LLM_API_KEY, LLM_API_URL, LLM_MODEL and DEMO_MODE=false in server/.env).',
    );
    return 2;
  }
  const runs = parseRuns(process.argv.slice(2));
  const set = JSON.parse(readFileSync(EVAL_PATH, 'utf8'));
  const challenge = JSON.parse(
    readFileSync(new URL(`${set.challengeId}.json`, CHALLENGES_DIR), 'utf8'),
  );

  console.log(`model: ${config.llmModel}, runs per case: ${runs}`);
  console.log('case | expected | scores | result');
  let failures = 0;
  for (const testCase of set.cases) {
    const scores = [];
    const misses = [];
    for (let i = 0; i < runs; i += 1) {
      const { score, miss } = await runCase(
        testCase,
        challenge,
        set.testSummary,
      );
      scores.push(score);
      if (miss) misses.push(miss);
    }
    const e = testCase.expected;
    const extra = ['is_correct', 'needs_clarification']
      .filter((k) => k in e)
      .map((k) => `${k}=${e[k]}`)
      .join(' ');
    const status = misses.length === 0 ? 'PASS' : `FAIL (${misses[0]})`;
    if (misses.length > 0) failures += 1;
    console.log(
      `${testCase.id} | ${e.minQuality}-${e.maxQuality} ${extra} | ${scores.join(', ')} | ${status}`,
    );
  }
  console.log(failures === 0 ? 'ALL PASS' : `${failures} case(s) failed`);
  return failures === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (err) {
  // Name only: the message could echo configuration.
  console.error(`eval crashed (${err?.name ?? 'Error'})`);
  process.exitCode = 3;
}
