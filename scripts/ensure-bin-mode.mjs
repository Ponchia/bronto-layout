#!/usr/bin/env node
/** Git dependency builds may inherit a private umask. Normalize only our CLI's
 * reviewed executable before packaging; consumers must not relax their guards. */
import { chmodSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const executable = fileURLToPath(new URL('../bin/bronto-layout.mjs', import.meta.url));
if (process.platform !== 'win32') {
  const current = statSync(executable);
  chmodSync(executable, (current.mode & ~0o777) | 0o755);
  if ((statSync(executable).mode & 0o777) !== 0o755)
    throw new Error('Could not normalize Bronto Layout CLI executable mode');
}
