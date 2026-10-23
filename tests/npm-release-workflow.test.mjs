import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  assert.match(workflow,/publish-npm:\s*\n\s*needs: preflight/);
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
