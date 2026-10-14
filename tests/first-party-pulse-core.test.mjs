import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_WIDTHS, TARGETS, verifyTargetSpec, summarizeTarget, pulseSummary, pulseMarkdown} from '../scripts/first-party-pulse-core.mjs';

const target = TARGETS[0];
const report = () => ({schemaVersion: 1, mode: 'check', format: 'compact',
  summary: {passed: 28, failed: 0, skipped: 0}, sampledWidths: [...EXPECTED_WIDTHS],
  sampling: {interiorProbes:1, largestUntestedGapPx: 255},
  failures: [], unmeasurable: [], omittedFailures: 0, omittedUnmeasurable: 0});

test('only the six hard-coded public first-party contracts can run', () => {
  assert.equal(TARGETS.length, 6);
  for(const value of TARGETS) verifyTargetSpec(value, {schemaVersion:1, url:value.url,
    widths:[320,375,768,1280], rules:[{id:'reviewed'}]});
  assert.throws(() => verifyTargetSpec(target,{schemaVersion:1,url:'https://arbitrary.example/', widths:[320,375,768,1280],rules:[{}]}),/Refusing/);
  assert.throws(() => verifyTargetSpec({...target}, {schemaVersion:1,url:target.url,widths:[320,375,768,1280],rules:[{}]}),/Unknown/);
});

test('passes only when every expected sampled width is present', () => {
  const row = summarizeTarget(target,0,report(),1200);
  assert.deepEqual([row.status,row.checkedWidths,row.passed,row.failed,row.maxUntestedGapPx],['pass',7,28,0,255]);
  for(const mutation of [
    r=>{r.sampledWidths.splice(3,1);},
    r=>{r.sampling.interiorProbes=0;},
    r=>{r.sampling.largestUntestedGapPx=-1;},
    r=>{r.summary.passed='28';},
    r=>{r.sampling.largestUntestedGapPx=0;},
    r=>{r.summary.passed=0;r.summary.skipped=0;},
  ]) {const value=report(); mutation(value); assert.equal(summarizeTarget(target,0,value,1).status,'unverified');}
});

test('runtime failure, missing measurements and contradictory status never become pass',()=>{
  const errors = [
    summarizeTarget(target,2,{error:{code:'CSP_SANDBOX_UNINSPECTABLE',message:'private page data'}},2),
    summarizeTarget(target,0,{error:{message:'private page data'}},2),
    summarizeTarget(target,137,null,2),
  ];
  assert.deepEqual(errors.map(r=>r.status),['unverified','unverified','unverified']);
  assert.deepEqual(errors.map(r=>r.code),['CSP_SANDBOX_UNINSPECTABLE','UNEXPECTED_REPORT','CLI_PROCESS_ERROR']);
  const incomplete=report(); incomplete.unmeasurable=[{id:'not measured'}];
  assert.equal(summarizeTarget(target,0,incomplete,2).code,'UNMEASURABLE_RULES');
  const falseSuccess=report(); falseSuccess.summary.failed=1;
  assert.equal(summarizeTarget(target,0,falseSuccess,2).code,'CONTRADICTORY_EXIT');
});

test('sanitized violations omit untrusted DOM/CSS/messages while retaining fixed rule IDs',()=>{
  const observed=report(); observed.summary.failed=1;
  observed.failures=[{id:'hero-edge',message:'do not output user content',paths:['.password'],evidence:[{css:'password'}],width:320,deviation:12.345}];
  const row=summarizeTarget(target,1,observed,678);
  assert.equal(row.status,'violation');
  assert.deepEqual(row.ruleIds,['hero-edge']);
  assert.deepEqual(row.findings,[{id:'hero-edge',width:320,deviation:12.35}]);
  assert.doesNotMatch(JSON.stringify(row),/password|do not output/);
  assert.match(pulseMarkdown(pulseSummary(TARGETS.map(t => t === target ? row : summarizeTarget(t,0,report(),1)))),/hero-edge@320px/);
  const safe=report(); safe.summary.failed=1; safe.failures=[{id:'<script>alert(1)</script>'}];
  assert.deepEqual(summarizeTarget(target,1,safe,1).ruleIds,['(unprintable)']);
});

test('the complete cohort can be summarized without exposing captured pages',()=>{
  const rows=TARGETS.map((t,i)=>summarizeTarget(t,0,report(),100+i));
  const aggregate=pulseSummary(rows);
  assert.equal(aggregate.passing,6);
  assert.equal(aggregate.totalElapsedMs,615);
  const summary=pulseMarkdown(aggregate);
  assert.match(summary,/6\/6 passing/);
  assert.equal((summary.match(/\| pass \|/g)||[]).length,6);
  assert.throws(()=>pulseSummary(rows.slice(1)),/exactly/);
});

test('unverified widths and error codes never appear as a numeric coverage claim',()=>{
  const rows=TARGETS.map(t=>summarizeTarget(t,0,report(),1));
  rows[2]=summarizeTarget(TARGETS[2],2,{error:{code:'CSP_SANDBOX_UNINSPECTABLE'}},1);
  const summary=pulseMarkdown(pulseSummary(rows));
  assert.match(summary,/5\/6 passing/);
  assert.match(summary,/sense6-ar \| unverified \| 0 \| 0 \| 0 \| 0 \| — \| CSP_SANDBOX_UNINSPECTABLE/);
  assert.doesNotMatch(summary,/— px/);
});
