import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
const codeql = read('codeql.yml');
const review = read('dependency-review.yml');

function assertUnprivilegedSource(workflow) {
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /pull_request_target:|workflow_run:|secrets\.|secrets: inherit|write-all|contents: write|id-token: write|packages: write/);
  assert.doesNotMatch(workflow, /^\s+(?:-\s+)?(?:run|continue-on-error|paths|paths-ignore|branches-ignore):/m);
  for (const line of workflow.split('\n').filter((line) => /\buses:/.test(line))) {
    assert.match(line, /uses: [A-Za-z0-9_./-]+@[a-f0-9]{40}(?:\s|$)/, line);
  }
}

test('source and workflow scans are scheduled, bounded and cannot execute package install hooks', () => {
  assertUnprivilegedSource(codeql);
  assert.match(codeql, /pull_request:\n {4}branches: \[main\]/);
  assert.match(codeql, /push:\n {4}branches: \[main\]/);
  assert.match(codeql, /schedule:\n {4}- cron:/);
  assert.match(codeql, /language: \[javascript-typescript, actions\]/);
  assert.match(codeql, /build-mode: none/);
  assert.match(codeql, /timeout-minutes: 20/);
  assert.match(codeql, /security-events: write/);
  assert.match(codeql, /codeql-action\/analyze@[a-f0-9]{40}/);
  assert.match(codeql, /category: \/language:\$\{\{ matrix.language \}\}/);
});

test('dependency review covers every PR and fails on high/critical changes without scope exemptions', () => {
  assertUnprivilegedSource(review);
  assert.match(review, /pull_request:\n {4}branches: \[main\]/);
  assert.match(review, /name: Review dependency changes/);
  assert.match(review, /timeout-minutes: 10/);
  assert.match(review, /dependency-review-action@[a-f0-9]{40}/);
  assert.match(review, /fail-on-severity: high/);
  assert.match(review, /warn-only: false/);
  assert.doesNotMatch(review, /allow-ghsas|deny-packages|allow-dependencies-licenses|fail-on-scopes|security-events: write/);
});

test('security workflow credentials and permission regressions fail the contract', () => {
  assert.throws(() => assertUnprivilegedSource(review.replace('contents: read', 'contents: write')));
  assert.throws(() => assertUnprivilegedSource(review.replace('pull_request:', 'pull_request_target:')));
  assert.throws(() => assertUnprivilegedSource(`${review}\n      - run: npm ci\n`));
  assert.throws(() => assertUnprivilegedSource(review.replace(/@a1d282b36b6f3519aa1f3fc636f609c47dddb294/, '@v5')));
});
