import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('presentation reproduces the captured contract, rule and downloadable fixture bytes', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'bronto-presentation-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/build-presentation.mjs', out], {
      cwd: root, encoding: 'utf8', timeout: 15000
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const html = await readFile(path.join(out, 'index.html'), 'utf8');
    const evidence = JSON.parse(await readFile(path.join(out, 'assets/first-use/evidence.json'), 'utf8'));
    const specBytes = await readFile(path.join(out, 'assets/first-use/portfolio-alignment.json'));
    const spec = JSON.parse(specBytes);
    assert.equal(hash(specBytes), evidence.contract.sha256);
    const encoded = html.match(/<code data-alignment-rule>([\s\S]*?)<\/code>/)?.[1];
    assert.ok(encoded, 'The exact rule must be visible in the generated HTML');
    const decoded = encoded.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    assert.deepEqual(JSON.parse(decoded), spec.rules.find(rule => rule.id === evidence.contract.ruleId));
    assert.doesNotMatch(html, /\/home\//i);
    assert.equal((html.match(/<script\b/g) ?? []).length, 1);
    assert.match(html, /id="try-controls" hidden/);
    for (const state of ['healthy', 'broken']) {
      const file = `portfolio-alignment-${state}.html`;
      const fixture = await readFile(path.join(out, 'assets/first-use', file));
      assert.equal(hash(fixture), evidence.fixtures[state].fixtureSha256);
      assert.ok(html.includes(`href="assets/first-use/${file}" download`));
      assert.ok(html.includes(`href="assets/first-use/${file}">Open`));
    }
    assert.equal(spec.url, 'portfolio-alignment-healthy.html', 'Downloaded contract resolves the co-located healthy fixture');
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('rule explanation distinguishes browser viewing, CLI checks and the mobile skip', async () => {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  assert.match(html, /Opening them shows the layout; the CLI commands below perform the actual checks/);
  assert.match(html, /narrower than 768 CSS pixels/);
  assert.match(html, /Download the complete contract/);
  assert.match(html, /<pre tabindex="0" aria-labelledby="contract-code-label">/);
  assert.match(html, /<summary>Try the same fixtures in your browser<\/summary>/);
});
