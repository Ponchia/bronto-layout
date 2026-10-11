import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReports } from '../dist/compare.js';
import { toSarif } from '../dist/sarif.js';
const finding = (id, status, deviation, tolerance=1) => ({id,type:'align-edge',status,deviation,tolerance,message:`${id} (${status})`,paths:['#first','#last']});
const report = (width, findings) => ({viewport:{width,height:800,direction:'ltr'},summary:{passed:findings.filter(f=>f.status==='pass').length,failed:findings.filter(f=>f.status==='fail').length,skipped:findings.filter(f=>f.status==='skip').length},findings});
test('comparison identifies regression, improvement, worsening, and uncertain changes',()=>{
  const before = [report(375,[finding('new','pass',0),finding('fixed','fail',20),finding('worse','fail',10),finding('skip','skip'),finding('stable','pass',0)])];
  const after = [report(375,[finding('new','fail',4),finding('fixed','pass',0),finding('worse','fail',17),finding('skip','fail',19),finding('stable','pass',0)])];
  const out=compareReports('https://example.test/old','https://example.test/new',before,after);
  assert.deepEqual(out.summary,{regressions:2,improvements:1,unchanged:1,unverified:1,baselineFailures:2,candidateFailures:3});
  assert.deepEqual(out.changes.map(c=>[c.ruleId,c.kind]),[
    ['new','regression'],['fixed','improvement'],['worse','regression'],['skip','unverified'],['stable','unchanged']]);
  assert.equal(out.changes.find(c=>c.ruleId==='worse').errorDelta,7);
});
test('compares only like-for-like viewport and rule IDs',()=>{
 const a=report(375,[finding('a','pass',0)]),b=report(320,[finding('a','pass',0)]),c=report(375,[finding('b','pass',0)]);
 assert.throws(()=>compareReports('a','b',[a],[b]),/same unique viewport widths/);
 assert.throws(()=>compareReports('a','b',[a],[c]),/Different contract rule IDs/);
 assert.throws(()=>compareReports('a','b',[a,a],[a,a]),/same unique viewport widths/);
});
test('minor errors under threshold do not become regressions',()=>{
 const a=report(375,[finding('old','fail',10)]),b=report(375,[finding('old','fail',10.5)]);
 assert.equal(compareReports('a','b',[a],[b]).summary.regressions,0);
 assert.equal(compareReports('a','b',[a],[b],0.25).summary.regressions,1);
});
test('SARIF describes only concrete failures and preserves DOM paths as metadata',()=>{
 const a=report(375,[finding('a','fail',5),finding('b','pass',0)]);
 const sarif=toSarif('https://example.test/',[a]);
 assert.equal(sarif.version,'2.1.0');
 assert.equal(sarif.runs[0].results.length,1);
 assert.equal(sarif.runs[0].results[0].ruleId,'a');
 assert.equal(sarif.runs[0].results[0].properties.viewportWidth,375);
 assert.deepEqual(sarif.runs[0].results[0].properties.selectors,['#first','#last']);
 assert.deepEqual(sarif.runs[0].results[0].locations[0].physicalLocation,{artifactLocation:{uri:'https://example.test/'}});
 assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region,undefined);
});
test('SARIF compare includes regressions only',()=>{
 const a=report(375,[finding('bad','pass',0),finding('old','fail',20)]);
 const b=report(375,[finding('bad','fail',8),finding('old','fail',20)]);
 const compare=compareReports('old','new',[a],[b]);
 const sarif=toSarif('https://example.test/',compare.candidate,compare);
 assert.deepEqual(sarif.runs[0].results.map(r=>r.ruleId),['bad']);
});
