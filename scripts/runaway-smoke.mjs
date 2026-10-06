// Local fake-provider smoke. No credentials, external requests or paid calls.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root=mkdtempSync(join(tmpdir(),'cc-runaway-'));
let hits=0;
const up=http.createServer((req,res)=>{hits++;res.setHeader('content-type','application/json');res.end(JSON.stringify({model:'gpt-4o-mini',usage:{prompt_tokens:1000000,completion_tokens:0}}));});
await new Promise(r=>up.listen(0,'127.0.0.1',r));
async function scenario(name,flags,count,distinct=true){
 hits=0;const receipts=join(root,name+'.jsonl');
 const childCode=`for(let i=0;i<${count};i++){let r=await fetch(process.env.OPENAI_BASE_URL+'/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:${distinct?'String(i)':"'same retry'"}}]})});console.log(r.status);if(r.status===429)break;}`;
 const child=spawn(process.execPath,[new URL('../src/cli.js',import.meta.url).pathname,'wrap',...flags,'--receipts',receipts,'--kill-file',join(root,'KILL'),'--',process.execPath,'--input-type=module','-e',childCode],{env:{...process.env,COSTCAP_TEST_OPENAI_UPSTREAM:'http://127.0.0.1:'+up.address().port},stdio:['ignore','pipe','pipe']});
 let output='',err='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>err+=x);
 const status=await new Promise(r=>child.on('exit',r));assert.equal(status,0,err);
 const ledger=readFileSync(receipts,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(ledger.at(-1).blocked,true);assert.equal(ledger.filter(x=>!x.blocked).length,hits);
 return {scenario:name,upstreamCalls:hits,blockedReason:ledger.at(-1).reason,statuses:output.trim().split('\n'),receiptCount:ledger.length,reportedCost:ledger.reduce((n,x)=>n+(x.cost_usd??0),0)};
}
try{
 const cap=await scenario('cap',['--cap','0.10'],20);assert.equal(cap.upstreamCalls,1);assert.equal(cap.blockedReason,'budget_exceeded');
 const spiral=await scenario('retry-spiral',[],20,false);assert.equal(spiral.upstreamCalls,5);assert.equal(spiral.blockedReason,'spiral_detected');
 const steps=await scenario('steps',['--max-steps','3'],20);assert.equal(steps.upstreamCalls,3);assert.equal(steps.blockedReason,'step_budget');
 writeFileSync(join(root,'KILL'),'synthetic frozen');const killed=await scenario('kill-file',[],20);assert.equal(killed.upstreamCalls,0);assert.equal(killed.blockedReason,'killed');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),provider:'local fake OpenAI',paidCalls:0,results:[cap,spiral,steps,killed]},null,2));
}finally{up.closeAllConnections();up.close()}
