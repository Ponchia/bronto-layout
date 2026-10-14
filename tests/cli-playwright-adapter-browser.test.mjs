import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import {checkPlaywrightPage} from '../dist/playwright.js';

const spec={schemaVersion:1,widths:[375],selectors:{heading:'#heading',content:'#content'},rules:[
  {id:'semantic-alignment',type:'align-edge',a:'heading',b:'content',edgeA:'left',tolerance:1},
  {id:'document-fit',type:'document-overflow',tolerance:1}
]};

test('real Playwright Chromium Page evaluates live geometry with no second browser harness',async t=>{
  const args={headless:true,chromiumSandbox:process.env.BRONTO_CHROME_NO_SANDBOX!=='1'};
  const binary=process.env.CHROME_PATH||process.env.BRONTO_PLAYWRIGHT_CHROME||
    (process.platform==='linux' && existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  if(binary)args.executablePath=binary;
  let browser;
  try {browser=await chromium.launch(args);} catch(error) {
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw error;
    t.skip('Chromium unavailable on test host');return;
  }
  try {
    const page=await browser.newPage({viewport:{width:375,height:900}});
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0}#heading,#content{position:relative;padding:0;margin:10px;width:200px;height:30px}</style></head><body><h1 id="heading">Header</h1><main id="content">Content</main></body></html>');
    const baseline=await checkPlaywrightPage(page,spec);
    assert.deepEqual(baseline.summary,{passed:2,failed:0,skipped:0});
    await page.addStyleTag({content:'#content{transform:translateX(12px)!important}'});
    const changed=await checkPlaywrightPage(page,spec);
    assert.equal(changed.summary.failed,1);
    assert.equal(changed.findings.find(x=>x.id==='semantic-alignment').deviation,12);
    assert.equal(changed.findings.find(x=>x.id==='document-fit').status,'pass');
    await page.setViewportSize({width:768,height:900});
    await assert.rejects(checkPlaywrightPage(page,spec),/does not match/);
    await page.close();
  } finally {await browser.close();}
});
