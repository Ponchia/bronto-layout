import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseContract } from '../dist/contract.js';

const load = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const manifest = load('benchmarks/oss-mobile-states.v0.1.json');
const workflow = readFileSync(
  new URL('../.github/workflows/oss-mobile-state-smoke.yml', import.meta.url), 'utf8'
);

const known = new Map([
  ['astro-en-375', ['https://docs.astro.build/en/getting-started/',
    'button.sl-menu-button', '#starlight__sidebar:popover-open']],
  ['astro-es-375', ['https://docs.astro.build/es/getting-started/',
    'button.sl-menu-button', '#starlight__sidebar:popover-open']],
  ['docusaurus-375', ['https://docusaurus.io/docs/',
    'button.navbar__toggle', '.navbar-sidebar--show']],
  ['vite-375', ['https://vite.dev/guide/',
    'button[aria-controls="mobile-menu"]',
    'button[aria-controls="mobile-menu"][aria-expanded="true"]']],
  ['svelte-375', ['https://svelte.dev/docs/svelte/overview',
    'button.menu-toggle', 'button.menu-toggle[aria-expanded="true"]']]
]);

test('external menu cohort is limited to five reviewed read-only public states', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'external-oss-mobile-nav-v0_1');
  assert.deepEqual(manifest.allowedHosts,
    ['docs.astro.build', 'docusaurus.io', 'vite.dev', 'svelte.dev']);
  assert.equal(manifest.contracts.length, 5);
  assert.equal(new Set(manifest.contracts).size, 5);
  assert.deepEqual(manifest.contracts.map(file =>
    file.split('/').at(-1).replace('.json', '')), [...known.keys()]);
  for (const filename of manifest.contracts) {
    assert.match(filename, /^benchmarks\/oss-states\/[a-z0-9-]+\.json$/);
    const contract = parseContract(load(filename));
    const id = filename.split('/').at(-1).replace('.json', '');
    const expected = known.get(id);
    assert.ok(expected, id);
    assert.equal(contract.url, expected[0]);
    assert.equal(new URL(contract.url).hostname, new URL(expected[0]).hostname);
    assert.deepEqual(contract.widths, [375]);
    assert.deepEqual(contract.actions,
      [{ type: 'click', selector: expected[1] },
        { type: 'pause', milliseconds: 350 }]);
    assert.equal(contract.selectors.opened, expected[2]);
    assert.equal(contract.selectors.button, expected[1]);
    assert.equal(contract.selectors.content, 'main');
    assert.deepEqual(contract.rules.map(rule => [rule.type, rule.element, rule.exactly]),
      [['selector-count', 'opened', 1], ['selector-count', 'button', 1],
        ['selector-count', 'content', 1]]);
  }
});

test('manual OSS workflow rejects arbitrary targets and browser sandbox bypass', () => {
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:\n|\n\s+push:\n|\n\s+schedule:\n/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /CHROME_PATH: \/usr\/bin\/google-chrome/);
  assert.match(workflow, /doctor --verify-launch --json/);
  assert.match(workflow, /benchmarks\/oss-states\/\*\.json/);
  assert.match(workflow, /--actions "\$dir\/actions\.json"/);
  assert.match(workflow, /--spec "\$spec"/);
  assert.match(workflow, /--evidence-dir "\$dir\/screens"/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /BRONTO_CHROME_NO_SANDBOX|--no-sandbox|--disable-web-security/);
  assert.doesNotMatch(workflow, /inputs\.(?:url|host|manifest|path|command)/);
  assert.doesNotMatch(workflow, /curl -X POST|fill.*password|workflow_call/);
  assert.match(workflow, /Navigation left approved public path/);
  assert.ok(workflow.includes('cd "$out"'), 'Checksum paths must be relative to extracted artifact root');
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(workflow, /<<'NODE' \|\| failed=1/,
    'An invalid capture must not prevent independent remaining routes being observed');
});


test('actual workflow checksum block survives moving the extracted artifact and detects changes', () => {
  const start = workflow.indexOf('          manifest="$RUNNER_TEMP/oss-mobile-SHA256SUMS"');
  const end = workflow.indexOf('          if [ "$failed" -ne 0 ]; then', start);
  assert.ok(start !== -1 && end > start, 'Could not locate the workflow checksum block');
  const body = workflow.slice(start, end).split('\n')
    .map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');

  const temp = mkdtempSync(path.join(tmpdir(), 'bronto-oss-mobile-'));
  try {
    const source = path.join(temp, 'ci', 'reports', 'oss-mobile-123');
    const evidence = path.join(source, 'astro-en-375');
    const nested = path.join(evidence, 'screens');
    const relocated = path.join(temp, 'downloaded artifact with spaces');
    const runtimeTemp = path.join(temp, 'runner-temp');
    mkdirSync(nested, { recursive: true });
    mkdirSync(runtimeTemp);
    writeFileSync(path.join(evidence, 'audit.json'), '{"summary":{"measuredIssues":0}}\n');
    writeFileSync(path.join(evidence, 'check.json'), '{"summary":{"passed":3}}\n');
    writeFileSync(path.join(nested, 'audit-375px.png'), 'synthetic screenshot fixture bytes');
    writeFileSync(path.join(source, 'results.txt'), 'case=astro-en-375 check=0 audit=0\n');

    const execute = script => spawnSync('bash', ['-e', '-o', 'pipefail'], {
      cwd: temp, encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: runtimeTemp },
      input: script, timeout: 10000
    });
    const write = execute('out=' + JSON.stringify(source) + '\n' + body);
    assert.equal(write.status, 0, write.stderr || write.stdout);
    const manifest = readFileSync(path.join(source, 'SHA256SUMS'), 'utf8');
    assert.equal(manifest.trim().split('\n').length, 4);
    assert.ok(manifest.includes('  ./astro-en-375/screens/audit-375px.png'));
    assert.ok(!manifest.includes(source), 'Absolute CI workspace must not be embedded');

    renameSync(source, relocated);
    const verify = execute('cd ' + JSON.stringify(relocated) + '\nsha256sum --check SHA256SUMS');
    assert.equal(verify.status, 0, verify.stderr || verify.stdout);
    writeFileSync(path.join(relocated, 'astro-en-375', 'check.json'), 'tampered evidence');
    const corrupted = execute('cd ' + JSON.stringify(relocated) + '\nsha256sum --check SHA256SUMS');
    assert.notEqual(corrupted.status, 0, 'Tampered browser evidence must be rejected');
    assert.match(corrupted.stdout + corrupted.stderr, /FAILED/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
