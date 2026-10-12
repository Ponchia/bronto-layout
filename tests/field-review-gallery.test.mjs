import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderFieldReviewGallery} from '../scripts/field-review-gallery.mjs';
const root=path.resolve(import.meta.dirname,'..');
const run=args=>spawnSync(process.execPath,[path.join(root,'scripts/field-benchmark.mjs'),...args],{cwd:root,encoding:'utf8',timeout:25000});
const hash=x=>createHash('sha256').update(x).digest('hex');
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,1,119,0,0,3,132]);
const fakeCapture=dir=>{
 const cases=path.join(dir,'cases','sample-375');
 mkdirSync(cases,{recursive:true});
 writeFileSync(path.join(cases,'screen.png'),png);
 writeFileSync(path.join(cases,'full.png'),png);
 const report=Buffer.from('{"findings":[{"code":"PREDICTION_SHOULD_NOT_APPEAR_IN_REVIEW"}]}');
 writeFileSync(path.join(cases,'audit.json'),report);
 const entry={id:'sample-375',url:'https://example.org/gallery?secret=token',width:375,complete:true,
  screenshotFile:'cases/sample-375/screen.png',screenshotSha256:hash(png),
  fullPageScreenshotFile:'cases/sample-375/full.png',fullPageScreenshotSha256:hash(png),
  fullPageEvidenceCoverage:'bounded-top-left-rectangle',fullPageTruncated:true,
  auditFile:'cases/sample-375/audit.json',auditSha256:hash(report)};
 const index={schemaVersion:1,datasetId:'gallery-test',sourceCommit:'abc123',capturedAt:'2026-10-12',
  captureOptions:{fullPageEvidence:true},cases:[entry]};
 writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));
 return {entry,index};
};
test('review-gallery gives human reviewer a local contact sheet with verified images, not detector predictions',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-review-gallery-'));
 try{
  fakeCapture(dir);
  const out=path.join(dir,'review-gallery.html');
  const r=run(['review-gallery','--captures',dir,'--out',out,'--json']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  const response=JSON.parse(r.stdout);
  assert.deepEqual({mode:response.mode,total:response.total,ready:response.readyForReview,
    predictions:response.includesDetectorPredictions},
    {mode:'field-review-gallery',total:1,ready:1,predictions:false});
  const html=readFileSync(out,'utf8');
  assert.match(html,/cases\/sample-375\/screen\.png/);
  assert.match(html,/cases\/sample-375\/full\.png/);
  assert.match(html,/Evidence verified/);
  assert.match(html,/Bounded document screenshot/);
  assert.match(html,/truncated/);
  assert.match(html,/Content-Security-Policy/);
  assert.doesNotMatch(html,/PREDICTION_SHOULD_NOT_APPEAR_IN_REVIEW/);
  assert.doesNotMatch(html,/<script\b/i);
  assert.doesNotMatch(html,/secret=token/);
  assert.equal(run(['review-gallery','--captures',dir,'--out',out]).status,2,
    'The generator must not overwrite prior reviewer work');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('review-gallery marks tampered or absent screenshot evidence unsafe instead of displaying it',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-bad-'));
 try{
  fakeCapture(dir);
  writeFileSync(path.join(dir,'cases','sample-375','full.png'),Buffer.from('tampered'));
  const output=path.join(dir,'gallery.html');
  const r=run(['review-gallery','--captures',dir,'--out',output,'--json']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.equal(JSON.parse(r.stdout).readyForReview,0);
  const html=readFileSync(output,'utf8');
  assert.match(html,/Incomplete evidence/);
  assert.match(html,/unavailable or integrity check failed/);
  assert.doesNotMatch(html,/src="cases\/sample-375\/full\.png"/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('untrusted metadata is HTML escaped and non-http URLs never become active links',()=>{
 const html=renderFieldReviewGallery({schemaVersion:1,datasetId:'<b>untrusted</b>',
    sourceCommit:'"><script>alert(1)</script>',capturedAt:'<img src=x>'},[{
    id:'safe-375',url:'javascript:alert(1)',width:375,locale:'<svg onload=alert(2)>',
    screenshotVerified:false,reportVerified:false,fullPageEvidenceVerified:null,
    fullPageTruncated:null,readyForReview:false
  }],'/tmp/captures','/tmp/captures/gallery.html');
 assert.match(html,/&lt;b&gt;untrusted&lt;\/b&gt;/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/&lt;svg onload=alert\(2\)&gt;/);
 assert.doesNotMatch(html,/<script\b|<svg\b|<b>untrusted|href="javascript:/i);
 assert.match(html,/Source URL unavailable/);
});
test('review-gallery rejects invalid index format and escaping capture paths',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-traversal-'));
 try{
  const {index}=fakeCapture(dir);
  index.cases[0].screenshotFile='../../outside.png';
  writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));
  const r=run(['review-gallery','--captures',dir,'--out',path.join(dir,'gallery.html')]);
  assert.equal(r.status,2);
  assert.match(r.stderr,/escapes capture directory/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('symlinks escaping a downloaded capture directory cannot become image references',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-symlink-'));
 const outside=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-outside-'));
 try{
  const {index}=fakeCapture(dir);
  const secret=path.join(outside,'screen.png');
  writeFileSync(secret,png);
  symlinkSync(secret,path.join(dir,'cases','sample-375','link.png'));
  index.cases[0].screenshotFile='cases/sample-375/link.png';
  writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));
  const r=run(['review-gallery','--captures',dir,'--out',path.join(dir,'gallery.html')]);
  assert.equal(r.status,2);
  assert.match(r.stderr,/resolves outside capture directory/);
 }finally{
  rmSync(dir,{recursive:true,force:true});
  rmSync(outside,{recursive:true,force:true});
 }
});
test('even hash-matching non-PNG content is not presented as a screenshot',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-gallery-not-png-'));
 try {
  const {index}=fakeCapture(dir);
  const payload=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  writeFileSync(path.join(dir,'cases','sample-375','screen.png'),payload);
  index.cases[0].screenshotSha256=hash(payload);
  writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));
  const out=path.join(dir,'review.html');
  const r=run(['review-gallery','--captures',dir,'--out',out,'--json']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.equal(JSON.parse(r.stdout).readyForReview,0);
  const html=readFileSync(out,'utf8');
  assert.doesNotMatch(html,/src="cases\/sample-375\/screen\.png"/);
  assert.doesNotMatch(html,/<svg|<script/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
