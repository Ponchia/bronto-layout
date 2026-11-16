import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'reports/presentation'));
assert.ok(out !== root && !root.startsWith(out + path.sep), 'Output must not contain the source checkout');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const evidence = JSON.parse(await readFile(path.join(root, 'docs/assets/first-use/evidence.json'), 'utf8'));
assert.equal(evidence.package.name, '@ponchia/layout');

// The displayed rule and downloadable files must be exactly the sources used
// by the captured npm example. Source drift requires new evidence, not a relabel.
const specBytes = await readFile(path.join(root, 'examples/portfolio-alignment.json'));
assert.equal(digest(specBytes), evidence.contract.sha256, 'Contract changed since the recorded capture');
const spec = JSON.parse(specBytes);
const alignment = spec.rules.find(rule => rule.id === evidence.contract.ruleId);
assert.ok(alignment, 'Captured alignment rule is missing');
assert.equal(alignment.tolerance, evidence.contract.tolerance);
assert.equal(alignment.minWidth, evidence.contract.minWidth);
const fixtures = new Map();
for (const state of ['healthy', 'broken']) {
  const bytes = await readFile(path.join(root, `examples/portfolio-alignment-${state}.html`));
  assert.equal(digest(bytes), evidence.fixtures[state].fixtureSha256, `${state} fixture changed since capture`);
  const screenshot = await readFile(path.join(root, `docs/assets/first-use/${state}-768.png`));
  assert.equal(digest(screenshot), evidence.fixtures[state].screenshotSha256, `${state} screenshot does not match capture evidence`);
  fixtures.set(state, bytes);
}

let html = await readFile(path.join(root, 'site/index.html'), 'utf8');
assert.equal(html.split('<!-- ALIGNMENT_RULE -->').length, 2, 'Exactly one generated rule excerpt is required');
html = html.replace('<!-- ALIGNMENT_RULE -->', escapeHtml(JSON.stringify(alignment, null, 2)));
assert.match(html, /id="try-controls" hidden/, 'Interactive controls must wait for the real evaluator');
assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'Only the progressive rule enhancement is expected');
assert.ok(html.includes(`@ponchia/layout@${evidence.package.version}`), 'Install snippet must match the captured package version');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'index.html'), html);
await cp(path.join(root, 'site/styles.css'), path.join(out, 'styles.css'));
await cp(path.join(root, 'docs/assets/first-use'), path.join(out, 'assets/first-use'), { recursive: true });
await writeFile(path.join(out, 'assets/first-use/portfolio-alignment.json'), specBytes);
await cp(path.join(root, 'site/try-rule.mjs'), path.join(out, 'try-rule.mjs'));
const source = await readFile(path.join(root, 'src/core.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
assert.ok(!/^import /m.test(compiled), 'The browser evaluator must remain dependency-free');
await writeFile(path.join(out, 'assets/layout-core.js'), compiled);
await writeFile(path.join(out, 'assets/evaluator-source.json'), JSON.stringify({ package: '@ponchia/layout', version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, file: 'src/core.ts', sha256: digest(source), scope: 'Current source evaluator, host-measured DOM geometry; not the recorded npm CLI capture.' }, null, 2) + '\n');

for (const [state, bytes] of fixtures) {
  await writeFile(path.join(out, `assets/first-use/portfolio-alignment-${state}.html`), bytes);
}
const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
for (const link of links) {
  if (link.startsWith('https://')) continue;
  if (link.startsWith('#')) {
    if (link !== '#') assert.ok(html.includes(`id="${link.slice(1)}"`), `Missing anchor: ${link}`);
  } else {
    assert.ok(!link.includes('..'), `Unexpected path traversal: ${link}`);
    await access(path.join(out, link));
  }
}
await writeFile(path.join(out, 'links.json'), JSON.stringify([...new Set(links)], null, 2) + '\n');
process.stdout.write(`Built static presentation: ${out}\nVerified ${links.length} link/image targets, exact rule and captured fixture hashes; static evidence remains usable without JavaScript.\n`);
