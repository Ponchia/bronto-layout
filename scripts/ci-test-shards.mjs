#!/usr/bin/env node
/**
 * Repeatable CI test partitioning across independent runners.
 * All test files are included exactly once per Node version. Shards avoid
 * competing Chromium processes on one runner and preserve --test-concurrency=1.
 * This controls scheduling, NOT test selection or coverage expectations.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserFiles = new Set([
  'breakpoints.test.mjs', 'field-benchmark.test.mjs',
  'field-review-console.test.mjs', 'modern-web.test.mjs',
  'uniform-gaps.test.mjs'
]);

function testWeight(name) {
  const source = readFileSync(path.join(root, 'tests', name), 'utf8');
  // Conservative balancing estimate; every file is executed regardless.
  const numberOfTests = Math.max(1, (source.match(/\btest\s*\(/g) ?? []).length);
  const browserHeavy = name.startsWith('cli-') || name === 'cli.test.mjs' ||
    browserFiles.has(name);
  return numberOfTests * (browserHeavy ? 10 : 1);
}

export function buildPlan(shardCount = 2) {
  if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 8) {
    throw new Error('Shard count must be an integer in 1..8');
  }
  const names = readdirSync(path.join(root, 'tests'))
    .filter(name => name.endsWith('.test.mjs')).sort();
  if (names.length < shardCount) throw new Error('More shards than test files');
  const tests = names.map(name => ({name, weight: testWeight(name)}))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  const shards = Array.from({ length: shardCount },
    (_, i) => ({index: i + 1, weight: 0, files: []}));
  for (const testFile of tests) {
    // Deterministic greedy balance, with stable tie-breaking.
    const target = [...shards].sort((a, b) =>
      a.weight - b.weight || a.files.length - b.files.length || a.index - b.index)[0];
    target.files.push('tests/' + testFile.name);
    target.weight += testFile.weight;
  }
  for (const bucket of shards) bucket.files.sort();
  const flattened = shards.flatMap(s => s.files);
  if (flattened.length !== names.length || new Set(flattened).size !== names.length) {
    throw new Error('Test shard coverage missing or duplicated');
  }
  return {version: 1, totalFiles: names.length, shards};
}

function main() {
  const args = process.argv.slice(2);
  const isPlan = args.length === 1 && args[0] === '--plan';
  const isShard = args.length === 2 && args[0] === '--shard';
  if (!isPlan && !isShard) {
    throw new Error('Usage: node scripts/ci-test-shards.mjs --plan | --shard 1/2');
  }
  if (isPlan) {
    process.stdout.write(JSON.stringify(buildPlan(), null, 2) + '\n');
    return;
  }
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(args[1]);
  if (!match) throw new Error('Invalid shard argument, expected INDEX/COUNT');
  const index = Number(match[1]), count = Number(match[2]);
  const plan = buildPlan(count);
  if (index > count) throw new Error('Shard index exceeds count');
  const selected = plan.shards[index - 1];
  process.stdout.write('Bronto CI shard ' + index + '/' + count + ': ' +
    selected.files.length + '/' + plan.totalFiles +
    ' test files; estimated weight ' + selected.weight + '\n');
  const result = spawnSync(process.execPath,
    ['--test', '--test-concurrency=1', ...selected.files], {
      cwd: root, stdio: 'inherit', env: process.env, timeout: 12 * 60 * 1000
    });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
