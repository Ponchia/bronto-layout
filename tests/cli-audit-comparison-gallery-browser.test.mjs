import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { startBrowser } from '../bin/chromium-session.mjs';
import { chromeExecutable } from '../bin/chrome-detect.mjs';

const root=path.resolve(import.meta.dirname,'..');
const cli=path.join(root,'bin/bronto-layout.mjs');

test('offline paired comparison HTML actually loads both PNGs and the CSP-approved grid layout in Chromium',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'bronto-paired-browser-gallery-'));
  let browser;
  try{
    const captured=spawnSync(process.execPath,[cli,'audit',
      '--baseline','examples/audit-healthy.html', '--url','examples/audit-broken.html',
      '--width','375','--json','--compact','--evidence-dir',directory],{
      cwd:root,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,
      env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
    });
    if(captured.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(captured.stdout+captured.stderr)){
      if(process.env.BRONTO_REQUIRE_CHROME==='1') throw new Error('CI requires Chromium');
      t.skip('Chromium unavailable');return;
    }
    assert.equal(captured.status,1,captured.stderr||captured.stdout);
    const report=JSON.parse(captured.stdout);
    const file=report.comparisonGallery.file;
    browser=await startBrowser(chromeExecutable(),15000,process.env.BRONTO_CHROME_NO_SANDBOX==='1');
    const loaded=browser.cdp.event('Page.loadEventFired',15000);
    const nav=await browser.cdp.send('Page.navigate',{url:pathToFileURL(file).href});
    assert.equal(nav.errorText,undefined);
    await loaded.promise;
    const rendered=await browser.cdp.eval(`(async()=>{
      await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));
      return { images:[...document.images].map(img=>({
        source:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight,
        complete:img.complete
      })), cases:document.querySelectorAll('.case').length,
      grid:getComputedStyle(document.querySelector('.columns')).display,
      scriptCount:document.querySelectorAll('script').length,
      csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]').content };
    })()`);
    assert.equal(rendered.images.length,2);
    assert.equal(rendered.cases,1);
    assert.equal(rendered.grid,'grid');
    assert.equal(rendered.scriptCount,0);
    assert.ok(rendered.images.every(img=>img.complete&&img.width===375&&img.height>0));
    assert.match(rendered.csp,/script-src 'none'/);
    assert.match(rendered.csp,/connect-src 'none'/);
  } finally {
    await browser?.close();
    rmSync(directory,{recursive:true,force:true});
  }
});
