import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {buildRequest,migrateConfig,publicPlayer} from '../lib/providers.mjs';
import {characterState,focusedPlayer} from '../public/avatar-state.mjs';
import {visualHint} from '../public/visual-hints.mjs';
const players=[{id:'a',name:'A',characterId:'gemini'},{id:'b',name:'B',characterId:'claude'}];
const shapes=[{type:'line',points:[[20,20],[90,90]],width:4,color:'#202633'}];
const publicChoice={region:'all',focus:'whole'},aChoice={region:'top-left',focus:'outline'},bChoice={region:'top-left',focus:'direction'};
const hintText=choice=>visualHint(choice,shapes).text;
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');
const words=Array.from({length:5},()=>({answer:'西瓜',category:'食物'}));
const create=(opts={})=>new Game({orderRandom:n=>n-1,players,human:true,words,revealDelay:60000,run:async()=>({guess:'西瓜'}),...opts});
test('自信等待不会提前泄漏对错、答案或得分；统一公布只计分一次',async()=>{
 const g=create();await g.next();await g.beginGuess({image,shapes});const s=g.snapshot();
 assert.equal(s.phase,'locked');assert.equal(s.results.a.status,'confident');assert.deepEqual(s.results.a.history,[]);assert.equal(s.results.a.solved,false);assert.equal(s.players[1].guessScore,0);
 assert.throws(()=>g.record('a','西瓜'));g.publishGuesses();assert.equal(g.phase,'reveal');assert.equal(g.players[1].guessScore,3);g.publishGuesses();assert.equal(g.players[1].guessScore,3);g.finish();
});
test('单独提示按收件人隔离，猜中的人不能再收提示，旧选项转为文字',async()=>{
 let seen=[],turn=1;const g=create({run:async(p,prompt)=>{seen.push({id:p.id,prompt});return {guess:turn===1?'香蕉':'西瓜'};}});
 await g.next();await g.beginGuess({image,shapes});g.publishGuesses();await g.revise();seen=[];turn=2;
 assert.throws(()=>g.setPrivateHints({a:{text:'非法格式'}}));assert.throws(()=>g.setPrivateHints({human:'提示'}));
 await g.beginGuess({image,shapes,hint:publicChoice,hints:{a:aChoice,b:bChoice}});
 for(const [id,mine,other] of [['a',aChoice,bChoice],['b',bChoice,aChoice]]){const p=seen.find(s=>s.id===id).prompt;assert(p.includes(hintText(mine)));assert(!p.includes(hintText(other)));assert(p.includes(hintText(publicChoice)));}
 assert.equal(g.snapshot().hintChoice,hintText(publicChoice));assert.deepEqual(g.snapshot().privateHintChoices,{a:hintText(aChoice),b:hintText(bChoice)});
 g.publishGuesses();assert.throws(()=>g.setPrivateHints({a:aChoice}),/此前未猜中/);g.finish();
});
test('人类猜手只能看到自己的私下提示；结束才允许复盘全部提示',async()=>{
 const g=create({run:async(p,prompt,img)=>img?{guess:'香蕉'}:{shapes}});await g.next();g.reveal();await g.next();
 await g.beginGuess({image});g.humanGuess('香蕉');g.publishGuesses();await g.revise();g.setPrivateHints({human:aChoice,b:bChoice});
 assert.equal(g.snapshot().myHint,hintText(aChoice));assert.deepEqual(g.snapshot().privateHints,{});assert.deepEqual(g.snapshot().privateHintChoices,{});assert(!JSON.stringify(g.snapshot()).includes(hintText(bChoice)));g.reveal();assert.equal(g.snapshot().privateHints.b,hintText(bChoice));g.finish();
});
test('提前结束会取消延迟揭晓，迟到计时不会改变最终阶段',async()=>{
 const g=create();await g.next();await g.beginGuess({image,shapes});g.finish();g.publishGuesses();assert.equal(g.phase,'finished');assert.equal(g.players[1].guessScore,3);
});
test('角色区分画画、自信等待、思考和判分后表情',()=>{
 const artist=players[0],guesser=players[1],g={phase:'ready',artistId:'a',players,results:{b:{status:'waiting'}}};
 assert.equal(characterState(g,artist,true),'drawing');g.phase='guessing';g.results.b.status='confident';g.results.b.confidence=90;assert.equal(characterState(g,guesser),'confident');assert.equal(focusedPlayer(g).id,'b');g.results.b.status='thinking';assert.equal(characterState(g,guesser),'thinking');g.results.b.solved=true;assert.equal(characterState(g,guesser),'happy');g.results.b.solved=false;g.results.b.status='wrong';assert.equal(characterState(g,guesser),'sad');
});
test('五个新增官方接入格式包含图片，不把密钥放进消息；千问提供平台默认地址',()=>{
 for(const provider of ['deepseek','grok','kimi','qwen','doubao']){
  const p={provider,model:'vision',apiKey:'private-key',...(provider==='qwen'?{baseUrl:'https://example.aliyuncs.com/compatible-mode/v1'}:{})},r=buildRequest(p,'猜图',image);
  assert(JSON.stringify(r.body).includes(image));assert(!JSON.stringify(r.body).includes('private-key'));assert.equal(r.headers.Authorization,'Bearer private-key');assert(r.url.endsWith(provider==='grok'?'/responses':'/chat/completions'));assert.equal(publicPlayer(p).apiKey,undefined);
 }
 assert.equal(buildRequest({provider:'qwen',model:'qwen3.8-flash'},'hi',image).url,'https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions');
});
test('配置迁移保留已有密钥和自定义角色；删除的旧选手不会被复活',()=>{
 const old={version:1,players:[{id:'custom',name:'我的模型',provider:'compatible',apiKey:'keep-me',characterId:'grok'}]};const migrated=migrateConfig(old);
 assert.equal(migrated.players[0].apiKey,'keep-me');assert.equal(migrated.players[0].characterId,'grok');assert.equal(migrated.players.length,8);assert(!migrated.players.some(p=>p.id==='codex-sol'));
 const removed={...migrated,players:migrated.players.filter(p=>p.id!=='grok')};assert.deepEqual(migrateConfig(removed),removed);
});
