import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd: root, encoding: 'utf8', timeout: 90000,
  env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
});
test('Chromium suggests a provisional draft, approve writes only chosen rules', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-suggest-'));
  try {
    const draftFile = path.join(dir, 'draft.json');
    const specFile = path.join(dir, 'accepted.json');
    const proposed = run(['suggest', '--url', 'examples/healthy.html', '--widths', '375,1280',
      '--out', draftFile, '--json']);
    if (/Cannot find Chrome\/Chromium/.test(proposed.stdout + proposed.stderr)) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required');
      t.skip('Chromium unavailable'); return;
    }
    assert.equal(proposed.status, 0, proposed.stderr || proposed.stdout);
    const draft = JSON.parse(readFileSync(draftFile, 'utf8'));
    assert.ok(draft.proposals.length >= 2);
    assert.ok(draft.proposals.length <= 16);
    assert.ok(draft.proposals.every(p => p.reviewRequired));
    assert.equal(draft.proposals[0].id, 'document-horizontal-fit');
    const accept = run(['approve', '--draft', draftFile, '--accept', 'document-horizontal-fit',
      '--out', specFile]);
    assert.equal(accept.status, 0, accept.stderr || accept.stdout);
    const accepted = JSON.parse(readFileSync(specFile, 'utf8'));
    assert.equal(accepted.rules.length, 1);
    assert.deepEqual(accepted.selectors, {});
    assert.equal(run(['validate', '--spec', specFile]).status, 0);
    assert.equal(run(['approve', '--draft', draftFile, '--accept', 'nonexistent',
      '--out', path.join(dir, 'bad.json')]).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
