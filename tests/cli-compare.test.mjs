import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024,env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1'}});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium is required for CI but was not found'); t.skip('Chrome unavailable');return true;}return false;}
test('validate checks contracts without launching Chrome',()=>{
 const r=run(['validate','--spec','examples/layout.json','--json']);
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(r.stdout);
 assert.equal(data.valid,true);
 assert.equal(data.rules.length,5);
});
test('comparison detects regression and returns exit code 1',t=>{
 const r=run(['compare','--spec','examples/layout.json','--baseline','examples/healthy.html','--url','examples/broken.html','--width','1280','--json']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,1,r.stderr);
 const report=JSON.parse(r.stdout);
 assert.equal(report.summary.regressions,3);
 assert.equal(report.summary.candidateFailures,3);
 assert.equal(report.summary.baselineFailures,0);
});
test('comparison reports verified improvements and returns 0',t=>{
 const r=run(['compare','--spec','examples/layout.json','--baseline','examples/broken.html','--url','examples/healthy.html','--width','1280','--json']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr);
 const report=JSON.parse(r.stdout);
 assert.equal(report.summary.improvements,3);
 assert.equal(report.summary.regressions,0);
 assert.equal(report.summary.candidateFailures,0);
});
test('SARIF compare includes only regressions as findings',t=>{
 const r=run(['compare','--spec','examples/layout.json','--baseline','examples/healthy.html','--url','examples/broken.html','--width','1280','--sarif']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,1,r.stderr);
 const sarif=JSON.parse(r.stdout);
 assert.equal(sarif.version,'2.1.0');
 assert.equal(sarif.runs[0].results.length,3);
});
test('CLI detects conflicting output modes',()=>{
 const r=run(['check','--spec','examples/layout.json','--json','--sarif']);
 assert.equal(r.status,2);
 assert.match(r.stderr,/Choose --json or --sarif/);
});
test('comparison rejects missing baseline rather than defaulting to a green result',()=>{
 const r=run(['compare','--spec','examples/layout.json','--url','examples/healthy.html']);
 assert.equal(r.status,2);
 assert.match(r.stderr,/requires --baseline/);
});
