import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:55000,maxBuffer:7*1024*1024,
 env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'}});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){
 if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('CI requires Chromium');t.skip('Chromium unavailable');return true;
}return false;}
test('srcdoc embedded document appears as CDP snapshot evidence but is still an unverified layout surface',t=>{
 const args=['audit','--url','examples/audit-iframe-coverage.html','--width','375','--frame-inventory','--json','--compact'];
 const r=run(args);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const report=JSON.parse(r.stdout).reports[0];
 assert.equal(report.coverage.status,'known-uninspected-content');
 assert.equal(report.frameInventory.frameCount,1);
 assert.equal(report.frameInventory.observedFrameDocuments,1);
 assert.equal(report.frameInventory.missingFrameDocuments,0);
 assert.equal(report.frameInventory.status,'frame-documents-observed');
 assert.equal(report.frameInventory.frames[0].url,'about:srcdoc');
 assert.ok(report.frameInventory.frames[0].domNodes>=5);
 assert.ok(report.findings.some(f=>f.code==='embedded-frame-uninspected'));
 assert.equal(report.findings.filter(f=>f.code==='broken-image').length,0,
   'A missing image within srcdoc is not yet an automatic layout claim');
 const strict=run([...args,'--fail-on-coverage-gaps']);
 assert.equal(strict.status,2,strict.stderr||strict.stdout);
});
test('frame-free page reports zero documents and keeps ordinary audit results',t=>{
 const r=run(['audit','--url','examples/audit-healthy.html','--width','375','--frame-inventory','--json','--compact']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const report=JSON.parse(r.stdout).reports[0];
 assert.equal(report.frameInventory.status,'no-child-frames');
 assert.equal(report.frameInventory.frameCount,0);
 assert.equal(report.coverage.status,'supported-scope-measured');
});
test('audit comparisons retain bounded frame inventories for baseline and candidate',t=>{
 const r=run(['audit','--baseline','examples/audit-healthy.html','--url','examples/audit-iframe-coverage.html',
   '--width','375','--frame-inventory','--json','--compact']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const comparison=JSON.parse(r.stdout);
 assert.equal(comparison.mode,'audit-compare');
 assert.equal(comparison.frameInventories.length,1);
 assert.equal(comparison.frameInventories[0].baseline.frameCount,0);
 assert.equal(comparison.frameInventories[0].candidate.frameCount,1);
});
test('frame inventory is rejected for unsupported commands',()=>{
 const r=run(['check','--spec','examples/layout.json','--frame-inventory','--json']);
 assert.equal(r.status,2);
 assert.match(JSON.parse(r.stdout).error.message,/applies only to audit/);
});
