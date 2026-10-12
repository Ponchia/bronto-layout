import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderFieldReviewConsole } from '../scripts/field-review-console.mjs';
import { validateFieldLabels } from '../scripts/field-benchmark-core.mjs';
import { chromeExecutable } from '../bin/chrome-detect.mjs';
import { startBrowser } from '../bin/chromium-session.mjs';
import { serveTarget } from '../bin/local-fixture-server.mjs';

const root=path.resolve(import.meta.dirname,'..');
const script=path.join(root,'scripts/field-benchmark.mjs');
const sha=data=>createHash('sha256').update(data).digest('hex');
const run=args=>spawnSync(process.execPath,[script,...args],{
  cwd:root,encoding:'utf8',timeout:25000,maxBuffer:5*1024*1024
});
// A small valid static PNG. The content bytes are never interpreted as labels.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+y+lcAAAAASUVORK5CYII=','base64');
const prediction=Buffer.from(JSON.stringify({findings:[{
  code:'PREDICTION_DO_NOT_USE_AS_GROUND_TRUTH',source:'https://example.test/secret?auth=token'
}]}));

function fixture(t, opts={}) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-review-console-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:80}));
  const entries=[];
  for(const [id,index] of [['sample-375',375],['unsafe-320',320]]) {
    const folder=path.join(dir,'cases',id);
    mkdirSync(folder,{recursive:true});
    writeFileSync(path.join(folder,'screen.png'),png);
    writeFileSync(path.join(folder,'full.png'),png);
    writeFileSync(path.join(folder,'audit.json'),prediction);
    entries.push({id,url:'https://example.test/gallery?access=secret-token',width:index,complete:true,
      screenshotFile:`cases/${id}/screen.png`,screenshotSha256:sha(png),
      fullPageScreenshotFile:`cases/${id}/full.png`,fullPageScreenshotSha256:sha(png),
      fullPageEvidenceCoverage:'rendered-document-rectangle',fullPageTruncated:false,
      auditFile:`cases/${id}/audit.json`,auditSha256:sha(prediction)});
  }
  if(opts.tamper)writeFileSync(path.join(dir,'cases/unsafe-320/screen.png'),Buffer.from('not-an-image'));
  const index={schemaVersion:1,datasetId:'fixture-human-review',
    sourceCommit:'abc123',capturedAt:'2026-10-12',
    captureOptions:{fullPageEvidence:true},cases:entries};
  writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));
  return {dir,index};
}

function generate(dir) {
  const output=path.join(dir,'review-console.html');
  const r=run(['review-console','--captures',dir,'--out',output,'--json']);
  assert.equal(r.status,0,r.stderr||r.stdout);
  return {output,result:JSON.parse(r.stdout),html:readFileSync(output,'utf8')};
}

test('offline console uses hash-locked JavaScript, local screenshot paths and no audit predictions',t=>{
  const {dir}=fixture(t);
  const {output,result,html}=generate(dir);
  assert.deepEqual({total:result.total,ready:result.readyForReview,pending:result.initialPending,
    predictions:result.includesDetectorPredictions,network:result.outboundNetworkEnabled},
    {total:2,ready:2,pending:2,predictions:false,network:false});
  assert.match(html,/cases\/sample-375\/screen\.png/);
  assert.match(html,/cases\/sample-375\/full\.png/);
  assert.match(html,/Independent human review status|Independent review status/);
  assert.match(html,/href="https:\/\/example\.test\/gallery"/);
  assert.doesNotMatch(html,/secret-token|PREDICTION_DO_NOT_USE_AS_GROUND_TRUTH|access=secret/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/frame-src 'none'/);
  assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval\s*\(/);
  const match=html.match(/script-src 'sha256-([^']+)'/);
  const contents=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match && contents);
  assert.equal(createHash('sha256').update(contents[1]).digest('base64'),match[1],
    'CSP should permit precisely this hashed inline script, not arbitrary injected code');
  assert.equal(run(['review-console','--captures',dir,'--out',output]).status,2,
    'never overwrite an existing reviewer file');
});

test('the offline console disallows reviewed status for tampered screenshots while preserving unreviewable',t=>{
  const {dir}=fixture(t,{tamper:true});
  const {result,html}=generate(dir);
  assert.equal(result.readyForReview,1);
  assert.match(html,/Evidence unsafe/);
  assert.match(html,/option value="reviewed" disabled/);
  assert.doesNotMatch(html,/src="cases\/unsafe-320\/screen\.png"/);
  assert.match(html,/Unreviewable \/ evidence insufficient/);
});

test('renderer escapes malicious metadata instead of making executable markup or untrusted links',()=>{
  const html=renderFieldReviewConsole({schemaVersion:1,datasetId:'<svg onload=alert(1)>'},[{
    id:'safe-375',url:'javascript:alert(1)',width:375,locale:'<script>alert(2)</script>',
    screenshotVerified:false,reportVerified:false,fullPageEvidenceVerified:null,readyForReview:false
  }],'/tmp/bronto-captures','/tmp/bronto-captures/console.html');
  assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
  assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<svg\b|href="javascript:/i);
  assert.equal((html.match(/<script>/g)||[]).length,1);
  assert.match(html,/\\u003csvg/);
  assert.throws(()=>renderFieldReviewConsole({schemaVersion:1,datasetId:'bad'},[
    {id:'duplicate',readyForReview:false},{id:'duplicate',readyForReview:false}
  ],'/tmp','/tmp/console.html'),/repeated/);
});

function maybeBrowser(t) {
  try{return chromeExecutable();}
  catch(error){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw error;
    t.skip('Chrome/Chromium unavailable');return null;
  }
}

test('Chromium reviewer form exports pending, validates declarations and round-trips reviewed JSON locally',{
  timeout:90000
},async t=>{
  const chrome=maybeBrowser(t);
  if(!chrome)return;
  const {dir,index}=fixture(t);
  const {output}=generate(dir);
  const local=await serveTarget(output);
  let browser;
  try {
    browser=await startBrowser(chrome,25000,process.env.BRONTO_CHROME_NO_SANDBOX==='1');
    const cdp=browser.cdp;
    const loaded=cdp.event('Page.domContentEventFired',25000);
    const nav=await cdp.send('Page.navigate',{url:local.url});
    if(nav.errorText)throw new Error(nav.errorText);
    await loaded.promise;
    const boot=await cdp.eval(`(() => ({
      items:document.querySelectorAll('[data-case-id]').length,
      count:document.querySelector('#counts')?.textContent,
      status:document.querySelector('#feedback')?.textContent,
      image:document.querySelector('img')?.complete
    }))()`);
    assert.equal(boot.items,2);
    assert.match(boot.count,/0 reviewed · 2 pending/);
    // Intercept only a local Blob download for inspection; no file is uploaded.
    await cdp.eval(`(() => {
      window.__reviewExport=null;
      window.__realCreate=URL.createObjectURL.bind(URL);
      window.__realRevoke=URL.revokeObjectURL.bind(URL);
      window.__realClick=HTMLAnchorElement.prototype.click;
      URL.createObjectURL=blob=>{window.__reviewExport=blob;return 'blob:fixture-test';};
      URL.revokeObjectURL=()=>{};
      HTMLAnchorElement.prototype.click=function(){ if(this.download)return; };
      return true;
    })()`);
    const pending=await cdp.eval(`(async()=>{
      document.querySelector('#download-labels').click();
      return JSON.parse(await window.__reviewExport.text());
    })()`);
    assert.deepEqual(pending.cases,index.cases.map(c=>({id:c.id,reviewStatus:'pending'})));
    assert.ok(pending.cases.every(c=>!('expectedMeasured' in c)));
    // A human-style explicit choice and attestations are required.
    const invalid=await cdp.eval(`(() => {
      const card=document.querySelector('[data-case-id="sample-375"]');
      const status=card.querySelector('.decision');
      status.value='reviewed';status.dispatchEvent(new Event('change'));
      document.querySelector('#download-labels').click();
      return document.querySelector('#feedback').textContent;
    })()`);
    assert.match(invalid,/Cannot export/);
    const exported=await cdp.eval(`(async()=>{
      const card=document.querySelector('[data-case-id="sample-375"]');
      card.querySelector('.reviewer').value='Independent Test Reviewer';
      card.querySelector('.review-date').value='2026-10-12';
      card.querySelector('.rationale').value='I independently inspected the controlled fixture in Chromium.';
      card.querySelector('.attest-screenshot').checked=true;
      card.querySelector('.attest-page').checked=true;
      card.querySelector('.measured input[value="broken-image"]').checked=true;
      document.querySelector('#download-labels').click();
      return JSON.parse(await window.__reviewExport.text());
    })()`);
    assert.equal(exported.cases[0].reviewStatus,'reviewed');
    assert.deepEqual(exported.cases[0].expectedMeasured,['broken-image']);
    assert.deepEqual(exported.cases[0].expectedReview,[]);
    assert.equal(exported.cases[1].reviewStatus,'pending');
    assert.doesNotMatch(JSON.stringify(exported),/PREDICTION_DO_NOT_USE|secret-token/);
    assert.doesNotThrow(()=>validateFieldLabels(exported,index.datasetId,index.cases.map(c=>c.id)));
    const imported=await cdp.eval(`(async()=>{
      const file=new File([${JSON.stringify(JSON.stringify(exported))}],'prior-labels.json',{type:'application/json'});
      const input=document.querySelector('#import-labels');
      const d=new DataTransfer();d.items.add(file);input.files=d.files;
      input.dispatchEvent(new Event('change'));
      for(let i=0;i<60;i++){
        if(document.querySelector('#feedback').textContent.includes('Imported'))break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      return {status:document.querySelector('#feedback').textContent,
        name:document.querySelector('[data-case-id="sample-375"] .reviewer').value};
    })()`);
    assert.match(imported.status,/Imported 2 reviewer declarations locally/);
    assert.equal(imported.name,'Independent Test Reviewer');
    // Restore real browser download APIs and verify an actual file is created.
    // This catches CSP/Blob/download restrictions a mocked click cannot catch.
    const downloads=path.join(dir,'downloads');
    mkdirSync(downloads);
    await cdp.send('Browser.setDownloadBehavior',{
      behavior:'allow',downloadPath:downloads,eventsEnabled:true
    });
    await cdp.eval(`(() => {
      URL.createObjectURL=window.__realCreate;
      URL.revokeObjectURL=window.__realRevoke;
      HTMLAnchorElement.prototype.click=window.__realClick;
      document.querySelector('#download-labels').click();
      return true;
    })()`);
    let filename;
    for(let i=0;i<35;i++){
      filename=readdirSync(downloads).find(file=>file.endsWith('.json'));
      if(filename)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(filename,'bronto-human-labels-fixture-human-review.json',
      'the real browser must save a schema-valid JSON file when the reviewer clicks Export');
    const saved=JSON.parse(readFileSync(path.join(downloads,filename),'utf8'));
    assert.doesNotThrow(()=>validateFieldLabels(saved,index.datasetId,index.cases.map(c=>c.id)));
    assert.equal(saved.cases[0].reviewStatus,'reviewed');
    assert.deepEqual(saved.cases[0].expectedMeasured,['broken-image']);
  } finally {await browser?.close();local.close();}
});
