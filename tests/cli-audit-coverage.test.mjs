import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const run=(args)=>spawnSync(process.execPath,[path.join(cwd,'bin/bronto-layout.mjs'),...args],{
  cwd,encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function skipChrome(t,r){
  if (r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr??'')) {
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chrome required in CI');
    t.skip('Chrome unavailable');return true;
  }
  return false;
}
test('partial iframe coverage is visible and strict audit may exit unverified',t=>{
  const args=['audit','--url','examples/audit-iframe-coverage.html','--width','375','--json','--compact'];
  const permissive=run(args);
  if(skipChrome(t,permissive))return;
  assert.equal(permissive.status,0,permissive.stderr || permissive.stdout);
  const payload=JSON.parse(permissive.stdout);
  assert.equal(payload.summary.partialViewports,1);
  assert.equal(payload.reports[0].coverage.status,'known-uninspected-content');
  assert.equal(payload.reports[0].coverage.scope,'top-document-and-open-shadow-roots');
  assert.ok(payload.reports[0].coverage.embeddedFrames>0);
  const strict=run([...args,'--fail-on-coverage-gaps']);
  assert.equal(strict.status,2,strict.stderr || strict.stdout);
  assert.equal(JSON.parse(strict.stdout).reports[0].coverage.status,'known-uninspected-content');
});
test('complete measured fixture stays clean with strict audit coverage policy',t=>{
 const r=run(['audit','--url','examples/audit-healthy.html','--width','375','--json','--fail-on-coverage-gaps']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.equal(JSON.parse(r.stdout).summary.partialViewports,0);
});

test('strict automatic comparison discloses the precise baseline/candidate coverage gap',t=>{
 const r=run(['audit','--baseline','examples/audit-healthy.html','--url','examples/audit-iframe-coverage.html',
   '--width','375','--json','--compact','--fail-on-coverage-gaps']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,2,r.stderr||r.stdout);
 const result=JSON.parse(r.stdout);
 assert.equal(result.mode,'audit-compare');
 assert.equal(result.coverageGaps.length,1);
 assert.equal(result.coverageGaps[0].baselineStatus,'supported-scope-measured');
 assert.equal(result.coverageGaps[0].candidateStatus,'known-uninspected-content');
});
