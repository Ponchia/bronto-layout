import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyPublishedRelease } from '../scripts/verify-registry-release.mjs';

const version = '0.5.0-beta.2';
const archive = Buffer.from('synthetic checked archive');
const name = '@ponchia/layout';
const url = `https://registry.npmjs.org/@ponchia/layout/-/layout-${version}.tgz`;
const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');
const metadata = () => ({ name, version, dist: { integrity, tarball: url, attestations: {
  url: `https://registry.npmjs.org/-/npm/v1/attestations/@ponchia%2Flayout@${version}`,
  provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
} } });
function fixture({ meta = metadata(), bytes = archive, tags = { beta: version }, statuses = [] } = {}) {
  const calls = [];
  return { calls, sleep: async () => {}, fetchImpl: async (address, init) => {
    calls.push(address);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    const status = statuses.shift();
    if (status) return new Response('{"error":"upstream response is not proof of publication"}', { status });
    if (address === url || address.includes('/-/layout-')) return new Response(bytes);
    const body = address.endsWith('/' + version) ? meta : { name, 'dist-tags': tags };
    return new Response(JSON.stringify(body));
  } };
}
test('registry verifier checks identity, exact public bytes, beta tag and advertised provenance', async () => {
  const source = fixture();
  const result = await verifyPublishedRelease({ version, archive, requireProvenance: true }, source);
  assert.equal(result.registryArchiveMatches, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.provenance.advertised, true);
  assert.equal(result.provenance.cryptographicallyVerified, false);
  assert.equal(source.calls.length, 3);
});
test('nonempty npm error JSON cannot become a successful release verification', async () => {
  await assert.rejects(verifyPublishedRelease({ version, archive }, fixture({ meta: { error: 'E404' } })), /identity/);
  const unavailable = fixture({ statuses: Array(5).fill(404) });
  await assert.rejects(verifyPublishedRelease({ version, archive }, unavailable), /HTTP 404/);
  assert.equal(unavailable.calls.length, 5);
});
test('only bounded read retries handle registry propagation; access errors are not retried', async () => {
  const source = fixture({ statuses: [404, 503] });
  assert.equal((await verifyPublishedRelease({ version, archive }, source)).version, version);
  assert.equal(source.calls.length, 5);
  for (const status of [401, 403, 429]) {
    const denied = fixture({ statuses: [status] });
    await assert.rejects(verifyPublishedRelease({ version, archive }, denied), new RegExp('HTTP ' + status));
    assert.equal(denied.calls.length, 1);
  }
});
test('wrong version, integrity, bytes and moving beta tag refuse success', async () => {
  const wrongVersion = metadata(); wrongVersion.version = '0.5.0-beta.1';
  const wrongIntegrity = metadata(); wrongIntegrity.dist.integrity = 'sha512-nope';
  await assert.rejects(verifyPublishedRelease({ version, archive }, fixture({ meta: wrongVersion })), /identity/);
  await assert.rejects(verifyPublishedRelease({ version, archive }, fixture({ meta: wrongIntegrity })), /integrity/);
  await assert.rejects(verifyPublishedRelease({ version, archive }, fixture({ bytes: Buffer.from('different archive') })), /differs/);
  await assert.rejects(verifyPublishedRelease({ version, archive }, fixture({ tags: { beta: '0.5.0-beta.3' } })), /dist-tag/);
});
test('provenance requirement is explicit for OIDC and not fabricated for local bootstrap', async () => {
  const noProof = metadata(); delete noProof.dist.attestations;
  assert.equal((await verifyPublishedRelease({ version, archive }, fixture({ meta: noProof }))).provenance.advertised, false);
  await assert.rejects(verifyPublishedRelease({ version, archive, requireProvenance: true }, fixture({ meta: noProof })), /provenance/);
  const wrongProof = metadata(); wrongProof.dist.attestations.url = 'https://example.invalid/proof';
  await assert.rejects(verifyPublishedRelease({ version, archive, requireProvenance: true }, fixture({ meta: wrongProof })), /provenance/);
});
test('registry cannot redirect the verifier to arbitrary hosts, packages or credential URLs', async () => {
  for (const target of ['http://registry.npmjs.org/a.tgz', 'https://example.invalid/a.tgz',
    'https://registry.npmjs.org/other/-/other.tgz', 'https://user:secret@registry.npmjs.org/@ponchia/layout/-/layout-0.5.0-beta.2.tgz']) {
    const meta = metadata(); meta.dist.tarball = target;
    const source = fixture({ meta });
    await assert.rejects(verifyPublishedRelease({ version, archive }, source), /boundary/);
    assert.equal(source.calls.length, 1);
  }
});
test('invalid versions, stable tag and oversized local archive refuse before network', async () => {
  const source = fixture();
  for (const v of ['latest', '0.5.0', '../beta', '01.5.0-beta.2'])
    await assert.rejects(verifyPublishedRelease({ version: v, archive }, source), /beta/);
  await assert.rejects(verifyPublishedRelease({ version, archive, tag: 'latest' }, source), /beta/);
  await assert.rejects(verifyPublishedRelease({ version, archive: new Uint8Array(21 * 1024 * 1024) }, source), /bounded/);
  assert.equal(source.calls.length, 0);
});
test('network failure is reported without leaking upstream diagnostics or attempting publication', async () => {
  await assert.rejects(verifyPublishedRelease({ version, archive }, {
    fetchImpl: async () => { throw Error('secret-bearing upstream diagnostic'); },
  }), error => /transport failed/.test(error.message) && !error.message.includes('secret-bearing'));
});
