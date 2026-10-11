import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const exec = (args, basedir=cwd) => spawnSync(process.execPath,[cli,...args],{cwd:basedir,encoding:'utf8',env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'},timeout:30000,maxBuffer:8*1024*1024});
function skipChrome(t,r){if (r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium is required for CI but was not found'); t.skip('Chrome not available');return true;}return false;}
test('CLI help shows native check, inspect, init and scan',()=>{
  const result=exec(['--help']);
  assert.equal(result.status,0);
  for(const word of ['check','inspect','init','scan']) assert.match(result.stdout,new RegExp(word));
});
test('CLI contract errors return exit 2 rather than producing a misleading pass',()=>{
  const result=exec(['check','--spec','examples/invalid-file.json']);
  assert.equal(result.status,2);
  assert.match(result.stderr,/ENOENT/);
});
test('init writes a valid contract and refuses accidental overwrite',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-init-test-'));
  try{
    let first=exec(['init','--url','http://localhost:5173/','--json'],dir);
    assert.equal(first.status,0,first.stderr);
    const data=JSON.parse(readFileSync(path.join(dir,'bronto-layout.json'),'utf8'));
    assert.equal(data.schemaVersion,1);
    assert.equal(data.url,'http://localhost:5173/');
    assert.equal(data.rules.length,2);
    first=exec(['init'],dir);
    assert.equal(first.status,2);
    assert.match(first.stderr,/exists/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('inspect measures real DOM without a contract',t=>{
  const r=exec(['inspect','--url','examples/healthy.html','--width','375','--selector','first=.card:nth-child(1)','--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr);
  const data=JSON.parse(r.stdout);
  assert.equal(data.mode,'inspect');
  assert.equal(data.snapshots[0].viewport.width,375);
  assert.equal(data.snapshots[0].selectors.first.length,1);
  assert.ok(data.snapshots[0].selectors.first[0].rect.width>0);
});
test('scan refines an actual CSS media query breakpoint',t=>{
  const r=exec(['scan','--spec','examples/responsive.json','--scan','320:920:600','--refine','--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,1,r.stderr);
  const data=JSON.parse(r.stdout);
  assert.equal(data.mode,'check');
  const transition=data.transitions.find(t=>t.ruleId==='left-edge'&&t.from==='pass'&&t.to==='fail');
  assert.ok(transition,JSON.stringify(data.transitions));
  assert.deepEqual([transition.previousWidth,transition.width],[600,601]);
  assert.equal(transition.precision,'one-pixel');
});
test('navigation failures are runtime errors, not false green audits',t=>{
  // Port 9 is not a site; a network error cannot satisfy a contract.
  const r=exec(['check','--spec','examples/layout.json','--url','http://127.0.0.1:9/','--width','375','--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,2,r.stderr||r.stdout);
  const error = JSON.parse(r.stdout);
  assert.equal(error.mode, 'error');
  assert.equal(error.exitCode, 2);
  assert.match(error.error.message,/Could not navigate|Timed out/);
});
test('named CLI selectors are validated before entering the browser',()=>{
  const r=exec(['inspect','--url','examples/healthy.html','--selector','viewport=body']);
  assert.equal(r.status,2);
  assert.match(r.stderr,/reserved|Invalid or repeated selector alias/);
});
