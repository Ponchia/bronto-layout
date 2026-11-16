import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
test('presentation builds a dependency-free real evaluator with a fixed 2px rule', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'layout-presentation-'));
  try {
    const build = spawnSync(process.execPath, ['scripts/build-presentation.mjs', out], { cwd: root, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const html = await readFile(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /id="try-controls" hidden/);
    assert.match(html, /current source evaluator/);
    const runtime = await readFile(path.join(out, 'try-rule.mjs'), 'utf8');
    assert.match(runtime, /getBoundingClientRect/);
    assert.match(runtime, /tolerance: 2/);
    const { evaluateLayout } = await import(pathToFileURL(path.join(out, 'assets/layout-core.js')));
    for (const [offset, status] of [[0, 'pass'], [2, 'pass'], [3, 'fail'], [18, 'fail']]) {
      const geometry = y => [{ path: 'fixture', tag: 'div', rect: { x: 0, y, width: 100, height: 100 } }];
      const report = evaluateLayout({ viewport: { width: 390, height: 800, direction: 'ltr' }, document: { width: 350, height: 250 }, selectors: { paragraph: geometry(24), image: geometry(24 + offset) } }, [{ id: 'alignment', type: 'align-edge', a: 'paragraph', b: 'image', edgeA: 'top', tolerance: 2 }]);
      assert.equal(report.findings[0].status, status);
      assert.equal(report.findings[0].deviation, offset);
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});
