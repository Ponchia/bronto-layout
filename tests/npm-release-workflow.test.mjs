import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/npm-release.yml',import.meta.url),'utf8');
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
  assert.match(workflow,/publish-npm:\s*\n\s*needs: preflight/);
  assert.match(workflow,/environment: npm-publish/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/uses: actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(workflow,/npm publish "\.\/\$TARBALL" --ignore-scripts --access public --tag beta/);
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
  assert.equal(pkg.repository.url,'https://github.com/Ponchia/bronto-layout.git');
  assert.match(docs,/npm whoami/);
  assert.match(docs,/npm publish \.\/ponchia-layout-0\.5\.0-beta\.1\.tgz/);
  assert.match(docs,/--access public --tag beta/);
  assert.match(docs,/--provenance=false/);
  assert.match(docs,/\bPonchia\b/);
  assert.match(docs,/\bnpm-release\.yml\b/);
  assert.match(docs,/no longer|No usable npm credential|not authenticated|not been published/);
});
