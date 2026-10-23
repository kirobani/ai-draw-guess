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
 try{await g.next();await g.beginGuess({image,shapes});assert.equal(g.banter.status,'empty');assert(g.banter.snapshot().canChallenge);assert.equal(calls,2);}finally{g.finish();}
 assert(banterPrompt({answer:'雨伞'},{fromName:'Claude',toName:'Gemini',kind:'artist-miss'},false).includes('不替对方写回应'));
});

const challenge=(b,overrides={})=>({banterId:b.id,targetId:'g',text:'Gemini，你这猜得也太离谱了吧！',requestId:'manual-request-001',...overrides});
test('玩家可以主动点名，只调用目标模型回应，保留本人原话和角色语气',async()=>{
 const calls=[],messages=[],b=make({pairs:[],publish:m=>messages.push(m),run:async(p,prompt)=>{calls.push({id:p.id,prompt});return {line:'玩家，那你倒说说那根线是不是伞柄？'};}});
 const html=banterMarkup(b.snapshot());assert(html.includes('点名开麦'));assert(html.includes('value="g"'));assert(!html.includes('value="human"'));
 assert(!banterMarkup(b.snapshot(),{controls:false}).includes('<form'));
 await b.challenge(challenge(b));
 assert.equal(b.status,'complete');assert.deepEqual(calls.map(x=>x.id),['g']);assert(calls[0].prompt.includes('Gemini，你这猜得也太离谱了吧！'));assert(calls[0].prompt.includes('必须回应这句话'));
 assert.equal(messages[0].source,'human');assert.equal(messages[0].playerId,'human');assert.equal(messages[0].reply,false);assert.equal(messages[0].text,'Gemini，你这猜得也太离谱了吧！');
 assert.equal(messages[1].playerId,'g');assert.equal(messages[1].targetId,'human');assert.equal(messages[1].source,'model');assert(messages[1].text.includes('喵'));
 await b.challenge(challenge(b));assert.equal(calls.length,1);assert.equal(messages.length,2);
 await b.challenge(challenge(b,{requestId:'manual-request-002',targetId:'c',text:'Claude，你也解释一下！'}));assert.deepEqual(calls.map(x=>x.id),['g','c']);
 assert(!JSON.stringify(b.snapshot()).includes('SECRET'));
});

test('玩家开麦验证目标、长度、观战身份和旧请求；不接受第二条未回应的点名',async()=>{
 let release;const b=make({pairs:[],run:()=>new Promise(resolve=>release=resolve)});
 for(const text of ['', ' '.repeat(2),'字'.repeat(121)])assert.throws(()=>b.challenge(challenge(b,{text})),/请输入/);
 for(const targetId of ['human','missing'])assert.throws(()=>b.challenge(challenge(b,{targetId})),/本局的一位/);
 assert.throws(()=>b.challenge(challenge(b,{banterId:'old'})),/变更/);
 assert.throws(()=>b.challenge(challenge(b,{requestId:''})),/标识/);
 const spectator=make({pairs:[],players:players.filter(p=>!p.human)});assert(!spectator.snapshot().canChallenge);assert.throws(()=>spectator.challenge(challenge(spectator)),/观战/);
 const task=b.challenge(challenge(b));await new Promise(resolve=>setImmediate(resolve));
 assert.throws(()=>b.challenge(challenge(b,{requestId:'manual-request-002'})),/还欠/);
 assert.throws(()=>b.challenge(challenge(b,{text:'换句内容'})),/已变更/);
 release({line:'这就回你。'});await task;
 b.stop();assert(!b.snapshot().canChallenge);assert.throws(()=>b.challenge(challenge(b,{requestId:'manual-request-003'})),/变更/);
});

test('主动开麦排在正在进行的互怼后，回应不会因自动两组上限被丢弃',async()=>{
 let release;const calls=[],messages=[],b=make({pairs:[...pairs,{fromId:'g',toId:'c',kind:'miss-artist'}],publish:m=>messages.push(m),run:async p=>{calls.push(p.id);if(calls.length===1)return new Promise(resolve=>release=resolve);return {line:'当面解释一下。'};}});
 const automatic=b.start(),manual=b.challenge(challenge(b,{targetId:'c'}));
 assert.equal(messages[0].source,'human');release({line:'先说这一句。'});await automatic;await manual;
 assert.equal(b.exchanges.length,3);assert.equal(b.status,'complete');assert.deepEqual(calls,['c','g','g','c','c']);
 assert.equal(messages.filter(m=>m.exchangeId===b.exchanges[2].id).length,2);
});

test('排队开麦不越过玩家待回复状态；AI 失败只重试回应且重复发送不加调用',async()=>{
 let fail=true;const calls=[],messages=[],b=make({pairs:[{fromId:'g',toId:'human',kind:'miss-artist'}],publish:m=>messages.push(m),run:async p=>{calls.push(p.id);if(p.id==='c'&&fail)throw Error('PRIVATE-UPSTREAM');return {line:'你刚才那笔呢？'};}});
 await b.start();await b.challenge(challenge(b,{targetId:'c'}));assert.equal(b.status,'waiting-human');assert.deepEqual(calls,['g']);
 await b.reply({banterId:b.id,exchangeId:b.exchanges[0].id,text:'那是伞骨，看清楚！'});
 assert.equal(b.status,'error');assert.equal(b.exchanges[1].opener,'Gemini，你这猜得也太离谱了吧！');assert(!JSON.stringify(b.snapshot()).includes('PRIVATE-UPSTREAM'));
 await b.challenge(challenge(b,{targetId:'c'}));assert.deepEqual(calls,['g','c']);
 fail=false;await b.retry({banterId:b.id});assert.deepEqual(calls,['g','c','c']);assert.equal(b.status,'complete');
 assert.equal(messages.filter(m=>m.exchangeId===b.exchanges[1].id&&!m.reply).length,1);
});

test('跳过未完成的玩家点名后，迟到模型结果不能发消息',async()=>{
 let release;const messages=[],b=make({pairs:[],publish:m=>messages.push(m),run:()=>new Promise(resolve=>release=resolve)});
 const task=b.challenge(challenge(b));await new Promise(resolve=>setImmediate(resolve));b.skip({banterId:b.id});release({line:'迟到的回嘴'});await task;
 assert.equal(b.status,'skipped');assert.equal(messages.length,1);assert.equal(messages[0].source,'human');
});

test('关闭自动互怼仍可主动开麦，普通局聊天、复盘和视频素材保留完整往返',async()=>{
 let lines=0;const g=new Game({players:players.slice(0,2),human:true,words,orderRandom:n=>n-1,banter:false,revealDelay:0,run:async(p,prompt)=>prompt.includes('"line"')?(lines++,{line:'玩家，那是你画的伞骨！'}):{guess:'雨伞'}});
 const rec=new MatchRecording(g);
 try{
  await g.next();assert.equal(g.banter,null);await g.beginGuess({image,shapes});assert.equal(g.phase,'reveal');assert.equal(g.banter.status,'empty');assert.equal(lines,0);
  const scores=g.players.map(p=>p.drawScore+p.guessScore);
  await g.banter.challenge(challenge(g.banter));assert.equal(lines,1);assert.equal(g.visibleConversation().filter(m=>m.kind==='banter').length,2);assert.deepEqual(g.players.map(p=>p.drawScore+p.guessScore),scores);
  await g.next();assert.equal(g.history[0].banter.exchanges[0].reply,'玩家，那是你画的伞骨喵！');
  const messages=rec.events.filter(e=>e.type==='message'&&e.data.kind==='banter');assert.equal(messages.length,2);assert.equal(messages[0].data.source,'human');assert(!JSON.stringify(rec.export()).includes('SECRET'));
 }finally{g.finish();}
});

test('接龙结果页也可主动点名；只传当前链记录与画作，后续链不可提前开麦',async()=>{
 const calls=[],messages=[],g={players:players.slice(1),index:1,chains:[{id:'chain',answer:'雨伞',route:['c','human'],steps:[{position:0,playerId:'c',kind:'draw',shapes},{position:1,playerId:'human',kind:'guess',text:'雨伞'}]}],banterEnabled:false,touch(){},addMessage(...m){messages.push(m);},run:async(p,prompt)=>{calls.push({id:p.id,prompt});return prompt.includes('"line"')?{line:'玩家，这条链我接得还不错吧？'}:{reflection:'配合不错！'};}};
 const show=new RelayShowcase(g,{renderSheet:()=>image});
 try{
  show.play({chainId:'chain'});assert(!show.banter);
  for(let stepIndex=0;stepIndex<2;stepIndex++)show.nextStep({chainId:'chain',stepIndex});
  await show.voteTask;assert.equal(show.status,'result');assert.equal(show.banter.status,'empty');
  await show.banter.challenge(challenge(show.banter,{targetId:'c'}));
  const dialog=calls.filter(c=>c.prompt.includes('"line"'));assert.equal(dialog.length,1);assert.equal(dialog[0].id,'c');assert(dialog[0].prompt.includes('接龙揭晓后互怼'));
  assert.equal(show.snapshot().ballots[0].banter.exchanges[0].reply,'玩家，这条链我接得还不错吧？');assert.equal(messages.filter(m=>m[0]==='banter').length,2);
  show.nextChain({chainId:'chain'});assert.equal(show.status,'complete');
 }finally{show.dispose();}
});
