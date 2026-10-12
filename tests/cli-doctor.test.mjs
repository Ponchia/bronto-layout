import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const cli=path.join(root,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:10000});
test('doctor reports real node and browser detection without launching Chromium',()=>{
 const r=run(['doctor','--json']);
 assert.ok([0,2].includes(r.status),r.stderr);
 const result=JSON.parse(r.stdout);
 assert.equal(result.mode,'doctor');
 assert.equal(result.node.version,process.versions.node);
 assert.equal(typeof result.browser.detected,'boolean');
 assert.ok(result.limitations.some(line=>line.includes('not launched')));
 if(result.browser.detected)assert.equal(r.status,0);
});
test('doctor fails explicitly when a manually selected Chrome executable is absent',()=>{
 const r=run(['doctor','--chrome','/definitely-not-an-installed-browser','--json']);
 assert.equal(r.status,2,r.stderr);
 const result=JSON.parse(r.stdout);
 assert.equal(result.mode,'doctor');
 assert.equal(result.status,'needs-attention');
 assert.equal(result.browser.detected,false);
 assert.match(result.browser.reason,/does not exist/);
});


test('doctor explicit opt-in launches a real isolated blank Chromium tab via CDP', {timeout:90000}, t=>{
 const result=spawnSync(process.execPath,[cli,'doctor','--verify-launch','--no-sandbox','--json'],{
  cwd:root,encoding:'utf8',timeout:85000,maxBuffer:4*1024*1024
 });
 if(result.error?.code==='ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stdout+result.stderr)){
  if(process.env.BRONTO_REQUIRE_CHROME==='1') throw new Error('Chrome required by CI');
  t.skip('Chrome unavailable');return;
 }
 assert.equal(result.status,0,result.stderr||result.stdout);
 const report=JSON.parse(result.stdout);
 assert.equal(report.mode,'doctor');
 assert.equal(report.status,'launch-verified');
 assert.equal(report.browser.detected,true);
 assert.deepEqual(report.browser.launch,{
  attempted:true,connected:true,sandboxBypassRequested:true,page:'about:blank'
 });
 assert.ok(report.limitations.some(s=>s.includes('NOT a sandbox verification')));
 assert.ok(report.limitations.some(s=>s.includes('Network navigation')));
});

test('doctor failed version detection does not attempt a launch or claim readiness',()=>{
 const r=run(['doctor','--verify-launch','--chrome','/definitely-not-an-installed-browser','--json']);
 assert.equal(r.status,2,r.stderr);
 const report=JSON.parse(r.stdout);
 assert.equal(report.status,'needs-attention');
 assert.equal(report.browser.detected,false);
 assert.equal(report.browser.launch.attempted,false);
 assert.equal(report.browser.launch.connected,false);
});

test('doctor reports an executable that prints a version but cannot start Chromium or CDP', t=>{
 if(process.platform==='win32'){t.skip('POSIX fixture executable');return;}
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-doctor-fake-browser-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const fake=path.join(dir,'fake-chrome');
 writeFileSync(fake,'#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Fake Chromium 0.0";exit 0;fi\nexit 17\n');
 chmodSync(fake,0o755);
 const r=spawnSync(process.execPath,[cli,'doctor','--verify-launch','--chrome',fake,'--json'],{
  cwd:root,encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024
 });
 assert.equal(r.status,2,r.stderr||r.stdout);
 const report=JSON.parse(r.stdout);
 assert.equal(report.mode,'doctor');
 assert.equal(report.status,'needs-attention');
 assert.equal(report.browser.detected,true,'printing a version is not proof of launch readiness');
 assert.equal(report.browser.launch.attempted,true);
 assert.equal(report.browser.launch.connected,false);
 assert.match(report.browser.launch.reason,/Chrome exited before debugging started|Chrome failed to launch/);
});

test('doctor launch flag remains command-scoped and a sandbox override cannot be a non-launch preflight',()=>{
 const unrelated=run(['audit','--url','examples/audit-healthy.html','--verify-launch','--json']);
 assert.equal(unrelated.status,2);
 assert.match(JSON.parse(unrelated.stdout).error.message,/--verify-launch applies only to doctor/);
 const override=run(['doctor','--no-sandbox','--json']);
 assert.equal(override.status,2);
 assert.match(JSON.parse(override.stdout).error.message,/requires --verify-launch/);
});
