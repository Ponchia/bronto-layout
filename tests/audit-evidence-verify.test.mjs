import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync,linkSync,readFileSync,truncateSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyPairedAuditEvidence} from '../bin/audit-evidence-verify.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'bin/bronto-layout.mjs');
const tinyPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+USLaJwAAAABJRU5ErkJggg==','base64');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t, widths=[375]) {
  const base=mkdtempSync(path.join(os.tmpdir(),'bronto-verify-paired-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const evidence=path.join(base,'copied-images');
  const rows=widths.map(width=>{
    const pair={width};
    for(const version of ['baseline','candidate']) {
      const filename=`audit-${version}-${width}px.png`;
      pair[version]={file:path.join('/original-machine/other-artifacts',filename),coverage:'viewport-only',
        sha256:hash(tinyPNG)};
    }
    return pair;
  });
  const report={schemaVersion:1,mode:'audit-compare',sampledWidths:widths,
    comparisonEvidence:rows,summary:{measuredRegressions:3}};
  return {base,evidence,report,rows,ensure:()=>{
    // In a copied bundle, the absolute report paths no longer exist: verification
    // must use only canonical filenames relative to the selected local directory.
    mkdirSync(evidence);
    for(const pair of rows)for(const version of ['baseline','candidate']) {
      writeFileSync(path.join(evidence,`audit-${version}-${pair.width}px.png`),tinyPNG);
    }
  }};
}
const run=args=>spawnSync(process.execPath,[cli,...args],{
  cwd:root,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});

test('a relocated two-width paired audit artifact verifies offline without consulting original absolute paths',async t=>{
  const f=fixture(t,[375,768]);f.ensure();
  const result=await verifyPairedAuditEvidence(f.report,f.evidence);
  assert.equal(result.mode,'evidence-verify');
  assert.equal(result.status,'verified');
  assert.deepEqual(result.summary,{pairedWidths:2,totalImages:4,verifiedImages:4,unsafeImages:0});
  assert.equal(result.records.length,2);
  assert.ok(result.records.every(r=>r.baseline.status==='verified'&&r.candidate.status==='verified'));
  assert.ok(result.records.every(r=>r.candidate.pixelWidth===1&&r.candidate.pixelHeight===1));
  assert.ok(!JSON.stringify(result).includes('/original-machine'));
  const reportFile=path.join(f.base,'comparison-report.json');
  writeFileSync(reportFile,JSON.stringify(f.report));
  const cliRun=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,'--json']);
  assert.equal(cliRun.status,0,cliRun.stderr||cliRun.stdout);
  assert.equal(JSON.parse(cliRun.stdout).summary.verifiedImages,4);
  assert.ok(!cliRun.stdout.includes('measuredRegressions'),'evidence verifier must not infer or copy audit verdicts');
});

test('missing, corrupted and symlinked screenshots are unsafe, never verified',async t=>{
  const f=fixture(t);f.ensure();
  const baseline=path.join(f.evidence,'audit-baseline-375px.png');
  const candidate=path.join(f.evidence,'audit-candidate-375px.png');
  writeFileSync(baseline,Buffer.concat([tinyPNG,Buffer.from('TAMPERED')]));
  let r=await verifyPairedAuditEvidence(f.report,f.evidence);
  assert.equal(r.summary.unsafeImages,1);
  assert.equal(r.records[0].baseline.reason,'Screenshot SHA-256 mismatch');
  writeFileSync(baseline,tinyPNG);
  rmSync(candidate);
  r=await verifyPairedAuditEvidence(f.report,f.evidence);
  assert.equal(r.records[0].candidate.reason,'Screenshot is missing');
  symlinkSync(baseline,candidate);
  r=await verifyPairedAuditEvidence(f.report,f.evidence);
  assert.equal(r.records[0].candidate.reason,'Screenshot must be a regular non-symlink file');
  rmSync(candidate);writeFileSync(candidate,tinyPNG);
  const large=path.join(f.evidence,'audit-baseline-375px.png');
  truncateSync(large,32*1024*1024+1);
  r=await verifyPairedAuditEvidence(f.report,f.evidence);
  assert.equal(r.records[0].baseline.reason,'Invalid image length (limit 32 MiB)');
});

test('invalid, non-canonical and duplicate report metadata is rejected before opening screenshot paths',async t=>{
  const f=fixture(t);f.ensure();
  const malformed=[
    {...f.report,mode:'check'},
    {...f.report,comparisonEvidence:[]},
    {...f.report,sampledWidths:[375,375],comparisonEvidence:[...f.rows,...f.rows]},
    {...f.report,comparisonEvidence:[{...f.rows[0],width:430}]},
    {...f.report,comparisonEvidence:[{...f.rows[0],baseline:{...f.rows[0].baseline,file:'../audit-baseline-375px.png'}}]},
    {...f.report,comparisonEvidence:[{...f.rows[0],baseline:{...f.rows[0].baseline,sha256:'x'.repeat(64)}}]},
    {...f.report,comparisonEvidence:[{...f.rows[0],baseline:{...f.rows[0].baseline,coverage:'full-page'}}]}
  ];
  for(const report of malformed) await assert.rejects(
    ()=>verifyPairedAuditEvidence(report,f.evidence), /report|viewport|path provenance|evidence/);
});

test('tampering never exits green, and failure reporting cannot overwrite the comparison source',t=>{
  const f=fixture(t);f.ensure();
  const reportFile=path.join(f.base,'report.json');writeFileSync(reportFile,JSON.stringify(f.report));
  const baseline=path.join(f.evidence,'audit-baseline-375px.png');
  writeFileSync(baseline,Buffer.from('not a png'));
  const unsafe=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,'--json']);
  assert.equal(unsafe.status,2,unsafe.stderr||unsafe.stdout);
  assert.equal(JSON.parse(unsafe.stdout).status,'unsafe');
  assert.equal(JSON.parse(unsafe.stdout).summary.unsafeImages,1);
  const original=readFileSync(reportFile);
  const overwrite=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,
    '--json','--report',reportFile]);
  assert.equal(overwrite.status,2);
  assert.match(JSON.parse(overwrite.stdout).error.message,/must not overwrite/);
  assert.deepEqual(readFileSync(reportFile),original);
  const invalid=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,
    '--url','https://example.invalid/','--json','--report',reportFile]);
  assert.equal(invalid.status,2);
  assert.deepEqual(readFileSync(reportFile),original,
    'Even the global exception-to-report handler must not rewrite source evidence');
  const alias=path.join(f.base,'report-symlink.json');
  symlinkSync(reportFile,alias);
  const throughLink=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,
    '--json','--report',alias]);
  assert.equal(throughLink.status,2,throughLink.stderr||throughLink.stdout);
  assert.deepEqual(readFileSync(reportFile),original,
    'Symlink aliases of the source report must not be overwritten');
  const aliasHard=path.join(f.base,'report-hardlink.json');
  linkSync(reportFile,aliasHard);
  const throughHardlink=run(['verify-evidence','--comparison',reportFile,'--evidence-dir',f.evidence,
    '--json','--report',aliasHard]);
  assert.equal(throughHardlink.status,2,throughHardlink.stderr||throughHardlink.stdout);
  assert.deepEqual(readFileSync(reportFile),original,
    'Hardlink aliases of source report must not be overwritten');
});

test('CLI validates offline-only flags and rejects unsolicited comparison options',()=>{
  const attempts=[
    ['verify-evidence','--comparison','x.json'],
    ['verify-evidence','--evidence-dir','somewhere'],
    ['verify-evidence','--comparison','x.json','--evidence-dir','somewhere','--url','https://example.invalid/'],
    ['verify-evidence','--comparison','x.json','--evidence-dir','somewhere','--timeout','2000'],
    ['audit','--url','examples/audit-healthy.html','--comparison','x.json']
  ];
  for(const attempt of attempts){
    const r=run([...attempt,'--json']);
    assert.equal(r.status,2,r.stderr||r.stdout);
    assert.equal(JSON.parse(r.stdout).mode,'error');
  }
});
