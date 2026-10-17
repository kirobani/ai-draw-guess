import test from 'node:test';
import assert from 'node:assert/strict';
import {Banter,battleBanterPairs,relayBanterPairs,banterPrompt} from '../lib/banter.mjs';
import {Game} from '../lib/game.mjs';
import {RelayShowcase} from '../lib/relay-showcase.mjs';
import {MatchRecording} from '../lib/recording.mjs';
import {banterMarkup} from '../public/banter-view.mjs';
import {messageLabel,latestSpeech} from '../public/conversation.mjs';
const players=[{id:'g',name:'Gemini',characterId:'gemini',apiKey:'SECRET'},{id:'c',name:'Claude',characterId:'claude'},{id:'human',name:'你',human:true}];
const pairs=[{fromId:'c',toId:'g',kind:'artist-miss'}];
const make=overrides=>new Banter({players,pairs,context:{answer:'雨伞'},image:'fixture',run:async()=>({line:'这伞柄你看见了吗？'}),publish:()=>{},touch:()=>{},...overrides});
const rng=()=>{let n=42;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
const wrong={solved:false,history:[{guess:'降落伞',correct:false}]},right={solved:true,history:[{guess:'雨伞',correct:true}]};
const shapes=[{type:'ellipse',x:500,y:300,rx:100,ry:80,color:'#202633',width:5}];
const words=Array.from({length:5},()=>({answer:'雨伞',category:'物品'}));
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');

test('四类互动随机可达；最多两组、不重复对喷、不让人类自动开口、不责怪未作答者',()=>{
 const ps=[...players,{id:'m',name:'MiMo'},{id:'offline',name:'掉线者'}],results={g:right,human:wrong,m:wrong,offline:{solved:false,history:[{guess:'',skipped:true}]}},random=rng(),seen=new Set();let empty=false;
 for(let i=0;i<500;i++){
  const pairs=battleBanterPairs(ps,'c',results,random);if(!pairs.length)empty=true;assert(pairs.length<=2);
  assert.equal(new Set(pairs.map(p=>[p.fromId,p.toId].sort().join(':'))).size,pairs.length);
  for(const p of pairs){seen.add(p.kind);assert.notEqual(p.fromId,'human');assert.notEqual(p.fromId,p.toId);assert(![p.fromId,p.toId].includes('offline'));}
 }
 assert.equal(seen.size,4);assert(empty);assert.deepEqual(battleBanterPairs(ps,'c',{g:right,m:right},()=>0),[]);
});
test('双方由各自模型调用；回应能看到原话，喵只在对白中，消息带明确指向',async()=>{
 const calls=[],messages=[],b=make({run:async(p,prompt)=>{calls.push({id:p.id,prompt});return {line:p.id==='c'?'Gemini，弯钩是装饰吗？':'Claude，我确实漏看伞柄了。'};},publish:m=>messages.push(m)});
 await b.start();assert.equal(b.status,'complete');assert.deepEqual(calls.map(c=>c.id),['c','g']);assert(calls[1].prompt.includes('Gemini，弯钩是装饰吗？'));assert(!calls[0].prompt.includes('SECRET'));
 assert.equal(messages[1].text,'Claude，我确实漏看伞柄了喵。');assert.equal(messages[1].targetId,'c');assert(messages[1].reply);assert.equal(messages.length,2);
 assert.equal(messageLabel(messages[0]),'互怼 → Gemini');assert.equal(latestSpeech({index:0,conversation:messages.map(m=>({...m,index:0}))},'g').text,messages[1].text);
});
test('人类被点名等待本人输入，拒绝旧回应、重复、空白、超长；不自动替玩家回嘴',async()=>{
 const messages=[],calls=[],b=make({pairs:[{fromId:'g',toId:'human',kind:'miss-artist'}],publish:m=>messages.push(m),run:async p=>{calls.push(p.id);return {line:'玩家，这把伞怎么有两个尖？'};}});
 await b.start();assert.equal(b.status,'waiting-human');assert.deepEqual(calls,['g']);assert.equal(messages.length,1);
 const data={banterId:b.id,exchangeId:b.exchanges[0].id};
 for(const text of ['', ' '.repeat(2),'字'.repeat(121)])assert.throws(()=>b.reply({...data,text}),/请输入/);
 assert.throws(()=>b.reply({...data,banterId:'old',text:'我来解释'}),/变更/);
 assert.throws(()=>b.reply({...data,exchangeId:'old',text:'我来解释'}),/没有等待/);
 const html=banterMarkup(b.snapshot());assert(html.includes('你来回应 Gemini'));assert(html.includes('data-banter-form'));
 await b.reply({...data,text:'<img src=x> 你再看看那是伞骨！'});assert.equal(b.status,'complete');assert.equal(messages[1].source,'human');assert.equal(messages[1].text,'<img src=x> 你再看看那是伞骨！');assert.equal(calls.length,1);
 assert(!banterMarkup(b.snapshot()).includes('<img'));assert.throws(()=>b.reply({...data,text:'再来'}),/没有等待/);
});
test('回应失败不造假，只重试回应；过时的完成结果不能补发对白',async()=>{
 let fail=true;const calls=[],messages=[],b=make({publish:m=>messages.push(m),run:async p=>{calls.push(p.id);if(p.id==='g'&&fail)throw Error('SECRET-UPSTREAM');return {line:'有道理。'};}});
 await b.start();assert.equal(b.status,'error');assert.equal(messages.length,1);assert(!JSON.stringify(b.snapshot()).includes('SECRET-UPSTREAM'));
 fail=false;await b.retry({banterId:b.id});assert.deepEqual(calls,['c','g','g']);assert.equal(messages.length,2);assert.equal(b.status,'complete');
 let resolve;const late=make({run:()=>new Promise(r=>resolve=r),publish:m=>messages.push(m)});const pending=late.start();late.skip({banterId:late.id});resolve({line:'迟到的挑衅'});await pending;assert.equal(late.status,'skipped');assert.equal(messages.length,2);
});
test('下一题能取消未完成回嘴，已说内容进入聊天、复盘及视频素材；不改变得分',async()=>{
 const g=new Game({players:players.slice(0,2),human:true,words,orderRandom:n=>n-1,revealDelay:0,banter:true,banterRandom:()=>0,run:async(p,prompt,img)=>{
  if(prompt.includes('"line"'))return {line:'玩家，你这伞柄呢？'};
  if(prompt.includes('"summary"'))return {summary:'下次看仔细。'};
  return img?{guess:p.id==='g'?'雨伞':'降落伞',reason:'看轮廓'}:{shapes};
 }});
 const rec=new MatchRecording(g);
 try{
  await g.next();await g.beginGuess({image,shapes});assert.equal(g.phase,'review');assert.equal(g.banter,null);
  g.reveal();await g.banter.task;assert.equal(g.banter.status,'waiting-human');assert.equal(g.banter.exchanges[g.banter.index].toId,'human');
  const scores=g.players.map(p=>p.drawScore+p.guessScore),old=g.banter;
  await g.next();assert.equal(old.status,'skipped');assert.deepEqual(g.players.map(p=>p.drawScore+p.guessScore),scores);
  assert(g.history[0].banter.exchanges[0].opener);assert(rec.events.some(e=>e.type==='message'&&e.data.kind==='banter'));assert(!JSON.stringify(rec.export()).includes('SECRET'));
  assert.throws(()=>old.reply({banterId:old.id,exchangeId:old.exchanges[0].id,text:'迟到'}),/变更/);
 }finally{g.finish();}
});
test('接龙只按真实责任票配对；全对用邀功互动，不提前对尚未揭晓的链发言',async()=>{
 const ballot={verdict:{passed:false},culprits:{winners:['g']},culpritVotes:{c:{status:'submitted',targetId:'g'},human:{status:'submitted',targetId:'g'},g:{status:'submitted',targetId:'g'}}};
 for(const p of relayBanterPairs(players,ballot,()=>0)){assert([p.fromId,p.toId].includes('g'));assert.notEqual(p.fromId,'human');assert.notEqual(p.fromId,p.toId);}
 assert(relayBanterPairs(players,{verdict:{passed:true,automatic:true}},()=>0).every(p=>p.kind==='relay-pass'));
 assert.deepEqual(relayBanterPairs(players,{verdict:{passed:false},culprits:{winners:[]}},()=>0),[]);
 let calls=0;const g={players:players.slice(0,2),index:1,chains:[{id:'chain',answer:'雨伞',route:['c','g'],steps:[{position:0,playerId:'c',kind:'draw',shapes},{position:1,playerId:'g',kind:'guess',text:'雨伞'}]}],banterEnabled:true,banterRandom:()=>0,touch(){},addMessage(){},run:async(p,prompt)=>{calls++;return prompt.includes('"line"')?{line:'这都接住了，厉害！'}:{reflection:'配合不错！'};}};
 const show=new RelayShowcase(g,{renderSheet:()=>image});
 try{
  show.play({chainId:'chain'});assert.equal(calls,0);assert.equal(show.banter,undefined);
  show.nextStep({chainId:'chain',stepIndex:0});assert.equal(calls,0);
  show.nextStep({chainId:'chain',stepIndex:1});await show.voteTask;await show.banter.task;
  assert.equal(show.status,'result');assert.equal(show.ballot.verdict.automatic,true);assert.equal(show.ballot.banter.status,'complete');assert.equal(show.snapshot().ballots[0].banter.exchanges.length,1);
 }finally{show.dispose();}
});
test('跳过、关闭功能不额外调用；公开快照不携带凭证或模型提示',async()=>{
 const b=make();await b.start();assert(!JSON.stringify(b.snapshot()).includes('SECRET'));assert(!JSON.stringify(b.snapshot()).includes('公开比赛记录'));
 let calls=0;const g=new Game({players:players.slice(0,2),human:true,words,orderRandom:n=>n-1,banter:false,run:async()=>{calls++;return {guess:'雨伞'};},revealDelay:0});
 try{await g.next();await g.beginGuess({image,shapes});assert.equal(g.banter,null);assert.equal(calls,2);}finally{g.finish();}
 assert(banterPrompt({answer:'雨伞'},{fromName:'Claude',toName:'Gemini',kind:'artist-miss'},false).includes('不替对方写回应'));
});
