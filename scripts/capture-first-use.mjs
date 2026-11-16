#!/usr/bin/env node
/** Capture the documented journey from an installed package, never source imports. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const packageIndex = args.indexOf('--package-root');
const outIndex = args.indexOf('--out');
assert.ok(packageIndex >= 0 && args[packageIndex + 1], 'Pass --package-root /absolute/consumer/node_modules/@ponchia/layout');
assert.ok(outIndex >= 0 && args[outIndex + 1], 'Pass --out /absolute/evidence-directory');
const packageRoot = path.resolve(args[packageIndex + 1]);
const out = path.resolve(args[outIndex + 1]);
assert.ok(out !== packageRoot && !out.startsWith(packageRoot + path.sep), 'Evidence must be outside the installed package');
const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
assert.equal(pkg.name, '@ponchia/layout');
const cli = path.join(packageRoot, 'bin/bronto-layout.mjs');
const browserArgs = args.includes('--no-sandbox') ? ['--no-sandbox'] : [];
const spec = path.join(packageRoot, 'examples/portfolio-alignment.json');
await mkdir(out, { recursive: true });
const normalize = text => text.replaceAll(packageRoot, '$PACKAGE').replaceAll(out, '$EVIDENCE');
function run(command, expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...command, ...browserArgs], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024
  });
  assert.ifError(result.error);
  assert.equal(result.status, expected, normalize(result.stderr || result.stdout));
  assert.ok(result.stdout.trim(), 'Expected nonempty CLI output');
  return result.stdout;
}
const doctor = JSON.parse(run(['doctor', '--verify-launch', '--json']));
assert.equal(doctor.status, 'launch-verified');
assert.equal(doctor.browser.launch.connected, true);
assert.equal(doctor.browser.launch.sandboxBypassRequested, browserArgs.length > 0);
assert.equal(JSON.parse(run(['validate', '--spec', spec, '--json'])).valid, true);
const specBytes = await readFile(spec);
const alignment = JSON.parse(specBytes).rules.find(rule => rule.id === 'image-top-aligns-to-paragraph');
assert.equal(alignment.type, 'align-edge');
assert.equal(alignment.tolerance, 2);
const evidence = { package: { name: pkg.name, version: pkg.version },
  capture: 'Installed CLI inspect screenshots, unmodified; controlled local fixtures only.',
  browser: { version: doctor.browser.version, sandboxBypassRequested: browserArgs.length > 0 },
  contract: { ruleId: alignment.id, type: alignment.type, tolerance: alignment.tolerance,
    minWidth: alignment.minWidth, unit: 'CSS px', sha256: createHash('sha256').update(specBytes).digest('hex') },
  fixtures: {} };
for (const [state, exit] of [['healthy', 0], ['broken', 1]]) {
  const fixture = path.join(packageRoot, `examples/portfolio-alignment-${state}.html`);
  const command = ['check', '--spec', spec, '--url', fixture];
  const result = JSON.parse(run([...command, '--json'], exit));
  assert.deepEqual(result.summary, state === 'healthy'
    ? { passed: 11, failed: 0, skipped: 1 } : { passed: 9, failed: 2, skipped: 1 });
  assert.deepEqual(result.reports.map(report => report.viewport.width), [375, 768, 1280]);
  const text = run(command, exit);
  await writeFile(path.join(out, `${state}.txt`), normalize(text));
  // Inspect marks the same two elements in both states; a red box is selection,
  // not a failure label. The check report supplies the actual verdict.
  const inspected = JSON.parse(run(['inspect', '--url', fixture, '--width', '768', '--height', '440',
    '--selector', 'paragraph=.copy > p:first-child', '--selector', 'image=.artwork .image',
    '--evidence-dir', path.join(out, state), '--json']));
  const screenshot = await readFile(inspected.evidence[0].screenshot);
  await writeFile(path.join(out, `${state}-768.png`), screenshot);
  const snapshot = inspected.snapshots[0];
  const topDelta = Math.abs(snapshot.selectors.paragraph[0].rect.y - snapshot.selectors.image[0].rect.y);
  assert.equal(topDelta, state === 'healthy' ? 0 : 18);
  evidence.fixtures[state] = { exit, summary: result.summary, topDelta,
    widths: result.reports.map(report => ({ width: report.viewport.width, ...report.summary })),
    fixtureSha256: createHash('sha256').update(await readFile(fixture)).digest('hex'),
    screenshotSha256: createHash('sha256').update(screenshot).digest('hex') };
}
await writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
process.stdout.write(`Captured ${pkg.name}@${pkg.version}: healthy exit 0, broken exit 1, top delta 0/18px.\n`);
