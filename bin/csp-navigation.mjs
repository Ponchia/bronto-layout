/** A browser fact from the navigated top-level document, not a CSS diagnosis. */
export function scriptDisablingCspSandbox(response) {
  if (!response || typeof response !== 'object') return false;
  const headers = response.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return false;
  // Report-Only headers describe a would-be restriction, not an enforced one.
  // Multiple independent CSP policies can be folded into one CDP header value.
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'content-security-policy' || typeof value !== 'string') continue;
    for (const policy of value.split(/[\r\n,]/)) {
      for (const part of policy.split(';')) {
        const words = part.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (words[0] === 'sandbox' && !words.includes('allow-scripts')) return true;
      }
    }
  }
  return false;
}

/** An explicit fail-closed outcome. Never weaken a page's CSP to run checks. */
export function rejectUninspectableCspSandbox(response) {
  if (!scriptDisablingCspSandbox(response)) return;
  const error = new Error(
    'The top-level document sends Content-Security-Policy sandbox without allow-scripts. ' +
    'Bronto Layout cannot execute its in-page geometry probe; this page is unverified, ' +
    'not a passed layout check. Browser and document sandbox policies were not changed.'
  );
  error.code = 'CSP_SANDBOX_UNINSPECTABLE';
  throw error;
}
