/**
 * Discover an existing Chromium page target or explicitly create one using
 * the local DevTools HTTP endpoint when Chrome starts with an empty tab list.
 * No requests are made outside loopback.
 */
const validPage = (page, port) => {
  if (page?.type !== 'page' || typeof page.webSocketDebuggerUrl !== 'string') return false;
  try {
    const address = new URL(page.webSocketDebuggerUrl);
    return (address.protocol === 'ws:' || address.protocol === 'wss:') &&
      (address.hostname === '127.0.0.1' || address.hostname === 'localhost') &&
      Number(address.port) === port &&
      address.pathname.startsWith('/devtools/page/');
  } catch { return false; }
};

export async function findChromiumPageTarget(port, {
  timeoutMs = 15000,
  fetchImpl = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  isAlive = () => true
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid local Chromium debugging port');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    throw new Error('Invalid Chromium page-target timeout');
  }
  const origin = 'http://127.0.0.1:' + port;
  const deadline = now() + timeoutMs;
  const createAfter = now() + Math.min(1200, Math.floor(timeoutMs / 3));
  let createAttempted = false;
  let lastError = '';
  while (now() < deadline) {
    if (!isAlive()) throw new Error('Chrome exited before a debuggable page target became available');
    try {
      const response = await fetchImpl(origin + '/json/list', {
        signal: AbortSignal.timeout(1200)
      });
      if (!response.ok) throw new Error('/json/list HTTP ' + response.status);
      const pages = await response.json();
      if (!Array.isArray(pages)) throw new Error('/json/list returned non-array data');
      const available = pages.find(page => validPage(page, port));
      if (available) return { page: available, created: false };
    } catch (error) {
      lastError = String(error?.message || error).slice(0, 180);
    }
    if (!createAttempted && now() >= createAfter) {
      createAttempted = true;
      try {
        // Chrome requires PUT for the /json/new endpoint.
        const response = await fetchImpl(origin + '/json/new?about:blank', {
          method: 'PUT', signal: AbortSignal.timeout(2500)
        });
        if (!response.ok) throw new Error('/json/new HTTP ' + response.status);
        const page = await response.json();
        if (validPage(page, port)) return { page, created: true };
      } catch (error) {
        lastError = String(error?.message || error).slice(0, 180);
      }
    }
    await pause(75);
  }
  throw new Error('Chrome launched but page target was not found within ' +
    timeoutMs + 'ms' + (lastError ? ': ' + lastError : ''));
}
