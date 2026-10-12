#!/usr/bin/env node
/** Opt-in repeatable stress profiling. Only bundled trusted fixtures are visited.
 * This measures CLI process wall time, NOT field accuracy or production speed.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseBatchManifest } from '../dist/batch.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const manifestFile = path.join(root, 'examples/stress-batch.json');
const usage = 'Usage: node scripts/profile-stress.mjs [--plan] [--runs 1..3] [--parallel 1|2|4]';

function settings(args) {
  let runs = 1, parallel = 2, plan = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') return { help: true };
    if (arg === '--plan') { plan = true; continue; }
    if (arg === '--runs' || arg === '--parallel') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || (arg === '--runs' && (value < 1 || value > 3)) ||
          (arg === '--parallel' && ![1, 2, 4].includes(value))) throw new Error(usage);
      if (arg === '--runs') runs = value;
      else parallel = value;
    } else throw new Error(usage);
  }
  return { plan, runs, parallel };
}
function validateManifest() {
  const manifest = parseBatchManifest(JSON.parse(readFileSync(manifestFile, 'utf8')));
  if (manifest.jobs.length !== 16 || manifest.jobs.some(job =>
    !/^[a-z0-9-]+\.html$/.test(job.url ?? '') ||
    !/^[a-z0-9-]+\.json$/.test(job.spec) ||
    !['layout.json','gallery.json'].includes(job.spec) ||
    !['healthy.html','broken.html','gallery.html','gallery-broken.html'].includes(job.url))) {
    throw new Error('Stress profile requires exactly 16 reviewed, bundled, local HTML jobs');
  }
  return manifest;
}
function median(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle-1]+sorted[middle])/2*10)/10;
}
function run(variant, argv, expected, repetitions) {
  const times = [];
  const samples = [];
  for (let i=0;i<repetitions;i++) {
    const start = performance.now();
    // Array-form exec, no shell, no network URLs. Chromium sandbox settings
    // are inherited unmodified from the caller. Never disable it here.
    const child = spawnSync(process.execPath, [cli,...argv], { cwd:root, env:process.env,
      encoding:'utf8', timeout:180000, maxBuffer:12*1024*1024 });
    const elapsed = Math.round((performance.now()-start)*10)/10;
    if (child.error || child.status !== expected) {
      throw new Error(variant+' run '+(i+1)+' ended '+child.status+
        ' (expected '+expected+'): '+(child.error?.message || child.stderr || child.stdout).slice(-1200));
    }
    let report;
    try { report = JSON.parse(child.stdout); }
    catch { throw new Error(variant+' returned non-JSON output: '+child.stdout.slice(-300)); }
    if (variant.startsWith('batch-')) {
      if (report.mode !== 'batch' || report.summary?.total !== 16 ||
        report.summary?.errors !== 0 || report.summary?.violations < 1 ||
        report.jobs?.length !== 16) throw new Error(variant+' did not complete the 16 expected job states');
      samples.push({jobs:report.summary.total,passed:report.summary.passed,
        intentionallyViolating:report.summary.violations,errors:report.summary.errors});
    } else {
      const elements = Number(variant.slice('dom-'.length));
      const expectedTruncation = elements > 18000;
      if (report.mode !== 'audit' || report.summary?.viewports !== 1 ||
        Boolean(report.summary.incompleteViewports) !== expectedTruncation ||
        report.summary.measuredIssues !== 0) throw new Error(variant+
          ' did not preserve correct audit coverage and measured-error semantics');
      samples.push({elements,visited:report.summary.visitedElements,
        incomplete:report.summary.incompleteViewports,
        partial:report.summary.partialViewports});
    }
    times.push(elapsed);
  }
  return {variant,runs:repetitions,wallClockMs:times,medianMs:median(times),
    minMs:Math.min(...times),maxMs:Math.max(...times),samples};
}

function runBenchmark() {
  const opts = settings(process.argv.slice(2));
  if (opts.help) { process.stdout.write(usage+'\n'); return; }
  const manifest = validateManifest();
  const domSizes = [500,5000,20000];
  const description = {
    mode:'stress-profile-plan',manifest:'examples/stress-batch.json',
    jobs:manifest.jobs.map(job=>({id:job.id,widths:job.widths,locale:job.locale??null,
      mobile:job.mobile??false})),
    domSizes,parallel:opts.parallel,runs:opts.runs,
    internetRequests:false, browserRequired:!opts.plan,
    caveats:[
      'All 16 batch jobs are bundled trusted local fixtures and include deliberate failing layouts',
      'Synthetic DOM sizes measure one navigation and bounded top-document traversal only',
      'At 20,000 elements audit must report incomplete coverage (exit 2), not a clean page',
      'Cold independent CLI processes. No warm browser reuse, field detector accuracy, memory peak or cross-machine speed claims',
      'Wall-clock timings are noisy on shared hosts; rerun with stable host load and record hardware/browser versions'
    ]
  };
  if (opts.plan) { process.stdout.write(JSON.stringify(description,null,2)+'\n'); return; }
  const directory = mkdtempSync(path.join(os.tmpdir(),'bronto-layout-stress-'));
  const results=[];
  try {
    const parallelModes = opts.parallel === 1 ? [1] : [1, opts.parallel];
    for(const parallel of parallelModes) {
      results.push(run('batch-'+parallel,
        ['batch','--manifest',manifestFile,'--parallel',String(parallel),'--json','--compact'],
        1,opts.runs));
    }
    for(const count of domSizes) {
      const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
        '<meta name="viewport" content="width=device-width,initial-scale=1">'+
        '<style>body{margin:0}.item{height:4px;font-size:9px}</style></head><body><main>'+
        '<div class="item">Row</div>'.repeat(count)+'</main></body></html>';
      const file = path.join(directory,'stress-'+count+'.html');
      writeFileSync(file,html);
      results.push(run('dom-'+count,
        ['audit','--url',file,'--width','375','--json','--compact'],
        count > 18000 ? 2 : 0,opts.runs));
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
  process.stdout.write(JSON.stringify({...description, mode:'stress-profile',
    platform:process.platform, architecture:process.arch,nodeVersion:process.version,
    results},null,2)+'\n');
}

try {runBenchmark();}
catch(error) {process.stderr.write('Stress profile: '+(error?.message||error)+'\n');process.exitCode=2;}
