import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8*1024*1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function noBrowser(result,t) {
  if(result.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(result.stderr||'')){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chrome is required by CI');
    t.skip('Chromium not available');return true;
  }
  return false;
}
test('failed check directly associates matched author CSS with the violating rule',t=>{
  const response=run(['check','--spec','examples/css-sources-check.json','--css-sources','--json']);
  if(noBrowser(response,t))return;
  assert.equal(response.status,1,response.stderr||response.stdout);
  const output=JSON.parse(response.stdout);
  assert.equal(output.summary.failed,1);
  assert.equal(output.cssSourceLeads.length,1);
  const lead=output.cssSourceLeads[0];
  assert.equal(lead.width,375);
  assert.deepEqual(lead.ruleIdsByAlias,{example:['unexpectedly-wide-main']});
  assert.deepEqual(lead.unattributedRuleIds,[]);
  assert.equal(lead.inspection.aliases[0].inspectedCount,1);
  const external=lead.inspection.aliases[0].elements[0].rules.find(rule=>rule.selector==='.external');
  assert.match(external.sourceUrl,/css-sources-fixture\.css$/);
  assert.equal(external.declarations.find(d=>d.name==='margin-left').line,3);
  assert.equal(output.reports[0].findings.find(f=>f.id==='unexpectedly-wide-main').status,'fail');
});
test('compact check preserves selected stylesheet evidence without passing layout records',t=>{
  const response=run(['check','--spec','examples/css-sources-check.json','--css-sources','--json','--compact']);
  if(noBrowser(response,t))return;
  assert.equal(response.status,1,response.stderr||response.stdout);
  const data=JSON.parse(response.stdout);
  assert.equal(data.format,'compact');
  assert.equal('reports' in data,false);
  assert.equal(data.summary.failed,1);
  assert.deepEqual(data.cssSourceLeads[0].ruleIdsByAlias,{example:['unexpectedly-wide-main']});
  assert.equal(data.omittedCSSSourceWidths,0);
});
test('passing checks do not invoke the extra CSS source collection',t=>{
  const response=run(['check','--spec','examples/layout.json','--width','375','--css-sources','--json']);
  if(noBrowser(response,t))return;
  assert.equal(response.status,0,response.stderr||response.stdout);
  assert.equal(JSON.parse(response.stdout).cssSourceLeads.length,0);
});
test('unsupported CSS source operations fail before browser startup',()=>{
  const response=run(['compare','--spec','examples/layout.json','--baseline','examples/healthy.html',
    '--url','examples/broken.html','--css-sources','--json']);
  assert.equal(response.status,2,response.stderr||response.stdout);
  assert.match(JSON.parse(response.stdout).error.message,/only to inspect, check and scan/);
});
test('failing CSS evidence is capped at eight widths with omission counts',t=>{
  const widths=Array.from({length:9},(_,i)=>375+i);
  const response=run(['check','--spec','examples/css-sources-check.json',
    '--widths',widths.join(','),'--css-sources','--json','--compact']);
  if(noBrowser(response,t))return;
  assert.equal(response.status,1,response.stderr||response.stdout);
  const data=JSON.parse(response.stdout);
  assert.deepEqual(data.sampledWidths,widths);
  assert.equal(data.summary.failed,9);
  assert.equal(data.cssSourceLeads.length,8);
  assert.equal(data.omittedCSSSourceWidths,1);
});
