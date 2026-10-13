#!/usr/bin/env node
/** Verifies that the npm tarball actually works without the source checkout. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temp = await mkdtemp(path.join(os.tmpdir(), 'bronto-layout-package-test-'));
const print = text => process.stdout.write(text + '\n');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    ...options
  });
  if (result.error || result.status !== 0) {
    throw new Error(command + ' ' + args.join(' ') + ' failed: ' +
      (result.error?.message || result.stderr || result.stdout || 'unknown failure').slice(-2000));
  }
  return result.stdout;
}

try {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const output = run(npm, [
    'pack', '--json', '--ignore-scripts', '--pack-destination', temp
  ]);
  const packed = JSON.parse(output)[0];
  assert.ok(packed.filename.endsWith('.tgz'), 'Expected npm tarball');
  const archive = path.join(temp, packed.filename);
  assert.ok(existsSync(archive), 'npm did not write its tarball');
  const packedFiles = new Set(packed.files.map(file => file.path));
  const required = [
    'bin/bronto-layout.mjs', 'bin/audit-command.mjs', 'bin/batch-command.mjs', 'bin/audit-comparison-gallery.mjs', 'bin/audit-evidence-verify.mjs', 'bin/cli-options.mjs', 'bin/chromium-target.mjs', 'bin/local-fixture-server.mjs', 'bin/chrome-detect.mjs', 'bin/cdp-client.mjs', 'bin/chromium-session.mjs', 'dist/index.js', 'dist/index.d.ts', 'dist/core.js',
    'dist/browser.js', 'dist/workflow-guidance.js', 'dist/bounded-screenshot.js', 'dist/contract.js', 'dist/proposal-review.js', 'dist/audit.js', 'dist/audit-browser.js', 'dist/composed-selector.js', 'dist/scenario.js', 'dist/frame-inventory.js', 'dist/frame-inspector.js',
    'examples/audit-healthy.html', 'examples/audit-broken.html', 'examples/layout.json',
    'examples/healthy.html', 'examples/portfolio-alignment.json', 'examples/portfolio-alignment-healthy.html', 'examples/portfolio-alignment-broken.html',
    'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'package.json', 'docs/quickstart.md', 'docs/cli-reference.md', 'docs/portfolio-regression-case-study.md', 'docs/release-checklist.md',
    'schemas/layout-contract.schema.json', 'schemas/batch-manifest.schema.json', 'schemas/layout-actions.schema.json'
  ];
  for (const file of required) assert.ok(packedFiles.has(file), 'Missing packaged file: ' + file);
  for (const file of packedFiles) {
    assert.ok(!file.startsWith('src/'), 'Uncompiled source unexpectedly shipped: ' + file);
    assert.ok(!file.startsWith('tests/'), 'Unit tests unexpectedly shipped: ' + file);
    assert.ok(!file.startsWith('node_modules/'), 'Development dependencies unexpectedly shipped');
    assert.ok(!file.startsWith('benchmarks/'), 'Contributor-only field benchmarks unexpectedly shipped');
    assert.ok(!file.startsWith('scripts/'), 'Contributor-only development scripts unexpectedly shipped');
  }
  const consumer = path.join(temp, 'consumer');
  await mkdir(consumer);
  // Offline, no install scripts and no dev dependencies: installed CLI is genuinely self-contained.
  run(npm, [
    'install', '--offline', '--ignore-scripts', '--omit=dev',
    '--no-audit', '--no-fund', '--no-package-lock', '--prefix', consumer, archive
  ]);
  const installed = path.join(consumer, 'node_modules', '@ponchia', 'layout');
  const installedPkg = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(installedPkg.version, pkg.version);
  assert.deepEqual(installedPkg.dependencies ?? {}, {}, 'Unexpected runtime dependencies');
  // Editor schemas must ship with the public npm tarball, but Ajv itself is
  // strictly development-only. The installed package needs no validator to
  // parse/render those JSON definitions or to run its CLI.
  for (const schemaName of ['layout-contract.schema.json','batch-manifest.schema.json','layout-actions.schema.json']) {
    const exportPath = './schemas/' + schemaName;
    assert.equal(installedPkg.exports[exportPath],exportPath,
      'Installed package must expose the '+schemaName+' editor schema');
    const definition = JSON.parse(await readFile(path.join(installed,'schemas',schemaName),'utf8'));
    assert.equal(definition.$schema,'https://json-schema.org/draft/2020-12/schema');
    assert.equal(definition.$id,'https://raw.githubusercontent.com/Ponchia/bronto-layout/main/schemas/'+schemaName);
  }

  const binary = process.platform === 'win32'
    ? path.join(consumer, 'node_modules', '.bin', 'bronto-layout.cmd')
    : path.join(consumer, 'node_modules', '.bin', 'bronto-layout');
  assert.ok(existsSync(binary), 'npm did not install the CLI executable');
  const version = run(binary, ['--version'], { cwd: consumer }).trim();
  const help = run(binary, ['--help'], { cwd: consumer });
  assert.match(help, /doctor/);
  assert.equal(version, 'Bronto Layout ' + pkg.version);
  const sourceSpec = path.join(installed, 'examples', 'layout.json');
  const validated = JSON.parse(run(binary, ['validate', '--spec', sourceSpec, '--json'], { cwd: consumer }));
  assert.equal(validated.valid, true);
  const portfolioSpec = path.join(installed, 'examples', 'portfolio-alignment.json');
  assert.equal(JSON.parse(run(binary, ['validate', '--spec', portfolioSpec, '--json'], { cwd: consumer })).valid, true,
    'Published tarball should run its documented portfolio regression workflow');
  const schemaSpec = path.join(installed,'examples','schema-enabled-layout.json');
  const schemaValidated = JSON.parse(run(binary,['validate','--spec',schemaSpec,'--json'],{cwd:consumer}));
  assert.equal(schemaValidated.valid,true,'Installed CLI must accept optional editor schema metadata');
  const schemaBatch = path.join(installed,'examples','schema-enabled-batch.json');
  const planned = JSON.parse(run(binary,['batch','--manifest',schemaBatch,'--dry-run','--json'],{cwd:consumer}));
  assert.equal(planned.mode,'batch-plan','Installed CLI must accept schema-tagged batch manifests');
  assert.equal(planned.total,2);

  const api = await import(pathToFileURL(path.join(installed, 'dist', 'index.js')).href);
  assert.equal(typeof api.evaluateLayout, 'function');
  assert.equal(typeof api.parseContract, 'function');
  assert.equal(api.parseContract({
    selectors: { element: '#element' },
    rules: [{ id: 'presence', type: 'selector-count', element: 'element', exactly: 1 }]
  }).rules.length, 1);

  // npm consumers normally DO NOT pass --ignore-scripts. Verify that the
  // published tarball installs in the ordinary mode too, with the lifecycle
  // setting explicitly enabled. Stay offline and exclude development deps.
  // This is a separate consumer directory so a prior no-scripts install can
  // never mask a lifecycle or packaging incompatibility.
  const ordinaryConsumer = path.join(temp, 'consumer-ordinary');
  await mkdir(ordinaryConsumer);
  run(npm, [
    'install', '--offline', '--ignore-scripts=false', '--omit=dev',
    '--no-audit', '--no-fund', '--no-package-lock', '--prefix', ordinaryConsumer, archive
  ]);
  const ordinaryInstall = path.join(ordinaryConsumer, 'node_modules', '@ponchia', 'layout');
  const ordinaryPkg = JSON.parse(await readFile(path.join(ordinaryInstall, 'package.json'), 'utf8'));
  assert.equal(ordinaryPkg.version, pkg.version);
  assert.deepEqual(ordinaryPkg.dependencies ?? {}, {}, 'Ordinary install unexpectedly requires runtime dependencies');
  const ordinaryBinary = process.platform === 'win32'
    ? path.join(ordinaryConsumer, 'node_modules', '.bin', 'bronto-layout.cmd')
    : path.join(ordinaryConsumer, 'node_modules', '.bin', 'bronto-layout');
  assert.ok(existsSync(ordinaryBinary), 'Ordinary npm install did not expose the CLI executable');
  assert.equal(run(ordinaryBinary, ['--version'], { cwd: ordinaryConsumer }).trim(),
    'Bronto Layout ' + pkg.version);
  const ordinarySpec = path.join(ordinaryInstall, 'examples', 'layout.json');
  assert.equal(JSON.parse(run(ordinaryBinary,
    ['validate', '--spec', ordinarySpec, '--json'], { cwd: ordinaryConsumer })).valid, true);
  const ordinaryAPI = await import(pathToFileURL(path.join(ordinaryInstall, 'dist', 'index.js')).href);
  assert.equal(typeof ordinaryAPI.evaluateLayout, 'function');
  assert.equal(typeof ordinaryAPI.parseContract, 'function');

  if (process.env.BRONTO_REQUIRE_CHROME === '1') {
    // The installed public CLI, not the source checkout, must genuinely start
    // Chromium and exchange a CDP command through its isolated blank tab.
    // Browser sandbox disabling remains an explicit fixture-only CI override.
    const launchArgs = ['doctor', '--verify-launch', '--json'];
    if (process.env.BRONTO_CHROME_NO_SANDBOX === '1') launchArgs.push('--no-sandbox');
    const launched = JSON.parse(run(ordinaryBinary, launchArgs, {
      cwd: ordinaryConsumer, timeout: 90000
    }));
    assert.equal(launched.mode, 'doctor');
    assert.equal(launched.status, 'launch-verified');
    assert.equal(launched.browser.launch.attempted, true);
    assert.equal(launched.browser.launch.connected, true);
    assert.equal(launched.browser.launch.page, 'about:blank');
    assert.equal(launched.browser.launch.sandboxBypassRequested,
      process.env.BRONTO_CHROME_NO_SANDBOX === '1');
    const browserArgs = [
      'check', '--spec', sourceSpec, '--url', path.join(installed, 'examples', 'healthy.html'),
      '--width', '375', '--json'
    ];
    if (process.env.BRONTO_CHROME_NO_SANDBOX === '1') browserArgs.push('--no-sandbox');
    const checked = JSON.parse(run(binary, browserArgs, { cwd: consumer, timeout: 90000 }));
    assert.equal(checked.summary.failed, 0);
    assert.ok(checked.summary.passed > 0);
    const audit = JSON.parse(run(binary, [
      'audit', '--url', path.join(installed, 'examples', 'audit-healthy.html'),
      '--width', '320', '--json', '--compact'
    ], { cwd: consumer, timeout: 90000 }));
    assert.equal(audit.mode, 'audit');
    assert.equal(audit.summary.measuredIssues, 0);
    const automaticComparison = JSON.parse(run(binary, [
      'audit',
      '--baseline', path.join(installed, 'examples', 'audit-healthy.html'),
      '--url', path.join(installed, 'examples', 'audit-healthy.html'),
      '--width', '375', '--json', '--compact'
    ], { cwd: consumer, timeout: 90000 }));
    assert.equal(automaticComparison.mode, 'audit-compare');
    assert.equal(automaticComparison.summary.measuredRegressions, 0);
    assert.equal(automaticComparison.summary.unverifiedViewports, 0);
  }

  print('Packed ' + packed.filename + ': ' + packedFiles.size + ' files, ' +
    packed.size + ' bytes; script-disabled and normal offline consumer installs, CLI, exports and examples verified');
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
