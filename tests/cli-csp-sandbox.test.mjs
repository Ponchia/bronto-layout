import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const doc = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Owned layout</h1></main></body></html>';
async function invoke(args) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1' } // trusted loopback fixtures ONLY
  });
  const stdout = [], stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve(signal ? 2 : code ?? 2));
  });
  const raw = Buffer.concat(stdout).toString('utf8');
  return { exit, report: JSON.parse(raw), stderr: Buffer.concat(stderr).toString('utf8') };
}
test('CSP-sandboxed HTTP document refuses evaluation rather than timing out or passing', async t => {
  const server = createServer((request, response) => {
    if (request.url === '/sandbox') response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (request.url === '/allowed') response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox allow-scripts");
    if (request.url === '/report-only') response.setHeader('Content-Security-Policy-Report-Only', 'sandbox');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(doc);
  });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bronto-csp-navigation-'));
  try {
    server.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const spec = path.join(dir, 'layout.json');
    await writeFile(spec, JSON.stringify({schemaVersion:1, selectors:{main:'main'}, rules:[
      {id:'main-present',type:'selector-count',element:'main',exactly:1},
      {id:'fit',type:'document-overflow',tolerance:1}
    ]}));
    const base = `http://127.0.0.1:${server.address().port}`;
    const args = ['check','--spec',spec,'--width','375','--json','--compact','--timeout','25000'];
    const good = await invoke([...args,'--url',`${base}/normal`]);
    if (good.exit === 2 && /Cannot find Chrome\/Chromium/.test(good.report.error?.message ?? '')) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('CI requires Chromium');
      t.skip('Chromium unavailable'); return;
    }
    assert.equal(good.exit,0,JSON.stringify(good));
    assert.deepEqual(good.report.summary,{passed:2,failed:0,skipped:0});
    const sandbox = await invoke([...args,'--url',`${base}/sandbox`]);
    assert.equal(sandbox.exit,2,JSON.stringify(sandbox));
    assert.equal(sandbox.report.error?.code,'CSP_SANDBOX_UNINSPECTABLE');
    assert.match(sandbox.report.error?.message,/unverified/);
    assert.doesNotMatch(sandbox.report.error?.message,/Timed out running Runtime\.evaluate/);
    for (const name of ['allowed','report-only']) {
      const result = await invoke([...args,'--url',`${base}/${name}`]);
      assert.equal(result.exit,0,JSON.stringify({name,result}));
      assert.equal(result.report.summary.passed,2);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
