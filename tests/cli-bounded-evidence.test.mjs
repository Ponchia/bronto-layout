import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:65000,maxBuffer:8*1024*1024,
 env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'}});
const dimensions=buf=>({width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){
 if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required in CI');t.skip('Chromium unavailable');return true;
}return false;}
test('audit writes both viewport and below-fold image evidence without changing detector decisions',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-bounded-long-'));
 try {
  const r=run(['audit','--url','examples/audit-long-page.html','--width','375',
   '--json','--compact','--evidence-dir',dir,'--full-page-evidence']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.summary.measuredIssues,0);
  const item=report.reports[0];
  assert.equal(item.fullPageScreenshot.coverage,'rendered-document-rectangle');
  assert.equal(item.fullPageScreenshot.truncatedVertically,false);
  assert.ok(item.fullPageScreenshot.capturedHeight>=2820);
  assert.ok(existsSync(item.screenshot.file));
  assert.ok(existsSync(item.fullPageScreenshot.file));
  const viewport=dimensions(readFileSync(item.screenshot.file));
  const expanded=dimensions(readFileSync(item.fullPageScreenshot.file));
  assert.equal(viewport.width,375);
  assert.equal(expanded.width,375);
  assert.equal(expanded.height,item.fullPageScreenshot.capturedHeight);
  assert.ok(expanded.height>viewport.height*2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('very tall page evidence reports truncation instead of claiming a complete screenshot',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-bounded-tall-'));
 try{
  const r=run(['audit','--url','examples/audit-tall-page.html','--width','375',
   '--json','--compact','--evidence-dir',dir,'--full-page-evidence']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const p=JSON.parse(r.stdout).reports[0].fullPageScreenshot;
  assert.equal(p.coverage,'bounded-top-left-rectangle');
  assert.equal(p.truncatedVertically,true);
  assert.equal(p.capturedHeight,6000);
  assert.ok(p.documentHeight>=9400);
  assert.equal(dimensions(readFileSync(p.file)).height,6000);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('bounded capture cannot be requested silently without evidence directory or on unsupported commands',()=>{
 for(const args of [
  ['audit','--url','examples/audit-long-page.html','--full-page-evidence','--json'],
  ['check','--spec','examples/layout.json','--full-page-evidence','--json'],
  ['audit','--baseline','examples/healthy.html','--url','examples/broken.html','--full-page-evidence','--evidence-dir','/tmp/should-not-create','--json']
 ]){
  const r=run(args);
  assert.equal(r.status,2,r.stderr||r.stdout);
  assert.match(JSON.parse(r.stdout).error.message,/full-page-evidence/);
 }
});
