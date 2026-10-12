import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 40000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
});
function chromeUnavailable(t, result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr ?? '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required for CI');
    t.skip('Chromium unavailable'); return true;
  }
  return false;
}
test('open shadow selectors work identically for readiness, wait, click, fill, scroll and geometry', t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'bronto-shadow-actions-'));
  try {
    const spec = {
      schemaVersion: 1, url: path.resolve(cwd, 'examples/shadow-actions.html'), widths: [375],
      selectors: { subject: '#host >>> .subject' },
      actions: [
        { type: 'wait-for', selector: '#host >>> button' },
        { type: 'click', selector: '#host >>> #change' },
        { type: 'fill', selector: '#host >>> #value', value: 'expand' },
        { type: 'scroll-into-view', selector: '#host >>> .subject' }
      ],
      rules: [{ id: 'expected-width', type: 'size-range', element: 'subject', axis: 'width', min: 160, max: 160 }]
    };
    const specPath = path.join(temp, 'shadow-contract.json');
    writeFileSync(specPath, JSON.stringify(spec));
    const result = run(['check', '--spec', specPath, '--ready-selector', '#host >>> .subject', '--json']);
    if (chromeUnavailable(t, result)) return;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.reports[0].summary.passed, 1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('invalid composed action selectors return an error rather than pretending a check passed', t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'bronto-shadow-invalid-'));
  try {
    const specPath = path.join(temp, 'bad.json');
    writeFileSync(specPath, JSON.stringify({schemaVersion:1,url:path.resolve(cwd,'examples/shadow-actions.html'),
      widths:[375],selectors:{subject:'#host >>> .subject'},
      actions:[{type:'click',selector:'#host >>>'}],
      rules:[{id:'exists',type:'selector-count',element:'subject',exactly:1}]}));
    const result=run(['check','--spec',specPath,'--json']);
    if (chromeUnavailable(t, result)) return;
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(JSON.parse(result.stdout).error.message, /Invalid deep selector/);
  } finally {rmSync(temp, {recursive:true,force:true});}
});
