import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const script=path.join(cwd,'scripts/field-benchmark.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('field review worksheet independently verifies evidence and never populates labels',()=>{
 const base=mkdtempSync(path.join(os.tmpdir(),'bronto-field-review-'));
 try {
  const captures=path.join(base,'captures');
  mkdirSync(path.join(captures,'cases','case-320'),{recursive:true});
  const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  const report=Buffer.from('{"mode":"audit","findings":["not ground truth"]}');
  writeFileSync(path.join(captures,'cases/case-320/screen.png'),image);
  writeFileSync(path.join(captures,'cases/case-320/audit.json'),report);
  writeFileSync(path.join(captures,'index.json'),JSON.stringify({schemaVersion:1,datasetId:'test-cohort',
    capturedAt:'2026-10-12',sourceCommit:'abcd',cases:[{
      id:'case-320',url:'https://example.org/',width:320,complete:true,
      screenshotFile:'cases/case-320/screen.png',screenshotSha256:sha(image),
      auditFile:'cases/case-320/audit.json',auditSha256:sha(report)
    }]}));
  const output=path.join(base,'worksheet.md');
  const run=()=>spawnSync(process.execPath,[script,'review-packet','--captures',captures,'--out',output,'--json'],{cwd,encoding:'utf8'});
  const result=run();
  assert.equal(result.status,0,result.stderr);
  const json=JSON.parse(result.stdout);
  assert.equal(json.readyForReview,1);
  assert.equal(json.pendingHumanLabels,1);
  const content=readFileSync(output,'utf8');
  assert.match(content,/Record reviewer identity/);
  assert.doesNotMatch(content,/not ground truth/); // tool findings are not copied into human worksheet
  assert.equal(run().status,2); // do not clobber review work
 } finally {rmSync(base,{recursive:true,force:true});}
});
