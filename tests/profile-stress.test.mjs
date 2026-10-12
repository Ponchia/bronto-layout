import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseBatchManifest } from '../dist/batch.js';

const root=path.resolve(import.meta.dirname,'..');
const runner=path.join(root,'scripts/profile-stress.mjs');
const call=args=>spawnSync(process.execPath,[runner,...args],{cwd:root,encoding:'utf8',timeout:15000});

test('the stress manifest contains exactly 16 bounded and trusted local layout routes',()=>{
 const manifest=parseBatchManifest(JSON.parse(readFileSync(path.join(root,'examples/stress-batch.json'),'utf8')));
 assert.equal(manifest.jobs.length,16);
 assert.equal(new Set(manifest.jobs.map(job=>job.id)).size,16);
 for(const job of manifest.jobs){
  assert.match(job.url,/^(healthy|broken|gallery|gallery-broken)\.html$/);
  assert.ok(['layout.json','gallery.json'].includes(job.spec));
  assert.ok(job.widths.length===1);
  assert.ok(job.widths[0]>=320 && job.widths[0]<=1280);
  assert.ok(!job.actions);
 }
});

test('stress plan is browser-free, lists honest coverage bounds and allows configured concurrency',()=>{
 const output=call(['--plan','--runs','2','--parallel','4']);
 assert.equal(output.status,0,output.stderr);
 const p=JSON.parse(output.stdout);
 assert.equal(p.mode,'stress-profile-plan');
 assert.equal(p.jobs.length,16);
 assert.deepEqual(p.domSizes,[500,5000,20000]);
 assert.equal(p.browserRequired,false);
 assert.equal(p.runs,2);
 assert.equal(p.parallel,4);
 assert.equal(p.internetRequests,false);
 assert.ok(p.caveats.some(s=>s.includes('incomplete coverage')));
 assert.ok(p.caveats.some(s=>s.includes('Wall-clock')));
 assert.equal('results' in p,false,'the plan must not fabricate performance timings');
});

test('stress input limits fail before browser startup or side effects',()=>{
 for(const options of [['--runs','0'],['--runs','4'],['--parallel','3'],['--unknown'],['--runs']]){
  const output=call([...options,'--plan']);
  assert.equal(output.status,2,output.stderr);
  assert.match(output.stderr,/Usage: node scripts\/profile-stress\.mjs/);
 }
 const usage=call(['--help']);
 assert.equal(usage.status,0,usage.stderr);
 assert.match(usage.stdout,/--plan/);
});
