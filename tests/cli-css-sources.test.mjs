import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
});
function unavailable(t,result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required');
    t.skip('Chromium unavailable'); return true;
  }
  return false;
}
test('CDP source hints reveal external CSS file, relative line and style attribute', t => {
  const result = run(['inspect', '--url', 'examples/css-sources-fixture.html',
    '--width', '375', '--selector', 'example=#example', '--css-sources', '--json']);
  if (unavailable(t,result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.snapshots.length, 1);
  assert.equal(output.cssSources.length, 1);
  const alias = output.cssSources[0].aliases[0];
  assert.equal(alias.alias, 'example');
  assert.equal(alias.matchedCount, 1);
  assert.equal(alias.inspectedCount, 1);
  const elem = alias.elements[0];
  assert.equal(elem.status, 'ok');
  assert.equal(elem.tag, 'main');
  assert.equal(elem.id, 'example');
  const external = elem.rules.find(x=>x.selector==='.external');
  assert.ok(external, JSON.stringify(elem));
  assert.equal(external.sourceKind, 'external-stylesheet');
  assert.match(external.sourceUrl, /\/css-sources-fixture\.css$/);
  const margin=external.declarations.find(x=>x.name==='margin-left');
  assert.equal(margin.value, '28px');
  assert.equal(margin.line, 3);
  const inline=elem.rules.find(x=>x.selector==='.inline');
  assert.equal(inline.sourceKind, 'inline-stylesheet');
  assert.equal(inline.sourceUrl, undefined);
  assert.ok(inline.documentUrl.endsWith('/css-sources-fixture.html'));
  assert.equal(inline.declarations.find(x=>x.name==='margin-top').line,undefined);
  const attribute=elem.rules.find(x=>x.sourceKind==='element-style');
  assert.equal(attribute.declarations.find(x=>x.name==='padding-left').value,'12px');
});
test('human-readable CSS source leads use real line breaks and external locations', t => {
  const r = run(['inspect', '--url', 'examples/css-sources-fixture.html',
    '--width', '375', '--selector', 'example=#example', '--css-sources']);
  if (unavailable(t,r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /\n375px matched CSS source hints:\n/);
  assert.match(r.stdout, /css-sources-fixture\.css:3/);
  assert.match(r.stdout, /inline-stylesheet in http:/);
});
test('CSS source inspector traverses explicitly open shadow roots', t => {
  const r=run(['inspect', '--url','examples/css-sources-fixture.html',
    '--selector','inside=#host >>> .inner','--css-sources','--json']);
  if(unavailable(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const alias=JSON.parse(r.stdout).cssSources[0].aliases[0];
  assert.equal(alias.matchedCount,1);
  const rule=alias.elements[0].rules.find(x=>x.selector==='.inner');
  assert.ok(rule,JSON.stringify(alias));
  assert.equal(rule.sourceKind,'inline-stylesheet');
  assert.equal(rule.declarations.find(x=>x.name==='width').value,'95px');
});
test('CSS source inspection preserves caps and advertises omitted elements',t=>{
  const r=run(['inspect','--url','examples/large-dom.html','--width','375',
    '--selector','items=.item','--css-sources','--json']);
  if(unavailable(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout).cssSources[0].aliases[0];
  assert.equal(report.matchedCount,315);
  assert.equal(report.inspectedCount,6);
  assert.equal(report.omittedElements,309);
});
test('CSS source mode rejects unsupported compare operations and remains opt-in',t=>{
  const invalid=run(['compare','--spec','examples/layout.json','--baseline','examples/healthy.html',
    '--url','examples/broken.html','--css-sources','--json']);
  assert.equal(invalid.status,2);
  assert.match(JSON.parse(invalid.stdout).error.message,/only to inspect, check and scan/);
  const without=run(['inspect','--url','examples/css-sources-fixture.html',
    '--selector','example=#example','--json']);
  if(unavailable(t,without))return;
  assert.equal(without.status,0,without.stderr||without.stdout);
  assert.equal('cssSources' in JSON.parse(without.stdout), false);
});
