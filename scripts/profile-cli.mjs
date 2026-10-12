#!/usr/bin/env node
/** Repeatable cold-process CLI timings for TRUSTED local fixtures; no accuracy claims. */
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const command=path.join(root,'bin/bronto-layout.mjs');
const args=process.argv.slice(2);
const nPos=args.indexOf('--runs');
const count=nPos>=0 ? Number(args[nPos+1]) : 2;
if(!Number.isInteger(count)||count<1||count>8 || args.some((arg,i)=>arg.startsWith('--') && (arg!=='--runs' || i!==nPos)))
 throw new Error('Usage: node scripts/profile-cli.mjs [--runs 1..8]');
const configurations=[
 {id:'single-viewport',argv:['audit','--url','examples/audit-healthy.html','--width','375','--json']},
 {id:'four-viewports',argv:['audit','--url','examples/audit-healthy.html','--widths','320,375,768,1280','--json']},
 {id:'batch-serial',argv:['batch','--manifest','examples/batch.json','--parallel','1','--json']},
 {id:'batch-parallel-2',argv:['batch','--manifest','examples/batch.json','--parallel','2','--json']}
];
const out=[];
for(const {id,argv} of configurations){
 const times=[];
 for(let i=0;i<count;i++){
  const begin=performance.now();
  const r=spawnSync(process.execPath,[command,...argv],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,env:process.env});
  times.push(Number((performance.now()-begin).toFixed(1)));
  const expected=id.startsWith('batch-')?1:0;
  if(r.error||r.status!==expected)throw new Error(id+' failed: '+(r.error?.message||r.stderr||r.stdout).slice(-1200));
  const report=JSON.parse(r.stdout);
  if(!['audit','batch'].includes(report.mode)) throw new Error('Unexpected CLI report mode');
 }
 const sorted=[...times].sort((a,b)=>a-b);
 out.push({id,runs:count,wallClockMs:times,medianMs:count%2 ? sorted[Math.floor(count/2)] : Number(((sorted[count/2-1]+sorted[count/2])/2).toFixed(1)),
  minMs:sorted[0],maxMs:sorted.at(-1)});
}
console.log(JSON.stringify({mode:'cli-profile',platform:process.platform,arch:process.arch,node:process.version,
 caveats:['Cold independent CLI processes, not browser-session reuse','Trustworthy local fixtures only','Wall-clock timings depend on host load; results do not imply real-site accuracy'],results:out},null,2));
