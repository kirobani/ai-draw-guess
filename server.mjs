import http from 'node:http';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,rename,readdir,appendFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Game} from './lib/game.mjs';
import {RelayGame} from './lib/relay.mjs';
import {CATEGORIES,IDIOM_LEVELS,CATEGORY_LEVELS} from './lib/words.mjs';
import {callModel,detectCodex,DEFAULT_PLAYERS,PRESETS,publicPlayer,buildRequest,migrateConfig,getKey} from './lib/providers.mjs';
import {CHARACTERS,CHARACTER_MAP,characterPrompt,resolveCharacter} from './public/characters.mjs';
import {modelCatalog} from './lib/model-catalog.mjs';
import {setSharedOpenRouterKey,hasSharedOpenRouterKey} from './lib/credentials.mjs';
import {checkKey,checkCapabilities} from './lib/model-checks.mjs';
import {modelSource,chosenEffort,validateControls,waitSeconds} from './public/reasoning.mjs';
import {HINT_MODES,normalizeHintMode} from './public/visual-hints.mjs';
import {RecordingStore} from './lib/recording.mjs';
import {productionFiles,characterFiles,zipFiles} from './lib/production-export.mjs';

const ROOT=dirname(fileURLToPath(import.meta.url)),LOCAL=process.env.DRAW_GUESS_DATA_DIR||join(ROOT,'.local');
await mkdir(LOCAL,{recursive:true});
const recordings=new RecordingStore(join(LOCAL,'recordings'));
const avatarAssets={core:existsSync(join(ROOT,'public/vendor/live2dcubismcore.min.js')),models:existsSync(join(ROOT,'public/models/agentkit-expressions-r3/deepseek/deepseek-expressions.model3.json'))};
let config={version:4,players:structuredClone(DEFAULT_PLAYERS)};
try{const x=JSON.parse(await readFile(join(LOCAL,'config.json'),'utf8'));if(Array.isArray(x.players))config=x;}catch{}
config=migrateConfig(config);
try{setSharedOpenRouterKey(JSON.parse(await readFile(join(LOCAL,'credentials.json'),'utf8')).openrouterApiKey);}catch{}
await writeFile(join(LOCAL,'config.json'),JSON.stringify(config,null,2),'utf8');
let codex=await detectCodex();
let modelChecks={};
try{modelChecks=JSON.parse(await readFile(join(LOCAL,'model-checks.json'),'utf8'));}catch{}
let checkWrites=Promise.resolve();
const publicChecks=()=>Object.fromEntries(config.players.map(p=>[p.id,modelChecks[checkKey(p)]||null]));
const sessions=new Map();const PORT=Number(process.env.PORT||3211);let closing=false;
const onDiagnostic=entry=>{appendFile(join(LOCAL,'request-diagnostics.jsonl'),JSON.stringify(entry)+'\n','utf8').catch(()=>{});};
const run=(p,prompt,image,signal,options={})=>callModel(p,characterPrompt(p,prompt),image,signal,codex.path,{...options,onDiagnostic});
const runRelay=(p,prompt,image,signal,options={})=>run(p,prompt,image,signal,{...options,parallel:true});
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function session(req,res){
  const match=(req.headers.cookie||'').match(/(?:^|;\s*)drawguess=([a-f0-9]{48})(?:;|$)/);let id=match?.[1];
  if(!id||!sessions.has(id)){id=randomBytes(24).toString('hex');sessions.set(id,{game:null,last:Date.now()});res.setHeader('Set-Cookie',`drawguess=${id}; HttpOnly; SameSite=Strict; Path=/`);}
  const s=sessions.get(id);s.last=Date.now();return s;
}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>4_000_000)throw new Error('请求太大。');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('请求格式无效。');}}
function launch(g,fn){Promise.resolve().then(fn).catch(e=>{if(!g.aborted){g.notice=e.message;g.touch();}});}
const allowedFiles=new Map([['/','index.html'],...['index.html','app.mjs','relay-view.mjs','relay.css','model-picker.mjs','reasoning.mjs','guess-confidence.mjs','drawing.mjs','visual-hints.mjs','drawing-playback.mjs','characters.mjs','characters.html','characters-review.mjs','style.css','fonts.css','help.html','avatar.html','avatar.css','avatar-preview.mjs','avatar-game.mjs','player-seats.mjs','conversation.mjs','panel-drawer.mjs','seat-presentation.mjs','avatar-state.mjs','avatar-renderer.mjs'].map(f=>['/'+f,f])]);
for(const file of ['production.html','production.css','production.mjs','production-player.mjs','recording-client.mjs','banter-view.mjs'])allowedFiles.set('/'+file,file);
const types={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',png:'image/png',moc3:'application/octet-stream',vert:'text/plain; charset=utf-8',frag:'text/plain; charset=utf-8',ttf:'font/ttf',txt:'text/plain; charset=utf-8'};
// Only explicitly published runtime assets are served; never follow symlinks or expose .local/source files.
async function registerAssets(dir){for(const item of await readdir(join(ROOT,'public',dir),{withFileTypes:true})){const file=dir+'/'+item.name;if(item.isDirectory())await registerAssets(file);else if(item.isFile()&&types[item.name.split('.').pop()])allowedFiles.set('/'+file,file);}}
await registerAssets('vendor');await registerAssets('models');await registerAssets('fonts');
const server=http.createServer(async(req,res)=>{
  try {
    const host=req.headers.host;if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`,`[::1]:${PORT}`].includes(host))return json(res,{error:'只接受本机访问。'},403);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url=new URL(req.url,'http://'+host),path=url.pathname;
    if(req.method==='GET'&&allowedFiles.has(path)){const file=allowedFiles.get(path);res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Cache-Control':'no-cache'});return res.end(await readFile(join(ROOT,'public',file)));}
    if(!path.startsWith('/api/'))return json(res,{error:'未找到。'},404);
    if(req.method==='POST') {
      if(req.headers['x-game-request']!=='1'||!req.headers['content-type']?.includes('application/json'))return json(res,{error:'请求来源无效。'},403);
      if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(res,{error:'不接受跨站请求。'},403);
    }
    const s=session(req,res);
    if(req.method==='GET'&&path==='/api/health')return json(res,{app:'draw-guess-arena',version:'2.9.1',drawingFormatRepair:true,postRoundBanter:true,humanInitiatedBanter:true,characterVoices:1,recordingVersion:2,randomTurnOrder:true,visualHintGuidance:2,lobbyCharacterPreparation:true,categoryDifficulties:true,relayExactPass:true,relayCategoryHints:true,relayShowcase:true,hintModes:HINT_MODES.map(item=>item.id),kitExpressions:9,confidenceExpressions:true,port:PORT,freeHints:true,expandablePanels:true,codexAutoLocate:true,reasoningControls:true,concurrency:12});
    if(req.method==='GET'&&path==='/api/config'){codex=await detectCodex();return json(res,{players:config.players.map(publicPlayer),checks:publicChecks(),avatarAssets,openrouter:{hasKey:hasSharedOpenRouterKey()},presets:PRESETS,characters:CHARACTERS,categories:CATEGORIES,idiomLevels:IDIOM_LEVELS,categoryLevels:CATEGORY_LEVELS,hintModes:HINT_MODES,relayShowcase:true,randomTurnOrder:true,recordingVersion:2,codex:{available:codex.available,loggedIn:codex.loggedIn}});}
    if(req.method==='GET'&&path==='/api/models')return json(res,await modelCatalog());
    if(req.method==='GET'&&path==='/api/state')return json(res,{game:s.game?{...s.game.snapshot(),recordingEnabled:!!s.game.recording,recordingWarning:s.game.recording?.persistenceError||''}:null});
    if(req.method==='GET'&&path==='/api/recordings')return json(res,{recordings:await recordings.list()});
    if(req.method==='GET'&&path==='/api/recording')return json(res,await recordings.get(url.searchParams.get('id')||''));
    if(req.method==='GET'&&['/api/production','/api/characters'].includes(path)){
      const id=url.searchParams.get('id')||s.game?.id;if(!id)throw new Error('先完成一场比赛，再下载素材。');
      const data=await recordings.get(id),files=await (path==='/api/production'?productionFiles:characterFiles)(data,join(ROOT,'public'));
      const zip=zipFiles(files);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="draw-guess-${path==='/api/production'?'production':'characters'}-${id}.zip"`});return res.end(zip);
    }
    if(req.method==='GET'&&path==='/api/export') {
      if(!s.game||s.game.phase!=='finished')throw new Error('先结束比赛，再导出复盘。');
      res.setHeader('Content-Disposition','attachment; filename="draw-guess-replay.json"');
      return json(res,s.game.recording?.export()||{version:1,exportedAt:new Date().toISOString(),...s.game.snapshot()});
    }
    if(req.method!=='POST')return json(res,{error:'未找到。'},404);
    const data=await body(req);
    if(path==='/api/recording-events'){
      if(!s.game?.recording||s.game.id!==data.gameId)throw new Error('素材记录对应的比赛已变更。');
      s.game.recording.client(data.events);return json(res,{ok:true});
    }
    if(path==='/api/shutdown'){json(res,{ok:true});setTimeout(shutdown,100);return;}
    if(path==='/api/openrouter-key'){
      const key=String(data.apiKey||'').trim();
      if(!data.clear&&(!key||key.length>1000))throw new Error('请填写有效的 OpenRouter Key。');
      await writeFile(join(LOCAL,'credentials.tmp'),JSON.stringify({openrouterApiKey:data.clear?'':key}),{encoding:'utf8',mode:0o600});
      await rename(join(LOCAL,'credentials.tmp'),join(LOCAL,'credentials.json'));
      setSharedOpenRouterKey(data.clear?'':key);
      return json(res,{ok:true,hasKey:hasSharedOpenRouterKey(),players:config.players.map(publicPlayer)});
    }
    if(path==='/api/config') {
      if(!Array.isArray(data.players)||data.players.length>12||data.players.length<1)throw new Error('请保留 1–12 位 AI。');
      const catalog=await modelCatalog();
      const ids=new Set();
      const players=data.players.map((p,i)=>{
        if(!/^[a-zA-Z0-9_-]{1,40}$/.test(p.id)||ids.has(p.id)||p.id==='human')throw new Error('选手标识无效。');ids.add(p.id);
        if(!PRESETS[p.provider])throw new Error('接口类型无效。');
        if(typeof p.name!=='string'||!p.name.trim()||p.name.length>40)throw new Error('选手名称须为 1–40 字。');
        if(typeof p.model!=='string'||p.model.length>160||!p.model.trim())throw new Error('请填写模型 ID。');
        const old=config.players.find(x=>x.id===p.id);
        const baseUrl=String(p.baseUrl||'').trim();
        const sameDestination=old?.provider===p.provider&&(old?.baseUrl||'')===baseUrl;
        const item={id:p.id,name:p.name.trim(),provider:p.provider,model:p.model.trim(),baseUrl,enabled:!!p.enabled,color:/^#[a-f0-9]{6}$/i.test(p.color)?p.color:DEFAULT_PLAYERS[i%5].color,apiKey:p.clearKey?'':String(p.apiKey||(sameDestination?old?.apiKey:'')||'').trim()};
        if(p.keySource&&!p.apiKey&&!p.clearKey){
          const destinations={qwen:'https://maas.qianwenaiapi.com/compatible-mode/v1',openrouter:'https://openrouter.ai/api/v1'};
          if(!['compatible','openrouter'].includes(item.provider)||item.baseUrl!==destinations[p.keySource])throw new Error('只能在同一平台的正式接口内复用密钥。');
          const donor=config.players.find(x=>modelSource(x)===p.keySource&&getKey(x));
          if(!donor)throw new Error('本机还没有保存此平台的密钥，请在接入与密钥设置中填写。');
          item.apiKey=getKey(donor);
        }
        if(p.replyMode!==undefined&&!['fast','thinking'].includes(p.replyMode))throw new Error('回复方式无效。');
        item.replyMode=p.replyMode||old?.replyMode||'fast';
        item.reasoningEffort=p.reasoningEffort??old?.reasoningEffort??chosenEffort(item);
        item.timeoutSeconds=p.timeoutSeconds??old?.timeoutSeconds??waitSeconds(item);
        const profile=catalog.models.find(m=>m.source===modelSource(item)&&m.id===item.model);
        validateControls(item,profile);
        if(item.apiKey.length>1000)throw new Error('API Key 过长。');
        if(p.characterId&&!CHARACTER_MAP[p.characterId]&&p.characterId!=='none')throw new Error('角色选择无效。');
        item.characterId=p.characterId||resolveCharacter(item)?.id||'none';
        if(p.provider!=='codex'&&(item.baseUrl||item.enabled||item.apiKey))buildRequest(item,'test',null,profile);
        return item;
      });
      await writeFile(join(LOCAL,'config.tmp'),JSON.stringify({version:4,players},null,2),'utf8');await rename(join(LOCAL,'config.tmp'),join(LOCAL,'config.json'));config={version:4,players};
      return json(res,{ok:true,players:players.map(publicPlayer),checks:publicChecks()});
    }
    if(path==='/api/test'){
      const p=config.players.find(p=>p.id===data.id);if(!p)throw new Error('选手不存在。');
      if(s.testing)throw new Error('连接测试正在进行。');s.testing=true;
      try{
        const image='data:image/png;base64,'+(await readFile(join(ROOT,'lib','vision-check.png'))).toString('base64');
        const result=await checkCapabilities(p,run,image);
        modelChecks[checkKey(p)]=result;
        checkWrites=checkWrites.catch(()=>{}).then(async()=>{await writeFile(join(LOCAL,'model-checks.tmp'),JSON.stringify(modelChecks,null,2),'utf8');await rename(join(LOCAL,'model-checks.tmp'),join(LOCAL,'model-checks.json'));});
        await checkWrites;return json(res,result);
      }finally{s.testing=false;}
    }
    if(path==='/api/start') {
      if(!Array.isArray(data.playerIds)||new Set(data.playerIds).size!==data.playerIds.length)throw new Error('选手列表无效。');
      const players=data.playerIds.map(id=>config.players.find(p=>p.id===id));
      if(players.some(p=>!p))throw new Error('选手不存在。');
      if(![1,2,3,5].includes(data.rounds))throw new Error('每人题数无效。');
      if(!CATEGORIES.some(c=>c.name===data.category))throw new Error('请选择题目分类。');
      if(players.some(p=>p.provider==='codex'))codex=await detectCodex();
      if(players.some(p=>p.provider==='codex')&&!codex.available)throw new Error('本机未找到 Codex，请配置 API 选手。');
      if(!['duel','battle','relay'].includes(data.mode))throw new Error('游戏模式无效。');
      if(data.banter!==undefined&&typeof data.banter!=='boolean')throw new Error('互怼开关无效。');
      const options={players:structuredClone(players),human:data.human!==false,rounds:data.rounds,category:data.category,idiomLevel:data.idiomLevel,wordLevel:data.wordLevel??data.idiomLevel??'easy',hintMode:normalizeHintMode(data.hintMode),mode:data.mode,banter:data.banter!==false};
      const game=data.mode==='relay'?new RelayGame({...options,run:runRelay}):new Game({...options,run});
      s.game?.finish();s.game=game;recordings.attach(game,{secrets:game.players.map(getKey)});launch(game,()=>game.next());return json(res,{ok:true,id:game.id},202);
    }
    if(path==='/api/action') {
      const g=s.game;if(!g||g.id!==data.gameId)throw new Error('比赛已变更，请刷新页面。');
      if(['banter-challenge','banter-reply','banter-retry','banter-skip'].includes(data.action)){
        const b=g.mode==='relay'&&g.showcase?.status==='result'?g.showcase.banter:g.phase==='reveal'?g.banter:null;
        if(!b)throw new Error('当前没有互怼环节。');b.check(data);
        if(data.action==='banter-challenge')b.challenge(data);
        else if(data.action==='banter-reply')b.reply(data);
        else if(data.action==='banter-retry')b.retry(data);
        else b.skip(data);
        return json(res,{ok:true});
      }
      if(g.mode==='relay'){
        switch(data.action){
          case 'relay-show-play':if(!g.showcase)throw new Error('当前没有展示环节。');g.showcase.play(data);break;
          case 'relay-show-pause':if(!g.showcase)throw new Error('当前没有展示环节。');g.showcase.pause(data);break;
          case 'relay-show-step':if(!g.showcase)throw new Error('当前没有展示环节。');g.showcase.nextStep(data);break;
          case 'relay-show-next':if(!g.showcase)throw new Error('当前没有展示环节。');g.showcase.nextChain(data);break;
          case 'relay-vote':if(!g.showcase)throw new Error('当前没有投票环节。');g.showcase.humanVote(data);break;
          case 'relay-reflection':if(!g.showcase)throw new Error('当前没有感言环节。');g.showcase.humanReflection(data);break;
          case 'relay-reflection-retry':if(!g.showcase)throw new Error('当前没有感言环节。');g.showcase.checkReflection(data);launch(g,()=>g.showcase.retryReflections(data));break;
          case 'relay-vote-retry':if(!g.showcase)throw new Error('当前没有投票环节。');g.showcase.checkVote(data);launch(g,()=>g.showcase.retryVotes(data));break;
          case 'relay-vote-abstain':if(!g.showcase)throw new Error('当前没有投票环节。');g.showcase.abstainErrors(data);break;
          case 'relay-submit':await g.submitHuman(data);break;
          case 'relay-retry':g.checkStage(data);launch(g,()=>g.retry(data));break;
          case 'relay-skip-errors':g.skipErrors(data);break;
          case 'finish':g.finish();break;
          case 'home':g.finish();s.game=null;break;
          default:throw new Error('当前接龙不支持此操作。');
        }
        return json(res,{ok:true});
      }
      switch(data.action) {
        case 'draw-done': await g.beginGuess(data);break;
        case 'guess':g.humanGuess(data.guess);break;
        case 'pass':g.humanGuess('',true);break;
        case 'revise':await g.revise();break;
        case 'retry-draw':if(g.phase!=='draw-error')throw new Error('当前不能重试。');await g.drawAI();break;
        case 'retry-guesses':if(g.phase!=='guessing'||!Object.values(g.results).some(r=>r.status==='error'))throw new Error('没有需要重试的选手。');await g.guessAIs(true);break;
        case 'skip-errors':g.skipErrors();break;
        case 'reveal':g.reveal();break;
        case 'next':await g.next();break;
        case 'finish':g.finish();break;
        case 'home':g.finish();s.game=null;break;
        default:throw new Error('未知操作。');
      }
      return json(res,{ok:true});
    }
    return json(res,{error:'未找到。'},404);
  }catch(e){if(!res.headersSent)json(res,{error:e.message||'操作失败，请重试。'},400);else res.end();}
});
server.requestTimeout=240000;
server.listen(PORT,'127.0.0.1',()=>console.log(`你画我猜 AI 大乱斗： http://127.0.0.1:${PORT}\nCodex：${codex.loggedIn?'已登录':codex.available?'已安装，需登录':'未安装，可使用 API'}\n按 Ctrl+C 关闭服务。`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${PORT} 已被占用；如果游戏已启动，请直接打开浏览器。`:e.message);process.exitCode=1;});
function shutdown(){if(closing)return;closing=true;for(const s of sessions.values())s.game?.finish();server.close();recordings.flush().finally(()=>process.exit());setTimeout(()=>process.exit(),10000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
setInterval(()=>{for(const [id,s] of sessions)if(Date.now()-s.last>24*3600e3){s.game?.finish();sessions.delete(id);}},3600000).unref();
