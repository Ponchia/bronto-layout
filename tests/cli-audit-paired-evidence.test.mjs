import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
  cwd,encoding:'utf8',timeout:100000,maxBuffer:8*1024*1024,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
const validatePNG=(record,width)=>{
  assert.equal(record.coverage,'viewport-only');
  assert.equal(existsSync(record.file),true,record.file);
  const bytes=readFileSync(record.file);
  assert.ok(bytes.subarray(0,8).equals(pngMagic));
  assert.equal(bytes.readUInt32BE(16),width);
  assert.match(record.sha256,/^[a-f0-9]{64}$/);
  assert.equal(record.sha256,digest(bytes));
  return bytes;
};
function skipChrome(t,result){
  if(result.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(result.stdout+result.stderr)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required by CI');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}

test('opt-in baseline comparison saves exact paired viewport PNGs with verifiable hashes at both widths',t=>{
  const evidence=mkdtempSync(path.join(os.tmpdir(),'bronto-paired-evidence-'));
  try{
    const args=['audit','--baseline','examples/audit-healthy.html',
      '--url','examples/audit-broken.html','--widths','375,768',
      '--json','--compact','--evidence-dir',evidence];
    const child=run(args);
    if(skipChrome(t,child))return;
    assert.equal(child.status,1,child.stderr||child.stdout);
    const report=JSON.parse(child.stdout);
    assert.equal(report.mode,'audit-compare');
    assert.equal(report.summary.measuredRegressions,4);
    assert.equal(report.summary.unverifiedViewports,0);
    assert.deepEqual(report.comparisonEvidence.map(x=>x.width),[375,768]);
    assert.equal(report.comparisonGallery.format,'static-offline-html');
    assert.equal(report.comparisonGallery.scripts,false);
    assert.equal(report.comparisonGallery.pairs,2);
    assert.equal(report.comparisonGallery.file,path.join(evidence,'audit-comparison.html'));
    const gallery=readFileSync(report.comparisonGallery.file,'utf8');
    assert.equal((gallery.match(/<img /g)||[]).length,4);
    assert.match(gallery,/Content-Security-Policy/);
    assert.match(gallery,/script-src 'none'/);
    assert.match(gallery,/src="audit-baseline-375px\.png"/);
    assert.match(gallery,/src="audit-candidate-768px\.png"/);
    assert.doesNotMatch(gallery,/<script[\s>]/i);

    for(const item of report.comparisonEvidence){
      assert.equal(item.baseline.file,path.join(evidence,`audit-baseline-${item.width}px.png`));
      assert.equal(item.candidate.file,path.join(evidence,`audit-candidate-${item.width}px.png`));
      const baseline=validatePNG(item.baseline,item.width);
      const candidate=validatePNG(item.candidate,item.width);
      assert.notEqual(digest(baseline),digest(candidate));
    }
    assert.equal('visualRegression' in report,false);
  }finally{rmSync(evidence,{recursive:true,force:true});}
});

test('ordinary no-evidence audit comparison makes no screenshot directory and retains prior report behavior',t=>{
  const child=run(['audit','--baseline','examples/audit-healthy.html',
    '--url','examples/audit-broken.html','--width','375','--json','--compact']);
  if(skipChrome(t,child))return;
  assert.equal(child.status,1,child.stderr||child.stdout);
  const report=JSON.parse(child.stdout);
  assert.equal(report.summary.measuredRegressions,2);
  assert.equal('comparisonEvidence' in report,false);
  assert.equal('comparisonGallery' in report,false);
});

test('paired comparison captures declared interactive state without echoing fill values in JSON',t=>{
  const evidence=mkdtempSync(path.join(os.tmpdir(),'bronto-paired-action-'));
  try{
    const child=run(['audit',
      '--baseline','examples/audit-stateful-healthy.html',
      '--url','examples/audit-stateful-broken.html','--width','375',
      '--actions','examples/audit-stateful-actions.json',
      '--evidence-dir',evidence,'--json','--compact']);
    if(skipChrome(t,child))return;
    assert.equal(child.status,1,child.stderr||child.stdout);
    const report=JSON.parse(child.stdout);
    assert.equal(report.summary.measuredRegressions,2);
    assert.equal(report.stateSetup.actionCount,4);
    assert.deepEqual(report.stateSetup.actionTypes,['wait-for','click','fill','wait-for']);
    assert.doesNotMatch(child.stdout,/sensitive-demo-input-do-not-leak/);
    assert.equal(report.comparisonEvidence.length,1);
    assert.notEqual(digest(validatePNG(report.comparisonEvidence[0].baseline,375)),
      digest(validatePNG(report.comparisonEvidence[0].candidate,375)));
  }finally{rmSync(evidence,{recursive:true,force:true});}
});

test('paired evidence never silently replaces an existing screenshot or produces a false green result',t=>{
  const evidence=mkdtempSync(path.join(os.tmpdir(),'bronto-paired-no-clobber-'));
  try{
    const file=path.join(evidence,'audit-baseline-375px.png');
    const existing=Buffer.from('EXISTING HUMAN REVIEW FILE');
    writeFileSync(file,existing);
    const child=run(['audit','--baseline','examples/audit-healthy.html',
      '--url','examples/audit-broken.html','--width','375','--json',
      '--evidence-dir',evidence]);
    if(skipChrome(t,child))return;
    assert.equal(child.status,2,child.stderr||child.stdout);
    assert.match(JSON.parse(child.stdout).error.message,/already exists/);
    assert.deepEqual(readFileSync(file),existing);
    assert.equal(existsSync(path.join(evidence,'audit-candidate-375px.png')),false);
  }finally{rmSync(evidence,{recursive:true,force:true});}
});

test('paired viewport evidence does not implicitly enable unsupported full-page comparisons',()=>{
  const child=run(['audit','--baseline','examples/audit-healthy.html',
    '--url','examples/audit-broken.html','--width','375','--json',
    '--evidence-dir','somewhere-not-created','--full-page-evidence']);
  assert.equal(child.status,2);
  assert.match(JSON.parse(child.stdout).error.message,/full-page-evidence/);
});

test('paired HTML contact sheet never overwrites an existing human review file',t=>{
  const evidence=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-no-overwrite-'));
  try{
    const file=path.join(evidence,'audit-comparison.html');
    const existing=Buffer.from('<!doctype html><title>Reviewer notes that must survive</title>');
    writeFileSync(file,existing);
    const result=run(['audit','--baseline','examples/audit-healthy.html',
      '--url','examples/audit-broken.html','--width','375',
      '--json','--compact','--evidence-dir',evidence]);
    if(skipChrome(t,result))return;
    assert.equal(result.status,2,result.stderr||result.stdout);
    assert.match(JSON.parse(result.stdout).error.message,/Comparison gallery already exists/);
    assert.deepEqual(readFileSync(file),existing);
  }finally{rmSync(evidence,{recursive:true,force:true});}
});

test('real Chromium paired PNGs can be independently verified after copying into a new directory',t=>{
  const original=mkdtempSync(path.join(os.tmpdir(),'bronto-evidence-origin-'));
  const destination=mkdtempSync(path.join(os.tmpdir(),'bronto-evidence-copy-'));
  try{
    const captured=run(['audit','--baseline','examples/audit-healthy.html',
      '--url','examples/audit-broken.html','--width','375','--json','--compact',
      '--evidence-dir',original]);
    if(skipChrome(t,captured))return;
    assert.equal(captured.status,1,captured.stderr||captured.stdout);
    const report=JSON.parse(captured.stdout);
    const file=path.join(destination,'paired-report.json');
    writeFileSync(file,JSON.stringify(report));
    for(const kind of ['baseline','candidate']){
      const name=`audit-${kind}-375px.png`;
      writeFileSync(path.join(destination,name),readFileSync(path.join(original,name)));
    }
    const verify=run(['verify-evidence','--comparison',file,'--evidence-dir',destination,'--json']);
    assert.equal(verify.status,0,verify.stderr||verify.stdout);
    const result=JSON.parse(verify.stdout);
    assert.deepEqual(result.summary,{pairedWidths:1,totalImages:2,verifiedImages:2,unsafeImages:0});
    assert.equal(result.status,'verified');
    assert.equal('visualRegression' in result,false);
    assert.ok(!verify.stdout.includes(original),'original machine paths are never disclosed or read');
    const changed=path.join(destination,'audit-candidate-375px.png');
    writeFileSync(changed,Buffer.concat([readFileSync(changed),Buffer.from('changed')]));
    const unsafe=run(['verify-evidence','--comparison',file,'--evidence-dir',destination,'--json']);
    assert.equal(unsafe.status,2,unsafe.stderr||unsafe.stdout);
    assert.equal(JSON.parse(unsafe.stdout).status,'unsafe');
    assert.equal(JSON.parse(unsafe.stdout).summary.unsafeImages,1);
  }finally{
    rmSync(original,{recursive:true,force:true});
    rmSync(destination,{recursive:true,force:true});
  }
});
