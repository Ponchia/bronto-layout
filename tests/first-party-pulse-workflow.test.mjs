import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const yml=readFileSync(new URL('../.github/workflows/first-party-layout-pulse.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/first-party-pulse.mjs',import.meta.url),'utf8');
const core=readFileSync(new URL('../scripts/first-party-pulse-core.mjs',import.meta.url),'utf8');

test('weekly real-site evidence is independent of PR and deploy gates',()=>{
  assert.match(yml,/schedule:\s*\n\s*- cron:\s*'23 6 \* \* 1'/);
  assert.match(yml,/workflow_dispatch:/);
  assert.doesNotMatch(yml,/pull_request:|push:|write-all|contents:\s*write/);
  assert.match(yml,/contents: read/);
  assert.match(yml,/cancel-in-progress: false/);
  assert.match(yml,/timeout-minutes: 25/);
});
test('sandboxes are mandatory; browser reports cannot be uploaded',()=>{
  assert.match(yml,/doctor --verify-launch/);
  assert.match(yml,/BRONTO_CHROME_NO_SANDBOX: '0'/);
  assert.doesNotMatch(yml,/no-sandbox(?:=1)?|--no-sandbox|actions\/download-artifact/);
  assert.match(yml,/scripts\/first-party-pulse.mjs --run/);
  assert.match(yml,/bronto-first-party-pulse-summary\.json/);
  assert.doesNotMatch(yml,/reports\/|logs\/|screenshots\/|--report/);
  assert.match(source,/BRONTO_CHROME_NO_SANDBOX === '1'/);
  assert.match(source,/--fail-on-skip/);
  assert.match(source,/--interior-probes/);
  assert.doesNotMatch(source, /--no-sandbox/);
  assert.match(source,/std(io|err): \['ignore', 'pipe', 'pipe'\]/);
});
test('fixed public-site inventory cannot accept outside domains or user-controlled URLs',()=>{
  assert.equal((core.match(/file: '/g)??[]).length,6);
  assert.match(core,/brontolotto\.observer/);
  assert.match(core,/sense6\.net/);
  assert.match(core,/ponchia\.github\.io/);
  assert.doesNotMatch(source,/process\.argv\[[^\]]+\].*url|--url.*process\.argv/);
});
