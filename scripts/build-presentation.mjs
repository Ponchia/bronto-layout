import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'reports/presentation'));
assert.ok(out !== root && !root.startsWith(out + path.sep), 'Output must not contain the source checkout');
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'try-rule.mjs']) await cp(path.join(root, 'site', file), path.join(out, file));
await cp(path.join(root, 'docs/assets/first-use'), path.join(out, 'assets/first-use'), { recursive: true });
const html = await readFile(path.join(out, 'index.html'), 'utf8');
assert.match(html, /id="try-controls" hidden/, 'Controls must wait for the real evaluator');
const source = await readFile(path.join(root, 'src/core.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
assert.ok(!/^import /m.test(compiled), 'The browser evaluator must remain dependency-free');
await mkdir(path.join(out, 'assets'), { recursive: true });
await writeFile(path.join(out, 'assets/layout-core.js'), compiled);
await writeFile(path.join(out, 'assets/evaluator-source.json'), JSON.stringify({ package: '@ponchia/layout', version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, file: 'src/core.ts', sha256: createHash('sha256').update(source).digest('hex'), scope: 'Current source evaluator, host-measured DOM geometry; not the recorded npm CLI capture.' }, null, 2) + '\n');
const evidence = JSON.parse(await readFile(path.join(out, 'assets/first-use/evidence.json'), 'utf8'));
assert.equal(evidence.package.name, '@ponchia/layout');
assert.ok(html.includes(`@ponchia/layout@${evidence.package.version}`), 'Install snippet must match the captured package version');
for (const state of ['healthy', 'broken']) {
  const bytes = await readFile(path.join(out, `assets/first-use/${state}-768.png`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.fixtures[state].screenshotSha256,
    `${state} screenshot does not match capture evidence`);
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
process.stdout.write(`Built static presentation: ${out}\nVerified ${links.length} link/image targets; no JavaScript required.\n`);
