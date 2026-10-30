import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workflow=readFileSync(new URL('../.github/workflows/npm-release.yml',import.meta.url),'utf8');
const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const macos=readFileSync(new URL('../.github/workflows/macos-portability.yml',import.meta.url),'utf8');
const docs=readFileSync(new URL('../docs/npm-publishing.md',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('the npm release never triggers from PR or main push, and is tag gated',()=>{
  assert.match(workflow,/tags:\s*\n\s*- 'v\*'/);
  assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|branches:/);
  assert.match(workflow,/git merge-base --is-ancestor /);
  assert.match(workflow,/^\s*if \[\[ ! "\$RELEASE_TAG" =~ \^v/m);
  assert.match(workflow,/npm view @ponchia\/layout name/);
  assert.match(workflow,/This version already exists in npm/);
});
test('npm release is behind validated bytes, human approval and OIDC rather than tokens',()=>{
  assert.match(workflow,/verify-ci:[\s\S]*?uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(workflow,/verify-macos:[\s\S]*?uses: \.\/\.github\/workflows\/macos-portability\.yml/);
  assert.match(workflow,/preflight:[\s\S]*?needs: \[verify-ci, verify-macos\]/);
  assert.match(ci,/workflow_call:/);
  assert.match(macos,/workflow_call:/);
  assert.match(workflow,/github-release:\s*\n\s*needs: \[preflight, verify-registry\]/);
  assert.match(workflow,/gh release create/);
  assert.match(workflow,/--verify-tag --prerelease --latest=false/);
  assert.match(workflow,/publish-npm:\s*\n\s*needs: \[preflight, publisher-readiness\]/);
  assert.match(workflow,/environment: npm-publish/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/uses: actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(workflow,/node "\$RUNNER_TEMP\/layout-publisher\/source\/bin\/npm-cli\.js" publish "\.\/\$TARBALL" --ignore-scripts --provenance --access public --tag beta/);
  assert.match(workflow,/sha256sum -c SHA256SUMS\.txt/);
  assert.match(workflow,/npm run test:unit/);
  assert.match(workflow,/npm run test:package/);
  assert.match(workflow,/doctor --verify-launch/);
  assert.match(workflow,/portfolio-alignment-broken\.html/);
  assert.doesNotMatch(workflow,/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.|npm publish.*--tag latest|\bpublishConfig\s*:/);
  assert.doesNotMatch(workflow,/\bnpm login\b|no-sandbox|BRONTO_CHROME_NO_SANDBOX/);
});
test('the first release requires an authenticated human and correct existing @ponchia scope',()=>{
  assert.equal(pkg.name,'@ponchia/layout');
  assert.equal(pkg.publishConfig.access,'public');
  assert.equal(pkg.publishConfig.tag,'beta', 'Unqualified npm publish must not default to stable latest');
  assert.equal(pkg.repository.url,'https://github.com/Ponchia/bronto-layout.git');
  assert.match(docs,/"\$NPM_CLI" whoami/);
  assert.match(docs,/"\$NPM_CLI" publish "\$TARBALL"/);
  assert.match(docs,/--access public --tag beta/);
  assert.match(docs,/--provenance=false/);
  assert.match(docs,/\bPonchia\b/);
  assert.match(docs,/\bnpm-release\.yml\b/);
  assert.match(docs,/not been published|first publication|first release/i);
});

test('registry observation fails closed and is isolated from publication authority',()=>{
  assert.match(workflow,/verify-registry:\s*\n\s*needs: \[preflight, publish-npm\]/);
  assert.match(workflow,/node scripts\/verify-registry-release\.mjs/);
  assert.match(workflow,/--require-provenance/);
  assert.match(workflow,/npm audit signatures/);
  assert.match(workflow,/npm install --ignore-scripts --no-audit --no-fund --save-exact/);
  assert.doesNotMatch(workflow,/if test -s .*npm-observed/);
  const publish = workflow.slice(workflow.indexOf('  publish-npm:'), workflow.indexOf('  verify-registry:'));
  assert.equal(publish.match(/actions\/checkout@/g)?.length, 1, 'Only the publisher tooling is checked out');
  assert.doesNotMatch(publish,/npm (?:ci|install) |node scripts\//);
  const verification = workflow.slice(workflow.indexOf('  verify-registry:'), workflow.indexOf('  github-release:'));
  assert.doesNotMatch(verification,/set \+e|id-token: write|contents: write|npm publish|environment: npm-publish/);
});

test('release checksum entries survive artifact relocation and reject changed bytes',()=>{
  assert.match(workflow,/\(cd "\$RUNNER_TEMP" && sha256sum "\$TARBALL" > SHA256SUMS\.txt\)/);
  assert.doesNotMatch(workflow,/sha256sum "\$RUNNER_TEMP\/\$TARBALL" > "\$RUNNER_TEMP\/SHA256SUMS\.txt"/);
  const root=mkdtempSync(path.join(tmpdir(),'layout-release-relocation-'));
  const producer=path.join(root,'producer'),consumer=path.join(root,'consumer');
  mkdirSync(producer);mkdirSync(consumer);
  const name='ponchia-layout-0.5.0-beta.2.tgz',bytes=Buffer.from('synthetic release archive');
  const sha=b=>createHash('sha256').update(b).digest('hex');
  try {
    writeFileSync(path.join(producer,name),bytes);
    writeFileSync(path.join(producer,'SHA256SUMS.txt'),`${sha(bytes)}  ${name}\n`);
    for(const file of [name,'SHA256SUMS.txt'])copyFileSync(path.join(producer,file),path.join(consumer,file));
    rmSync(producer,{recursive:true});
    const [,expected,relative]=readFileSync(path.join(consumer,'SHA256SUMS.txt'),'utf8').match(/^([a-f0-9]{64}) {2}([^\r\n]+)\n$/);
    assert.equal(path.isAbsolute(relative),false);
    assert.equal(relative,name);
    assert.equal(sha(readFileSync(path.join(consumer,relative))),expected);
    writeFileSync(path.join(consumer,name),'tampered archive');
    assert.notEqual(sha(readFileSync(path.join(consumer,relative))),expected);
  } finally {rmSync(root,{recursive:true,force:true});}
});

const job = (name, next) => workflow.slice(workflow.indexOf(`  ${name}:`), workflow.indexOf(`  ${next}:`));
const sparse = (block) => [...block.matchAll(/sparse-checkout: \|\n((?: {12}\S[^\n]*\n)+)/g)].map(m => m[1].trim().split(/\s+/));
const publisherFiles = ['/scripts/source-publisher.mjs', '/scripts/extract-publisher-source.py',
  '/scripts/audit-publishing-tooling.mjs', '/tooling/publisher/'];

test('only the audited source-locked publisher reaches OIDC, never the runner npm', () => {
  const readiness = job('publisher-readiness', 'verify-ci');
  assert.match(readiness, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(readiness, /id-token:|contents: write|environment:|continue-on-error:|if:|secrets\.|vars\.|\bnpm (?:install|ci|publish)\b/);
  assert.match(readiness, /node scripts\/source-publisher\.mjs prepare "\$RUNNER_TEMP\/layout-publisher"/);
  assert.match(readiness, /node scripts\/source-publisher\.mjs audit "\$RUNNER_TEMP\/layout-publisher"/);
  assert.deepEqual(sparse(readiness), [publisherFiles]);
  const publish = job('publish-npm', 'verify-registry');
  assert.match(publish, /needs: \[preflight, publisher-readiness\]/);
  assert.doesNotMatch(publish, /if:|continue-on-error:|always\(\)/);
  assert.deepEqual(sparse(publish), [publisherFiles], 'The OIDC job checks out publisher tooling only');
  assert.match(publish, /path: publisher\n/);
  assert.match(publish, /node publisher\/scripts\/source-publisher\.mjs prepare "\$RUNNER_TEMP\/layout-publisher"/);
  assert.match(publish, /node publisher\/scripts\/source-publisher\.mjs audit "\$RUNNER_TEMP\/layout-publisher"/);
  assert.ok(publish.indexOf('source-publisher.mjs audit') < publish.indexOf('npm-cli.js" publish'), 'audit before publish');
  assert.doesNotMatch(publish, /^\s*npm (?:publish|--version)\b/m, 'The runner npm never publishes');
  assert.doesNotMatch(workflow, /publisher-safety|publication is on hold/);
  assert.equal(pkg.scripts['publisher:readiness'], 'node scripts/source-publisher.mjs readiness');
  assert.match(docs, /source-locked/);
  assert.doesNotMatch(docs, /manual bootstrap.*also on hold/s);
});

test('the publisher pins unchanged npm source and overrides only the audited dependencies', () => {
  const source = JSON.parse(readFileSync(new URL('../tooling/publisher/source.json', import.meta.url), 'utf8'));
  const tooling = JSON.parse(readFileSync(new URL('../tooling/publisher/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../tooling/publisher/package-lock.json', import.meta.url), 'utf8'));
  assert.equal(source.version, '11.21.1');
  assert.equal(tooling.private, true);
  assert.equal(lock.packages['node_modules/undici']?.version, '6.29.1');
  assert.equal(lock.packages['node_modules/npm'], undefined, 'npm itself comes from pinned source, not the lock');
});
