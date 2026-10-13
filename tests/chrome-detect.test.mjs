import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromeExecutable, linuxBrowserPriority } from '../bin/chrome-detect.mjs';

test('stable packaged Chrome precedes development Chromium in automatic discovery', () => {
  const paths = linuxBrowserPriority();
  assert.ok(paths.indexOf('/usr/bin/google-chrome') >= 0);
  assert.ok(paths.indexOf('/usr/bin/chromium') >= 0);
  assert.ok(paths.indexOf('/usr/bin/google-chrome') < paths.indexOf('/usr/bin/chromium'));
  assert.ok(paths.indexOf('/usr/bin/google-chrome-stable') < paths.indexOf('/usr/bin/chromium'));
  assert.equal(new Set(paths).size, paths.length);
});

test('explicit --chrome path wins over CHROME_PATH, and environment overrides auto detection', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-chrome-selection-'));
  const override = path.join(dir, 'configured-chrome');
  const explicit = path.join(dir, 'explicit-chrome');
  const previous = process.env.CHROME_PATH;
  try {
    writeFileSync(override, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(explicit, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.env.CHROME_PATH = override;
    assert.equal(chromeExecutable(), override);
    assert.equal(chromeExecutable(explicit), explicit);
    assert.throws(() => chromeExecutable(path.join(dir, 'missing')), /does not exist/);
  } finally {
    if (previous === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
