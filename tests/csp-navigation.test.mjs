import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptDisablingCspSandbox, rejectUninspectableCspSandbox } from '../bin/csp-navigation.mjs';

const asResponse = headers => ({ status: 200, headers });
test('HTTP CSP sandbox with no allow-scripts is an explicit uninspectable document', () => {
  const response = asResponse({ 'Content-Security-Policy': "default-src 'none'; SANDBOX allow-forms" });
  assert.equal(scriptDisablingCspSandbox(response), true);
  assert.throws(() => rejectUninspectableCspSandbox(response), error => {
    assert.equal(error.code, 'CSP_SANDBOX_UNINSPECTABLE');
    assert.match(error.message, /unverified/);
    assert.doesNotMatch(error.message, /disable.*sandbox/i);
    return true;
  });
});
test('script-enabled or non-sandboxing policies remain inspectable', () => {
  for (const headers of [
    { 'content-security-policy': "default-src 'none'; img-src 'self'" },
    { 'Content-Security-Policy': "sandbox allow-scripts allow-forms; default-src 'none'" },
    { 'Content-Security-Policy-Report-Only': "sandbox; default-src 'none'" },
    { 'x-sandbox': 'sandbox' },
    { 'content-security-policy': 'default-src sandbox allow-scripts' },
  ]) {
    assert.equal(scriptDisablingCspSandbox(asResponse(headers)), false, JSON.stringify(headers));
    assert.doesNotThrow(() => rejectUninspectableCspSandbox(asResponse(headers)));
  }
});
test('multiple enforced policies fail closed when ANY policy disables scripts', () => {
  const response = asResponse({ 'CONTENT-SECURITY-POLICY': "sandbox allow-scripts, default-src 'none'; sandbox allow-forms" });
  assert.equal(scriptDisablingCspSandbox(response), true);
});
test('malformed or absent evidence never invents confirmed restrictions', () => {
  for (const response of [null, undefined, 'sandboxes', {}, {headers:null}, {headers:[]}, asResponse({'content-security-policy':1})]) {
    assert.equal(scriptDisablingCspSandbox(response), false);
  }
});
