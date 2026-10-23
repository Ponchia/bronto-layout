#!/usr/bin/env node
/** Read-only verification of a published beta. This command never publishes or repairs registry state. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const NAME = '@ponchia/layout';
const REGISTRY = 'https://registry.npmjs.org';
const MAX_ARCHIVE = 20 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;
const hash = (algorithm, bytes, encoding) => createHash(algorithm).update(bytes).digest(encoding);

async function responseBytes(response, limit) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw Error('Registry response exceeds its byte budget.');
  if (!response.body) throw Error('Registry returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('Registry response exceeds its byte budget.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Dependencies are injectable for offline tests; production always uses the fixed public registry. */
export async function verifyPublishedRelease(
  { version, archive, tag = 'beta', requireProvenance = false },
  { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {},
) {
  if (!VERSION.test(version) || tag !== 'beta') throw Error('An exact beta version and the beta dist-tag are required.');
  if (!(archive instanceof Uint8Array) || !archive.byteLength || archive.byteLength > MAX_ARCHIVE)
    throw Error('Expected a nonempty bounded local release archive.');
  const sha256 = hash('sha256', archive, 'hex');
  const integrity = 'sha512-' + hash('sha512', archive, 'base64');
  const get = async (url, maximumBytes, json = false) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {
          redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Accept: json ? 'application/json' : 'application/octet-stream' },
        });
      } catch { throw Error('Registry transport failed; publication state is unknown. No publish was attempted.'); }
      // Only absence and server errors can be eventual propagation. Do not retry authorization or rate limits.
      if ((response.status === 404 || response.status >= 500) && attempt < 4) {
        await response.body?.cancel();
        await sleep(3000);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw Error(`Registry verification returned HTTP ${response.status}. No publish was attempted.`);
      }
      const bytes = await responseBytes(response, maximumBytes);
      if (!json) return bytes;
      try { return JSON.parse(bytes.toString('utf8')); }
      catch { throw Error('Registry metadata is not valid JSON.'); }
    }
    throw Error('Registry verification unavailable.');
  };
  const encoded = encodeURIComponent(NAME);
  const metadata = await get(`${REGISTRY}/${encoded}/${version}`, MAX_JSON, true);
  if (!metadata || metadata.name !== NAME || metadata.version !== version)
    throw Error('Registry package identity/version does not match the reviewed archive.');
  if (metadata.dist?.integrity !== integrity)
    throw Error('Registry integrity does not match the reviewed archive.');
  let download;
  try { download = new URL(metadata.dist.tarball); }
  catch { throw Error('Registry archive URL is invalid.'); }
  if (download.origin !== REGISTRY || download.username || download.password || download.search || download.hash ||
      download.pathname !== `/@ponchia/layout/-/layout-${version}.tgz`)
    throw Error('Registry archive URL is outside the exact package boundary.');
  const actual = await get(download.href, MAX_ARCHIVE);
  if (actual.byteLength !== archive.byteLength || !timingSafeEqual(actual, Buffer.from(archive)))
    throw Error('Downloaded registry archive differs from the reviewed archive.');
  const packument = await get(`${REGISTRY}/${encoded}`, MAX_JSON, true);
  if (packument?.name !== NAME || packument['dist-tags']?.[tag] !== version)
    throw Error('Registry beta dist-tag does not identify this version.');
  const attestations = metadata.dist?.attestations;
  const predicate = attestations?.provenance?.predicateType;
  let provenanceAdvertised = false;
  if (typeof attestations?.url === 'string' && typeof predicate === 'string') {
    try {
      const address = new URL(attestations.url);
      provenanceAdvertised = address.origin === REGISTRY && !address.username && !address.password &&
        !address.search && !address.hash &&
        decodeURIComponent(address.pathname) === `/-/npm/v1/attestations/${NAME}@${version}` &&
        ['https://slsa.dev/provenance/v1', 'https://slsa.dev/provenance/v0.2'].includes(predicate);
    } catch { /* Invalid metadata is not provenance evidence. */ }
  }
  if (requireProvenance && !provenanceAdvertised)
    throw Error('Expected trusted-publisher provenance metadata is missing or invalid.');
  return {
    schemaVersion: 1, readOnly: true, name: NAME, version, tag, sha256, integrity,
    byteLength: archive.byteLength, registryArchiveMatches: true,
    provenance: { advertised: provenanceAdvertised, cryptographicallyVerified: false },
    caveat: 'Use npm audit signatures in a separate clean consumer to verify signatures and provenance. No publication is performed by this verifier.',
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = { requireProvenance: false };
  const values = new Map([['--version', 'version'], ['--tarball', 'tarball'], ['--tag', 'tag']]);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--require-provenance') { options.requireProvenance = true; continue; }
    const key = values.get(argv[i]);
    if (!key || options[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--'))
      throw Error('Usage: node scripts/verify-registry-release.mjs --version VERSION --tarball FILE [--tag beta] [--require-provenance]');
    options[key] = argv[++i];
  }
  if (!options.version || !options.tarball) throw Error('Pass an exact beta version and its reviewed local tarball.');
  const info = await stat(options.tarball);
  if (!info.isFile() || info.size > MAX_ARCHIVE) throw Error('Local archive must be a regular file within the byte budget.');
  const result = await verifyPublishedRelease({ ...options, archive: await readFile(options.tarball) });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('Release verification failed: ' + error.message);
    console.error('An earlier publication may already exist. Diagnose or rerun verification only; never blindly rerun npm publish.');
    process.exitCode = 2;
  });
}
