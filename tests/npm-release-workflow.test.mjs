import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
  assert.match(workflow,/publish-npm:\s*\n\s*needs: \[preflight, publisher-safety\]/);
  assert.match(workflow,/environment: npm-publish/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/uses: actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(workflow,/npm publish "\.\/\$TARBALL" --ignore-scripts --provenance --access public --tag beta/);
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
  assert.match(docs,/npm whoami/);
  assert.match(docs,/npm publish "\$TARBALL"/);
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
  assert.doesNotMatch(publish,/actions\/checkout|npm (?:ci|install) |node scripts\//);
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

// Execute the real workflow block, not a test-only imitation of its refusal.
const publisherHold = workflow.slice(workflow.indexOf('  publisher-safety:'), workflow.indexOf('  verify-ci:'));
const holdScript = publisherHold.match(/ {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1]
  ?.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');

test('unreviewed publisher is stopped before OIDC, even with approval-shaped environment values', () => {
  assert.ok(holdScript, 'The workflow must retain an executable read-only publisher hold');
  for (const enabled of ['true', 'false', '']) {
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', holdScript], {
      encoding: 'utf8', timeout: 5000,
      env: { PATH: '/usr/bin:/bin', ENABLE_NPM_PUBLISH: enabled, PUBLISHER_REVIEWED: enabled },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, 'No variable or environment approval releases the source-controlled hold');
    assert.match(result.stdout, /publication is on hold/);
  }
  assert.match(publisherHold, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(publisherHold, /id-token:|contents: write|environment:|continue-on-error:|if:|uses:|secrets\.|vars\.|\bnpm (?:install|ci|publish)\b/);
  const publish = workflow.slice(workflow.indexOf('  publish-npm:'), workflow.indexOf('  verify-registry:'));
  assert.match(publish, /needs: \[preflight, publisher-safety\]/);
  assert.doesNotMatch(publish, /if:|continue-on-error:|always\(\)/);
  assert.match(docs, /manual bootstrap.*also on hold/s);
});
