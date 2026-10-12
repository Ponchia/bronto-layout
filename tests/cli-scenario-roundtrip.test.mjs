import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const run = args => spawnSync(process.execPath, [path.join(cwd, 'bin/bronto-layout.mjs'), ...args], {
  cwd, encoding: 'utf8', timeout: 45000, maxBuffer: 4*1024*1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function skipChrome(t, r) {
  if (r.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(r.stderr ?? '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chrome required in CI');
    t.skip('Chrome unavailable'); return true;
  }
  return false;
}
test('suggest and approve preserve browser preferences, shadow readiness and state actions', t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'bronto-scenario-'));
  try {
    const actions = path.join(temp, 'actions.json');
    const draftFile = path.join(temp, 'proposals.json');
    const acceptedFile = path.join(temp, 'accepted.json');
    writeFileSync(actions, JSON.stringify([
      {type:'wait-for',selector:'#host >>> button'},
      {type:'click',selector:'#host >>> button'},
      {type:'fill',selector:'#host >>> #value',value:'expand'}
    ]));
    const r = run(['suggest', '--url', 'examples/shadow-actions.html', '--selector', 'subject=#host >>> .subject',
      '--widths','375,768','--mobile','--locale','ar','--color-scheme','dark','--reduced-motion',
      '--height','700','--ready-selector','#host >>> .subject','--settle','20',
      '--actions',actions,'--out',draftFile,'--json']);
    if (skipChrome(t,r)) return;
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const draft=JSON.parse(readFileSync(draftFile));
    assert.deepEqual(draft.scenario, {mobile:true,reducedMotion:true,colorScheme:'dark',locale:'ar',
      height:700,readySelector:'#host >>> .subject',settle:20});
    assert.equal(draft.actions.length, 3);
    assert.ok(draft.proposals.some(p=>p.id==='contained-subject'));
    const approve=run(['approve','--draft',draftFile,'--accept','contained-subject','--out',acceptedFile,'--json']);
    assert.equal(approve.status,0,approve.stderr || approve.stdout);
    const contract=JSON.parse(readFileSync(acceptedFile));
    assert.deepEqual(contract.scenario,draft.scenario);
    assert.deepEqual(contract.actions,draft.actions);
    contract.rules=[{id:'width-after-actions',type:'size-range',element:'subject',axis:'width',min:160,max:160}];
    writeFileSync(acceptedFile,JSON.stringify(contract));
    const result=run(['check','--spec',acceptedFile,'--json']);
    assert.equal(result.status,0,result.stderr || result.stdout);
    const check=JSON.parse(result.stdout);
    assert.equal(check.summary.failed,0);
    assert.equal(check.reports[0].viewport.locale,'ar');
    assert.equal(check.reports[0].viewport.coarsePointer,true);
    assert.equal(check.reports[0].viewport.colorScheme,'dark');
    assert.equal(check.reports[0].viewport.reducedMotion,true);
    const override=run(['check','--spec',acceptedFile,'--width','375','--locale','en-US','--json']);
    assert.equal(override.status,0,override.stderr || override.stdout);
    assert.equal(JSON.parse(override.stdout).reports[0].viewport.locale,'en-US');
    const disabled=run(['check','--spec',acceptedFile,'--width','375','--desktop','--normal-motion','--json']);
    assert.equal(disabled.status,0,disabled.stderr||disabled.stdout);
    assert.equal(JSON.parse(disabled.stdout).reports[0].viewport.coarsePointer,false);
    assert.equal(JSON.parse(disabled.stdout).reports[0].viewport.reducedMotion,false);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
