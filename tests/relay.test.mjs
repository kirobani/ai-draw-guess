import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayGame,relayRoutes} from '../lib/relay.mjs';
import {renderRelayDrawing} from '../lib/relay-renderer.mjs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {callModel} from '../lib/providers.mjs';
import {characterState} from '../public/avatar-state.mjs';
import {seatPresentation} from '../public/seat-presentation.mjs';
import {relayActionMarkup} from '../public/relay-view.mjs';

const words=Array.from({length:13},(_,i)=>({answer:`秘密题目${i}号`,category:'物品'}));
const players=Array.from({length:12},(_,i)=>({id:`ai${i}`,name:`选手${i}`,provider:'compatible',model:'test',apiKey:'SECRET-KEY'}));
const shapes=[{type:'line',points:[[10,10],[100,100]],width:5,color:'#ff0000'}];
const draw=async s=>'private-png-'+JSON.stringify(s);
const tick=()=>new Promise(r=>setImmediate(r));
const create=overrides=>new RelayGame({players:players.slice(0,2),human:true,words,run:async(p,prompt,image)=>image?{guess:p.id+'猜出的词',reason:'图像线索'}:{shapes},renderDrawing:draw,passDelay:60000,...overrides});

test('题库规则传入每轮猜词：成语三档都要求四字成语，其他分类不限制四字；不泄漏原题或历史词语',async()=>{
 for(const [category,idiomLevel] of [['成语','easy'],['成语','normal'],['成语','challenge'],['动物','easy'],['故事','easy']]){
  const seen=[],g=create({human:false,players:players.slice(0,5),category,idiomLevel,run:async(p,prompt,image)=>{
   if(image)seen.push({stage:g.index,prompt,image});
   return image?{guess:'上一轮私人猜词',reason:'私人观察'}:{shapes};
  }});
  try{
   await g.next();for(let i=0;i<4;i++){g.advance();await g.workTask;}
   assert.deepEqual(seen.map(c=>c.stage),[1,1,1,1,1,3,3,3,3,3]);
   for(const c of seen){
    assert(c.prompt.includes(category));assert(c.image.startsWith('private-png-'));
    for(const secret of ['秘密题目','上一轮私人猜词','私人观察'])assert(!c.prompt.includes(secret));
    assert(!c.prompt.includes('不要假设它必须是成语'));
    if(category==='成语'){assert(c.prompt.includes('每一棒猜词都必须回答一个真实的四字成语'));assert(c.prompt.includes('"guess":"一个四字成语'));}
    else{assert(c.prompt.includes('不限定字数'));assert(!c.prompt.includes('四字成语'));}
   }
  }finally{g.finish();}
 }
 const g={category:'成语',phase:'relay-work',results:{},relay:{myTask:{kind:'guess',status:'waiting'}}};
 const html=relayActionMarkup(g);assert(html.includes('本局题库：成语'));assert(html.includes('四字成语'));assert(!html.includes('不显示原题、字数'));
 g.category='动物';assert(relayActionMarkup(g).includes('本局题库：动物'));assert(!relayActionMarkup(g).includes('四字成语'));
});

test('2–13 人随机队列：每链每人一次，每棒每人一条，每人所有位置恰好一次',()=>{
 for(let n=2;n<=13;n++)for(let iteration=0;iteration<25;iteration++){
  const ids=Array.from({length:n},(_,i)=>'p'+i),routes=relayRoutes(ids);
  for(const route of routes)assert.deepEqual([...route].sort(),ids.slice().sort());
  for(let stage=0;stage<n;stage++)assert.deepEqual(routes.map(r=>r[stage]).sort(),ids.slice().sort());
  for(const id of ids)assert.deepEqual(routes.map(r=>r.indexOf(id)).sort((a,b)=>a-b),ids.map((_,i)=>i));
 }
 const ids=['a','b','c','d'];assert(new Set(Array.from({length:25},()=>JSON.stringify(relayRoutes(ids)))).size>1);
});
test('完整三人接龙：同棒同步，只传上一棒，奇数以画结束；结束前隐藏其他链与原题',async()=>{
 const calls=[],g=create({run:async(p,prompt,image)=>{calls.push({id:p.id,prompt,image});return image?{guess:p.id+'新词',reason:'私人理由'}:{shapes};}});
 await g.next();assert.equal(g.phase,'relay-work');assert.equal(g.snapshot().relay.done,2);
 const first=g.snapshot(),own=g.tasks.get('human'),ownChain=g.chains.find(c=>c.id===own.chainId);
 assert.equal(first.relay.myTask.input.text,ownChain.answer);assert.deepEqual(first.chains,[]);
 for(const c of g.chains)if(c!==ownChain)assert(!JSON.stringify(first).includes(c.answer));
 assert(!JSON.stringify(first).includes('SECRET-KEY'));
 await g.submitHuman({stage:0,chainId:own.chainId,shapes});assert.equal(g.phase,'relay-pass');
 g.advance();await g.workTask;assert.equal(g.kind,'guess');
 const guessSnapshot=g.snapshot();assert.deepEqual(Object.keys(guessSnapshot.relay.myTask.input),['shapes']);
 for(const c of g.chains)assert(!JSON.stringify(guessSnapshot).includes(c.answer));
 assert(!JSON.stringify(guessSnapshot).includes('新词'));assert(!JSON.stringify(guessSnapshot).includes('私人理由'));
 for(const call of calls.filter(c=>c.image)){assert(!call.prompt.includes('秘密题目'));assert(!call.prompt.includes('shapes'));assert(call.image.startsWith('private-png-'));}
 const guessTask=g.tasks.get('human');await g.submitHuman({stage:1,chainId:guessTask.chainId,guess:'错误的新词'});
 g.advance();await g.workTask;
 const downstream=g.chains.find(c=>c.id===guessTask.chainId).route[2];assert(calls.findLast(c=>c.id===downstream&&!c.image).prompt.includes('错误的新词'));
 await g.submitHuman({stage:2,chainId:g.tasks.get('human').chainId,shapes});g.advance();
 const final=g.snapshot();assert.equal(final.phase,'finished');assert.equal(final.relay.completed,true);
 assert(final.chains.every(c=>c.steps.length===3&&c.steps.at(-1).kind==='draw'));assert.equal(final.chains.flatMap(c=>c.steps).length,9);
 assert(!JSON.stringify(final).includes('SECRET-KEY'));assert(!JSON.stringify(final).includes('private-png-'));
});
test('真正并发启动 AI；慢的一位未完成前不会推进；重复与旧棒请求不能混入下一棒',async()=>{
 const resolvers=[];let calls=0;
 const g=create({run:()=>{calls++;return new Promise(r=>resolvers.push(r));}});
 const pending=g.next();assert.equal(calls,2);
 const task=g.tasks.get('human');await g.submitHuman({stage:0,chainId:task.chainId,shapes});
 await assert.rejects(g.submitHuman({stage:0,chainId:task.chainId,shapes}),/已经交卷/);
 resolvers[0]({shapes});await tick();assert.equal(g.phase,'relay-work');
 resolvers[1]({shapes});await pending;assert.equal(g.phase,'relay-pass');g.advance();
 await assert.rejects(g.submitHuman({stage:0,chainId:task.chainId,guess:'迟到答案'}),/已经变更/);
 await assert.rejects(g.submitHuman({stage:1,chainId:'other-chain',guess:'错链答案'}));g.finish();
 for(const r of resolvers.slice(2))r({guess:'晚到'});await g.workTask;assert.equal(g.phase,'finished');
});
test('调用失败可以单独重试，已交卷者不会被重复调用；留空明确中断该链',async()=>{
 const attempts={};const g=create({human:false,players:players.slice(0,3),run:async p=>{attempts[p.id]=(attempts[p.id]||0)+1;if(p.id==='ai0'&&attempts[p.id]===1)throw new Error('offline');return {shapes};}});
 await g.next();assert.equal(g.phase,'relay-work');assert.equal(g.tasks.get('ai0').status,'error');
 await g.retry({stage:0});assert.equal(g.phase,'relay-pass');assert.deepEqual(attempts,{ai0:2,ai1:1,ai2:1});g.finish();
 const skipped=create({human:false,run:async(p,_prompt,image)=>{if(p.id==='ai0'&&!image)throw new Error('offline');return image?{guess:'新词'}:{shapes};}});
 await skipped.next();const broken=skipped.tasks.get('ai0').chainId;skipped.skipErrors({stage:0});skipped.advance();await skipped.workTask;assert.equal(skipped.phase,'relay-pass');skipped.advance();
 assert.equal(skipped.phase,'finished');assert(skipped.chains.find(c=>c.id===broken).steps.every(s=>s.skipped));assert.equal(skipped.chains.find(c=>c.id!==broken).steps.at(-1).kind,'guess');
});
test('结束后迟到的绘图或转换结果不会写入已展开的接龙，也不会自动开下一棒',async()=>{
 const pending=[];const g=create({human:false,run:()=>new Promise(r=>pending.push(r))});const work=g.next();g.finish();const before=JSON.stringify(g.snapshot());
 pending.forEach(r=>r({shapes}));await work;g.advance();assert.equal(JSON.stringify(g.snapshot()),before);
});
test('2–13 人完整赛程都恰好完成 N² 棒，含全 AI 观战且不需要浏览器代画',async()=>{
 for(let n=2;n<=13;n++){
  const bots=Array.from({length:n},(_,i)=>({...players[i%players.length],id:'p'+i}));
  let calls=0;const g=create({players:bots,human:false,run:async(_p,_prompt,image)=>{calls++;return image?{guess:'接力词'}:{shapes};}});
  await g.next();for(let stage=0;stage<n;stage++){await g.workTask;assert.equal(g.phase,'relay-pass');assert.equal(g.index,stage);assert.equal(g.snapshot().relay.myTask,null);if(stage<n-1)assert.deepEqual(g.snapshot().chains,[]);g.advance();}
  assert.equal(g.phase,'finished');assert.equal(calls,n*n);assert.equal(g.chains.flatMap(c=>c.steps).length,n*n);
  for(const p of bots){const entries=g.chains.flatMap(c=>c.steps).filter(s=>s.playerId===p.id);assert.equal(entries.length,n);assert.equal(entries.filter(s=>s.kind==='draw').length,Math.ceil(n/2));}
 }
});
test('无效 JSON 的诊断不能把模型的私人词语泄漏到其他人的错误提示里',async()=>{
 const g=create({human:false,run:async()=>{throw new SyntaxError('Unexpected token 私人秘密词语 in JSON');}});await g.next();assert(!JSON.stringify(g.snapshot()).includes('私人秘密词语'));assert.equal(g.tasks.get('ai0').error,'模型回复格式无效，请重试。');g.finish();
});
test('服务端渲染真实 PNG，尺寸和画布一致，不把矢量指令当图片发送',async()=>{
 const image=renderRelayDrawing([{type:'rect',x:100,y:100,w:200,h:200,color:'none',fill:'#ff0000'}]);
 const loaded=await loadImage(image);assert.equal(loaded.width,1000);assert.equal(loaded.height,650);
 const canvas=createCanvas(1000,650),ctx=canvas.getContext('2d');ctx.drawImage(loaded,0,0);
 assert.deepEqual([...ctx.getImageData(150,150,1,1).data],[255,0,0,255]);assert.deepEqual([...ctx.getImageData(0,0,1,1).data],[255,255,255,255]);
});
test('接龙所有角色随棒次同步画图或思考；提交气泡和界面不宣称猜中',()=>{
 const g={mode:'relay',phase:'relay-work',index:1,total:3,relay:{kind:'guess',myTask:{kind:'guess',status:'waiting',input:{shapes}}},results:{ai0:{status:'working'},ai1:{status:'submitted',confidence:90}}};
 assert.equal(characterState(g,players[0]),'thinking');assert.equal(characterState(g,players[1]),'confident');assert.equal(seatPresentation(g,players[0]).role,'本棒猜手');
 g.relay.kind='draw';assert.equal(characterState(g,players[0]),'drawing');assert.equal(seatPresentation(g,players[0]).role,'本棒画手');
 g.relay.myTask={kind:'guess',status:'submitted',submitted:{text:'<script>词</script>'}};const html=relayActionMarkup(g);assert(html.includes('&lt;script&gt;'));assert(!html.includes('猜中'));assert(!html.includes('<script>'));
});
test('普通比赛和接龙均支持全桌并发；第十三路排队取消不占用名额',async t=>{
 let started=0;const gates=[];
 t.mock.method(globalThis,'fetch',()=>{started++;return new Promise(resolve=>gates.push(()=>resolve(new Response(JSON.stringify({model:'test',choices:[{message:{content:'{"ok":true}'}}]})))));});
 const p={provider:'compatible',baseUrl:'https://example.com/v1',model:'test'};
 const parallel=Array.from({length:3},()=>callModel(p,'test',null,null,null,{parallel:true}));await tick();assert.equal(started,3);gates.splice(0).forEach(r=>r());await Promise.all(parallel);
 started=0;const controller=new AbortController();const normal=Array.from({length:12},()=>callModel(p,'test')),progress=[];const cancelled=callModel(p,'test',null,controller.signal,null,{onProgress:s=>progress.push(s)});await tick();assert.equal(started,12);assert.deepEqual(progress,['queued']);controller.abort();await assert.rejects(cancelled,/已取消/);gates.splice(0).forEach(r=>r());await Promise.all(normal);
 const after=callModel(p,'test');await tick();assert.equal(started,13);gates.splice(0).forEach(r=>r());await after;
});
