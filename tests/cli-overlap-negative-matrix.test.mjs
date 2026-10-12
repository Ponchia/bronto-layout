import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const fixtures = [
  { name: 'audit-healthy', measured: 0 },
  { name: 'audit-intentional-overlays', measured: 0 },
  { name: 'gallery', measured: 0 },
  { name: 'media-preferences', measured: 0 },
  { name: 'shadow', measured: 0 },
  { name: 'audit-container-query', measured: 1 },
  { name: 'audit-rtl-overflow', measured: 2 },
  { name: 'stateful', measured: 0 },
  { name: 'audit-overlap-intentional', measured: 0 }
];

/** These are authored first-party fixtures, NOT independently labeled websites. */
test('two opt-in layout review heuristics preserve nine known healthy and intentional structures at mobile/desktop widths', t => {
  for (const fixture of fixtures) {
    const result = spawnSync(process.execPath, [
      cli, 'audit', '--url', path.join(root,'examples',fixture.name+'.html'),
      '--widths', '375,1280', '--grid-gap-review', '--sibling-overlap-review',
      '--json','--compact'
    ], { cwd:root, encoding:'utf8', timeout:85000, maxBuffer:8*1024*1024,
      env:{ ...process.env, BRONTO_CHROME_NO_SANDBOX:'1', BRONTO_TEST_INLINE_FIXTURE:'1' } });
    if (result.error?.code === 'ENOENT' ||
        /Cannot find Chrome\/Chromium/.test(result.stdout+result.stderr)) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') {
        throw new Error('Chromium required by CI');
      }
      t.skip('No installed Chromium available');
      return;
    }
    assert.equal(result.status, fixture.measured ? 1 : 0,
      fixture.name+' '+(result.stderr||result.stdout));
    const report=JSON.parse(result.stdout);
    assert.equal(report.mode,'audit');
    assert.deepEqual(report.sampledWidths,[375,1280]);
    assert.equal(report.summary.measuredIssues,fixture.measured,fixture.name);
    assert.equal(report.summary.reviewWarnings,0,
      fixture.name+': '+report.reports.flatMap(r=>r.findings.filter(f=>f.classification==='review').map(f=>f.message)).join('; '));
    assert.equal(report.summary.incompleteViewports,0);
    for(const viewport of report.reports){
      assert.equal(viewport.coverage.truncated,false);
      assert.equal(viewport.coverage.traversalLimit,18000);
      assert.equal(viewport.coverage.gridContainersOmitted,0);
      assert.equal(viewport.coverage.overlapContainersOmitted,0);
      assert.equal(viewport.coverage.siblingOverlapCount,0);
    }
  }
});
