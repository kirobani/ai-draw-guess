import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import net from 'node:net';

test('fresh install supports one shared key, per-player overrides, endpoint isolation and clearing', {timeout:60000}, async()=>{
  const data=await mkdtemp(join(tmpdir(),'draw-guess-public-test-'));
  const portServer=net.createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const env={...process.env,PORT:String(port),DRAW_GUESS_DATA_DIR:data,OPENROUTER_API_KEY:''};
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stderr.on('data',b=>log+=b);child.stdout.on('data',()=>{});
  const base=`http://127.0.0.1:${port}`,secret='fixture-shared-not-a-live-key';
  const api=async(path,value)=>{const res=await fetch(base+path,value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','x-game-request':'1'},body:JSON.stringify(value)});const text=await res.text();assert(!text.includes(secret));assert.equal(res.status,200,text);return JSON.parse(text);};
  try{
    let ready=false;for(let i=0;i<150;i++){try{await api('/api/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert(ready,log);
    const initial=await api('/api/config');assert.equal(initial.players.length,11);assert(initial.players.every(p=>p.provider==='openrouter'&&!p.hasKey));
    const saved=await api('/api/openrouter-key',{apiKey:secret});assert(saved.hasKey);assert(saved.players.every(p=>p.hasKey));
    const persisted=JSON.parse(await readFile(join(data,'credentials.json'),'utf8'));assert.equal(persisted.openrouterApiKey,secret);
    const players=initial.players.map(p=>({...p,enabled:false}));players[0]={...players[0],provider:'compatible',baseUrl:'https://example.test/v1'};
    players[1]={...players[1],apiKey:'individual-test-key'};
    const update=await api('/api/config',{players});assert.equal(update.players[0].hasKey,false);assert.equal(update.players[1].hasKey,true);assert(update.players.slice(2).every(p=>p.hasKey));
    const cleared=await api('/api/openrouter-key',{clear:true});assert(!cleared.hasKey);assert(cleared.players[1].hasKey);assert(cleared.players.filter((_,i)=>i!==1).every(p=>!p.hasKey));
    for(const path of ['/.env','/.local/config.json','/server.mjs'])assert.equal((await fetch(base+path)).status,404);
    const blocked=await fetch(base+'/api/openrouter-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:secret})});assert.equal(blocked.status,403);
  }finally{child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);await rm(data,{recursive:true,force:true});}
});
