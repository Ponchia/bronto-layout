import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serveTarget } from '../bin/local-fixture-server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bronto-fixture-test-'));
  const web = path.join(directory, 'web');
  const outside = path.join(directory, 'outside');
  await mkdir(web, { recursive: true });
  await mkdir(outside, { recursive: true });
  const source = path.join(web, 'fixture.html');
  await writeFile(source, '<!doctype html><title>Example</title>');
  await writeFile(path.join(web, 'site.css'), '.card { width: 120px }');
  await writeFile(path.join(web, 'app.js'), 'console.log("ok")');
  await writeFile(path.join(web, '.env'), 'PRIVATE_TOKEN=not-real');
  await writeFile(path.join(web, 'private.key'), 'DUMMY_KEY');
  await writeFile(path.join(outside, 'outside.css'), '.leak { width: 1px }');
  await symlink(path.join(outside, 'outside.css'), path.join(web, 'escape.css'));
  const server = await serveTarget(source);
  t.after(async () => {
    server.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return { source, web, outside, server };
}

test('local HTML and linked web assets serve with correct MIME and no directory listing', async t => {
  const { server } = await fixture(t);
  const doc = await fetch(server.url);
  assert.equal(doc.status, 200);
  assert.match(doc.headers.get('content-type'), /text\/html/);
  assert.match(await doc.text(), /Example/);
  const css = await fetch(new URL('site.css', server.url));
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(await css.text(), /width: 120px/);
  const js = await fetch(new URL('app.js', server.url));
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /text\/javascript/);
  const missing = await fetch(new URL('nope.css', server.url));
  assert.equal(missing.status, 404);
  const folder = await fetch(new URL('/', server.url));
  assert.notEqual(folder.status, 200);
});

test('local fixture server blocks hidden files, unknown extensions, and symlink escapes', async t => {
  const { server } = await fixture(t);
  for (const filename of ['.env', 'private.key', 'escape.css', '.git/config']) {
    const response = await fetch(new URL(filename, server.url));
    assert.equal(response.status, 403, filename);
    assert.doesNotMatch(await response.text(), /PRIVATE_TOKEN|DUMMY_KEY|\.leak/);
  }
});

test('traversal attempts cannot escape the declared fixture directory', async t => {
  const { server } = await fixture(t);
  const candidates = [
    '/%2e%2e/outside/outside.css',
    '/..%2foutside%2foutside.css',
    '/%252e%252e%252foutside%252foutside.css'
  ];
  for (const candidate of candidates) {
    const response = await fetch(new URL(candidate, server.url));
    assert.notEqual(response.status, 200, candidate);
    assert.doesNotMatch(await response.text(), /\.leak/);
  }
});

test('absolute file URLs work but hidden and escaping HTML entrypoints are refused', async t => {
  const { source, web, outside } = await fixture(t);
  const passed = await serveTarget(pathToFileURL(source).href);
  try {
    const response = await fetch(passed.url);
    assert.equal(response.status, 200);
  } finally { passed.close(); }
  const secretHtml = path.join(web, '.private.html');
  await writeFile(secretHtml, '<h1>Private</h1>');
  await assert.rejects(() => serveTarget(secretHtml), /Hidden local HTML/);
  await assert.rejects(() => serveTarget(path.join(web, 'site.css')), /must be HTML/);
  const external = path.join(outside, 'outside.html');
  await writeFile(external, '<h1>Private</h1>');
  const link = path.join(web, 'link.html');
  await symlink(external, link);
  await assert.rejects(() => serveTarget(link), /outside its directory/);
});

test('HTTP URL passthrough never starts a local asset server', async () => {
  const target = await serveTarget('https://example.test/page.html');
  assert.equal(target.url, 'https://example.test/page.html');
  assert.equal(target.sourcePath, undefined);
  target.close();
});
