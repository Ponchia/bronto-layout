import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchManifest } from '../dist/batch.js';

const job = { id: 'home', spec: 'home.json' };
const manifest = jobs => ({ schemaVersion: 1, jobs });

test('batch manifest accepts explicit, finite, independently configured jobs', () => {
  const value = parseBatchManifest(manifest([
    job,
    { id: 'rtl', spec: 'rtl.json', locale: 'ar', mobile: true, widths: [320, 375] },
    { id: 'dark', spec: 'dark.json', colorScheme: 'dark', reducedMotion: true,
      scan: '320:920:200', cssBreakpoints: true }
  ]));
  assert.equal(value.jobs.length, 3);
  assert.equal(value.jobs[2].cssBreakpoints, true);
});
test('batch manifest rejects unknown operations and duplicate job IDs', () => {
  assert.throws(() => parseBatchManifest({ ...manifest([job]), command: 'node secret.js' }), /jobs only/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, command: 'echo unsafe' }])), /unsupported fields/);
  assert.throws(() => parseBatchManifest(manifest([job, job])), /unique simple id/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, id: '../escape' }])), /unique simple id/);
});
test('batch manifest rejects excessive jobs and invalid width ranges', () => {
  assert.throws(() => parseBatchManifest(manifest([])), /1 to 16 jobs/);
  assert.throws(() => parseBatchManifest(manifest(
    Array.from({ length: 17 }, (_, i) => ({ ...job, id: 'job-' + i })))), /1 to 16 jobs/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, widths: [375, 375] }])), /duplicate/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, widths: [120] }])), /invalid/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, scan: '375:320:10' }])), /Invalid scan range/);
});
test('batch jobs cannot accidentally enable unsampled CSS breakpoint checks', () => {
  assert.throws(() => parseBatchManifest(manifest([{ ...job, cssBreakpoints: true }])), /require scan/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, scan: '320:920:80', widths: [375] }])), /choose widths or scan/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, colorScheme: 'sepia' }])), /light or dark/);
  assert.throws(() => parseBatchManifest(manifest([{ ...job, reducedMotion: 'true' }])), /boolean/);
});

test('v1 batch schema permits explicit audit jobs without weakening legacy contract validation',()=>{
 const value=parseBatchManifest(manifest([
  job,
  {id:'state-375',mode:'audit',url:'audit-stateful-broken.html',widths:[375],
   actions:'audit-stateful-actions.json',gridGapReview:true,domLimit:25000},
  {id:'rtl-320',mode:'audit',url:'https://example.test/ar/',widths:[320],
   locale:'ar',mobile:true,siblingOverlapReview:true,frameInventory:true,
   failOnCoverageGaps:true}
 ]));
 assert.equal(value.jobs.length,3);
 assert.equal(value.jobs[0].mode,undefined,'legacy jobs are still check jobs');
 assert.equal(value.jobs[1].mode,'audit');
 assert.equal(value.jobs[1].spec,undefined);
 assert.equal(value.jobs[1].domLimit,25000);
});

test('audit-only batch fields and bounded action paths cannot leak into contract job schemas',()=>{
 const audit={id:'a',mode:'audit',url:'example.html'};
 assert.throws(()=>parseBatchManifest(manifest([{...audit,spec:'unwanted.json'}])),/zero-contract/);
 assert.throws(()=>parseBatchManifest(manifest([{id:'a',mode:'audit'}])),/requires an explicit URL/);
 assert.throws(()=>parseBatchManifest(manifest([{id:'a',mode:'invalid',spec:'x.json'}])),/mode check or audit/);
 assert.throws(()=>parseBatchManifest(manifest([{...job,mode:'check',actions:'private.json'}])),/only supported for audit/);
 assert.throws(()=>parseBatchManifest(manifest([{...job,gridGapReview:true}])),/only supported for audit/);
 assert.throws(()=>parseBatchManifest(manifest([{...audit,stableFor:200}])),/does not support stableFor/);
 assert.throws(()=>parseBatchManifest(manifest([{...audit,actions:''}])),/actions file path/);
 for(const domLimit of [999,50001,0,2500.5,'25000',null]) {
  assert.throws(()=>parseBatchManifest(manifest([{...audit,domLimit}])),/domLimit/);
 }
 for(const field of ['gridGapReview','siblingOverlapReview','frameInventory','failOnCoverageGaps']) {
  assert.throws(()=>parseBatchManifest(manifest([{...audit,[field]:'true'}])),/boolean/);
 }
});
