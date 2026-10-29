import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const html = `<!doctype html>
<html><head><style>body{margin:0} svg{display:block;width:600px;height:300px}
  </style></head><body>
  <svg id="diagram" viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
    <rect id="left" x="20" y="30" width="80" height="40" fill="teal"/>
    <rect id="right" x="120" y="30" width="80" height="40" fill="teal"/>
    <foreignObject x="220" y="30" width="60" height="40">
      <div id="label" xmlns="http://www.w3.org/1999/xhtml" style="width:60px;height:24px">Label</div>
    </foreignObject>
  </svg>
</body></html>`;

test('real Chromium captures root-space geometry, foreignObject labels and deliberate SVG shifts', async t => {
  const server = createServer(async (req, res) => {
    if (req.url === '/svg.js') {
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.end(await readFile(new URL('../dist/svg.js', import.meta.url)));
    } else if (req.url === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html);
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) =>
    server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let browser;
  try {
    try {
      const path = process.env.BRONTO_PLAYWRIGHT_CHROME || process.env.CHROME_PATH ||
        (process.platform === 'linux' && existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: process.env.BRONTO_CHROME_NO_SANDBOX !== '1',
        ...(path ? { executablePath: path } : {}),
      });
    } catch (error) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') throw error;
      t.skip('Verified browser not installed on this fixture host');
      return;
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'load' });
    const readGeometry = () => page.evaluate(async () => {
      const { captureSvgHostGeometry } = await import('/svg.js');
      const root = document.querySelector('#diagram');
      return captureSvgHostGeometry({
        root,
        inventoryComplete: true,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        revision: 'render-7',
        targets: [
          { id: 'left-model', element: document.querySelector('#left') },
          { id: 'right-model', element: document.querySelector('#right') },
          { id: 'label-model', element: document.querySelector('#label') },
        ],
      });
    });
    const initial = await readGeometry();
    assert.equal(initial.space, 'svg');
    assert.equal(initial.viewport.width, 390);
    assert.equal(initial.revision, 'render-7');
    const byId = id => initial.elements.find(e => e.id === id);
    assert.deepEqual(byId('left-model').rect, { x: 20, y: 30, width: 80, height: 40 });
    assert.deepEqual(byId('right-model').rect, { x: 120, y: 30, width: 80, height: 40 });
    assert.equal(byId('label-model').measurement, 'measured');
    assert.deepEqual(byId('label-model').rect, { x: 220, y: 30, width: 60, height: 24 });
    await page.locator('#right').evaluate(element =>
      element.setAttribute('transform', 'translate(0 12)'));
    const moved = await readGeometry();
    assert.equal(moved.elements.find(e => e.id === 'right-model').rect.y, 42);
    await page.locator('#right').evaluate(element =>
      element.setAttribute('display', 'none'));
    const hidden = await readGeometry();
    assert.equal(hidden.elements.find(e => e.id === 'right-model').measurement, 'unavailable');
    // Opacity on HTML ABOVE the root prevents painting too.
    await page.evaluate(() => { document.body.style.opacity = '0'; });
    await assert.rejects(readGeometry(), /SVG root or ancestor is hidden/);
    await page.evaluate(() => { document.body.style.opacity = ''; });

    // visibility is inherited, but a child may explicitly override a hidden
    // SVG group and still paint; the measurement must not be discarded.
    await page.evaluate(() => {
      const svg = document.querySelector('#diagram');
      const group = document.createElementNS(svg.namespaceURI, 'g');
      group.setAttribute('visibility', 'hidden');
      const left = document.querySelector('#left');
      left.remove();
      group.append(left);
      left.setAttribute('visibility', 'visible');
      svg.append(group);
    });
    const override = await readGeometry();
    assert.deepEqual(override.elements.find(e => e.id === 'left-model').rect,
      { x: 20, y: 30, width: 80, height: 40 });
    await page.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
