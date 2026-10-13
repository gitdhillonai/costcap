import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFleetClient } from '../src/hosted/client.js';
const listen = server => new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));
test('offline frozen cache refuses upstream calls across wrapper restarts',async t=>{
 let hits=0;
 const up=http.createServer((req,res)=>{hits++;res.end(JSON.stringify({model:'gpt-4o-mini',usage:{prompt_tokens:1,completion_tokens:1}}));});
 const port=await listen(up);t.after(()=>{up.closeAllConnections();up.close();});
 // A deliberately closed loopback port models an unreachable control plane.
 const stopped=http.createServer();const fleetPort=await listen(stopped);await new Promise(r=>stopped.close(r));
 const dir=mkdtempSync(join(tmpdir(),'cc-offline-proof-'));
 const cache=join(dir,'enrollment.json');
 writeFileSync(cache,JSON.stringify({url:`http://127.0.0.1:${fleetPort}`,token:'fixture-token',agentId:'fixture-agent',policy:{version:3,caps:{run:1},killed:true},syncedIds:[]}),{mode:0o600});
 for(let restart=0;restart<2;restart++){
  const receipts=join(dir,`receipts-${restart}.jsonl`);
  const script=`const r=await fetch(process.env.OPENAI_BASE_URL+'/chat/completions',{method:'POST',body:JSON.stringify({model:'gpt-4o-mini'})});console.log(r.status);`;
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['src/cli.js','wrap','--enrollment',cache,'--receipts',receipts,'--kill-file',join(dir,'KILL'),'--',process.execPath,'--input-type=module','-e',script],{env:{...process.env,COSTCAP_TEST_OPENAI_UPSTREAM:`http://127.0.0.1:${port}`}});
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));
  });
  assert.equal(result.out.replace(/\x1b\[[0-9;]*m/g, "").trim(),'429',result.err);
  assert.equal(hits,0);
  const rows=readFileSync(receipts,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].reason,'killed');assert.equal(rows[0].blocked,true);
 }
});
test('offline unfrozen cache keeps caps and does not invent a remote freeze',async()=>{
 const server=http.createServer();const port=await listen(server);await new Promise(r=>server.close(r));
 const dir=mkdtempSync(join(tmpdir(),'cc-offline-open-'));const path=join(dir,'enrollment.json');
 writeFileSync(path,JSON.stringify({url:`http://127.0.0.1:${port}`,token:'fixture',agentId:'fixture',policy:{version:1,caps:{run:0.1},killed:false},syncedIds:[]}));
 const client=createFleetClient({path,receiptsPath:join(dir,'receipts.jsonl')});
 assert.equal((await client.sync()).online,false);assert.equal(client.policy().killed,false);assert.equal(client.policy().caps.run,0.1);
});
