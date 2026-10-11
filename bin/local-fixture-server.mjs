/**
 * Local fixture asset server for the standalone Bronto Layout CLI.
 *
 * Serve the user-selected HTML document and ordinary web assets beneath its
 * directory, never dotfiles, unsupported file types or symlink escapes.
 * The bound HTTP listener is loopback-only and has no directory listing.
 *
 * This is a guardrail, not a sandbox for arbitrary untrusted JavaScript:
 * callers should inspect trustworthy local fixtures with Chromium sandboxing
 * enabled. Prefer a separate dev server for full application projects.
 */
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
});

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (
    relative !== '..' && !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function response(res, status) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(status === 403 ? 'Forbidden' : status === 404 ? 'Not found' : 'Bad request');
}

export async function serveTarget(raw) {
  if (/^https?:\/\//.test(raw)) return { url: raw, close() {} };
  const source = raw.startsWith('file://') ? fileURLToPath(raw) : path.resolve(raw);
  let sourceInfo;
  try { sourceInfo = await stat(source); }
  catch { throw new Error('URL or file does not exist: ' + raw); }
  if (!sourceInfo.isFile()) throw new Error('Local fixture must be a regular file: ' + raw);
  if (!['.html', '.htm'].includes(path.extname(source).toLowerCase())) {
    throw new Error('Local target must be HTML; use a development server URL for other files: ' + raw);
  }
  if (path.basename(source).startsWith('.')) throw new Error('Hidden local HTML fixtures are not served: ' + raw);
  const root = path.dirname(source);
  const rootReal = await realpath(root);
  const sourceReal = await realpath(source);
  if (!inside(rootReal, sourceReal)) {
    throw new Error('Local fixture resolves outside its directory: ' + raw);
  }

  const server = createServer((req, res) => {
    // Validate before filesystem access; HTTP status codes are intentionally
    // generic to avoid revealing the contents of excluded files.
    let segments;
    try {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      const decoded = decodeURIComponent(pathname);
      if (decoded.includes('\0')) throw new Error('Null byte');
      segments = decoded.split(/[\\/]+/).filter(Boolean);
      if (!segments.length || segments.some(part => part.startsWith('.') || part === '..')) {
        response(res, 403); return;
      }
    } catch { response(res, 400); return; }

    const lexical = path.resolve(root, ...segments);
    if (!inside(root, lexical)) { response(res, 403); return; }
    const mime = MIME[path.extname(lexical).toLowerCase()];
    if (!mime) { response(res, 403); return; }

    void (async () => {
      let resolved;
      try { resolved = await realpath(lexical); }
      catch { response(res, 404); return; }
      if (!inside(rootReal, resolved)) { response(res, 403); return; }
      let info;
      try { info = await stat(resolved); }
      catch { response(res, 404); return; }
      if (!info.isFile()) { response(res, 403); return; }

      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-store');
      const stream = createReadStream(resolved);
      stream.on('error', () => {
        if (!res.headersSent) response(res, 404);
        else res.destroy();
      });
      stream.pipe(res);
    })().catch(() => {
      if (!res.headersSent) response(res, 404);
      else res.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: 'http://127.0.0.1:' + address.port + '/' + encodeURIComponent(path.basename(source)),
    sourcePath: source,
    close() { server.close(); }
  };
}
