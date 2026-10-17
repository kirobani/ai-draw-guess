import test from 'node:test';
import assert from 'node:assert/strict';
import {loadImage} from '@napi-rs/canvas';
import {RelayShowcase,tallyPass,tallyCulprits,relayVotePrompt,relayReflectionPrompt,isExactRelayChain,renderRelayVoteSheet} from '../lib/relay-showcase.mjs';
import {relayShowcaseMarkup,relayVoteRecord} from '../public/relay-view.mjs';
import {RelayGame} from '../lib/relay.mjs';
const shapes=[{type:'ellipse',x:500,y:325,rx:100,ry:80,color:'#202633',width:5}];
const chain=(n=3,id='c1')=>({id,answer:'画蛇添足',ownerId:'human',route:['human','a','b','c'].slice(0,n),steps:Array.from({length:n},(_,i)=>({position:i,playerId:['human','a','b','c'][i],kind:i%2?'guess':'draw',...(i%2?{text:'未来隐藏猜词'+i,reason:'看到了一个圆'}:{shapes}),skipped:false}))});
function create({n=3,run=async()=>({pass:true,reason:'还保留核心意思'}),stepDelay=60000,guessDelay=60000}={}){
 const g={id:'g',updated:0,players:chain(n).route.map(id=>({id,name:id,human:id==='human'})),chains:[chain(n),chain(n,'c2')],touch(){this.updated++;},messages:[],addMessage(...args){this.messages.push(args);},run};
 const show=new RelayShowcase(g,{stepDelay,guessDelay});g.showcase=show;return {g,show,data:{chainId:'c1'}};
}
function advanceToVote(show,data){show.play(data);while(show.status==='playing')show.nextStep({...data,stepIndex:show.stepIndex});}
const view=(g,show)=>({...g,relay:{showcase:show.snapshot()}});

test('末棒猜词逐字相同才自动通过；感言替代投票，玩家可选留言，记录与展示保留',async()=>{
 const calls=[],{g,show,data}=create({n:4,run:async(p,prompt)=>{calls.push(prompt);return {reflection:`${p.name}：这都传回来了，牛啊！`};}});
 g.chains[0].steps[3].text=g.chains[0].answer;
 try{
  advanceToVote(show,data);assert.equal(show.status,'result');assert.equal(show.ballot.verdict.automatic,true);
  assert.deepEqual(show.ballot.passVotes,{});assert.deepEqual(show.ballot.culpritVotes,{});
  await show.voteTask;assert.equal(calls.length,3);assert(calls.every(p=>p.includes('通关感言')&&!p.includes('"pass":')&&!p.includes('"targetId":')));
  assert(g.messages.some(m=>m[0]==='relay-reflection'));
  assert.throws(()=>show.humanReflection({...data,text:''}),/请输入/);
  show.humanReflection({...data,text:'还得是大家！'});assert.throws(()=>show.humanReflection({...data,text:'重复'}),/已经发表/);
  const html=relayShowcaseMarkup(view(g,show));assert(html.includes('免投票通关'));assert(html.includes('还得是大家！'));assert(!html.includes('0 票通过'));assert(!html.includes('data-showcase-vote'));
  assert.equal(show.snapshot().ballots[0].reflections.a.status,'submitted');
  show.nextChain(data);assert.equal(show.status,'intro');assert.throws(()=>show.humanReflection({...data,text:'旧链'}),/变更/);
 }finally{show.dispose();}
});
test('自动通过严格区分同字异序、近似词、画面末棒和留空；感言失败只重试失败者',async()=>{
 const c=chain(4);for(const text of ['画足添蛇','画蛇添手','画蛇添足。','画蛇添足 ']){c.steps[3].text=text;assert.equal(isExactRelayChain(c),false);}
 c.steps[3].text=c.answer;assert.equal(isExactRelayChain(c),true);c.steps[3].skipped=true;assert.equal(isExactRelayChain(c),false);assert.equal(isExactRelayChain(chain(3)),false);
 const attempts={},pending=[],{g,show,data}=create({n:4,run:async p=>{attempts[p.id]=(attempts[p.id]||0)+1;if(p.id==='a'&&attempts.a===1)throw Error('offline');if(p.id==='a')return new Promise(r=>pending.push(r));return {reflection:'配合不错！'};}});
 g.chains[0].steps[3].text=g.chains[0].answer;advanceToVote(show,data);await show.voteTask;
 assert.equal(show.ballot.verdict.passed,true);assert.equal(show.ballot.reflections.a.status,'error');
 const retry=show.retryReflections(data);await new Promise(r=>setImmediate(r));assert.deepEqual(attempts,{a:2,b:1,c:1});
 show.nextChain(data);assert.equal(show.ballots[0].reflections.a.status,'skipped');pending[0]({reflection:'迟到感言'});await retry;
 assert(!JSON.stringify(show.snapshot()).includes('迟到感言'));show.dispose();
});
test('投票与感言提示提供真实人名供互怼，编号仅用于画作对应，不暴露密钥',()=>{
 const players=[{id:'human',name:'你',human:true},{id:'a',name:'DeepSeek',apiKey:'PRIVATE-KEY'},{id:'b',name:'Grok'}];
 for(const kind of ['pass','culprit']){const prompt=relayVotePrompt(chain(),players,kind,'a');assert(prompt.includes('DeepSeek'));assert(prompt.includes('Grok'));assert(prompt.includes('玩家'));assert(prompt.includes('直接叫对方的名字'));assert(prompt.includes('火力比客套点评强'));assert(!prompt.includes('PRIVATE-KEY'));}
 assert(relayReflectionPrompt(chain(),players,'a').includes('不需要投票')||relayReflectionPrompt(chain(),players,'a').includes('无需投票'));
});

test('画作标题显示该棒收到的词，猜词揭晓仍按原节奏，留空不冒用原题',()=>{
 const {g,show,data}=create({n:4});
 try{
  show.play(data);show.pause(data);
  let html=relayShowcaseMarkup(view(g,show));
  assert(html.includes('human 画的：画蛇添足'));assert(!html.includes('未来隐藏猜词'));
  show.nextStep({...data,stepIndex:0});html=relayShowcaseMarkup(view(g,show));
  assert(html.includes('human 画的：画蛇添足'));assert(html.includes('a 猜的是：'));assert(html.includes('未来隐藏猜词1'));
  show.nextStep({...data,stepIndex:1});html=relayShowcaseMarkup(view(g,show));
  assert(html.includes('b 画的：未来隐藏猜词1'));assert(!html.includes('画蛇添足'));assert(!html.includes('未来隐藏猜词3'));
  g.chains[0].steps[1].text='<img src=x onerror=alert(1)> & 乌龟';
  html=relayShowcaseMarkup(view(g,show));assert(html.includes('b 画的：&lt;img'));assert(!html.includes('<img'));
  g.chains[0].steps[1].skipped=true;html=relayShowcaseMarkup(view(g,show));
  assert(html.includes('b 画的：未收到词语'));assert(!html.includes('画蛇添足'));
  g.chains[0].steps[2].skipped=true;html=relayShowcaseMarkup(view(g,show));
  assert(html.includes('b 的画作：这一棒留空'));assert(!html.includes('b 画的：'));
 }finally{show.dispose();}
});
test('展示先画后猜，暂停保留进度，旧棒与旧链请求不能重复推进',()=>{
 const {g,show,data}=create();
 assert.equal(show.status,'intro');assert(!relayShowcaseMarkup(view(g,show)).includes('未来隐藏猜词'));
 show.play(data);assert.equal(show.stepIndex,0);assert(show.dueAt>Date.now());assert(!relayShowcaseMarkup(view(g,show)).includes('未来隐藏猜词'));
 show.pause(data);assert.equal(show.dueAt,null);assert.equal(show.paused,true);
 show.nextStep({...data,stepIndex:0});assert.equal(show.stepIndex,1);assert(relayShowcaseMarkup(view(g,show)).includes('a 猜的是：'));assert(relayShowcaseMarkup(view(g,show)).includes('未来隐藏猜词1'));
 assert.throws(()=>show.nextStep({...data,stepIndex:0}),/已揭晓/);assert.throws(()=>show.play({chainId:'wrong'}),/变更/);assert.equal(g.messages.length,1);show.dispose();
});
test('计时自动推进，取消后不会继续揭晓或产生投票调用',async()=>{
 const {show,data}=create({stepDelay:15,guessDelay:60000});show.play(data);await new Promise(r=>setTimeout(r,35));assert.equal(show.stepIndex,1);show.dispose();show.advance();assert.equal(show.stepIndex,1);
});
test('通过票全员独立且先封票；通过后不调用害群之马投票，重复人类票被拒绝',async()=>{
 const calls=[],{g,show,data}=create({run:async(p,prompt,image)=>{calls.push({id:p.id,prompt,image});return {pass:true,reason:'一致'};}});
 advanceToVote(show,data);await show.voteTask;assert.equal(show.status,'pass-vote');assert.equal(show.snapshot().ballots[0].passVotes.a.pass,undefined);
 for(const call of calls){assert(call.image.startsWith('data:image/png;base64,'));assert(!call.prompt.includes('apiKey'));assert(call.prompt.includes('其他人的投票不会给你看'));}
 show.humanVote({...data,kind:'pass',pass:false});assert.equal(show.status,'result');assert.deepEqual(show.ballot.verdict,{yes:2,no:1,abstained:0,passed:true});assert.equal(calls.length,2);
 assert.throws(()=>show.humanVote({...data,kind:'pass',pass:true}),/变更|结束/);show.nextChain(data);assert.equal(show.chainIndex,1);assert.equal(show.status,'intro');assert.throws(()=>show.play(data),/变更/);show.dispose();
});
test('不过才进入第二轮，每人一票，可选自己，最高票并列全部保留和展示',async()=>{
 const calls=[],{g,show,data}=create({run:async(p,prompt)=>{calls.push(prompt);return prompt.includes('targetId')?{targetId:p.id==='a'?'a':'b',reason:'具体这一棒偏离'}:{pass:false,reason:'末棒偏离'};}});
 advanceToVote(show,data);await show.voteTask;show.humanVote({...data,kind:'pass',pass:true});await show.voteTask;
 assert.equal(show.status,'culprit-vote');assert.equal(calls.length,4);assert.equal(show.snapshot().ballots[0].culpritVotes.a.targetId,undefined);
 assert.throws(()=>show.humanVote({...data,kind:'culprit',targetId:'不存在'}),/本链/);assert.equal(show.ballot.culpritVotes.human.status,'waiting');
 show.humanVote({...data,kind:'culprit',targetId:'human'});assert.equal(show.status,'result');assert.deepEqual(show.ballot.culprits.winners,['human','a','b']);
 assert(relayVoteRecord(view(g,show),show.ballot).includes('并列最大害群之马'));assert(relayVoteRecord(view(g,show),show.ballot).includes('具体这一棒偏离'));show.dispose();
});
test('超时与非法票不会冒充投票；仅重试失败者，显式弃权，不足有效票不制造结论',async()=>{
 const attempts={};const {show,data}=create({run:async p=>{attempts[p.id]=(attempts[p.id]||0)+1;if(p.id==='a')throw new Error('timeout');return {pass:true};}});
 advanceToVote(show,data);await show.voteTask;assert.equal(show.ballot.passVotes.a.status,'error');assert.equal(show.status,'pass-vote');
 await show.retryVotes({...data,kind:'pass'});assert.deepEqual(attempts,{a:2,b:1});show.humanVote({...data,kind:'pass',pass:true});show.abstainErrors({...data,kind:'pass'});
 assert.equal(show.status,'result');assert.deepEqual(show.ballot.verdict,{yes:2,no:0,abstained:1,passed:true});show.dispose();
 assert.equal(tallyPass({a:{status:'abstained'},b:{status:'abstained'}}).passed,null);
 assert.equal(tallyPass({a:{status:'submitted',pass:true},b:{status:'submitted',pass:false}}).passed,false);
 assert.deepEqual(tallyCulprits({a:{status:'abstained'}}).winners,[]);
});
test('离开比赛后迟到的投票不会写入结果或启动下一轮',async()=>{
 const pending=[],{show,data}=create({run:()=>new Promise(r=>pending.push(r))});advanceToVote(show,data);await new Promise(r=>setImmediate(r));show.dispose();
 const before=JSON.stringify(show.snapshot());pending.forEach(r=>r({pass:false}));await show.voteTask;assert.equal(JSON.stringify(show.snapshot()),before);
});
test('奇数末棒对照真实画面，偶数末棒对照词语；不提前泄漏原词，内容安全转义',async()=>{
 for(const n of [3,4]){const {g,show,data}=create({n});const intro=relayShowcaseMarkup(view(g,show));assert(!intro.includes('画蛇添足'));
  advanceToVote(show,data);await show.voteTask;g.chains[0].answer='<script>坏词</script>';const html=relayShowcaseMarkup(view(g,show));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes(n===3?'最后一棒的画面':'最后一棒的词语'));
  assert.equal(n===3?html.includes('data-showcase-picture="2"'):html.includes('未来隐藏猜词3'),true);show.dispose();
 }
 const sheet=await loadImage(renderRelayVoteSheet(chain(3)));assert.equal(sheet.width,1000);assert.equal(sheet.height,355);
 const prompt=relayVotePrompt(chain(),[{id:'a',apiKey:'SECRET'}],'culprit','a');assert(!prompt.includes('SECRET'));assert(prompt.includes('不要只因为最后答案不对'));
});
test('全员完成才自动生成展示；聊天不抢跑公布猜词；提前结束仍可直接复盘',async()=>{
 const opts={human:false,players:[{id:'a'},{id:'b'}],words:[{answer:'起点一'},{answer:'起点二'}],run:async(_p,_s,img)=>img?{guess:'隐藏终点'}:{shapes},renderDrawing:async()=> 'image',passDelay:60000};
 const g=new RelayGame(opts);await g.next();g.advance();await g.workTask;g.advance();assert.equal(g.snapshot().relay.showcase.status,'intro');assert(!g.snapshot().conversation.some(m=>m.text.includes('隐藏终点')));g.finish();
 const early=new RelayGame(opts);await early.next();early.finish();assert.equal(early.snapshot().relay.showcase,null);assert.equal(early.phase,'finished');
});
