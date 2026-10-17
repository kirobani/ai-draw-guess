import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {RelayGame} from '../lib/relay.mjs';
import {characterState,CELEBRATION_MS} from '../public/avatar-state.mjs';
import {normalizeConfidence,submittedExpression,submittedLabel} from '../public/guess-confidence.mjs';

const players=['high','mid','low'].map(id=>({id,name:id,characterId:'deepseek'}));
const shapes=[{type:'line',points:[[100,100],[200,200]],width:4,color:'#202633'}];
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const words=Array.from({length:5},()=>({answer:'西瓜',category:'食物'}));

test('模型把握分三档；缺失或无效字段用稳定表情，不伪造主观把握标签',()=>{
 for(const [n,state] of [[0,'random'],[39,'random'],[40,'uncertain'],[74,'uncertain'],[75,'confident'],[100,'confident']])assert.equal(submittedExpression(n),state);
 for(const value of [null,undefined,'90',NaN,Infinity,-1,101,{}]){
  assert.equal(normalizeConfidence(value),null);assert.equal(submittedLabel(value),'已提交 · 等待揭晓');
  assert.equal(submittedExpression(value,'game:1:ai'),submittedExpression(value,'game:1:ai'));
 }
 assert.equal(normalizeConfidence(82.3),82);
 assert.equal(new Set(Array.from({length:12},(_,i)=>submittedExpression(null,'game:'+i))).size,3);
});

test('同一猜词回复携带把握，无额外调用；提交只透露表情，揭晓才公布答案和判分',async()=>{
 let calls=0;const g=new Game({orderRandom:n=>n-1,players,human:true,words,revealDelay:60000,run:async(p,prompt)=>{
  calls++;assert.match(prompt,/confidence/);return {guess:p.id==='low'?'西瓜':'香蕉',reason:'依据画面形状',confidence:{high:91,mid:56,low:12}[p.id]};
 }});
 await g.next();await g.beginGuess({image,shapes});assert.equal(calls,3);
 const s=g.snapshot();assert.equal(s.phase,'locked');
 for(const [i,p] of players.entries()){
  assert.equal(characterState(s,p),['confident','uncertain','random'][i]);
  assert.deepEqual(s.results[p.id].history,[]);assert.equal(s.results[p.id].solved,false);
  assert.equal(s.results[p.id].judgedAt,null);
 }
 assert(!JSON.stringify(s.results).includes('香蕉'));assert(!JSON.stringify(s.results).includes('依据画面形状'));
 g.publishGuesses();const judged=g.snapshot(),at=judged.results.low.judgedAt;
 assert.equal(characterState(judged,players[0]),'sad');
 assert.equal(characterState(judged,players[2],false,at),'happy');
 assert.equal(characterState(judged,players[2],false,at+CELEBRATION_MS),'spectator');
 assert.equal(calls,3);g.finish();
});

test('下一轮未返回把握时不沿用上一轮；画完等待有独立姿势',async()=>{
 let round=1;const g=new Game({orderRandom:n=>n-1,players:players.slice(0,1),human:true,words,revealDelay:60000,run:async()=>({guess:'香蕉',...(round===1?{confidence:98}:{})})});
 await g.next();await g.beginGuess({image,shapes});g.publishGuesses();await g.revise();round=2;
 await g.beginGuess({image,shapes});assert.equal(g.snapshot().results.high.confidence,null);assert.equal(g.phase,'locked');g.finish();
 const p={id:'artist'},s={phase:'ready',artistId:'artist',results:{}};
 assert.equal(characterState(s,p),'finished');assert.equal(characterState(s,p,true),'drawing');
 assert.equal(characterState({...s,phase:'draw-error'},p),'idle');
});

test('接龙也使用同次猜词的把握，传递前仍不泄漏答案或理由',async()=>{
 let calls=0;const g=new RelayGame({players,human:false,words,passDelay:60000,renderDrawing:async()=>image,run:async(p,prompt,png)=>{
  calls++;return png?{guess:'接龙秘密猜词',reason:'秘密理由',confidence:{high:90,mid:55,low:10}[p.id]}:{shapes};
 }});
 await g.next();assert.equal(calls,3);assert.equal(characterState(g.snapshot(),players[0]),'finished');
 g.advance();await g.workTask;assert.equal(calls,6);const s=g.snapshot();
 for(const [i,p] of players.entries())assert.equal(characterState(s,p),['confident','uncertain','random'][i]);
 assert(!JSON.stringify(s).includes('接龙秘密猜词'));assert(!JSON.stringify(s).includes('秘密理由'));g.finish();
});
