import test from 'node:test';
import assert from 'node:assert/strict';
import { argsFromCLI, int, configFromArgs, getWidths, withApprovedScenario,
  scenarioFromExplicitFlags, validateCommandOptions, HELP } from '../bin/cli-options.mjs';

test('strict CLI parsing keeps legacy check and repeated CSS selectors without browser startup',()=>{
 assert.equal(argsFromCLI([]).command,'check');
 assert.equal(argsFromCLI(['--spec','examples/layout.json']).spec,'examples/layout.json');
 const input=argsFromCLI(['suggest','--url','examples/healthy.html','--selector','title=h1',
   '--selector','gallery=.gallery','--widths','375,768']);
 assert.equal(input.command,'suggest');
 assert.deepEqual(input.selector,['title=h1','gallery=.gallery']);
 assert.deepEqual(getWidths(input),[375,768]);
 assert.match(HELP,/bronto-layout audit/);
 assert.throws(()=>argsFromCLI(['unknown']),/Unknown command/);
 assert.throws(()=>argsFromCLI(['audit','another-command']),/Unknown command/);
 assert.throws(()=>argsFromCLI(['audit','--fake-option']),/Unknown option/);
});

test('validated widths and numeric options reject malformed or duplicate limits before starting Chromium',()=>{
 assert.equal(int('375','width',200,10000),375);
 assert.throws(()=>int('375.2','width',200,10000),/integer/);
 assert.throws(()=>int('01','width',200,10000),/integer/);
 assert.deepEqual(getWidths({scan:'320:640:160'}),[320,480,640]);
 assert.deepEqual(getWidths({width:'375',widths:'320,375'}),[375]);
 assert.deepEqual(getWidths({}, {widths:[375,768]}),[375,768]);
 assert.throws(()=>getWidths({widths:'375,375'}),/distinct widths/);
 assert.throws(()=>getWidths({widths:'300,invalid'}),/integer/);
 assert.throws(()=>getWidths({scan:'320:900'}),/MIN:MAX:STEP/);
 assert.throws(()=>configFromArgs({timeout:'300', 'stable-for':'300'}),/shorter/);
});

test('approved scenarios inherit tested flags and explicit overrides win',()=>{
 const source={mobile:true,reducedMotion:true,colorScheme:'dark',locale:'ar',height:700,
   readySelector:'#loaded',settle:200,stableFor:100};
 const inherited=withApprovedScenario({command:'check'},source);
 assert.equal(inherited.mobile,true);
 assert.equal(inherited['reduced-motion'],true);
 assert.equal(inherited.height,'700');
 assert.equal(inherited['ready-selector'],'#loaded');
 const changed=withApprovedScenario({command:'check',desktop:true,'normal-motion':true,locale:'it-IT'},source);
 assert.equal(changed.mobile,false);
 assert.equal(changed['reduced-motion'],false);
 assert.equal(changed.locale,'it-IT');
 const selected=configFromArgs({...changed,timeout:'1000'});
 assert.equal(selected.mobile,false);
 assert.equal(selected.reducedMotion,false);
 assert.equal(selected.locale,'it-IT');
 assert.equal(selected.height,700);
 assert.deepEqual(scenarioFromExplicitFlags({mobile:true,locale:'ar',settle:'100'}),
   {mobile:true,locale:'ar',settle:100});
 assert.equal(scenarioFromExplicitFlags({}),undefined);
});

test('option restrictions remain explicit, pure and reject incompatible command states',()=>{
 assert.doesNotThrow(()=>validateCommandOptions({command:'doctor'}));
 assert.doesNotThrow(()=>validateCommandOptions({command:'audit',url:'examples/audit-healthy.html',json:true,compact:true}));
 assert.doesNotThrow(()=>validateCommandOptions({command:'batch',manifest:'examples/batch.json',json:true,compact:true,parallel:'2'}));
 const invalid=[
  [{command:'audit',spec:'x.json'},/zero-contract/],
  [{command:'audit',sarif:true},/JSON/],
  [{command:'audit','stable-for':'200'},/named selectors/],
  [{command:'audit','full-page-evidence':true},/evidence-dir/],
  [{command:'audit','fail-on-skip':true},/no contract skips/],
  [{command:'inspect',compact:true,json:true},/compact requires/],
  [{command:'check','css-breakpoints':true},/requires --scan/],
  [{command:'check',json:true,sarif:true},/Choose --json or --sarif/],
  [{command:'suggest',actions:'steps.json','color-scheme':'invalid'},/color-scheme/],
  [{command:'review-draft',draft:'a',width:'375'},/replays the original/],
  [{command:'check',parallel:'2'},/batch/],
  [{command:'batch'},/requires --manifest/],
  [{command:'check','fail-on-coverage-gaps':true},/applies only to audit/]
 ];
 for(const [args,expected] of invalid)assert.throws(()=>validateCommandOptions(args),expected);
});


test('extracted command validation accepts explicit audit state replay but never arbitrary check-time actions',()=>{
  assert.match(HELP,/bronto-layout audit --url URL \[--actions steps\.json\]/);
  const a=argsFromCLI(['audit','--url','examples/audit-stateful-broken.html','--actions','examples/audit-stateful-actions.json',
    '--width','375','--json','--compact']);
  assert.equal(a.command,'audit');
  assert.equal(a.actions,'examples/audit-stateful-actions.json');
  assert.deepEqual(getWidths(a),[375]);
  assert.doesNotThrow(()=>validateCommandOptions(a));
  assert.doesNotThrow(()=>validateCommandOptions({...a,baseline:'examples/audit-stateful-healthy.html'}));
  assert.doesNotThrow(()=>validateCommandOptions({command:'suggest',url:'examples/healthy.html',actions:'steps.json'}));
  assert.throws(()=>validateCommandOptions({command:'check',spec:'examples/layout.json',actions:'steps.json'}),
    /applies only to suggest or audit/);
  assert.throws(()=>validateCommandOptions({command:'review-draft',draft:'a',actions:'steps.json'}),
    /applies only to suggest or audit/);
});
