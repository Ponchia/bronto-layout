import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseLayoutActions } from '../dist/actions.js';

const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
function run(args) {
  return spawnSync(process.execPath,[cli,...args,'--json'], {
    cwd,encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,
    // The sandbox bypass is only for our bundled, locally served HTML
    // fixtures on disposable test runners. Never enable it on public sites.
    env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'}
  });
}
function chromeUnavailable(t,r) {
  if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')) {
    if(process.env.BRONTO_REQUIRE_CHROME==='1') throw new Error('Chromium required by CI');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}
function spec(file) {return run(['check','--spec','examples/'+file+'.json']);}
function detail(result) {return result.stderr||result.stdout;}
function message(result) {return JSON.parse(result.stdout).error?.message??'';}

test('explicit real pointer click opens a visible panel using a trusted browser click',t=>{
  const r=spec('pointer-click-visible');
  if(chromeUnavailable(t,r))return;
  assert.equal(r.status,0,detail(r));
  assert.deepEqual(JSON.parse(r.stdout).summary,{passed:2,failed:0,skipped:0});
});

test('blocked pointer-click exits 2 instead of reporting a false clean open-menu state',t=>{
  const blocked=spec('pointer-click-obscured');
  if(chromeUnavailable(t,blocked))return;
  assert.equal(blocked.status,2,detail(blocked));
  assert.match(message(blocked),/Pointer target is obscured/);
  const legacy=spec('dom-click-obscured');
  assert.equal(legacy.status,0,detail(legacy));
  assert.deepEqual(JSON.parse(legacy.stdout).summary,{passed:2,failed:0,skipped:0});
});

test('hover-triggered overlay is rechecked before Chrome mouse down',t=>{
  const r=spec('pointer-click-hover-cover');
  if(chromeUnavailable(t,r))return;
  assert.equal(r.status,2,detail(r));
  assert.match(message(r),/Pointer target is obscured/);
});

test('pointer-click requires a viewport hit area; explicit scroll-into-view makes it succeed',t=>{
  const below=spec('pointer-click-below-fold');
  if(chromeUnavailable(t,below))return;
  assert.equal(below.status,2,detail(below));
  assert.match(message(below),/outside the usable viewport/);
  const scrolled=spec('pointer-click-scrolled');
  assert.equal(scrolled.status,0,detail(scrolled));
  const result=JSON.parse(scrolled.stdout);
  assert.deepEqual(result.summary,{passed:2,failed:0,skipped:0});
  assert.ok(result.reports[0].viewport.scrollY>1000);
});

test('pointer-click traverses explicitly open Shadow DOM and activates the intended control',t=>{
  const r=spec('pointer-click-shadow');
  if(chromeUnavailable(t,r))return;
  assert.equal(r.status,0,detail(r));
  assert.deepEqual(JSON.parse(r.stdout).summary,{passed:1,failed:0,skipped:0});
});

test('automatic audit replays opt-in pointer-click and records action type without selector',t=>{
  const r=run([
    'audit','--url','examples/pointer-click-visible.html','--width','375',
    '--actions','examples/pointer-click-actions.json','--compact'
  ]);
  if(chromeUnavailable(t,r))return;
  assert.equal(r.status,0,detail(r));
  const report=JSON.parse(r.stdout);
  assert.equal(report.summary.measuredIssues,0);
  assert.deepEqual(report.stateSetup,{
    actionCount:1,actionTypes:['pointer-click'],replayedAtEachWidth:true
  });
  assert.doesNotMatch(r.stdout,/'#open'|pointer-click-actions.json/);
});

test('strict action parser accepts pointer-click but rejects scripts and unrelated extra fields',()=>{
  assert.deepEqual(parseLayoutActions([{type:'pointer-click',selector:'#button'}]),
    [{type:'pointer-click',selector:'#button'}]);
  assert.throws(()=>parseLayoutActions([{type:'pointer-click',selector:'#button',script:'alert(1)'}]),
    /unknown field/);
  assert.throws(()=>parseLayoutActions([{type:'pointer-click',selector:'   '}]),
    /selector must be/);
});
