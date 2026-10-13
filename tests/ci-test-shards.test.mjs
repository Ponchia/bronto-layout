import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan } from '../scripts/ci-test-shards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CI sharding includes each current test file once with no omissions', () => {
  const real = readdirSync(path.join(root, 'tests'))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => 'tests/' + name).sort();
  const plan = buildPlan(2);
  assert.equal(plan.totalFiles, real.length);
  assert.deepEqual(plan.shards.flatMap(s => s.files).sort(), real);
  assert.ok(plan.shards.every(s => s.files.length > 0 && s.weight > 0));
  assert.equal(new Set(plan.shards.flatMap(s => s.files)).size, real.length);
  assert.deepEqual(buildPlan(2), plan, 'Partition must remain deterministic');
});

test('CI shard count validation cannot silently omit or duplicate a test', () => {
  assert.throws(() => buildPlan(0), /Shard count/);
  assert.throws(() => buildPlan(999), /Shard count/);
  for (const count of [1, 2, 3, 4]) {
    const plan = buildPlan(count);
    assert.equal(plan.shards.length, count);
    assert.equal(plan.shards.flatMap(s => s.files).length, plan.totalFiles);
  }
});

test('both supported Node versions run each half, with separate lint, package and benchmarks', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /node: \[22, 24\]/);
  assert.match(workflow, /shard: \[1, 2\]/);
  assert.match(workflow, /scripts\/ci-test-shards\.mjs --shard/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run coverage:unit/);
  assert.match(workflow, /npm run benchmark:audit:locations/);
  assert.match(workflow, /npm run test:package/);
});
