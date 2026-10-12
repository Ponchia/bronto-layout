#!/usr/bin/env node
/**
 * Small controlled benchmark for explicitly labeled zero-contract audit cases.
 * Not a substitute for independently labeled production websites or a
 * published head-to-head comparison with other products.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  validateBenchmarkManifest, scoreLabeledAuditCases
} from './audit-benchmark-metrics.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const examples=path.resolve(root,'examples');
const args=process.argv.slice(2);
const flag=name=>args.includes(name);
function option(name, fallback) {
  const index=args.indexOf(name);
  if(index===-1) return fallback;
  if(index===args.length-1 || args[index+1].startsWith('--')) {
    throw new Error(name+' requires a value');
  }
  return args[index+1];
}
function under(rootDir,target) {
  const relative=path.relative(rootDir,target);
  return relative!=='' && relative!=='..' &&
    !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
}

async function main() {
  if(flag('--help')) {
    process.stdout.write([
      'Bronto Layout audit benchmark — labeled fixture quality checks',
      'Usage: node scripts/benchmark-audit.mjs [--json] [--assert] [--report FILE] [--manifest FILE]',
      'Only explicitly labeled local HTML fixtures; no internet, LLM, or cloud service.',
      'Exit 0 if completed (and --assert labels match), 1 for --assert mismatches, 2 for runtime/incomplete labels.'
    ].join('\n')+'\n');
    return;
  }
  const allowed=new Set(['--help','--assert','--json','--report','--manifest']);
  for(let i=0;i<args.length;i++) {
    if(!allowed.has(args[i]) && args[i-1]!=='--report' && args[i-1]!=='--manifest') {
      throw new Error('Unsupported benchmark option: '+args[i]);
    }
  }
  const manifestPath=path.resolve(option('--manifest',path.join(root,'benchmarks','audit-controlled-v0.1.json')));
  if(!existsSync(manifestPath))throw new Error('No benchmark manifest at '+manifestPath);
  const manifest=validateBenchmarkManifest(JSON.parse(readFileSync(manifestPath,'utf8')));
  const dir=realpathSync(examples);
  const started=performance.now();
  const rows=[];
  for(const sample of manifest.cases) {
    const fixture=path.resolve(examples,sample.fixture);
    if(!existsSync(fixture) || !under(dir,realpathSync(fixture))) {
      throw new Error('Fixture path escapes examples/: '+sample.fixture);
    }
    const request=[
      path.join(root,'bin','bronto-layout.mjs'),
      'audit','--url',fixture,'--width',String(sample.width),
      '--settle','300','--timeout','15000','--json','--compact'
    ];
    const observed=spawnSync(process.execPath,request,{
      cwd:root,encoding:'utf8',timeout:45000,
      maxBuffer:8*1024*1024,env:process.env
    });
    let document;
    try {document=JSON.parse(observed.stdout);}catch {document=undefined;}
    const report=document?.reports?.[0];
    const valid=(observed.status===0 || observed.status===1) &&
      document?.mode==='audit' && document?.summary?.viewports===1 &&
      report?.width===sample.width &&
      // Controlled fixtures may intentionally contain uninspected iframe
      // interiors with review-only warnings. They are valid test captures when
      // the supported top-level/open-shadow traversal actually completed.
      // Do not use this predicate for whole-page real-world accuracy scoring.
      (report?.summary?.supportedScopeMeasured === true ||
        (report?.summary?.supportedScopeMeasured === undefined &&
          report?.summary?.verified === true)) &&
      Array.isArray(report.findings);
    const localizationCodes=manifest.localization?.codes ?? [];
    const observedLocations=Object.fromEntries(localizationCodes.map(code => [
      code,valid ? [...new Set(report.findings.filter(f => f.code===code && typeof f.path==='string')
        .map(f=>f.path))] : []
    ]));
    const unlocalized=valid ? report.findings.filter(f =>
      localizationCodes.includes(f.code) && !(typeof f.path==='string' && f.path.length>0)) : [];
    // A capped per-element evidence list cannot prove that the named element
    // was found. This is an incomplete attribution, not a true negative.
    const localizationComplete=valid &&
      unlocalized.length===0 &&
      (report.coverage?.omittedBrokenImages===0) &&
      (report.coverage?.omittedTextClips===0);
    rows.push({
      id:sample.id, fixture:sample.fixture,width:sample.width,
      ...(manifest.localization ? {
        expectedLocations:sample.expectedLocations,
        observedLocations,localizationComplete,
        ...(!localizationComplete ? {
          localizationError:'Element paths missing or omitted from bounded diagnostic evidence'
        } : {})
      } : {}),
      expectedMeasured:sample.expectedMeasured,
      expectedReview:sample.expectedReview,
      observedMeasured:valid?[...new Set(report.findings
        .filter(f=>f.classification==='measured').map(f=>f.code))]:[],
      observedReview:valid?[...new Set(report.findings
        .filter(f=>f.classification==='review').map(f=>f.code))]:[],
      issueCounts:valid?{
        measured:report.findings.filter(f=>f.classification==='measured').length,
        review:report.findings.filter(f=>f.classification==='review').length
      }:undefined,
      complete:valid,
      ...(valid?{}:{
        error:observed.error?.message ||
          document?.error?.message ||
          observed.stderr?.trim().slice(-400) ||
          'Unexpected/incomplete audit result with exit '+observed.status
      })
    });
  }
  const scored=scoreLabeledAuditCases(rows,manifest.detectors);
  const result={
    schemaVersion:1,mode:'audit-benchmark',
    benchmarkId:manifest.id,labelSource:manifest.labelSource,
    fixtureCases:manifest.cases.length,
    browserRunner:'bronto-layout local Chromium CDP',
    nodeVersion:process.version,
    elapsedMs:Math.round(performance.now()-started),
    metrics:scored,
    cases:rows.map(row=>({
      id:row.id,width:row.width,fixture:row.fixture,
      labelReason:manifest.cases.find(item=>item.id===row.id).labelReason,
      expectedMeasured:row.expectedMeasured,
      expectedReview:row.expectedReview,
      observedMeasured:row.observedMeasured,
      observedReview:row.observedReview,
      ...(manifest.localization ? {
        expectedLocations:row.expectedLocations,
        observedLocations:row.observedLocations,
        localizationComplete:row.localizationComplete,
        ...(row.localizationError ? { localizationError:row.localizationError } : {})
      } : {}),
      issueCounts:row.issueCounts,
      complete:row.complete,
      ...(row.error?{error:row.error}:{})
    })),
    limitations:[
      'Only hand-authored controlled fixtures, not independent production-site samples',
      'Classification unit is one code in one fixture/viewport, not individual DOM elements',
      'Measured root overflow can be intentional; no automatic design-intent inference',
      'Chromium-only at these widths and loading conditions',
      'No claim of superiority over other tools or WCAG conformance'
    ]
  };
  const reportPath=option('--report',null);
  if(reportPath) {
    const target=path.resolve(reportPath);
    mkdirSync(path.dirname(target),{recursive:true});
    writeFileSync(target,JSON.stringify(result,null,2)+'\n');
  }
  if(flag('--json'))process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else {
    process.stdout.write(
      'Bronto Layout controlled audit benchmark: '+result.benchmarkId+'\n'+
      'Cases: '+scored.evaluatedCases+'/'+manifest.cases.length+
      ' evaluated; '+scored.matchingCases+' exact label matches; '+
      scored.incompleteCases+' incomplete\n'+
      'Measured detection: TP '+scored.measured.tp+', FP '+scored.measured.fp+
      ', FN '+scored.measured.fn+', precision '+
      (scored.measured.precision?.toFixed(3)??'N/A')+', recall '+
      (scored.measured.recall?.toFixed(3)??'N/A')+'\n'+
      'Review detection: TP '+scored.review.tp+', FP '+scored.review.fp+
      ', FN '+scored.review.fn+', precision '+
      (scored.review.precision?.toFixed(3)??'N/A')+', recall '+
      (scored.review.recall?.toFixed(3)??'N/A')+'\n'+
      (scored.localization ? 'Element localization: '+scored.localization.evaluatedCases+'/'+
        scored.localization.labeledCases+' labeled cases, '+scored.localization.matchingCases+
        ' exact path matches; TP '+scored.localization.tp+', FP '+scored.localization.fp+
        ', FN '+scored.localization.fn+', precision '+
        (scored.localization.precision?.toFixed(3)??'N/A')+', recall '+
        (scored.localization.recall?.toFixed(3)??'N/A')+'\n' : '')+
      (scored.localization?.caseResults.some(row=>row.status!=='match') ?
        scored.localization.caseResults.filter(row=>row.status!=='match').map(row=>
          '  Element '+row.id+': '+row.status+
          (row.mismatches?.length?' '+row.mismatches.map(m=>m.code+'/'+m.path+'/'+m.type).join(', '):'')
        ).join('\n')+'\n' : '')+
      (scored.caseResults.some(row=>row.status!=='match') ?
        scored.caseResults.filter(row=>row.status!=='match').map(row=>
          '  '+row.id+': '+row.status+(row.mismatches?.length ?
            ' '+row.mismatches.map(item=>item.category+'/'+item.code+'/'+item.type).join(', '):'')
        ).join('\n')+'\n' : '')+
      'Warning: this tiny controlled dataset is not evidence of real-world competitive accuracy.\n'
    );
  }
  if(scored.incompleteCases || scored.localization?.incompleteCases)process.exitCode=2;
  else if(flag('--assert') && (scored.matchingCases!==scored.evaluatedCases ||
    (scored.localization && scored.localization.matchingCases!==scored.localization.evaluatedCases)))process.exitCode=1;
}
main().catch(error=>{
  console.error('Bronto audit benchmark: '+(error?.message || String(error)));
  process.exitCode=2;
});
