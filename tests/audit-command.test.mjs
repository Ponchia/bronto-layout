import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStateSummary, createAuditCommand } from '../bin/audit-command.mjs';

test('audit-only provenance contains action types but not selectors, filled values or source paths',()=>{
 const secret='example-private-fixture-password';
 const actions=[
  {type:'wait-for',selector:'#account'},
  {type:'fill',selector:'input[name=password]',value:secret},
  {type:'click',selector:'#confirm'},
  {type:'pause',milliseconds:500}
 ];
 const initial=auditStateSummary({},actions);
 assert.deepEqual(initial,{});
 const report=auditStateSummary({actions:'/private/fixture-steps.json'},actions);
 assert.deepEqual(report,{stateSetup:{actionCount:4,
  actionTypes:['wait-for','fill','click','pause'],replayedAtEachWidth:true}});
 assert.doesNotMatch(JSON.stringify(report),/example-private|password|account|confirm|fixture-steps/);
 const comparison=auditStateSummary({actions:'steps.json',baseline:'example.html'},actions);
 assert.deepEqual(comparison.stateSetup,{...report.stateSetup,replayedOnBothVersions:true});
});

test('audit runner exports an isolated command factory without requiring browser startup',()=>{
 const command=createAuditCommand({});
 assert.equal(typeof command,'function');
});
