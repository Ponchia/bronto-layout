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
    'bin/bronto-layout.mjs', 'bin/chromium-target.mjs', 'bin/local-fixture-server.mjs', 'bin/chrome-detect.mjs', 'bin/cdp-client.mjs', 'bin/chromium-session.mjs', 'dist/index.js', 'dist/index.d.ts', 'dist/core.js',
    'dist/browser.js', 'dist/contract.js', 'dist/audit.js', 'dist/audit-browser.js', 'dist/composed-selector.js', 'dist/scenario.js', 'dist/frame-inventory.js', 'dist/frame-inspector.js',
    'examples/audit-healthy.html', 'examples/audit-broken.html', 'examples/layout.json',
    'examples/healthy.html', 'README.md', 'LICENSE', 'package.json', 'docs/quickstart.md', 'docs/release-checklist.md'
  ];
  for (const file of required) assert.ok(packedFiles.has(file), 'Missing packaged file: ' + file);
  for (const file of packedFiles) {
    assert.ok(!file.startsWith('src/'), 'Uncompiled source unexpectedly shipped: ' + file);
    assert.ok(!file.startsWith('tests/'), 'Unit tests unexpectedly shipped: ' + file);
    assert.ok(!file.startsWith('node_modules/'), 'Development dependencies unexpectedly shipped');
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
  const api = await import(pathToFileURL(path.join(installed, 'dist', 'index.js')).href);
  assert.equal(typeof api.evaluateLayout, 'function');
  assert.equal(typeof api.parseContract, 'function');
  assert.equal(api.parseContract({
    selectors: { element: '#element' },
    rules: [{ id: 'presence', type: 'selector-count', element: 'element', exactly: 1 }]
  }).rules.length, 1);

  if (process.env.BRONTO_REQUIRE_CHROME === '1') {
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
    packed.size + ' bytes; isolated installed CLI, exports and examples verified');
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
