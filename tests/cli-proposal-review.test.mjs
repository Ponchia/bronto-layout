import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
 cwd,encoding:'utf8',timeout:75000,maxBuffer:6*1024*1024,
 env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stdout+r.stderr)){
 if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('CI requires Chromium');t.skip('Chromium unavailable');return true;
}return false;}
test('review-draft replays prior selector/width contracts and finds seeded gallery spacing changes',t=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-review-'));
 try{
  const draftFile=path.join(tmp,'draft.json');
  const cmd=run(['suggest','--url','examples/gallery.html','--selector','gallery=.gallery','--selector','cards=.card','--widths','375,768','--out',draftFile,'--json']);
  if(skipChrome(t,cmd))return;
  assert.equal(cmd.status,0,cmd.stderr||cmd.stdout);
  const draft=JSON.parse(readFileSync(draftFile));
  assert.ok(draft.proposals.some(p=>p.id==='uniform-x-cards'));
  const healthy=run(['review-draft','--draft',draftFile,'--url','examples/gallery.html','--json']);
  assert.equal(healthy.status,0,healthy.stderr||healthy.stdout);
  const report=JSON.parse(healthy.stdout);
  assert.equal(report.summary.changed,0);
  assert.equal(report.summary.unverified,0);
  const broken=run(['review-draft','--draft',draftFile,'--url','examples/gallery-broken.html','--json']);
  assert.equal(broken.status,1,broken.stderr||broken.stdout);
  const diff=JSON.parse(broken.stdout);
  assert.equal(diff.mode,'review-draft');
  assert.equal(diff.proposals.find(x=>x.id==='uniform-x-cards').status,'changed');
  assert.equal(diff.summary.changed>0,true);
  const unrelated=run(['review-draft','--draft',draftFile,'--url','examples/shadow.html','--json']);
  assert.equal(unrelated.status,2,unrelated.stderr||unrelated.stdout);
  assert.ok(JSON.parse(unrelated.stdout).summary.unverified>0);
  const invalid=run(['review-draft','--draft',draftFile,'--width','375','--json']);
  assert.equal(invalid.status,2);
  assert.match(JSON.parse(invalid.stdout).error.message,/replays the original widths/);
  // The draft must remain untouched; none of these commands approves its rules.
  assert.equal(JSON.parse(readFileSync(draftFile)).draftSchemaVersion,1);
 } finally{rmSync(tmp,{recursive:true,force:true});}
});
test('selector discovery reports when the unique-selector and group caps prevent complete inspection',t=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-selector-cap-'));
 try{
  const html=path.join(tmp,'many.html');
  const parents=Array.from({length:26},(_,i)=>`<section id="section-${i}"><div class="card-${i}">1</div><div class="card-${i}">2</div><div class="card-${i}">3</div></section>`).join('');
  writeFileSync(html,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}section{width:220px;height:80px}section>div{display:inline-block;width:60px;height:24px}</style></head><body><main>'+parents+'</main></body></html>');
  const r=run(['suggest','--url',html,'--widths','375,768','--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const draft=JSON.parse(r.stdout);
  assert.equal(draft.coverage.truncated,true);
  assert.ok(draft.coverage.limitReasons.includes('unique-selector-limit'));
  assert.ok(draft.coverage.limitReasons.includes('repeated-group-limit'));
  assert.equal(draft.coverage.groupAliases.length,6);
  assert.ok(draft.proposals.every(p=>p.reviewRequired));
 } finally{rmSync(tmp,{recursive:true,force:true});}
});

test('the 500-candidate inspection limit is disclosed rather than silently presented as complete',t=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-selector-500-'));
 try {
  const fixture=path.join(tmp,'large.html');
  const html=Array.from({length:510},(_,i)=>`<section id="section-${i}">Item ${i}</section>`).join('');
  writeFileSync(fixture,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>section{display:block;width:160px;height:20px}</style></head><body><main>'+html+'</main></body></html>');
  const r=run(['suggest','--url',fixture,'--width','375','--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.coverage.truncated,true);
  assert.ok(report.coverage.limitReasons.includes('candidate-limit'));
  assert.ok(report.coverage.limitReasons.includes('unique-selector-limit'));
  assert.ok(report.coverage.candidateCount<=20);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
test('review-draft safely replays captured Shadow DOM action state instead of testing a default page state',t=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-state-review-'));
 try {
  const draftFile=path.join(tmp,'draft.json');
  const base={draftSchemaVersion:1,url:path.resolve(cwd,'examples/shadow-actions.html'),widths:[375],
    selectors:{subject:'#host >>> .subject'},
    scenario:{mobile:true,locale:'ar',colorScheme:'dark',reducedMotion:true,readySelector:'#host >>> .subject'},
    actions:[{type:'wait-for',selector:'#host >>> button'},
      {type:'click',selector:'#host >>> button'},
      {type:'fill',selector:'#host >>> #value',value:'expand'}],
    proposals:[{id:'post-action-width',rule:{id:'post-action-width',type:'size-range',element:'subject',axis:'width',min:160,max:160},
      rationale:'The stateful component has a measured width of 160px after declared setup actions',sampledWidths:[375],
      deviations:[{width:375,value:0,tolerance:0}],reviewRequired:true}],
    coverage:{groupAliases:[],candidateCount:1,truncated:false},limitations:[]};
  writeFileSync(draftFile,JSON.stringify(base));
  const pass=run(['review-draft','--draft',draftFile,'--json']);
  if(skipChrome(t,pass))return;
  assert.equal(pass.status,0,pass.stderr||pass.stdout);
  assert.equal(JSON.parse(pass.stdout).summary.stillSatisfied,1);
  const withoutActions={...base,actions:[]};
  writeFileSync(draftFile,JSON.stringify(withoutActions));
  const fail=run(['review-draft','--draft',draftFile,'--json']);
  assert.equal(fail.status,1,fail.stderr||fail.stdout);
  assert.equal(JSON.parse(fail.stdout).summary.changed,1);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
