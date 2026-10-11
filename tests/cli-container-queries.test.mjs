import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
  cwd,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function noChrome(t,r) {
  if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stdout+r.stderr)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}
test('inspector detects named container CSS rules and runtime container width at responsive viewports',t=>{
  const r=run(['inspect','--url','examples/container-query.html',
    '--selector','gallery=#gallery','--selector','child=#child',
    '--widths','375,768','--container-queries','--json']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.mode,'inspect');
  assert.equal(result.containerQueries.length,2);
  const narrow=result.containerQueries[0], wide=result.containerQueries[1];
  assert.deepEqual(result.containerQueries.map(x=>x.width),[375,768]);
  for(const v of [narrow,wide]) {
    assert.equal(v.supported,true);
    assert.equal(v.stylesheetsInaccessible,0);
    assert.ok(v.discoveredRules>=2,JSON.stringify(v.rules));
    assert.ok(v.rules.some(x=>x.name==='gallery'&&x.query.includes('400px')));
    assert.ok(v.rules.some(x=>x.query.includes('500px')));
    assert.ok(v.rules.some(x=>x.sourceKind==='external-stylesheet'&&x.sourceUrl.endsWith('/container-query.css')));
    assert.ok(v.containers.some(x=>x.name==='gallery'&&x.type==='inline-size'&&x.path==='#gallery'));
    assert.ok(v.rules.some(x=>x.candidatePxThresholds.some(t=>t.valuePx===400)));
    assert.ok(v.rules.some(x=>x.candidatePxThresholds.some(t=>t.valuePx===500)));
    // A relative 30rem condition must not be mislabeled as 30px or a
    // guessed 480px viewport breakpoint.
    const relative=v.rules.flatMap(x=>x.candidatePxThresholds)
      .find(t=>t.unit==='rem'&&t.value===30);
    assert.ok(relative);
    assert.equal(relative.valuePx,undefined);
  }
  const boxNarrow=result.snapshots[0].selectors.child[0].rect;
  const boxWide=result.snapshots[1].selectors.child[0].rect;
  assert.equal(boxNarrow.width,80);
  assert.equal(boxWide.width,180);
  assert.equal(boxNarrow.height,40);
  assert.equal(boxWide.height,90);
  assert.ok(narrow.containers[0].width < 400);
  assert.ok(wide.containers[0].width > 500);
});
test('human-readable summary keeps query values but never promises viewport boundary guarantees',t=>{
  const r=run(['inspect','--url','examples/container-query.html',
    '--selector','child=#child','--width','375',
    '--container-queries']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.match(r.stdout,/CSS containers:/);
  assert.match(r.stdout,/conditional container width, not viewport breakpoints/);
});
test('container-query inspection is opt-in and cannot silently affect contracts',t=>{
  const r=run(['inspect','--url','examples/container-query.html',
    '--selector','child=#child','--width','375','--json']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.equal('containerQueries' in JSON.parse(r.stdout),false);
});
test('unsupported commands reject the container-query option without launching Chromium',()=>{
  const r=run(['audit','--url','examples/container-query.html',
    '--container-queries','--json']);
  assert.equal(r.status,2);
  assert.match(JSON.parse(r.stdout).error.message,/only to inspect/);
});
