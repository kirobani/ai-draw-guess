import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {drawPrompt,guessPrompt} from '../lib/shapes.mjs';
import {visualHint,hintControl} from '../public/visual-hints.mjs';
const shapes=[{type:'line',points:[[20,20],[90,90]],width:4,color:'#202633'}];
const hint='你当成树枝的长线是鱼竿，注意它末端的弯钩。';
const words=Array.from({length:5},()=>({answer:'画蛇添足',category:'成语'}));
const players=[{id:'a',name:'甲'},{id:'b',name:'乙'}];
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const create=(opts={})=>new Game({orderRandom:n=>n-1,players,human:true,words,revealDelay:0,run:async()=>({guess:'东张西望'}),...opts});
test('自由提示允许具体物体、纠正误读，不按笔画数量或区域拦截',()=>{
  for(const text of [hint,'注意左上方那个人的手。','那不是树，是一条蛇。'])assert.deepEqual(visualHint(' '+text+' ',[]),{text,choice:text});
  for(const empty of [null,undefined,'','  '])assert.deepEqual(visualHint(empty),{text:'',choice:null});
  assert.equal(visualHint({region:'top-left',focus:'outline'},[]).text,'注意画面左上方的外轮廓和线条形状。');
});
test('释义要求仅通过提示词引导，不做关键词或语义硬拦截',()=>{
  const text='比喻做了多余的事情';assert.equal(visualHint(text).text,text);
  const prompt=drawPrompt(words[0],shapes,[{id:'b',guesses:['树枝']}]);
  for(const rule of ['不必使用固定句式','别写题目或成语的释义','鱼竿','hints 的值是针对该选手的提示文字'])assert(prompt.includes(rule));
  assert(!prompt.includes('观察重点编号'));assert(!prompt.includes('不得输出自由文本'));
});
test('仍检查输入类型和长度，文本界面安全转义',()=>{
  for(const bad of [[],{text:hint},35,'甲'.repeat(301)])assert.throws(()=>visualHint(bad));
  const html=hintControl('<甲>','$public','</textarea><script>alert(1)</script>');
  assert(html.includes('<textarea'));assert(html.includes('&lt;甲&gt;'));assert(!html.includes('<script>'));assert(html.includes('&lt;/textarea&gt;'));
});

test('公开及私下提示都要在同一回复里排除换皮释义，猜手忽略画外寓意',()=>{
 const prompt=drawPrompt(words[0],shapes,[{id:'b',guesses:['黑白不分']}]);
 for(const needle of ['马群里那匹惹祸的马','仍然是在解释答案','红圈','每一条公开和单独提示','关键含义不要靠提示补齐','不要输出检查过程'])assert(prompt.includes(needle));
 const guess=guessPrompt({category:'成语',length:4,hint:'注意那匹惹祸的马',privateHint:'提醒你想想破坏集体的人'});
 assert(guess.includes('忽略那部分，仍以图像为依据'));
 // The requested free-text mode stays free: no new keyword rejection or extra model pass.
 assert.equal(visualHint('右边黑马身上有红圈，请看这部分。').text,'右边黑马身上有红圈，请看这部分。');
});
test('第一轮仍然只看画，不发送公开或私下提示',async()=>{
  const g=create();await g.next();await assert.rejects(g.beginGuess({image,shapes,hint}),/第一轮/);
  await assert.rejects(g.beginGuess({image,shapes,hints:{a:hint}}),/此前未猜中/);assert.equal(g.revision,0);g.finish();
  const ai=create({human:false,run:async()=>({shapes,hint,hints:{b:hint}})});await ai.next();assert.equal(ai.hint,'');assert.deepEqual(ai.privateHints,{});ai.finish();
});
test('人类自由提示进入后续猜题与聊天，坏格式不改写画面',async()=>{
  const g=create();await g.next();await g.beginGuess({image,shapes});await g.revise();
  const revision=g.revision;await assert.rejects(g.beginGuess({image,shapes,hint:{text:hint}}),/文字/);assert.equal(g.revision,revision);assert.equal(g.phase,'drawing');
  await g.beginGuess({image,shapes,hint,hints:{a:'左边画的是人，不是柱子。'}});assert.equal(g.hint,hint);assert.equal(g.privateHints.a,'左边画的是人，不是柱子。');
  assert(g.snapshot().conversation.some(m=>m.kind==='hint'&&m.text===hint));g.finish();
});
test('模型自由提示可进入气泡和猜题，但私下提示只给指定选手',async()=>{
  let drawings=0;const prompts=[];
  const g=create({players:[...players,{id:'c',name:'丙'}],human:false,run:async(p,prompt,img)=>{
    if(img){prompts.push({id:p.id,prompt});return {guess:'东张西望'};}
    return ++drawings===1?{shapes}:{undo:0,append:[],hint,hints:{b:'给乙：你看成树枝的地方是鱼竿。'}};
  }});
  await g.next();await g.beginGuess({image});await g.revise();assert.equal(g.hint,hint);
  await g.beginGuess({image});assert(prompts.filter(p=>p.id==='b').at(-1).prompt.includes('给乙'));
  assert(!prompts.filter(p=>p.id==='c').at(-1).prompt.includes('给乙'));
  assert(prompts.slice(-2).every(p=>p.prompt.includes(hint)&&!p.prompt.includes('画蛇添足')));g.finish();
});
test('短答案与正常画面用词重叠时不误杀提示',async()=>{
  const g=create({words:words.map(()=>({answer:'线条',category:'物品'}))});await g.next();assert.equal(g.prepareHint('注意右边线条的方向。').text,'注意右边线条的方向。');g.finish();
});
