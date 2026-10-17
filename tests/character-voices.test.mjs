import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS,characterPrompt,characterSpeech} from '../public/characters.mjs';
import {Game} from '../lib/game.mjs';
import {RelayGame} from '../lib/relay.mjs';
import {RelayShowcase} from '../lib/relay-showcase.mjs';

const cat={id:'gemini',name:'Gemini',characterId:'gemini'},other={id:'doubao',name:'豆包'};
const shapes=[{type:'ellipse',x:500,y:300,rx:100,ry:80,color:'#202633',width:5}];
const words=Array.from({length:3},()=>({answer:'画蛇添足',category:'成语'}));
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const game=opts=>new Game({players:[cat],human:true,words,revealDelay:0,orderRandom:n=>n-1,run:async()=>({guess:'画蛇添足',reason:'蛇身下面长了脚。',confidence:80}),...opts});

test('喵兜底保留标点、截断后仍在句尾、不重复追加、不制造空白发言',()=>{
 for(const [input,expected] of [['看脚。','看脚喵。'],['看脚喵！','看脚喵！'],['看脚喵喵？！','看脚喵？！'],['看脚','看脚喵'],['',''],['   ',''],[null,''],[{},'']]){
  assert.equal(characterSpeech(cat,input),expected);
  assert.equal(characterSpeech(cat,characterSpeech(cat,input)),expected);
 }
 const long=characterSpeech(cat,'🐱'.repeat(170)+'喵！',120);
 assert.equal(Array.from(long).length,120);assert(long.endsWith('喵！'));assert(!long.includes('\uFFFD'));
 assert.equal(characterSpeech({...cat,human:true},'看脚。'),'看脚。');
 assert.equal(characterSpeech({...cat,characterId:'none'},'看脚。'),'看脚。');
 assert.equal(characterSpeech(other,'诶不是，看脚！'),'诶不是，看脚！');
});

test('每个角色独立风格，规则和任务原文保留，预览猫娘台词也一致',()=>{
 for(const c of CHARACTERS){const prompt=characterPrompt({characterId:c.id},'本次任务原文');assert(prompt.includes(c.personality));assert(prompt.includes('reflection'));assert(prompt.includes('summary'));assert(prompt.endsWith('本次任务原文'));assert(prompt.includes('guess 只放答案'));}
 for(const line of Object.values(CHARACTERS.find(c=>c.id==='gemini').lines))assert.match(line,/喵[。！？!?…]*$/u);
 assert.equal(characterPrompt({human:true},'原文'),'原文');
});

test('普通猜题只装饰理由，答案、把握、计分和聊天原答案保持一致',async()=>{
 const g=game();try{
  await g.next();await g.beginGuess({image,shapes});
  const result=g.results.gemini.history[0];assert.equal(result.guess,'画蛇添足');assert.equal(result.reason,'蛇身下面长了脚喵。');assert.equal(result.confidence,80);assert.equal(result.correct,true);assert.equal(result.points,3);
  const message=g.snapshot().conversation.find(m=>m.kind==='guess');assert.equal(message.text,result.guess);assert.equal(message.reason,result.reason);
 }finally{g.finish();}
});

test('AI 自由公开和私聊提示加口吻，第一轮、禁提示和固定选项不被绕过',async()=>{
 for(const mode of ['visual','none','preset']){
  let draws=0;const choice={region:'all',focus:'outline'};
  const g=game({players:[cat,other],human:false,hintMode:mode,run:async(p,prompt,img)=>img?{guess:'东张西望'}:++draws===1?{shapes,hint:'看轮廓。',hints:{doubao:'看脚。'}}:{undo:0,append:[],hint:mode==='preset'?choice:'看轮廓。',hints:{doubao:mode==='preset'?choice:'看脚。'}}});
  try{
   await g.next();assert.equal(g.hint,'');assert.deepEqual(g.privateHints,{});
   await g.beginGuess({image});await g.revise();
   if(mode==='visual'){assert.equal(g.hint,'看轮廓喵。');assert.equal(g.privateHints.doubao,'看脚喵。');assert(g.conversation.some(m=>m.kind==='hint'&&m.text==='看脚喵。'));}
   if(mode==='none'){assert.equal(g.hint,'');assert.deepEqual(g.privateHints,{});}
   if(mode==='preset'){assert.deepEqual(g.hintChoice,choice);assert.equal(g.hint,'注意画面的外轮廓和线条形状。');}
  }finally{g.finish();}
 }
});

test('无人猜中复盘保留猫娘口吻，记录生成的回顾不冒充 AI 发言',async()=>{
 const g=game({run:async(p,prompt)=>prompt.includes('"summary"')?{summary:'我把蛇脚看成树枝了。'}:{guess:'东张西望',reason:'看成了树枝。'}});
 try{await g.next();g.turn=3;await g.beginGuess({image,shapes});await g.recapTask;
  const entry=g.recap.entries.find(x=>x.playerId==='gemini');assert.equal(entry.summary,'我把蛇脚看成树枝了喵。');assert.equal(entry.source,'model');assert.equal(g.conversation.find(m=>m.kind==='recap'&&m.playerId==='gemini').text,entry.summary);
  assert.equal(g.recap.entries.find(x=>x.playerId==='human').source,'record');
 }finally{g.finish();}
});

test('接龙只向下一位传干净答案，口吻留在理由和最终记录',async()=>{
 const g=new RelayGame({players:[cat,other],human:false,words,passDelay:60000,renderDrawing:async()=>image,run:async(p,prompt,img)=>img?{guess:'画蛇添足',reason:'蛇身下面有脚。',confidence:60}:{shapes}});
 try{
  await g.next();g.advance();await g.workTask;
  const step=g.chains.flatMap(c=>c.steps).find(s=>s.playerId==='gemini'&&s.kind==='guess');
  assert.equal(step.text,'画蛇添足');assert.equal(step.reason,'蛇身下面有脚喵。');assert.equal(step.confidence,60);
  g.finish();assert(g.snapshot().conversation.some(m=>m.playerId==='gemini'&&m.text.endsWith('蛇身下面有脚喵。')));
 }finally{g.finish();}
});

test('接龙通过票、责任票、感言保持选票内容并存储同一份角色对白',async()=>{
 for(const kind of ['pass','culprit','reflection']){
  const messages=[],g={players:[cat,other],chains:[{id:'chain',answer:'画蛇添足',route:['gemini','doubao'],steps:[{kind:'draw',position:0,shapes},{kind:'guess',position:1,text:'画蛇添足'}]}],touch(){},addMessage(...args){messages.push(args);},run:async()=>kind==='reflection'?{reflection:'这次终于传回来了！'}:kind==='pass'?{pass:true,reason:'豆包认出蛇脚了。'}:{targetId:'doubao',reason:'豆包把蛇脚看成树枝了。'}};
  const show=new RelayShowcase(g,{renderSheet:()=>image});
  try{
   if(kind==='reflection'){show.beginExactPass();await show.voteTask;assert.equal(show.ballot.reflections.gemini.text,'这次终于传回来了喵！');}
   else {show.beginVote(kind);await show.voteTask;const vote=(kind==='pass'?show.ballot.passVotes:show.ballot.culpritVotes).gemini;assert(vote.reason.endsWith('喵。'));if(kind==='pass')assert.equal(vote.pass,true);else assert.equal(vote.targetId,'doubao');}
   assert(messages.some(m=>m[2]==='gemini'&&/喵[。！]$/u.test(m[1])));
  }finally{show.dispose();}
 }
});
