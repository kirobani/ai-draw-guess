import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {drawPrompt,guessPrompt} from '../lib/shapes.mjs';
import {HINT_MODES,hintControl,normalizeHintMode,visualHint} from '../public/visual-hints.mjs';

const shapes=[{type:'line',points:[[20,20],[90,90]],width:4,color:'#202633'}];
const right=[{type:'ellipse',x:840,y:510,rx:30,ry:30,width:4,color:'#202633'}];
const choice={region:'top-left',focus:'outline'};
const text='那不是树枝，是鱼竿，注意末端的钩子。';
const words=Array.from({length:5},()=>({answer:'画蛇添足',category:'成语'}));
const players=[{id:'a',name:'甲'},{id:'b',name:'乙'}];
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);
// Match the real 1000 x 650 canvas header used by the game.
bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');
const create=(opts={})=>new Game({orderRandom:n=>n-1,players,human:true,words,revealDelay:0,run:async()=>({guess:'东张西望'}),...opts});

test('三档按禁止、固定、当前文字排列；旧调用默认第三档，无效档位不静默放行',()=>{
 assert.deepEqual(HINT_MODES.map(x=>x.id),['none','preset','visual']);
 assert.equal(normalizeHintMode(),'visual');assert.equal(create().snapshot().hintMode,'visual');
 for(const bad of ['free','',null,1,{},[]])assert.throws(()=>create({hintMode:bad}),/提示方式/);
 assert.equal(hintControl('公开','$public',null,'none'),'');
 assert(!hintControl('公开','$public',choice,'preset').includes('<textarea'));
 assert(hintControl('公开','$public',null,'visual').includes('<textarea'));
});

test('禁止档玩家不能公开或私发提示，拒绝提交时保持画面和已有状态不变',async()=>{
 const g=create({hintMode:'none'});await g.next();await g.beginGuess({image,shapes});await g.revise();
 const before={shapes:g.shapes,revision:g.revision,privateHints:g.privateHints};
 for(const hints of [{hint:text},{hint:choice},{hints:{a:text}},{hints:{a:choice}}]){
  await assert.rejects(g.beginGuess({image,shapes:right,...hints}),/禁止任何提示/);
  assert.deepEqual({shapes:g.shapes,revision:g.revision,privateHints:g.privateHints},before);assert.equal(g.phase,'drawing');
 }
 await g.beginGuess({image,shapes:right});assert.deepEqual(g.shapes,right);assert.equal(g.hint,'');assert.deepEqual(g.privateHints,{});
 assert(!g.snapshot().conversation.some(m=>m.kind==='hint'));g.finish();
});

test('禁止档 AI 每轮得到禁止规则；即使返回提示也不会进入猜题、聊天或快照',async()=>{
 const seen=[];const g=create({human:false,hintMode:'none',run:async(p,prompt,img)=>{
  seen.push({prompt,img});return img?{guess:'东张西望'}:{shapes,hint:text,hints:{b:choice}};
 }});
 await g.next();await g.beginGuess({image});await g.revise();await g.beginGuess({image});
 assert(seen.filter(x=>!x.img).every(x=>x.prompt.includes('所有轮次 hint 必须为 null')));
 assert(seen.filter(x=>x.img).every(x=>x.prompt.includes('本局禁止任何提示')&&!x.prompt.includes(text)&&!x.prompt.includes('画手公开提示：')));
 assert.equal(g.hint,'');assert.deepEqual(g.privateHints,{});assert(!g.snapshot().conversation.some(m=>m.kind==='hint'));
 assert(!JSON.stringify(g.snapshot()).includes(text));g.finish();
 const blind=guessPrompt({category:'物品',length:2,hint:text,privateHint:'隐藏线索',hintMode:'none'});
 assert(!blind.includes(text));assert(!blind.includes('隐藏线索'));
});

test('第二档恢复上一版区域、笔画数及固定格式校验；第三档仍不做语义硬拦截',()=>{
 assert.deepEqual(visualHint(choice,shapes,'preset'),{text:'注意画面左上方的外轮廓和线条形状。',choice});
 for(const value of [text,{...choice,text:'多余释义'},[],{region:'bad',focus:'outline'}])assert.throws(()=>visualHint(value,shapes,'preset'));
 assert.throws(()=>visualHint({...choice,region:'bottom-right'},shapes,'preset'),/没有足够/);
 assert.throws(()=>visualHint({region:'all',focus:'count'},shapes,'preset'),/没有足够/);
 assert.equal(visualHint('比喻做了多余的事情',[],'visual').text,'比喻做了多余的事情');
 for(const [mode,needle] of [['none','禁止任何提示'],['preset','不得输出自由文本或附加字段'],['visual','不必使用固定句式']])assert(drawPrompt(words[0],shapes,[],mode).includes(needle));
 assert(!drawPrompt(words[0],shapes,[],'none').includes('可以指出画里的'));
});

test('固定档按补画后的图校验，拒绝坏提示时不改动画面；选择保留到快照和复盘',async()=>{
 const g=create({hintMode:'preset'});await g.next();await g.beginGuess({image,shapes});await g.revise();
 await assert.rejects(g.beginGuess({image,shapes:right,hint:choice}),/没有足够/);assert.deepEqual(g.shapes,shapes);
 const updated={region:'bottom-right',focus:'direction'};
 await g.beginGuess({image,shapes:right,hint:updated,hints:{a:updated}});
 assert.deepEqual(g.snapshot().hintChoice,updated);assert.deepEqual(g.snapshot().privateHintChoices.a,updated);
 assert(g.snapshot().conversation.some(m=>m.kind==='hint'&&m.text==='注意画面右下方线条的朝向和指向。'));
 g.finish();assert.equal(g.snapshot().hintMode,'preset');assert.equal(g.snapshot().hintModeName,'固定选项提示');
});

test('固定档 AI 非法文字只丢弃提示，合法选项进入提示且对收件人隔离',async()=>{
 const inputs=[];let draws=0;const g=create({players:[...players,{id:'c',name:'丙'}],human:false,hintMode:'preset',run:async(p,prompt,img)=>{
  if(img){inputs.push({id:p.id,prompt});return {guess:'东张西望'};}
  return ++draws===1?{shapes}:{undo:0,append:[],hint:text,hints:{b:choice,c:{...choice,meaning:text}}};
 }});
 await g.next();await g.beginGuess({image});await g.revise();assert.equal(g.phase,'ready');assert.deepEqual(g.shapes,shapes);
 assert.equal(g.hint,'');assert.equal(g.privateHints.b,'注意画面左上方的外轮廓和线条形状。');assert.equal(g.privateHints.c,undefined);
 await g.beginGuess({image});assert(inputs.filter(x=>x.id==='b').at(-1).prompt.includes(g.privateHints.b));assert(!inputs.filter(x=>x.id==='c').at(-1).prompt.includes(g.privateHints.b));assert(!JSON.stringify(g.snapshot()).includes(text));g.finish();
});

test('所有档位第一轮只看画；第二轮仍不能给已猜中或不存在的选手私发',async()=>{
 for(const mode of HINT_MODES.map(x=>x.id)){
  const hint=mode==='preset'?choice:text,g=create({hintMode:mode});await g.next();
  await assert.rejects(g.beginGuess({image,shapes,hint}));await assert.rejects(g.beginGuess({image,shapes,hints:{a:hint}}));
  await g.beginGuess({image,shapes});await g.revise();
  await assert.rejects(g.beginGuess({image,shapes,hints:{missing:hint}}));
  g.results.a.solved=true;await assert.rejects(g.beginGuess({image,shapes,hints:{a:hint}}));g.finish();
 }
});
