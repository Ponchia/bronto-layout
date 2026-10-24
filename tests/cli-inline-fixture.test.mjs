import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeExecutable } from '../bin/chrome-detect.mjs';
import { startBrowser } from '../bin/chromium-session.mjs';
import { setInlineFixtureContent } from '../bin/inline-fixture.mjs';

test('CDP inline fixtures preserve HTML, scripts and geometry without constructing JavaScript', { timeout: 45000 }, async t => {
  let chrome;
  try { chrome = chromeExecutable(); }
  catch (error) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw error;
    t.skip('Chromium unavailable'); return;
  }
  const browser = await startBrowser(chrome, 15000, process.env.BRONTO_CHROME_NO_SANDBOX === '1');
  try {
    await setInlineFixtureContent(browser.cdp, undefined,
      '<!doctype html><style>#probe{width:123px}</style>' +
      '<p id="probe">\'); globalThis.injected = true; // \u2028</p>' +
      '<script>globalThis.fixtureLoaded=true;</script>');
    const observed = await browser.cdp.eval(`(() => ({
      text: document.querySelector('#probe').textContent,
      width: document.querySelector('#probe').getBoundingClientRect().width,
      fixtureLoaded: globalThis.fixtureLoaded,
      injected: typeof globalThis.injected
    }))()`);
    assert.equal(observed.text, "'); globalThis.injected = true; // \u2028");
    assert.equal(observed.width, 123);
    assert.equal(observed.fixtureLoaded, true);
    assert.equal(observed.injected, 'undefined');
  } finally { await browser.close(); }
});
