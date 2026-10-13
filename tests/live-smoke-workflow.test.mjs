import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/live-site-smoke.yml',import.meta.url),'utf8');

test('exploratory layout review modes require explicit manual opt-in and retain read-only permissions',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^\s{2}schedule:/m);
 assert.match(workflow,/permissions:\n {2}contents: read/);
 for(const flag of ['grid_gap_review','sibling_overlap_review']) {
  assert.match(workflow,new RegExp('^      '+flag+':\\n        description: [^\\n]+\\n        type: boolean\\n        default: false$', 'm'));
  assert.match(workflow,new RegExp('inputs\\.'+flag));
 }
 assert.match(workflow,/if: \$\{\{ !cancelled\(\) && \(inputs\.automatic_audit \|\| inputs\.grid_gap_review \|\| inputs\.sibling_overlap_review\) \}\}/);
 assert.match(workflow,/Without an explicit status function GitHub implicitly requires/);
 assert.match(workflow,/BRONTO_CHROME_NO_SANDBOX: '1'/);
});

test('manual audit uses only known public first-party sites and preserves nonblocking optional warning classes',()=>{
 assert.match(workflow,/review_flags=\(\)/);
 assert.match(workflow,/review_flags\+=\(--grid-gap-review\)/);
 assert.match(workflow,/review_flags\+=\(--sibling-overlap-review\)/);
 assert.match(workflow,/"\$\{review_flags\[@\]\}" "\$\{extra\[@\]\}"/);
 assert.match(workflow,/Experimental REVIEW-ONLY leads:/);
 assert.match(workflow,/gridContainersOmitted/);
 assert.match(workflow,/overlapContainersOmitted/);
 assert.match(workflow,/zero findings does NOT mean complete inspection/);
 assert.match(workflow,/item\.classification==='review'/);
 for(const url of ['https://brontolotto.observer/','https://sense6.net/en/',
   'https://sense6.net/ar/','https://sense6.net/en/learn/',
  'https://ponchia.github.io/bronto-ui/','https://ponchia.github.io/bronto-ui/examples/operations/']) {
  assert.ok(workflow.includes(url),url);
 }
 assert.doesNotMatch(workflow,/inputs\.url|inputs\.domain|schedule:\n/);
 assert.match(workflow,/retention-days: 7/);
});


test('a missing or malformed site report cannot prevent processing the other allowlisted sites',()=>{
 assert.match(workflow,/for name in personal-site sense6-gallery sense6-ar sense6-learn brontoui-home brontoui-operations; do/);
 assert.match(workflow,/report_status=\$\?/);
 assert.ok(workflow.includes('if [ "$status" -ne 0 ] || [ "$report_status" -ne 0 ]'));
 assert.match(workflow,/A reporting failure is a failed observation, never a clean page/);
 assert.match(workflow,/Sites with measured issues or incomplete audits/);
});
