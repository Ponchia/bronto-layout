import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createBatchCommand } from '../bin/batch-command.mjs';

const root=path.resolve(import.meta.dirname,'..');

test('extracted batch module keeps dry-run planning browser-free, bounded and in order',async()=>{
 const output=[];
 const batch=createBatchCommand({output:async(a,data,printable)=>output.push({a,data,printable})});
 await batch({manifest:path.join(root,'examples/batch.json'),'dry-run':true,parallel:'2',json:true});
 assert.equal(output.length,1);
 const {data,printable}=output[0];
 assert.equal(data.mode,'batch-plan');
 assert.equal(data.parallel,2);
 assert.equal(data.total,2);
 assert.deepEqual(data.jobs.map(x=>x.id),['healthy-gallery','broken-gallery']);
 assert.deepEqual(data.jobs.map(x=>x.widths),[[375],[375]]);
 assert.ok(data.jobs.every(x=>x.spec.endsWith('layout.json')));
 assert.match(printable,/without opening Chromium/);
});

test('extracted batch parser rejects unsupported concurrency before launching browsers',async()=>{
 const batch=createBatchCommand({output:async()=>{throw Error('Unexpected output');}});
 await assert.rejects(batch({manifest:path.join(root,'examples/batch.json'),parallel:'5','dry-run':true}),/--parallel/);
});

test('mixed check/audit batch plans validate every spec and action before any Chromium startup',async()=>{
 const output=[];
 const batch=createBatchCommand({output:async (_a,data)=>output.push(data)});
 await batch({manifest:path.join(root,'examples/batch-mixed.json'),'dry-run':true,parallel:'2'});
 assert.equal(output.length,1);
 const mixed=output[0];
 assert.deepEqual(mixed.jobs.map(job=>[job.id,job.mode,Boolean(job.spec)]),[
  ['approved-healthy','check',true],['automatic-broken','audit',false]
 ]);
 assert.equal(mixed.jobs[1].auditOptions.domLimit,25000);
 assert.equal(mixed.jobs[1].target,'audit-broken.html');
 await batch({manifest:path.join(root,'examples/batch-audit.json'),'dry-run':true,json:true,
  parallel:'2'}).then(()=>{});
 // All declarative actions are parsed, but typed input values are not exposed.
 await assert.rejects(batch({manifest:path.join(root,'examples/batch-audit-partial.json'),
  'dry-run':true,'stable-for':'200'}),/without named selectors/);
 await assert.rejects(batch({manifest:path.join(root,'examples/batch-mixed.json'),
  'dry-run':true,'fail-on-skip':true}),/no contract skips/);
});
