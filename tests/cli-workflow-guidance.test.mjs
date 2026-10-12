import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
 cwd,encoding:'utf8',timeout:85000,maxBuffer:9*1024*1024,
 env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'}
});
test('a first-time developer gets a complete review → approve → check flow with measured differences',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-workflow-guide-'));
 try{
  const draft=path.join(dir,'suggestions.json');
  const accepted=path.join(dir,'accepted.json');
  const suggest=run(['suggest','--url','examples/gallery.html',
    '--selector','gallery=.gallery','--selector','cards=.card',
    '--widths','375,768','--out',draft]);
  if(/Cannot find Chrome\/Chromium/.test(suggest.stderr+suggest.stdout)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw Error('Chromium required');
    t.skip('Chromium unavailable');return;
  }
  assert.equal(suggest.status,0,suggest.stderr||suggest.stdout);
  assert.match(suggest.stdout,/No rule was approved/);
  assert.match(suggest.stdout,/review-draft --draft/);
  assert.match(suggest.stdout,/--accept RULE_ID/);
  const saved=JSON.parse(readFileSync(draft,'utf8'));
  assert.ok(saved.proposals.some(p=>p.id==='uniform-x-cards'));
  const review=run(['review-draft','--draft',draft,'--url','examples/gallery-broken.html']);
  assert.equal(review.status,1,review.stderr||review.stdout);
  assert.match(review.stdout,/CHANGED: uniform-x-cards/);
  assert.match(review.stdout,/375px: Δ 12px \(tolerance 2px\)/);
  assert.match(review.stdout,/768px: Δ 12px \(tolerance 2px\)/);
  const approval=run(['approve','--draft',draft,'--accept','uniform-x-cards','--out',accepted]);
  assert.equal(approval.status,0,approval.stderr||approval.stdout);
  assert.match(approval.stdout,/Validate: bronto-layout validate/);
  assert.match(approval.stdout,/Check: bronto-layout check/);
  const regression=run(['check','--spec',accepted,'--url','examples/gallery-broken.html','--json','--compact']);
  assert.equal(regression.status,1,regression.stderr||regression.stdout);
  const report=JSON.parse(regression.stdout);
  assert.equal(report.summary.failed,2);
  assert.ok(report.failures.every(f=>f.id==='uniform-x-cards'&&f.deviation===12));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
