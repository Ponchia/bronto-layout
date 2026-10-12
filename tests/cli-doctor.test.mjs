import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
