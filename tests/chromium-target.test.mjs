import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { findChromiumPageTarget } from '../bin/chromium-target.mjs';

const page = {
  type:'page',
  webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/page/abc',
  url:'about:blank'
};
const json = (data,status=200) => new Response(JSON.stringify(data), {
  status,
  headers:{'Content-Type':'application/json'}
});
const fakeClock = () => {
  let time=0;
  return {
    now:()=>time,
    pause:async ms=>{time+=ms;},
    elapsed:()=>time
  };
};

test('existing page target is reused without opening any extra browser tab',async()=>{
  const clock=fakeClock();
  const calls=[];
  const found=await findChromiumPageTarget(9222,{
    timeoutMs:900,
    now:clock.now,pause:clock.pause,
    fetchImpl:async(url,options)=>{
      calls.push({url,method:options?.method||'GET'});
      return json([page]);
    }
  });
  assert.equal(found.created,false);
  assert.deepEqual(found.page,page);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^http:\/\/127\.0\.0\.1:9222\/json\/list$/);
});

test('an empty CDP page list recovers using a single local PUT new-tab request',async()=>{
  const clock=fakeClock();
  const calls=[];
  const found=await findChromiumPageTarget(9222,{
    timeoutMs:1200,
    now:clock.now,pause:clock.pause,
    fetchImpl:async(url,options)=>{
      calls.push({url,method:options?.method||'GET'});
      return url.includes('/json/new') ? json(page) : json([]);
    }
  });
  assert.equal(found.created,true);
  assert.deepEqual(found.page,page);
  const created=calls.filter(call=>call.method==='PUT');
  assert.equal(created.length,1);
  assert.match(created[0].url,/^http:\/\/127\.0\.0\.1:9222\/json\/new\?about:blank$/);
});

test('no page and a blocked PUT endpoint produce a bounded explicit failure',async()=>{
  const clock=fakeClock();
  const attempts=[];
  await assert.rejects(()=>findChromiumPageTarget(9222,{
    timeoutMs:950,
    now:clock.now,pause:clock.pause,
    fetchImpl:async(url,options)=>{
      attempts.push(options?.method||'GET');
      return url.includes('/json/new') ? json({error:'forbidden'},403) : json([]);
    }
  }),/page target was not found.*HTTP 403/);
  assert.equal(attempts.filter(x=>x==='PUT').length,1);
  assert.ok(clock.elapsed()>=950);
});

test('browser process exits early instead of hanging until page discovery timeout',async()=>{
  let alive=true;
  const clock=fakeClock();
  await assert.rejects(()=>findChromiumPageTarget(9222,{
    timeoutMs:10000,
    now:clock.now,
    pause:async ms=>{await clock.pause(ms);alive=false;},
    isAlive:()=>alive,
    fetchImpl:async()=>json([])
  }),/Chrome exited before/);
  assert.ok(clock.elapsed()<300);
});

test('invalid local debugging ports are rejected before fetch',async()=>{
  for(const port of [-1,0,65536,NaN,'https://example.com']){
    await assert.rejects(()=>findChromiumPageTarget(port,{timeoutMs:1000}),/Invalid local Chromium/);
  }
});

test('actual loopback HTTP DevTools-style endpoint returns a usable target',async t=>{
  let created=false;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/json/list') res.end(JSON.stringify(created?[page]:[]));
    else if(req.url==='/json/new?about:blank' && req.method==='PUT'){
      created=true;res.end(JSON.stringify(page));
    }else{res.statusCode=404;res.end('{}');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const port=server.address().port;
  const localPage = { ...page,
    webSocketDebuggerUrl: 'ws://127.0.0.1:' + port + '/devtools/page/abc' };
  // Swap the fixed 9222 mock page for one tied to this server's real port.
  const found=await findChromiumPageTarget(port,{
    timeoutMs:2500,
    fetchImpl:async (url,options) => {
      const response=await fetch(url,options);
      if (!response.ok) return response;
      const body=await response.json();
      const data=Array.isArray(body)?body.map(() => localPage):localPage;
      return json(data);
    }
  });
  assert.equal(found.created,true);
  assert.equal(found.page.webSocketDebuggerUrl,localPage.webSocketDebuggerUrl);
});

test('debugging URL must match the discovered local port and page target path',async()=>{
  for(const candidate of [
    { ...page, webSocketDebuggerUrl:'ws://example.com:9222/devtools/page/abc' },
    { ...page, webSocketDebuggerUrl:'ws://127.0.0.1:9444/devtools/page/abc' },
    { ...page, webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/browser/abc' }
  ]){
    const c=fakeClock();
    await assert.rejects(()=>findChromiumPageTarget(9222,{
      timeoutMs:700,now:c.now,pause:c.pause,
      fetchImpl:async url=>json(url.includes('/json/new')?candidate:[candidate])
    }),/page target was not found/);
  }
});
