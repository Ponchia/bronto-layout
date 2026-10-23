import test from 'node:test';
import assert from 'node:assert/strict';
import { CDP } from '../bin/cdp-client.mjs';

function transport(t,timeout=1000) {
  const original=globalThis.WebSocket;
  class Socket {
    sent=[];
    closed=false;
    send(message) {this.sent.push(JSON.parse(message));}
    close() {this.closed=true;this.onclose?.();}
    receive(data) {this.onmessage({data:JSON.stringify(data)});}
  }
  globalThis.WebSocket=Socket;
  t.mock.timers.enable({apis:['setTimeout']});
  const cdp=new CDP('ws://local-fixture',timeout);
  t.after(()=>{cdp.close();globalThis.WebSocket=original;});
  return cdp;
}

test('a WebSocket that never opens is bounded by the configured CDP timeout',async t=>{
  const cdp=transport(t);
  const rejected=assert.rejects(cdp.send('Page.enable'),/connection timed out after 1000ms/);
  t.mock.timers.tick(1000);
  await rejected;
  assert.equal(cdp.socket.closed,true);
  await assert.rejects(cdp.send('Runtime.enable'),/connection timed out/);
});

test('closing before the WebSocket opens rejects readiness and event waits immediately',async t=>{
  const cdp=transport(t);
  const ready=assert.rejects(cdp.send('Page.enable'),/connection closed/);
  const event=assert.rejects(cdp.event('Page.domContentEventFired').promise,/connection closed/);
  cdp.socket.close();
  await Promise.all([ready,event]);
  assert.equal(cdp.waiters.size,0);
  await assert.rejects(cdp.event('Page.loadEventFired').promise,/connection closed/);
});

test('a disconnect rejects in-flight commands and events instead of waiting for their timers',async t=>{
  const cdp=transport(t);
  cdp.socket.onopen();
  const request=assert.rejects(cdp.send('Page.navigate'),/connection closed/);
  const event=assert.rejects(cdp.event('Page.domContentEventFired').promise,/connection closed/);
  await Promise.resolve();
  assert.equal(cdp.pending.size,1);
  cdp.socket.close();
  await Promise.all([request,event]);
  assert.equal(cdp.pending.size,0);
  assert.equal(cdp.listeners.size,0);
});

test('request replies, protocol errors, event delivery and cancellation clean up their own state',async t=>{
  const cdp=transport(t);
  cdp.socket.onopen();
  const request=cdp.send('Page.enable');
  await Promise.resolve();
  const [{id}]=cdp.socket.sent;
  cdp.socket.receive({id,result:{enabled:true}});
  assert.deepEqual(await request,{enabled:true});
  const failed=assert.rejects(cdp.send('Unknown.method'),/Unknown.method: unsupported/);
  await Promise.resolve();
  cdp.socket.receive({id:cdp.socket.sent.at(-1).id,error:{message:'unsupported'}});
  await failed;
  const event=cdp.event('Page.loadEventFired');
  cdp.socket.receive({method:'Page.loadEventFired',params:{timestamp:123}});
  assert.deepEqual(await event.promise,{timestamp:123});
  const cancelled=cdp.event('Page.loadEventFired');
  cancelled.cancel();
  assert.equal(cdp.pending.size,0);
  assert.equal(cdp.waiters.size,0);
  assert.equal(cdp.listeners.size,0);
});

test('send failures and timeouts release pending requests',async t=>{
  const cdp=transport(t);
  cdp.socket.onopen();
  const expired=assert.rejects(cdp.send('Page.navigate'),/Timed out running Page.navigate/);
  await Promise.resolve();
  t.mock.timers.tick(1000);
  await expired;
  assert.equal(cdp.pending.size,0);
  cdp.socket.send=()=>{throw new Error('fixture send failed');};
  await assert.rejects(cdp.send('Page.enable'),/fixture send failed/);
  assert.equal(cdp.pending.size,0);
  const event=cdp.event('Page.loadEventFired');
  const expiredEvent=assert.rejects(event.promise,/Timed out waiting for Page.loadEventFired/);
  t.mock.timers.tick(1000);
  await expiredEvent;
  assert.equal(cdp.waiters.size,0);
});

test('WebSocket errors close the connection and reject commands',async t=>{
  const cdp=transport(t);
  const rejected=assert.rejects(cdp.send('Page.enable'),/WebSocket connection failed/);
  cdp.socket.onerror();
  await rejected;
  assert.equal(cdp.socket.closed,true);
});
