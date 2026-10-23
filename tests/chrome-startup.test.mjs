import test from 'node:test';
import assert from 'node:assert/strict';
import { retryChromiumPortStartup, chromiumTempBase } from '../bin/chromium-session.mjs';
const notReady = () => Object.assign(new Error('Chrome debugging endpoint did not start within 15000ms'),
 { code: 'CHROME_DEBUG_PORT_TIMEOUT' });

test('a single timed-out Chrome port is retried once with a new launch attempt', async () => {
 const calls = [];
 const result = await retryChromiumPortStartup(async attempt => {
   calls.push(attempt);
   if (attempt === 1) throw notReady();
   return { ready: true };
 });
 assert.deepEqual(result, {ready: true});
 assert.deepEqual(calls, [1, 2]);
});

test('two timed-out launches stop after exactly two attempts with an explicit error', async () => {
 const calls = [];
 await assert.rejects(() => retryChromiumPortStartup(async attempt => {
   calls.push(attempt);
   throw notReady();
 }), error => {
   assert.equal(error.code, 'CHROME_DEBUG_PORT_TIMEOUT');
   assert.match(error.message, /after 2 isolated attempts/);
   assert.match(error.message, /debugging endpoint did not start/);
   return true;
 });
 assert.deepEqual(calls, [1,2]);
});

test('navigation, invalid binary and other non-startup errors never trigger another browser', async () => {
 for (const message of ['Chrome executable does not exist', 'Page.navigate failed',
    'Chromium page target was not found', 'A layout contract failed']) {
   let launches = 0;
   await assert.rejects(() => retryChromiumPortStartup(async () => {
     launches++; throw new Error(message);
   }), new RegExp(message));
   assert.equal(launches,1);
 }
});

test('caller can select just one attempt, and invalid retry limits reject early', async () => {
 let calls = 0;
 await assert.rejects(() => retryChromiumPortStartup(async () => {calls++;throw notReady();},1),
   /did not start within/);
 assert.equal(calls,1);
 for (const attempts of [0,3,-1,1.5,NaN]) {
   await assert.rejects(() => retryChromiumPortStartup(() => null, attempts),/1\.\.2/);
 }
 await assert.rejects(() => retryChromiumPortStartup(null),/launch function/);
});

test('Chromium uses a short Unix socket directory for deep or multibyte TMPDIR paths',()=>{
 assert.equal(chromiumTempBase('/tmp','linux'),'/tmp');
 assert.equal(chromiumTempBase('/tmp/short','darwin'),'/tmp/short');
 const deep='/tmp/session-'+ 'nested-'.repeat(20);
 assert.equal(chromiumTempBase(deep,'linux'),'/tmp');
 assert.equal(chromiumTempBase(deep,'darwin'),'/tmp');
 assert.equal(chromiumTempBase('/tmp/'+ '界'.repeat(20),'linux'),'/tmp');
 assert.equal(chromiumTempBase(deep,'win32'),deep);
});
