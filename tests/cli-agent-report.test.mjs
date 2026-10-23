import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, linkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function unavailable(result, t) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required on CI');
    t.skip('Chromium not available'); return true;
  }
  return false;
}
test('fatal input errors produce JSON and a failure report, not unparseable stderr', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-cli-agent-error-'));
  try {
    const file = path.join(dir, 'missing', 'error.json');
    const result = run(['check', '--spec', 'not-found.json', '--json', '--report', file]);
    assert.equal(result.status, 2);
    const data = JSON.parse(result.stdout);
    assert.equal(data.mode, 'error');
    assert.equal(data.status, 'error');
    assert.equal(data.exitCode, 2);
    assert.match(data.error.message, /ENOENT/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), data);
  } finally { rmSync(dir, { force: true, recursive: true }); }
});
test('successful CLI reports create parent directories as well as failure reports', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-cli-success-report-'));
  try {
    const file = path.join(dir, 'nested', 'reports', 'validated.json');
    const result = run(['validate', '--spec', 'examples/layout.json', '--json', '--report', file]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(data.mode, 'validate');
    assert.equal(data.valid, true);
    assert.deepEqual(data, JSON.parse(result.stdout));
  } finally { rmSync(dir, { force: true, recursive: true }); }
});
test('compact flag is opt-in and restricted to JSON layout checks', () => {
  const r = run(['validate', '--spec', 'examples/layout.json', '--json', '--compact']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).mode, 'error');
  assert.match(JSON.parse(r.stdout).error.message, /requires --json/);
});
test('CLI emits compact failing widths with real Chromium measurements', t => {
  const result = run(['check', '--spec', 'examples/layout.json', '--url', 'examples/broken.html', '--json', '--compact']);
  if (unavailable(result, t)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.format, 'compact');
  assert.deepEqual(data.sampledWidths, [320, 375, 768, 1280]);
  assert.equal(data.summary.failed, 12);
  assert.equal(data.failures.length, 12);
  assert.equal(data.omittedFailures, 0);
  assert.equal('reports' in data, false);
  assert.ok(data.failures.every(item => Number.isFinite(item.deviation)));
});
test('CLI compare retains existing candidate failures and highlights new regressions', t => {
  const result = run(['compare', '--spec', 'examples/layout.json', '--baseline', 'examples/healthy.html',
    '--url', 'examples/broken.html', '--json', '--compact']);
  if (unavailable(result, t)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.mode, 'compare');
  assert.equal(data.format, 'compact');
  assert.ok(data.summary.regressions > 0);
  assert.ok(data.changes.some(item => item.kind === 'regression'));
  assert.equal(data.remainingFailures.length, data.summary.candidateFailures);
  assert.equal('candidate' in data, false);
});

test('report destinations cannot replace input contracts through direct paths, symlinks or hardlinks',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-report-input-'));
  try {
    const source=path.join(dir,'contract.json');
    const original=JSON.stringify({selectors:{},rules:[{id:'fit',type:'document-overflow'}]});
    writeFileSync(source,original);
    const symlink=path.join(dir,'symlink.json'),hardlink=path.join(dir,'hardlink.json');
    symlinkSync(source,symlink);linkSync(source,hardlink);
    for(const destination of [source,symlink,hardlink]) {
      const result=run(['validate','--spec',source,'--report',destination,'--json']);
      assert.equal(result.status,2,result.stderr||result.stdout);
      assert.match(JSON.parse(result.stdout).error.message,/--report must not overwrite --spec/);
      assert.equal(readFileSync(source,'utf8'),original);
    }
    writeFileSync(source,'{ malformed input');
    for(const extra of [[],['--sarif'],['--unknown-option']]) {
      const result=run(['validate',`--spec=${source}`,`--report=${source}`,'--json',...extra]);
      assert.equal(result.status,2,result.stderr||result.stdout);
      assert.equal(readFileSync(source,'utf8'),'{ malformed input');
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('report paths preserve other explicit inputs and primary generated files before work begins',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-report-other-inputs-'));
  try {
    const source=path.join(dir,'input.json');
    const original='[private fixture input]';
    writeFileSync(source,original);
    const cases=[
      ['batch','--manifest',source],['review-draft','--draft',source],
      ['audit','--url','examples/healthy.html','--actions',source],
      ['audit','--url',source],['audit','--url','examples/healthy.html','--baseline',source]
    ];
    for(const args of cases) {
      const result=run([...args,'--report',source,'--json']);
      assert.equal(result.status,2,result.stderr||result.stdout);
      assert.match(JSON.parse(result.stdout).error.message,/--report must not overwrite/);
      assert.equal(readFileSync(source,'utf8'),original);
    }
    const output=path.join(dir,'new-contract.json');
    const result=run(['init','--out',output,'--report',output,'--json']);
    assert.equal(result.status,2,result.stderr||result.stdout);
    assert.equal(existsSync(output),false,'conflicting outputs should not create or overwrite a contract');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('contract-relative local targets are protected before startup and on invalid-option failure paths',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-report-contract-target-'));
  try {
    const page=path.join(dir,'page.html'),spec=path.join(dir,'c.json');
    const original='<!doctype html><main>owned fixture</main>';
    writeFileSync(page,original);
    const symlink=path.join(dir,'page-alias.html'),hardlink=path.join(dir,'page-hardlink.html');
    symlinkSync(page,symlink);linkSync(page,hardlink);
    for(const url of ['page.html',page,pathToFileURL(page).href]) {
      writeFileSync(spec,JSON.stringify({url,selectors:{},rules:[{id:'fit',type:'document-overflow'}]}));
      for(const command of ['check','scan','compare']) {
        for(const destination of [page,symlink,hardlink]) {
          const result=run([command,'--spec',spec,'--report',destination,
            '--chrome','/missing/chrome-for-collision-preflight','--json']);
          assert.equal(result.status,2,result.stderr||result.stdout);
          assert.match(JSON.parse(result.stdout).error.message,/--report must not overwrite --spec target/);
          assert.equal(readFileSync(page,'utf8'),original);
        }
      }
      const invalid=run(['check','--spec',spec,'--report',page,'--json','--sarif']);
      assert.equal(invalid.status,2,invalid.stderr||invalid.stdout);
      assert.match(JSON.parse(invalid.stdout).error.message,/Choose --json or --sarif/);
      assert.equal(readFileSync(page,'utf8'),original,'the error handler must protect contract-relative resources too');
    }
    writeFileSync(spec,'{"url":"page.html", malformed JSON');
    const invalid=run(['check','--spec',spec,'--report',page,'--json']);
    assert.equal(invalid.status,2,invalid.stderr||invalid.stdout);
    assert.equal(readFileSync(page,'utf8'),original,'malformed JSON cannot authorize overwriting an unresolved input');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
