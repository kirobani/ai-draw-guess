import test from 'node:test';
import assert from 'node:assert/strict';
import {requestDrawing} from '../lib/drawing-response.mjs';
import {applyDrawingEdit,DrawingFormatError,drawPrompt} from '../lib/shapes.mjs';
import {Game} from '../lib/game.mjs';
const stroke=x=>({type:'line',points:[[x,10],[x,100]],color:'#202633',width:5});
const previous=[stroke(10),stroke(20)],word={answer:'雨伞',category:'物品'},player={id:'mimo',name:'MiMo'};

test('改画明确保留原画或只撤回时合法，缺失、空白和超量分别报格式错误',()=>{
 assert.deepEqual(applyDrawingEdit({undo:0,append:[]},previous),previous);
 assert.deepEqual(applyDrawingEdit({undo:1,append:[]},previous),[previous[0]]);
 assert.throws(()=>applyDrawingEdit({hint:'看把手'},previous),/缺少 undo 和 append/);
 assert.throws(()=>applyDrawingEdit({shapes:[]},previous),/空白画面/);
 assert.throws(()=>applyDrawingEdit({undo:2,append:[]},previous),/撤回了全部旧笔画/);
 assert.throws(()=>applyDrawingEdit({undo:0,append:Array(449).fill(stroke(30))},previous),/451.*450/);
 assert.throws(()=>applyDrawingEdit({shapes:[null]}),DrawingFormatError);
 const prompt=drawPrompt(word,previous);
 for(const rule of ['顶层必须同时包含 undo、append、hint、hints','不能只返回提示','"undo":0,"append":[]','至少 1 笔'])assert.ok(prompt.includes(rule));
});

test('只向原画手自动纠正一次格式，成功才应用，不静默猜测缺失字段',async()=>{
 for(const bad of [{hint:'看把手'},{shapes:[]},{undo:2,append:[]},{undo:0,append:[null]}]){
  const calls=[],saved=structuredClone(previous),signal=new AbortController().signal;
  const result=await requestDrawing({player,word,previous,signal,run:async(...args)=>{
   calls.push(args);assert.deepEqual(previous,saved);
   return calls.length===1?{...bad,elapsed:10}:{undo:1,append:[stroke(30)],hint:'看下方的弯钩',elapsed:20};
  }});
  assert.equal(calls.length,2);assert.equal(calls[1][0],player);assert.equal(calls[1][2],null);assert.equal(calls[1][3],signal);
  assert.ok(calls[1][1].includes('上次回复未通过绘图格式检查'));
  assert.deepEqual(result.shapes,[previous[0],stroke(30)]);assert.deepEqual(previous,saved);assert.equal(result.elapsed,30);
  assert.equal(result.data.hint,'看下方的弯钩');
 }
});

test('有效绘图只调用一次，网络错误不反复调用，取消后不补发纠错请求',async()=>{
 let calls=0;
 const good=await requestDrawing({player,word,previous,run:async()=>{calls++;return {undo:0,append:[]};}});
 assert.equal(calls,1);assert.deepEqual(good.shapes,previous);
 calls=0;await assert.rejects(requestDrawing({player,word,previous,run:async()=>{calls++;throw new Error('API 401');}}),/API 401/);assert.equal(calls,1);
 calls=0;const controller=new AbortController();
 await assert.rejects(requestDrawing({player,word,previous,signal:controller.signal,run:async()=>{calls++;controller.abort();return {};}}),{name:'AbortError'});assert.equal(calls,1);
});

test('纠错失败保留上一版、提示和计分；手动重试继续同一轮',async()=>{
 const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');
 let draws=0,fixed=false;
 const g=new Game({players:[player,{id:'b',name:'B'}],human:false,orderRandom:n=>n-1,words:[word,word],revealDelay:0,run:async(p,prompt,img)=>{
  if(img)return {guess:'降落伞'};
  draws++;return draws===1?{shapes:previous}:fixed?{undo:1,append:[stroke(40)],hint:'看弯钩。'}:{hint:'看把手。'};
 }});
 await g.next();await g.beginGuess({image});assert.equal(g.phase,'review');
 const before={shapes:structuredClone(g.shapes),revision:g.revision,image:g.image,results:structuredClone(g.results),players:g.snapshot().players};
 await g.revise();assert.equal(draws,3);assert.equal(g.phase,'draw-error');assert.equal(g.snapshot().drawErrorKind,'format');assert.equal(g.turn,2);assert.match(g.notice,/已自动修正一次.*原画已保留/);
 assert.deepEqual({shapes:g.shapes,revision:g.revision,image:g.image,results:g.results,players:g.snapshot().players},before);
 fixed=true;await g.drawAI();assert.equal(g.phase,'ready');assert.equal(g.turn,2);assert.equal(draws,4);assert.equal(g.revision,before.revision+1);assert.equal(g.snapshot().drawErrorKind,null);
 assert.deepEqual(g.shapes,[previous[0],stroke(40)]);g.finish();
});

test('纠错期间离开本题，迟到的画和提示不覆盖下一题',async()=>{
 let release,calls=0;
 const g=new Game({players:[player,{id:'b',name:'B'}],human:false,orderRandom:n=>n-1,words:[word,word],run:async()=>{
  calls++;if(calls===1)return {shapes:[]};if(calls===2)return new Promise(resolve=>{release=resolve;});return {shapes:[stroke(50)]};
 }});
 const first=g.next();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
 g.reveal();await g.next();release({shapes:[stroke(99)],hint:'旧提示'});await first;
 assert.equal(g.index,1);assert.equal(g.phase,'ready');assert.deepEqual(g.shapes,[stroke(50)]);assert.equal(g.hint,'');g.finish();
});
