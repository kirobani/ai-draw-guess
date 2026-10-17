import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Game} from '../lib/game.mjs';
import {RelayGame} from '../lib/relay.mjs';
import {MatchRecording,RecordingStore,readJournal} from '../lib/recording.mjs';
import {productionFiles,zipFiles} from '../lib/production-export.mjs';
const players=[{id:'a',name:'DeepSeek',characterId:'deepseek',model:'test/ds',provider:'compatible',apiKey:'DO-NOT-EXPORT-THIS-KEY'},{id:'b',name:'千问',characterId:'qwen',model:'test/qwen'}];
const words=Array.from({length:8},()=>({answer:'西瓜',category:'食物'}));
const shape=x=>({type:'ellipse',x,y:300,rx:100,ry:70,width:5,color:'#202633'});
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);const image='data:image/png;base64,'+bytes.toString('base64');
const basic=opts=>new Game({players,human:false,words,category:'食物',orderRandom:n=>n-1,revealDelay:0,run:async(_p,_prompt,img)=>img?{guess:'西瓜',confidence:88}:{shapes:[shape(200)]},...opts});

test('记录所有改画、提示、提交和揭晓，保持对战公开状态原有保密边界',async()=>{
  let draw=0,guess=0;const g=basic({run:async(_p,_prompt,img)=>img?{guess:++guess<3?'苹果':'西瓜',reason:'右边的果皮',confidence:81,receipt:{requestedModel:'test/qwen',responseModel:'actual/qwen',apiKey:'DO-NOT-EXPORT-THIS-KEY'}}:{shapes:[shape(200+ ++draw*100)],hint:draw>1?'注意右边的外轮廓':'',hints:draw>1?{b:'那不是苹果蒂，看长条纹'}:{}}});
  const journal=[],r=new MatchRecording(g,{write:e=>journal.push(e)});await g.next();
  await g.beginGuess({image});assert.equal(g.phase,'review');assert.deepEqual(g.snapshot().results.b.history,[]);assert(!JSON.stringify(g.snapshot()).includes('recording'));
  await g.revise();await g.beginGuess({image});await g.revise();await g.beginGuess({image});g.finish();
  const out=r.export(),changes=out.recording.events.filter(e=>e.type==='state'&&e.data.drawingId).map(e=>out.recording.assets[e.data.drawingId].shapes[0]?.x).filter(Boolean);
  assert.deepEqual(changes,[300,400,500]);assert.equal(out.history[0].shapes[0].x,500);
  const messages=out.recording.events.filter(e=>e.type==='message').map(e=>e.data);
  assert.equal(messages.filter(m=>m.kind==='guess').length,3);assert(messages.some(m=>m.kind==='hint'&&m.recipientId==='b'));
  assert(out.recording.events.some(e=>e.type==='state'&&e.data.results?.b?.pending?.guess==='苹果'));
  assert(out.recording.events.some(e=>e.type==='state'&&e.data.expressions?.b==='confident'));
  assert(!JSON.stringify(out).includes('DO-NOT-EXPORT'));assert(!JSON.stringify(journal).includes('DO-NOT-EXPORT'));
  assert(out.recording.events.some(e=>e.type==='model-response'&&e.data.receipt.responseModel==='actual/qwen'));
});

test('人类笔迹增量保留撤销、清空与起止时间，重发去重并拒绝越界',async()=>{
  const g=basic({human:true,orderRandom:n=>n-1});let now=Date.now();const r=new MatchRecording(g,{clock:()=>now});await g.next();
  const event=(id,keep,append,operation='stroke')=>({id,at:now+=100,index:0,turn:1,type:'drawing-edit',keep,append,operation,startedAt:now-80});
  const first=event('stroke-1',0,[shape(200)]);r.client([first]);r.client([first]);r.client([event('stroke-2',1,[shape(400)])]);r.client([event('undo',1,[],'undo')]);r.client([event('clear',0,[],'clear')]);
  assert.equal(r.events.filter(e=>e.type==='drawing-edit').length,4);assert.equal(r.clientDrafts.get('0:').length,0);assert.throws(()=>r.client([event('bad',2,[])]));assert.throws(()=>r.client([event('bad-shape',0,[{type:'script'}])]))
  g.finish();
});

test('自动存盘可在新进程恢复，未结束比赛禁止导出；尾行损坏保留已完成部分',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'draw-guess-record-')),store=new RecordingStore(dir),g=basic();store.attach(g);await g.next();await assert.rejects(store.get(g.id),/先结束/);assert.equal((await store.list()).length,0);
  await g.beginGuess({image});g.finish();await store.flush();const reloaded=new RecordingStore(dir),out=await reloaded.get(g.id);assert.equal(out.recording.status,'finished');assert.equal(out.history[0].answer,'西瓜');assert.equal((await reloaded.list()).length,1);
  const raw=await readFile(join(dir,g.id+'.jsonl'),'utf8'),partial=readJournal(raw+'{"type":');assert(partial.recording.warning);assert.equal(partial.recording.events.length,out.recording.events.length);await assert.rejects(store.get('../config'),/编号/);
});

test('接龙各棒矢量图、猜词、投票及感言均记录，重建不依赖 PNG 缓存',async()=>{
  const g=new RelayGame({players,human:false,words,category:'食物',passDelay:60_000,renderDrawing:async()=>image,run:async(_p,prompt,img)=>prompt.includes('"pass"')?{pass:true,reason:'DeepSeek，这图还能认出来！'}:prompt.includes('"reflection"')?{reflection:'千问，这回真接住了！'}:img?{guess:'西瓜',reason:'圆瓜皮',confidence:99}:{shapes:[shape(400)]}});
  const r=new MatchRecording(g);await g.next();g.advance();await g.workTask;g.advance();assert.equal(g.phase,'finished');const show=g.showcase;
  show.play({chainId:show.chain.id});show.nextStep({chainId:show.chain.id,stepIndex:0});show.nextStep({chainId:show.chain.id,stepIndex:1});await show.voteTask;
  const out=r.export();assert(out.recording.events.some(e=>e.type==='state'&&e.data.chains?.some(c=>c.steps.some(s=>s?.drawingId))));assert(out.recording.events.some(e=>e.type==='message'&&e.data.kind==='relay-reflection'));assert(out.recording.events.some(e=>e.type==='state'&&e.data.relay?.showcase?.ballots.some(b=>b.verdict?.automatic)));
  assert(!JSON.stringify(out.recording).includes('data:image/png'));show.dispose();
});

test('素材 ZIP 含矢量原图、字幕、离线播放器；恶意文本不能逃出嵌入 JSON',async()=>{
  const g=basic(),r=new MatchRecording(g);await g.next();await g.beginGuess({image});g.addMessage('xss',{kind:'hint',text:'</script><script>alert(1)</script>',playerId:'a'});g.finish();
  const files=await productionFiles(r.export(),fileURLToPath(new URL('../public/',import.meta.url))),map=new Map(files);
  assert(map.has('replay.json'));assert(files.some(([name])=>name.endsWith('.svg')));assert(map.has('字幕/b.srt'));assert(map.get('时间线.csv').includes('猜词轮次'));
  const html=map.get('离线回放.html');assert(!html.includes('</script><script>alert(1)'));const embedded=html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(embedded).conversation.find(m=>m.id==='xss').text,'</script><script>alert(1)</script>');
  const zip=zipFiles(files);assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);assert.equal(zip.readUInt16LE(zip.length-14),files.length);
});

test('外部提供的密钥也会从头信息、模型回执和导出字段中清除',async()=>{
  const secret='ENVIRONMENT-ONLY-SECRET',g=basic({players:players.map(p=>({...p,name:p.name+secret,reasoningEffort:'high',replyMode:'thinking'}))});
  const journal=[],r=new MatchRecording(g,{secrets:[secret],write:e=>journal.push(e)});await g.next();g.finish();const out=r.export();
  assert(!JSON.stringify(out).includes(secret));assert(!JSON.stringify(journal).includes(secret));assert.equal(out.recording.players[0].reasoningEffort,'high');assert.equal(out.recording.players[0].provider,'compatible');
});

test('接龙不通过后每个人的归责对象和理由也进入持久记录',async()=>{
  const g=new RelayGame({players,human:false,words,category:'食物',passDelay:60_000,renderDrawing:async()=>image,run:async(_p,prompt,img)=>prompt.includes('"targetId"')?{targetId:'a',reason:'DeepSeek，你把瓜画成气球了！'}:prompt.includes('"pass"')?{pass:false,reason:'千问，这已经猜成气球了！'}:img?{guess:'气球',reason:'看到了线',confidence:51}:{shapes:[shape(400)]}});
  const r=new MatchRecording(g);await g.next();g.advance();await g.workTask;g.advance();const show=g.showcase;
  show.play({chainId:show.chain.id});show.nextStep({chainId:show.chain.id,stepIndex:0});show.nextStep({chainId:show.chain.id,stepIndex:1});await show.voteTask;
  assert.equal(show.status,'culprit-vote');await show.voteTask;
  const last=r.export().recording.events.filter(e=>e.type==='state'&&e.data.relay?.showcase).at(-1).data.relay.showcase.ballots[0];
  assert.equal(last.verdict.passed,false);assert.equal(last.culpritVotes.b.targetId,'a');assert.match(last.culpritVotes.b.reason,/DeepSeek/);assert(last.culprits.winners.includes('a'));show.dispose();
});
