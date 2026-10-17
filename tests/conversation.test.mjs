import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {judgeGuess,isCorrect} from '../lib/words.mjs';
import {latestSpeech,messageBody} from '../public/conversation.mjs';
import {visualHint} from '../public/visual-hints.mjs';
const players=[{id:'a',name:'甲',characterId:'claude'},{id:'b',name:'乙',characterId:'kimi'}];
const shapes=[{type:'line',points:[[20,20],[90,90]],width:4,color:'#202633'}];
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');
const words=Array.from({length:6},()=>({answer:'画龙点睛',category:'成语'}));
const create=(opts={})=>new Game({orderRandom:n=>n-1,players,human:true,words,category:'成语',revealDelay:0,run:async(p,prompt,img)=>prompt.includes('赛后一句话复盘')?{summary:'我把眼睛看成了太阳，下次会先看清点睛的动作。'}:img?{guess:'旭日东升',reason:'圆形像一轮太阳。'}:{shapes},...opts});

test('四字成语：乱序字数一致、三个字原位置正确都接受，重复字按次数核对',()=>{
 const word=words[0];assert.deepEqual(judgeGuess(word,'点睛画龙'),{correct:true,match:'idiom-order'});
 assert.deepEqual(judgeGuess(word,'画龙点精'),{correct:true,match:'idiom-three'});
 assert(isCorrect(word,'画 龙 点 精！'));assert(isCorrect(word,'画龙点睛'));
 for(const guess of ['画龙睛点点','画龙点','画点精睛','我猜画龙点睛','画龙点睛或旭日东升',''])assert(!isCorrect(word,guess),guess);
 assert.equal(judgeGuess({answer:'自言自语',category:'成语'},'语自言自').match,'idiom-order');
 assert(!isCorrect({answer:'自言自语',category:'成语'},'自语言言'));
 assert(!isCorrect({answer:'后羿射日',category:'故事'},'后羿射月'));
 assert(!isCorrect({answer:'西瓜',category:'食物'},'瓜西'));
});
test('放宽判定仍统一揭晓：AI 与人类同等计分，聊天说明判定依据',async()=>{
 const g=create({human:false,revealDelay:60000,run:async(p,prompt,img)=>img?{guess:'睛点龙画',reason:'看见给龙补眼睛。'}:{shapes}});
 await g.next();await g.beginGuess({image});assert.equal(g.phase,'locked');assert(!g.snapshot().conversation.some(m=>m.kind==='guess'));
 g.publishGuesses();assert.equal(g.results.b.points,3);assert.equal(g.artist.drawScore,3);assert.equal(g.snapshot().conversation.find(m=>m.kind==='guess').match,'idiom-order');g.publishGuesses();assert.equal(g.artist.drawScore,3);g.finish();
 const h=create({run:async(p,prompt,img)=>img?{guess:'画龙点精'}:{shapes}});await h.next();h.reveal();await h.next();await h.beginGuess({image});h.humanGuess('画龙点精');assert.equal(h.results.human.points,3);assert.equal(h.results.b.points,3);assert.equal(h.artist.drawScore,6);h.finish();
});
test('聊天按收件人和盲猜阶段过滤：不能用气泡或聊天偷看；观战可看已判分猜词',async()=>{
 const g=create();await g.next();g.reveal();await g.next();await g.beginGuess({image});g.humanGuess('东张西望');
 assert(!g.snapshot().conversation.some(m=>m.kind==='guess'&&m.playerId==='b'));assert(g.snapshot().conversation.some(m=>m.kind==='guess'&&m.playerId==='human'));
 const mine={region:'top-left',focus:'outline'},other={region:'top-left',focus:'direction'};
 await g.revise();g.hint=visualHint({region:'all',focus:'whole'},shapes).text;g.setPrivateHints({human:mine,b:other});g.logHints();
 const before=g.snapshot();assert(!JSON.stringify(before).includes(visualHint(other,shapes).text));assert(latestSpeech(before,'a').text.includes(visualHint(mine,shapes).text));
 g.reveal();assert(g.snapshot().conversation.some(m=>m.text===visualHint(other,shapes).text));assert(g.snapshot().conversation.some(m=>m.kind==='guess'&&m.playerId==='b'));await g.recapTask;g.finish();
 const spectator=create({human:false});await spectator.next();await spectator.beginGuess({image});assert(spectator.snapshot().conversation.some(m=>m.kind==='guess'));spectator.finish();
});
test('整题无人猜中后生成一次复盘：记录真实猜词理由，并保存到比赛历史',async()=>{
 let recapCalls=0;const g=create({run:async(p,prompt,img)=>{if(prompt.includes('赛后一句话复盘')){recapCalls++;assert(prompt.includes('旭日东升'));return {summary:'我误把圆形当成太阳，忽略了旁边的龙。'};}return {guess:'旭日东升',reason:'圆形像太阳。'};}});
 await g.next();for(let i=0;i<3;i++){await g.beginGuess({image,shapes});if(i<2)await g.revise();}
 assert.equal(g.phase,'reveal');await g.recapTask;assert.equal(recapCalls,2);assert.equal(g.recap.status,'complete');assert.equal(g.recap.entries[1].trail.length,3);
 assert.equal(g.recap.entries[1].trail[0].reason,'圆形像太阳。');assert.equal(g.snapshot().conversation.filter(m=>m.kind==='recap').length,3);
 g.roundEnded();await g.recapTask;assert.equal(recapCalls,2);g.finish();assert.equal(g.history[0].recap.entries[1].source,'model');assert.equal(g.snapshot().conversation.filter(m=>m.kind==='guess').length,6);
});
test('复盘失败或提前切题保留记录摘要，迟到回复不污染下一题',async()=>{
 const waiting=[];const g=create({run:async(p,prompt,img)=>prompt.includes('赛后一句话复盘')?new Promise(resolve=>waiting.push(resolve)):img?{guess:'旭日东升',reason:'太阳'}:{shapes}});
 await g.next();await g.beginGuess({image,shapes});g.reveal();const pending=g.recapTask;assert.equal(waiting.length,2);
 await g.next();assert.equal(g.recap,null);assert.equal(g.history[0].recap.status,'complete');assert.equal(g.history[0].recap.entries[1].status,'record');
 for(const resolve of waiting)resolve({summary:'迟到的复盘'});await pending;assert(!JSON.stringify(g.snapshot()).includes('迟到的复盘'));assert(g.snapshot().conversation.some(m=>m.kind==='recap'&&m.index===0));g.finish();
 const failed=create({run:async(p,prompt,img)=>{if(prompt.includes('赛后一句话复盘'))throw Error('offline');return img?{guess:'旭日东升'}:{shapes};}});await failed.next();await failed.beginGuess({image,shapes});failed.reveal();await failed.recapTask;assert.equal(failed.recap.entries[1].source,'record');assert.equal(failed.phase,'reveal');failed.finish();
});
test('没有有效猜词或已有选手猜中时不额外调用复盘；聊天内容安全转义',async()=>{
 const g=create();await g.next();g.reveal();assert.equal(g.recap,null);g.finish();
 const solved=create({run:async()=>({guess:'画龙点睛'})});await solved.next();await solved.beginGuess({image,shapes});assert.equal(solved.recap,null);solved.finish();
 const html=messageBody({kind:'guess',text:'<img src=x onerror=alert(1)>',reason:'<script>x</script>',correct:false});assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));
});
