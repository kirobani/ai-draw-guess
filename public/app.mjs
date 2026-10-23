import {createPanelDrawer} from './panel-drawer.mjs';
import {chosenEffort,waitSeconds} from './reasoning.mjs';
import {hintControl,visualHint,HINT_MODES,hintModeInfo} from './visual-hints.mjs';
import {updateArenaLayout} from './seat-presentation.mjs';
import {W,H,paint,png,drawShape,DrawingHistory} from './drawing.mjs';
import {createCompanion} from './avatar-game.mjs';
import {createPlayerSeats} from './player-seats.mjs';
import {createConversation,recapMarkup} from './conversation.mjs';
import {drawingTransition,playbackFactor,strokeDuration,animateProgress,partialStroke} from './drawing-playback.mjs';
import {CHARACTERS,CHARACTER_MAP,playerLabel,playerModelLabel} from './characters.mjs';
import {mountModelPicker,sameSetup,connectionIssue} from './model-picker.mjs';
import {relayActionMarkup,relayStageMarkup,renderRelayResults} from './relay-view.mjs';
import {createRelayShowcase} from './relay-view.mjs';
import {banterMarkup,banterPending,bindBanterControls,captureBanterDraft,restoreBanterDraft} from './banter-view.mjs';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config=null,game=null,mode='battle',human=true,category='成语',idiomLevel='easy',rounds=1,selected=new Set(),localShapes=[],color='#202633',erasing=false,currentStroke=null;
let canvasKey='',actionKey='',resultKey='',animation=0,animating=false,inFlight=0,autoSent='',toastTimer,polling=false,online=true;
let modelCatalog=null,actionDraftScope='',hintMode='visual';
let productionTrace=null;
try{const saved=localStorage.getItem('drawguess.hintMode');if(HINT_MODES.some(item=>item.id===saved))hintMode=saved;}catch{}
const lobbyIntro={heading:document.querySelector('.intro h1').innerHTML,text:document.querySelector('.intro-text').innerHTML,note:document.querySelector('.rule-note').innerHTML};
const canvas=$('canvas');
const drawingHistory=new DrawingHistory();
const companion=createCompanion();
const preparation=document.createElement('div');preparation.className='lobby-preparation';preparation.innerHTML='<span id="characterPreparation" role="status" aria-live="polite"></span><button class="quiet" id="retryCharacterPreparation" hidden>重试未加载角色</button>';document.querySelector('.setup-panel').append(preparation);
const playerSeats=createPlayerSeats($('guessers'),{onPreparation:({total,ready,failed})=>{
  $('characterPreparation').textContent=!total?'选择 AI 后会提前准备角色。':ready===total?`参赛角色已就绪 ${ready} / ${total} · 进场直接显示`:`正在准备参赛角色 ${ready} / ${total}${failed?` · ${failed} 位未加载成功`:''} · 可以继续选择比赛`;
  preparation.dataset.ready=String(total>0&&ready===total);$('retryCharacterPreparation').hidden=!failed;
}});
$('retryCharacterPreparation').onclick=()=>playerSeats.retryPrepared();
const conversation=createConversation($('conversationPanel'));
bindBanterControls($('actionPanel'),act);bindBanterControls($('results'),act);
document.querySelector('.final-setup').insertAdjacentHTML('beforebegin','<div class="setup-row banter-setting"><span class="row-label">赛后互动</span><div><label class="check"><input type="checkbox" id="banterEnabled" checked> 开启自动互怼</label><p class="hint-mode-help">答案或本链接龙投票揭晓后，随机点名互怼，最多两组。你也可以主动选择 AI 开麦，对方必须接话；关闭自动互怼仍可主动点名。</p></div></div>');
try{$('banterEnabled').checked=localStorage.getItem('drawguess.banter')!=='false';}catch{}
$('banterEnabled').onchange=()=>{try{localStorage.setItem('drawguess.banter',String($('banterEnabled').checked));}catch{}};
const banterFilter=document.createElement('option');banterFilter.value='banter';banterFilter.textContent='互怼与回应';$('conversationPanel').querySelector('select').append(banterFilter);
const panelDrawer=createPanelDrawer(); 
const relayShowcase=createRelayShowcase($('results'),act);
const productionLink=document.createElement('a');productionLink.href='/production.html';productionLink.target='_blank';productionLink.rel='noopener';productionLink.textContent='视频素材';productionLink.hidden=true;document.querySelector('.topbar nav').prepend(productionLink);
const recordingStatus=document.createElement('span');recordingStatus.className='muted';recordingStatus.setAttribute('role','status');recordingStatus.hidden=true;document.querySelector('.game-controls').prepend(recordingStatus);
const syncAudioButton=document.createElement('button');syncAudioButton.className='quiet';syncAudioButton.textContent='录音对时';syncAudioButton.hidden=true;document.querySelector('.game-controls').append(syncAudioButton);
syncAudioButton.onclick=async()=>{try{const ac=new AudioContext();await ac.resume();const oscillator=ac.createOscillator(),gain=ac.createGain();oscillator.frequency.value=880;gain.gain.value=.15;oscillator.connect(gain);gain.connect(ac.destination);oscillator.start();oscillator.stop(ac.currentTime+.16);oscillator.onended=()=>ac.close();productionTrace?.emit('presentation',{action:'sync-audio'});await productionTrace?.flush();toast('已发出对时音，并在素材时间线留下标记。');}catch{toast('浏览器未能播放对时音，请允许播放声音后重试。');}};
function recordingLinks(){if(!game?.recordingEnabled||$('results').querySelector('[data-production-links]'))return;const row=document.createElement('div');row.className='result-actions';row.dataset.productionLinks='true';row.innerHTML='<a class="quiet download-link" href="/api/production" download>下载视频素材包</a><a class="quiet download-link" href="/production.html?current=1" target="_blank" rel="noopener">大画布回放</a><span class="muted">本局素材自动保存在本机</span>';$('results').prepend(row);}
$('pauseSeats').onclick=()=>{const button=$('pauseSeats'),paused=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'继续动作':'暂停动作';playerSeats.setPaused(paused);};
async function api(path,data) {
  let r;try{r=await fetch(path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Game-Request':'1'},body:JSON.stringify(data)});}catch{throw new Error('连接不到本地游戏服务，请重新双击启动游戏。');}
  const j=await r.json();if(!r.ok)throw new Error(j.error||'操作失败。');return j;
}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function confirmAction(title,text,yes='确定'){return new Promise(resolve=>{$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmYes').textContent=yes;const d=$('confirmDialog');const close=value=>{d.close();resolve(value);};$('confirmYes').onclick=()=>close(true);$('confirmCancel').onclick=()=>close(false);d.oncancel=()=>resolve(false);d.showModal();});}

async function loadConfig(init=false){config=await api('/api/config');productionLink.hidden=config.recordingVersion!==2;if(config.recordingVersion===2&&!productionTrace){const {createRecordingClient}=await import('./recording-client.mjs');productionTrace=createRecordingClient({getGame:()=>game,send:api,onError:toast});}if(init)selected=new Set(config.players.filter(p=>p.enabled).map(p=>p.id));else selected=new Set([...selected].filter(id=>config.players.some(p=>p.id===id)));renderLobby();}
function renderLobby(){
  $('players').innerHTML=`<button class="chip human ${human?'selected':''}" data-human="1" aria-pressed="${human}">✦ 你 <small>人类</small></button>`+config.players.map(p=>`<button class="chip ${selected.has(p.id)?'selected':''} ${(p.provider!=='codex'&&!p.hasKey&&p.provider!=='compatible')?'unavailable':''}" data-player="${esc(p.id)}" aria-pressed="${selected.has(p.id)}" title="${esc(playerLabel(p))}" style="--p-color:${esc(p.color)}"><span class="chip-dot"></span>${esc(p.name)}<small class="chip-model">${esc(playerModelLabel(p))}</small><small>${p.provider==='codex'?'命令行':p.hasKey?'API':'待配置'}</small></button>`).join('');
  const levels=config.categoryLevels?.[category]||(category==='成语'?config.idiomLevels:[]),level=levels.find(item=>item.id===idiomLevel)||levels[0];
  $('categories').innerHTML=config.categories.map(c=>{const count=(config.categoryLevels?.[c.name]||(c.name==='成语'?config.idiomLevels:[])).find(l=>l.id===idiomLevel)?.count??c.count;return `<button class="chip ${category===c.name?'selected':''}" data-category="${esc(c.name)}" aria-pressed="${category===c.name}">${esc(c.name)} <small>${count.toLocaleString('zh-CN')}</small></button>`;}).join('');
  $('idiomLevelRow').hidden=!levels.length;
  $('idiomLevelRow').querySelector('.row-label').textContent='题库难度';
  $('idiomLevels').setAttribute('aria-label',category+'难度');
  $('idiomLevels').innerHTML=levels.map(item=>`<button class="chip ${item.id===idiomLevel?'selected':''}" data-idiom-level="${item.id}" aria-pressed="${item.id===idiomLevel}">${item.name} <small>${item.count.toLocaleString('zh-CN')} 题</small></button>`).join('');
  $('idiomLevelHelp').textContent=level?.description||'';
  $('hintModeRow').hidden=mode==='relay';
  $('hintModes').innerHTML=HINT_MODES.map(item=>`<button class="chip ${item.id===hintMode?'selected':''}" data-hint-mode="${item.id}" aria-pressed="${item.id===hintMode}">${item.label}</button>`).join('');
  $('hintModeHelp').textContent=hintModeInfo(hintMode).description;
  const count=selected.size+(human?1:0),relay=mode==='relay';$('matchInfo').textContent=relay?`${count} 条链 · ${count} 棒 · 每人 ${count} 次接力${!human?' · 观战模式':''}`:`${count} 位选手 · 共 ${count*rounds} 题${!human?' · 观战模式':''}`;
  $('roundOptions').hidden=relay;$('relaySetupNote').hidden=!relay;$('relaySetupNote').textContent=`每人一个起始题目，同时传递。每位 AI 完成 ${count} 棒，共约 ${selected.size*count} 次画猜调用。揭晓后，每链每位 AI 投一次通过票；没通过再投一次最大害群之马。`;
  document.querySelector('.final-setup .row-label').textContent=relay?'接龙配置':'每人画几幅';$('startButton').innerHTML=relay?'开始传画接龙 <span aria-hidden="true">↝</span>':'开始比赛 <span aria-hidden="true">✦</span>';
  document.querySelector('.intro h1').innerHTML=relay?'传一幅<span class="pink">画</span>，<br>歪出一个新<span class="pink">故事</span>。':lobbyIntro.heading;
  document.querySelector('.intro-text').innerHTML=relay?'你画我猜，猜完再画。每个人只看上一棒，<br>等所有链条走完，再一起拆开看。':lobbyIntro.text;
  document.querySelector('.rule-note').innerHTML=relay?'<span class="note-tape"></span><strong>传画接龙小抄</strong><p><b>同时行动</b> · 全员画图 / 全员猜词交替</p><p><b>统一传递</b> · 全部交卷才进入下一棒</p><p><b>随机均衡</b> · 每条链都经过每人一次</p><p><b>最后揭晓</b> · 逐棒播放，全员投票</p>':lobbyIntro.note;
  $('assetSetupNotice').hidden=!!(config.avatarAssets?.core&&config.avatarAssets?.models);
  $('connectionInfo').textContent=config.players.some(p=>p.hasKey)?'模型接口已配置，可在 AI 设置选择型号并验证。':'先在「AI 设置」填写统一 OpenRouter Key，再开始比赛。';
  document.querySelectorAll('[data-mode]').forEach(e=>{e.classList.toggle('selected',e.dataset.mode===mode);e.setAttribute('aria-pressed',e.dataset.mode===mode);});
  document.querySelectorAll('[data-rounds]').forEach(e=>{e.classList.toggle('selected',+e.dataset.rounds===rounds);e.setAttribute('aria-pressed',+e.dataset.rounds===rounds);});
  playerSeats.prepare(config.players.filter(p=>selected.has(p.id)));
  if(mode==='battle'&&config.randomTurnOrder)$('matchInfo').textContent+=' · 每局随机出场';
}
$('players').onclick=e=>{const h=e.target.closest('[data-human]'),p=e.target.closest('[data-player]');if(h){if(mode==='duel')return toast('单人模式需要你参加。');human=!human;}if(p){const id=p.dataset.player;if(mode==='duel')selected=new Set([id]);else selected.has(id)?selected.delete(id):selected.add(id);}renderLobby();};
$('categories').onclick=e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;renderLobby();}};
$('idiomLevels').onclick=e=>{const b=e.target.closest('[data-idiom-level]');if(b){idiomLevel=b.dataset.idiomLevel;renderLobby();$('idiomLevels').querySelector(`[data-idiom-level="${idiomLevel}"]`).focus();}};
$('hintModes').onclick=e=>{const b=e.target.closest('[data-hint-mode]');if(!b)return;hintMode=b.dataset.hintMode;try{localStorage.setItem('drawguess.hintMode',hintMode);}catch{}renderLobby();$('hintModes').querySelector('[data-hint-mode="'+hintMode+'"]').focus();};
$('roundOptions').onclick=e=>{const b=e.target.closest('[data-rounds]');if(b){rounds=+b.dataset.rounds;renderLobby();}};
document.querySelector('.mode-tabs').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;mode=b.dataset.mode;if(mode==='duel'){human=true;selected=new Set([[...selected][0]||config.players[0].id]);}renderLobby();};
$('startButton').onclick=async()=>{
  if(mode==='relay'&&!config.relayShowcase)return toast('接龙展示与投票尚未在服务端生效，请先关闭并重新启动游戏，再刷新页面。');
  if(mode!=='relay'&&!config.hintModes?.some(item=>item.id===hintMode))return toast('提示方式尚未在服务端生效，请先关闭并重新启动游戏，再刷新页面。');
  const count=selected.size+(human?1:0);if(count<2||!selected.size)return toast('请至少选择一位 AI，并确保共有两位选手。');
  const missing=config.players.filter(p=>selected.has(p.id)&&p.provider!=='codex'&&p.provider!=='compatible'&&!p.hasKey);
  if(missing.length){toast(`${missing.map(p=>p.name).join('、')} 尚未填写 API Key。`);openSettings();return;}
  $('startButton').disabled=true;
  try{await api('/api/start',{playerIds:[...selected],human,mode,category,idiomLevel,wordLevel:idiomLevel,hintMode,banter:$('banterEnabled').checked,rounds:mode==='relay'?1:rounds});resetView();await poll();}catch(e){toast(e.message);}finally{$('startButton').disabled=false;}
};
function resetView(){canvasKey='';actionKey='';resultKey='';autoSent='';localShapes=[];drawingHistory.reset();currentStroke=null;animation++;animating=false;window.scrollTo({top:0,behavior:'instant'});}
async function act(action,extra={}){
  const id=game?.id;if(!id)return;
  inFlight++;
  try{await productionTrace?.flush();await api('/api/action',{gameId:id,action,...extra});await poll();return true;}
  catch(e){toast(e.message);autoSent='';actionKey='';if(game&&game.phase!=='finished')renderAction();return false;}
  finally{inFlight--;maybeAuto();}
}
async function poll(){
  if(polling)return;polling=true;
  try{const data=await api('/api/state');online=true;if(data.game?.mode==='relay'&&game?.id!==data.game.id){mode='relay';human=data.game.players.some(p=>p.human);selected=new Set(data.game.players.filter(p=>!p.human).map(p=>p.id));category=data.game.category;idiomLevel=data.game.wordLevel||data.game.idiomLevel||idiomLevel;renderLobby();}game=data.game;render();}catch(e){if(online)toast(e.message);online=false;}finally{polling=false;}
}
function render(){
  recordingStatus.hidden=!game?.recordingEnabled;syncAudioButton.hidden=!game?.recordingEnabled||game.phase==='finished';recordingStatus.textContent=game?.recordingWarning||'视频素材自动记录中';
  document.body.classList.toggle('relay-showing',!!game?.relay?.showcase&&game.relay.showcase.status!=='complete');
  $('lobby').hidden=!!game;$('game').hidden=!game||game.phase==='finished';$('results').hidden=!game||game.phase!=='finished';
  const relay=game?.mode==='relay';$('game').classList.toggle('relay-arena',relay);$('relayStageBar').hidden=!relay||game?.phase==='finished';$('autoContinue').closest('label').hidden=relay;document.querySelector('.playback-speed').hidden=relay;
  companion.update(game,animating);playerSeats.update(game,animating);
  panelDrawer.update(game);
  updateArenaLayout(game);
  conversation.update(game);
  if(!game||game.phase!=='finished')relayShowcase.stop();
  if(!game)return;if(game.phase==='finished'){renderResults();recordingLinks();return;}if(relay){renderRelay();return;}const g=game;
  $('roundLabel').textContent=`第 ${g.index+1} / ${g.total} 题 · 画手：${g.artistName||'准备中'} · ${g.category}${(g.wordLevelName||g.idiomLevelName)?' / '+(g.wordLevelName||g.idiomLevelName):''} · ${g.length} 个字 · ${hintModeInfo(g.hintMode).name}`;
  $('wordLabel').textContent=g.answer||'？'.repeat(Math.min(g.length||4,10));
  const key=`${g.id}-${g.index}-${g.revision}`;
  if(canvasKey!==key){const previous=canvasKey.startsWith(`${g.id}-${g.index}-`)?localShapes:[];canvasKey=key;localShapes=structuredClone(g.shapes);drawingHistory.reset();currentStroke=null;animation++;animating=false;$('playbackControls').hidden=true;if(g.artistHuman&&g.phase==='drawing')productionTrace?.sync(localShapes);if(g.shapes.length&&!g.artistHuman&&g.phase==='ready')animateDrawing(g.shapes,previous);else paint(canvas,localShapes);}
  const drawable=g.artistHuman&&g.phase==='drawing';$('toolbar').hidden=!drawable;canvas.parentElement.classList.toggle('drawable',drawable);
  $('canvasCaption').textContent=drawable?'你的画布 · 1000 × 650':g.shapes.length?`${g.artistName} 的画布`:'';
  const status=$('canvasStatus');status.hidden=g.phase!=='drawing-ai';
  if(g.phase==='drawing-ai')status.innerHTML=`<div class="spinner"></div><span>${esc(g.artistName)} 正在${g.turn>1?'改画':'构思'}…</span><small>模型响应后，会逐笔画出来</small>`;
  $('underCanvas').textContent=g.myHint?`只给你的提示：${g.myHint}${g.hint?' · 公开提示：'+g.hint:''}`:g.hint?`画手公开提示：${g.hint}`:drawable?'画图表达题目，不要写答案。支持鼠标和触屏，Ctrl+Z 撤销。':g.phase==='ready'||g.phase==='guessing'?'所有猜手看到的都是这一张画布。':'';
  renderAction();renderGuessers();maybeAuto();
}
function renderRelay(){
  const g=game,task=g.relay.myTask,drawable=canDraw();
  $('roundLabel').textContent=`传画接龙 · 第 ${g.index+1} / ${g.total} 棒 · ${g.category}${(g.wordLevelName||g.idiomLevelName)?' / '+(g.wordLevelName||g.idiomLevelName):''}`;
  $('wordLabel').textContent=task?.input?(task.kind==='draw'?task.input.text:'这幅画，像什么？'):g.relay.kind==='draw'?'所有人一起画图':'所有人一起猜词';
  $('relayStageBar').innerHTML=relayStageMarkup(g);
  const key=`relay-${g.id}-${g.index}-${task?.chainId||'spectator'}`;
  if(canvasKey!==key){canvasKey=key;localShapes=structuredClone(task?.kind==='guess'?task.input?.shapes||[]:task?.submitted?.shapes||[]);drawingHistory.reset();currentStroke=null;animation++;animating=false;paint(canvas,localShapes);if(drawable)productionTrace?.sync(localShapes);window.scrollTo({top:0,behavior:'instant'});}
  $('playbackControls').hidden=true;$('toolbar').hidden=!drawable;canvas.parentElement.classList.toggle('drawable',drawable);
  $('canvasCaption').textContent=task?.kind==='guess'&&task.input?`${task.fromName||'上一位'} 传来的画`:task?.kind==='draw'?'你的独立画布 · 只有交卷后才会传出去':'';
  const status=$('canvasStatus');status.hidden=!!task?.input;
  if(!status.hidden)status.innerHTML=!task?'<span class="relay-spectator-icon">✉</span><span>大家正在各自完成这一棒</span><small>只显示进度，所有作品在结束后展开</small>':'<span>这一棒没有收到内容</span><small>本链留空，等待大家交卷</small>';
  $('underCanvas').textContent=task?.kind==='draw'?(g.index===0?'这是你的起始题目，其他人看不到。':'只根据上一棒的词语画图，前面的历史暂时保密。'):task?.kind==='guess'?(g.category==='成语'?'只根据眼前的画猜一个四字成语，猜偏了也会照样传递。':'只根据眼前这幅画写一个词或短句，猜偏了也会照样传递。'):'随机均衡队列 · 每条链都经过所有人一次';
  $('guessProgress').textContent=`${g.relay.done} / ${g.players.length} 已交卷`;
  $('privacyNote').textContent='别人的题目、画作和猜词会在接龙结束后一起公开。';
  renderRelayAction();playerSeats.update(g,false);
}
function renderRelayAction(){
  const g=game,task=g.relay.myTask,key=JSON.stringify(['relay',g.id,g.index,g.phase,task?.status,Object.values(g.results).filter(r=>r.status==='error').length]);if(actionKey===key)return;actionKey=key;
  const previous=$('relayGuessInput'),draft=previous?.value||'',focused=previous&&document.activeElement===previous;
  $('actionPanel').innerHTML=relayActionMarkup(g);
  const form=$('relayGuessForm');if(form){const input=$('relayGuessInput');input.value=draft;if(focused)input.focus();form.onsubmit=e=>{e.preventDefault();const guess=input.value.trim();if(!guess)return;form.querySelector('button').disabled=true;act('relay-submit',{stage:g.index,chainId:task.chainId,guess});};}
}
async function animateDrawing(shapes,previous=[]){
  productionTrace?.emit('drawing-playback',{action:'start',revision:game.revision,speed:$('playbackSpeed').value});
  const token=++animation,plan=drawingTransition(previous,shapes),shown=previous.slice();animating=true;companion.update(game,true);playerSeats.update(game,true);$('playbackControls').hidden=false;
  const speed=()=>playbackFactor($('playbackSpeed').value);
  paint(canvas,shown);
  for(let i=0;i<plan.remove;i++){
    if(token!==animation)return;shown.pop();paint(canvas,shown);$('playbackStatus').textContent=`撤回 ${i+1} / ${plan.remove} 笔，保留其余画面`;
    await new Promise(r=>setTimeout(r,220*speed()));
  }
  for(let i=0;i<plan.append.length;i++){
    if(token!==animation)return;const shape=plan.append[i];$('playbackStatus').textContent=`${previous.length?'补画':'落笔'} ${i+1} / ${plan.append.length}`;
    const duration=strokeDuration(shape,$('playbackSpeed').value);
    productionTrace?.emit('drawing-playback',{action:'stroke',revision:game.revision,shapeIndex:plan.keep+i,duration,speed:$('playbackSpeed').value});
    const completed=await animateProgress(duration,{isActive:()=>token===animation,draw:progress=>paint(canvas,[...shown,partialStroke(shape,progress)])});
    if(!completed)return;
    shown.push(shape);
  }
  if(token!==animation)return;paint(canvas,shapes);animating=false;companion.update(game,false);playerSeats.update(game,false);$('playbackControls').hidden=true;productionTrace?.emit('drawing-playback',{action:'end',revision:game.revision});maybeAuto();
}
$('finishDrawingButton').onclick=()=>{productionTrace?.emit('drawing-playback',{action:'skip',revision:game.revision});animation++;animating=false;paint(canvas,localShapes);$('playbackControls').hidden=true;playerSeats.update(game,false);maybeAuto();};
$('playbackSpeed').addEventListener('change',()=>productionTrace?.emit('drawing-playback',{action:'speed',speed:$('playbackSpeed').value}));
$('pauseSeats').addEventListener('click',()=>productionTrace?.emit('presentation',{action:$('pauseSeats').getAttribute('aria-pressed')==='true'?'pause-characters':'resume-characters'}));
function maybeAuto(){if(game?.phase!=='ready'||game.artistHuman||!$('autoContinue').checked||animating||inFlight)return;const key=`${game.id}-${game.index}-${game.turn}`;if(autoSent===key)return;autoSent=key;submitCanvas();}
$('autoContinue').onchange=maybeAuto;
function readHintChoice(row){const text=row.querySelector('[data-hint-text]');if(text)return text.value.trim()||null;const focus=row.querySelector('[data-hint-focus]').value;return focus?{region:row.querySelector('[data-hint-region]').value,focus}:null;}
$('actionPanel').addEventListener('change',e=>{const row=e.target.closest('[data-hint-recipient]'),preview=row?.querySelector('[data-hint-preview]');if(!preview)return;try{preview.textContent=visualHint(readHintChoice(row),localShapes,game.hintMode).text||'不发送提示';}catch(error){preview.textContent=error.message;}});
function submitCanvas(){if(currentStroke||inFlight||animating)return;const shapes=localShapes;if(!shapes.length)return toast('先在画布上画几笔。');const hints={};let hint=null;try{for(const row of document.querySelectorAll('[data-hint-recipient]')){const choice=readHintChoice(row);visualHint(choice,shapes,game.hintMode);if(row.dataset.hintRecipient==='$public')hint=choice;else hints[row.dataset.hintRecipient]=choice;}}catch(e){return toast(e.message);}act('draw-done',{image:png(shapes),shapes,hint,hints});}
function renderAction(){
  if(game?.mode==='relay'){renderRelayAction();return;}
  const g=game,hr=g.results.human,errors=Object.values(g.results).filter(r=>r.status==='error');
  const key=JSON.stringify([g.index,g.phase,g.turn,hr?.status,g.notice,errors.length,g.recap,g.hintMode,g.banter]);if(key===actionKey)return;actionKey=key;
  let html='';
  const currentHintMode=g.hintMode||'visual',hintRule=currentHintMode==='preset'?'选择画面区域和观察重点，生成固定提示；画里没有的内容请先补画。':'自由提醒画里的具体内容，或纠正误读；别写词语或成语的释义。';
  if(g.phase==='drawing')html=`<h3>轮到你画了 ✎</h3><p>用画笔表达「${esc(g.answer)}」。其他选手看不到题目。</p>${currentHintMode==='none'?'<p class="hint-rule">本局禁止任何提示，只能通过补画帮助猜题。</p>':g.turn>1?`<p class="hint-rule">${hintRule}</p>${hintControl('公开提示','$public',g.hintChoice,currentHintMode)}<details class="private-hints"><summary>单独提示未猜中的选手</summary>${g.players.filter(p=>g.results[p.id]&&!g.results[p.id].solved).map(p=>hintControl('只给 '+p.name,p.id,g.privateHintChoices?.[p.id],currentHintMode)).join('')}</details>`:''}<button class="primary" data-action="submit">${g.turn>1?'改好了，再猜一轮':'画好了，开始猜'}</button>`;
  if(g.phase==='drawing-ai')html=`<h3>画手正在${g.turn>1?'改画':'构思'}</h3><p>${esc(g.artistName)} 正在生成第 ${g.turn} 版画面。通常需要十几秒到一分钟。</p><div class="button-row"><button data-action="reveal-confirm">跳过本题</button></div>`;
  if(g.phase==='ready')html=`<h3>画好了，轮到大家猜</h3><p>第 ${g.turn} / 3 次机会 · 本次猜中得 ${4-g.turn} 分</p><button class="primary" data-action="submit">开始猜画</button>`;
  if(g.phase==='guessing') {
    const humanWaiting=hr&&!hr.solved&&hr.status==='waiting';
    html=`<h3>第 ${g.turn} / 3 轮猜题</h3><p>${humanWaiting?'你有一次机会，想好了再提交。':hr?.solved?'你已猜中，等其他选手完成。':'大家正在独立看图猜答案。'}</p>`;
    if(humanWaiting)html+='<form id="guessForm" class="guess-form"><input id="guessInput" maxlength="80" placeholder="输入你的答案" aria-label="你的答案" autocomplete="off"><button type="submit">猜</button></form><div class="button-row"><button data-action="pass">跳过这次</button></div>';
    else if(hr?.status==='confident')html+='<p class="confident-note">✦ 答案已锁定，等大家交卷后统一揭晓。</p>';
    else if(hr?.status==='submitted')html+='<p>本次已跳过，等待其他人。</p>';
    else if(hr?.status==='wrong')html+='<p>这次没猜中，等大家完成后可以看画手改画。</p>';
    if(errors.length)html+='<p class="error-message">有选手连接失败。本次机会尚未扣除。</p><div class="button-row"><button data-action="retry-guesses">重试失败选手</button><button data-action="skip-errors">跳过失败选手</button></div>';
  }
  if(g.phase==='locked')html='<h3>答案已锁定 · 等待揭晓</h3><p>大家都交卷了，似乎都觉得自己稳了…</p><p class="confident-note">✦ 马上公布本轮结果</p>';
  if(g.phase==='review')html=`<h3>还有人没猜中</h3><p>第 ${g.turn} 轮结束。${currentHintMode==='none'?'本局禁止提示，画手只能补画，再让大家猜一次。':currentHintMode==='preset'?'画手可补画，并选择画面区域和观察重点给出固定提示。':g.artistHuman?'可以补画、指出画里的具体内容，或纠正选手的误读。':'让画手参考大家的误读补画，并给出读图提醒。'}</p><button class="primary" data-action="revise">${g.artistHuman?'继续画，再试一次':'让 AI 改画，再猜一次'}</button><div class="button-row"><button data-action="reveal-confirm">公布答案</button></div>`;
  if(g.phase==='draw-error')html=`<h3>${g.drawErrorKind==='format'?'画手返回的笔画格式有误':'画手暂时未能完成作画'}</h3><p class="error-message">${esc(g.notice)}</p>${g.shapes?.length?'<p>上一版画面已保留，重试不会扣除猜题机会。</p>':''}<button class="primary" data-action="retry-draw">${g.turn>1?'重试改画':'重试画图'}</button><div class="button-row"><button data-action="reveal-confirm">跳过本题</button>${g.drawErrorKind==='format'?'':'<button data-action="settings">检查 AI 设置</button>'}</div>`;
  if(g.phase==='reveal') {const solved=Object.values(g.results).filter(r=>r.solved).length;html=`<h3>答案揭晓</h3><div class="answer">${esc(g.answer)}</div><p>${solved} / ${Object.keys(g.results).length} 位猜中<br>画手本题得 <b>${g.roundGain}</b> 分</p>${banterMarkup(g.banter)}<button class="primary" data-action="next">${banterPending(g.banter)?'跳过剩余互怼，':''}${g.index+1===g.total?'查看比赛结果':'下一题'}</button>`;}
  if(g.notice&&g.phase!=='draw-error'&&g.phase!=='guessing')html+=`<p class="error-message">${esc(g.notice)}</p>`;
  if(g.phase==='reveal'&&g.recap)html+=`<p class="recap-intro">这题无人猜中，${g.recap.status==='loading'?'大家正在整理复盘…':'复盘已存入对局聊天。'}</p>${recapMarkup(g.recap)}`;
  const scope=JSON.stringify([g.id,g.index,g.turn,g.phase]),keepDraft=scope===actionDraftScope;
  const drafts=keepDraft?[...$('actionPanel').querySelectorAll('textarea[data-hint-text],select[data-hint-region],select[data-hint-focus],#guessInput')].map(input=>({id:input.id,recipient:input.closest('[data-hint-recipient]')?.dataset.hintRecipient,field:input.hasAttribute('data-hint-region')?'region':input.hasAttribute('data-hint-focus')?'focus':'text',value:input.value,focused:input===document.activeElement,start:input.selectionStart,end:input.selectionEnd})):[];
  const privateOpen=keepDraft&&$('actionPanel').querySelector('.private-hints')?.open;
  const recapOpen=$('actionPanel').querySelector('.round-recap')?.open;
  const banterDraft=captureBanterDraft($('actionPanel'));
  $('actionPanel').innerHTML=html;
  restoreBanterDraft($('actionPanel'),banterDraft);
  actionDraftScope=scope;
  if(privateOpen&&$('actionPanel').querySelector('.private-hints'))$('actionPanel').querySelector('.private-hints').open=true;
  for(const draft of drafts){const input=[...$('actionPanel').querySelectorAll('textarea[data-hint-text],select[data-hint-region],select[data-hint-focus],#guessInput')].find(input=>draft.id?input.id===draft.id:input.closest('[data-hint-recipient]')?.dataset.hintRecipient===draft.recipient&&(input.hasAttribute('data-hint-region')?'region':input.hasAttribute('data-hint-focus')?'focus':'text')===draft.field);if(input){input.value=draft.value;if(draft.focused){input.focus({preventScroll:true});if(input.setSelectionRange)input.setSelectionRange(draft.start,draft.end);}}}
  for(const row of $('actionPanel').querySelectorAll('[data-hint-recipient]')){const preview=row.querySelector('[data-hint-preview]');if(preview){try{preview.textContent=visualHint(readHintChoice(row),localShapes,currentHintMode).text||'不发送提示';}catch(error){preview.textContent=error.message;}}}
  if(recapOpen&&$('actionPanel').querySelector('.round-recap'))$('actionPanel').querySelector('.round-recap').open=true;
  const form=$('guessForm');if(form)form.onsubmit=e=>{e.preventDefault();const input=$('guessInput'),value=input.value.trim();if(!value)return;form.querySelector('button').disabled=true;act('guess',{guess:value});};
}
$('actionPanel').onclick=async e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
  if(game?.mode==='relay'){
    const g=game,task=g.relay.myTask,extra={stage:g.index,chainId:task?.chainId};
    if(a==='relay-draw-submit'){if(currentStroke||inFlight)return;if(!localShapes.length)return toast('先在画布上画几笔。');b.disabled=true;await act('relay-submit',{...extra,shapes:localShapes});}
    else if(a==='relay-pass'){b.disabled=true;await act('relay-submit',{...extra,pass:true});}
    else {b.disabled=true;await act(a,extra);}
    if(b.isConnected)b.disabled=false;return;
  }
  if(a==='submit'){submitCanvas();return;}
  if(a==='settings'){openSettings();return;}
  if(a==='reveal-confirm'){if(await confirmAction('结束这一题？','会公布答案，未猜中的选手不再获得本题分数。','公布答案'))act('reveal');return;}
  b.disabled=true;await act(a);if(b.isConnected)b.disabled=false;
};
$('finishButton').onclick=async()=>{const relay=game?.mode==='relay';if(await confirmAction(relay?'提前结束接龙？':'结束比赛？',relay?'公开所有已经交卷的内容；还在进行的棒次会停止。':'保留已经获得的分数，并查看当前比赛的复盘。',relay?'结束并展开接龙':'结束并复盘'))act('finish');};
function renderGuessers(){
  const g=game,entries=Object.values(g.results),solved=entries.filter(r=>r.solved).length;
  $('guessProgress').textContent=`${solved} / ${entries.length} 已猜中`;
  playerSeats.update(g,animating);
  $('privacyNote').textContent=g.phase==='reveal'?'本题结束，所有答案已公开。':g.artistHuman?'画手可以参考错误答案来改画。':!g.players.some(p=>p.human)?'观战中：已判分的猜词与理由会显示在气泡和聊天中。':'其他选手的答案将在本题结束后公开。';
}
const COLORS=['#202633','#db2450','#f09524','#f3ca24','#30a357','#2983c7','#415ed1','#8150ca','#895b33','#e979ab','#ffffff'];
$('colors').innerHTML=COLORS.map((c,i)=>`<button class="swatch ${i===0?'selected':''}" style="background:${c}" data-color="${c}" aria-label="${['黑色','红色','橙色','黄色','绿色','蓝色','靛蓝','紫色','棕色','粉色','白色'][i]}" aria-pressed="${i===0}"></button>`).join('');
$('colors').onclick=e=>{const b=e.target.closest('[data-color]');if(!b)return;color=b.dataset.color;erasing=false;updateTools();};
function updateTools(){document.querySelectorAll('.swatch').forEach(b=>{const on=!erasing&&b.dataset.color===color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});$('eraserButton').classList.toggle('selected',erasing);$('eraserButton').setAttribute('aria-pressed',erasing);}
$('eraserButton').onclick=()=>{erasing=!erasing;updateTools();};
function canDraw(){return game?.mode==='relay'?game.phase==='relay-work'&&game.relay.myTask?.kind==='draw'&&game.relay.myTask.status==='waiting'&&!!game.relay.myTask.input:game?.artistHuman&&game.phase==='drawing';}
function undo(){if(canDraw()&&!currentStroke){localShapes=drawingHistory.undo(localShapes);paint(canvas,localShapes);productionTrace?.edit(localShapes,'undo');}}
$('undoButton').onclick=undo;
$('clearButton').onclick=()=>{if(canDraw()&&!currentStroke&&localShapes.length){localShapes=drawingHistory.clear(localShapes);paint(canvas,localShapes);productionTrace?.edit(localShapes,'clear');}};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();undo();}});
function point(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(W,Math.round((e.clientX-b.left)*W/b.width))),Math.max(0,Math.min(H,Math.round((e.clientY-b.top)*H/b.height)))];}
canvas.onpointerdown=e=>{if(!canDraw()||localShapes.length>=440||currentStroke)return;e.preventDefault();productionTrace?.beginStroke();canvas.setPointerCapture(e.pointerId);drawingHistory.stroke(localShapes.length);const p=point(e);currentStroke={type:'line',points:[p,[p[0]+(p[0]<1000?.01:0),p[1]]],color:erasing?'#ffffff':color,width:erasing?24:+$('brushSize').value};localShapes.push(currentStroke);drawShape(canvas.getContext('2d'),currentStroke);};
canvas.onpointermove=e=>{if(!currentStroke)return;e.preventDefault();for(const v of e.getCoalescedEvents?.()||[e]){const p=point(v),last=currentStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<1)continue;if(currentStroke.points.length>=1700){const s={...currentStroke,points:[last,p]};localShapes.push(s);currentStroke=s;}else currentStroke.points.push(p);drawShape(canvas.getContext('2d'),{...currentStroke,points:[last,p]});}};
const endStroke=()=>{if(currentStroke)productionTrace?.edit(localShapes,'stroke');currentStroke=null;};canvas.onpointerup=endStroke;canvas.onpointercancel=endStroke;canvas.onlostpointercapture=endStroke;

function pct(a,b){return b?`${Math.round(a/b*100)}%`:'—';}
function renderResults(){
  if(game.mode==='relay'&&relayShowcase.update(game))return;
  if(game.mode==='relay'){const key=`relay-${game.id}-${game.updated}`;if(resultKey!==key){resultKey=key;renderRelayResults($('results'),game,act);window.scrollTo({top:0,behavior:'instant'});}return;}
  $('results').onclick=null;
  const g=game,key=g.id+'-'+g.history.length+'-'+g.updated;if(resultKey===key)return;resultKey=key;
  const ranking=[...g.players].sort((a,b)=>b.total-a.total);
  const best=(field,denom)=>{const eligible=g.players.filter(p=>p[denom]>0);if(!eligible.length)return {name:'暂无',rate:'—'};const value=Math.max(...eligible.map(p=>p[field]/p[denom]));return {name:eligible.filter(p=>p[field]/p[denom]===value).map(p=>p.name).join('、'),rate:`${Math.round(value*100)}%`};};
  const draw=best('drawScore','drawPossible'),guess=best('guessScore','guessPossible'),max=ranking[0].total,winners=ranking.filter(p=>p.total===max).map(p=>p.name).join('、');
  $('results').innerHTML=`<div class="results-head"><div><p class="eyebrow">比赛结束 · ${g.history.length} 幅脑洞作品</p><h1>这一局，谁赢了？</h1></div><div class="result-actions"><a id="exportButton" class="quiet download-link" href="/api/export" download="draw-guess-replay.json">导出复盘</a><button id="homeButton" class="primary">再来一局</button></div></div><div class="awards"><article class="award"><small>总冠军 ✦</small><strong>${esc(winners)}</strong><p>${max} 分 · 总分最高</p></article><article class="award"><small>最佳画手 ✎</small><strong>${esc(draw.name)}</strong><p>${draw.rate} · 作画得分 / 可得满分</p></article><article class="award"><small>最佳猜手 ◇</small><strong>${esc(guess.name)}</strong><p>${guess.rate} · 猜题得分 / 可得满分</p></article></div><div class="table-wrap"><table><thead><tr><th>名次</th><th>选手</th><th>总分</th><th>画图分</th><th>猜题分</th><th>猜中题数</th><th>画了几幅</th></tr></thead><tbody>${ranking.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(playerLabel(p))}</td><td><b>${p.total}</b></td><td>${p.drawScore} <small> / ${p.drawPossible}</small></td><td>${p.guessScore} <small> / ${p.guessPossible}</small></td><td>${p.hits} / ${p.guessPossible/3}</td><td>${p.drawn}</td></tr>`).join('')}</tbody></table></div><h2 class="gallery-heading">每一幅画</h2><div class="gallery">${g.history.map((r,i)=>`<article class="gallery-card"><canvas width="1000" height="650" id="gallery-${i}" aria-label="${esc(r.answer)}的画作"></canvas><div class="gallery-info"><h3>${esc(r.answer)}</h3><p>${esc(r.artistName)} · 画手 +${r.drawGain} 分</p>${g.players.filter(p=>r.results[p.id]).map(p=>{const v=r.results[p.id];return `<div class="gallery-guess"><span>${esc(playerLabel(p))}${p.id===r.artistId?'（盲猜）':''}</span><b>${v.solved?`第 ${v.history.find(h=>h.correct)?.turn} 次猜中 · +${v.points}`:'未猜中'}</b></div>`;}).join('')}<details><summary>查看猜题记录</summary>${g.players.filter(p=>r.results[p.id]).map(p=>`<p><b>${esc(p.name)}</b>：${r.results[p.id].history.map(h=>`${h.guess?esc(h.guess):'跳过'}${h.correct?' ✓':' ×'}`).join('；')||'未作答'}</p>`).join('')}</details>${recapMarkup(r.recap)}</div></article>`).join('')}</div>`;
  g.history.forEach((r,i)=>paint($(`gallery-${i}`),r.shapes));
  $('results').querySelectorAll('.gallery-info').forEach((el,i)=>el.insertAdjacentHTML('beforeend',banterMarkup(g.history[i].banter,{controls:false})));
  $('homeButton').onclick=()=>act('home');
}
function settingsRow(p){
  const character=CHARACTER_MAP[p.characterId];
  return `<article class="provider-form" data-id="${esc(p.id)}"><div class="provider-title"><strong>${esc(p.name)}</strong><button class="remove-provider" data-remove="${esc(p.id)}">移除</button></div><div class="provider-grid">
  <details class="wide player-meta"><summary>名称、接入方式与角色形象</summary><div class="provider-grid"><label>选手名称<input data-field="name" value="${esc(p.name)}" maxlength="40"></label><label>接入方式<select data-field="provider">${Object.entries(config.presets).map(([k,v])=>`<option value="${k}" ${p.provider===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select></label>
  <label class="wide">角色形象与性格<select data-field="characterId"><option value="none" ${!character?'selected':''}>自动形象 · 模型默认性格</option>${CHARACTERS.map(c=>`<option value="${c.id}" ${p.characterId===c.id?'selected':''}>${c.name} · ${c.title}</option>`).join('')}</select></label><p class="wide character-description">${esc(character?.personality||'自动匹配角色形象，回答保持模型默认风格。')}</p></div></details>
  <div class="wide model-picker"><input type="hidden" data-field="keySource" value=""><input type="hidden" data-field="reasoningEffort" value="${esc(chosenEffort(p))}"><input type="hidden" data-field="timeoutSeconds" value="${waitSeconds(p)}"><input type="hidden" data-field="replyMode" value="${p.replyMode==='thinking'?'thinking':'fast'}"><input data-field="model" value="${esc(p.model)}"></div><details class="wide connection-details"><summary>接入与密钥设置${p.provider==='codex'?' · 本机登录':p.hasKey?' · 已保存密钥':''}</summary><label class="api-field" ${p.provider==='codex'?'hidden':''}>接口基础地址<input data-field="baseUrl" value="${esc(p.baseUrl)}" placeholder="${p.provider==='qwen'?'复制申请 Key 的平台提供的完整地址':'https://…/v1'}"></label><p class="provider-hint">${esc(config.presets[p.provider]?.hint||'')}</p><label class="api-field" ${p.provider==='codex'?'hidden':''}>API Key<input type="password" data-field="apiKey" autocomplete="off" placeholder="${p.hasKey?'已有密钥，留空保留':'填入 API Key，仅保存在本机'}"></label></details></div><div class="provider-bottom"><label class="check"><input type="checkbox" data-field="enabled" ${p.enabled?'checked':''}> 默认加入比赛</label><button data-test="${esc(p.id)}">保存并验证看图 / 绘图</button><span class="test-status" role="status"></span></div></article>`;
}
function rowPlayer(row){const value=f=>row.querySelector(`[data-field=${f}]`).value;return {id:row.dataset.id,name:value('name'),provider:value('provider'),characterId:value('characterId'),model:value('model'),baseUrl:value('baseUrl'),apiKey:value('apiKey'),keySource:value('keySource'),replyMode:value('replyMode'),reasoningEffort:value('reasoningEffort'),timeoutSeconds:Number(value('timeoutSeconds'))};}
function refreshModelPicker(row){const p=rowPlayer(row),saved=config.players.find(x=>x.id===p.id);mountModelPicker(row,p,modelCatalog,sameSetup(p,saved)?config.checks?.[p.id]:null);}
async function openSettings(){try{await loadConfig();$('settingsPlayers').innerHTML=config.players.map(settingsRow).join('');$('settingsPlayers').querySelectorAll('.provider-form').forEach(refreshModelPicker);$('settingsStatus').textContent='';$('sharedKeyStatus').textContent=config.openrouter?.hasKey?'已配置统一密钥（不会显示密钥内容）':'尚未配置统一密钥';$('settingsDialog').showModal();$('modelCatalogStatus').textContent='正在读取各家的型号目录…';modelCatalog=await api('/api/models');$('modelCatalogStatus').textContent=modelCatalog.warnings.length?modelCatalog.warnings.join(' '):'目录已更新 · 默认只列出支持识图和文字回复的型号；是否能按游戏规则绘图，需要实测。';$('settingsPlayers').querySelectorAll('.provider-form').forEach(refreshModelPicker);}catch(e){toast(e.message);$('modelCatalogStatus').textContent='目录暂时不可用，可保留当前型号或手动填写。';}}
$('saveSharedKey').onclick=async()=>{try{
  const result=await api('/api/openrouter-key',{apiKey:$('sharedOpenRouterKey').value});
  $('sharedOpenRouterKey').value='';config.players=result.players;config.openrouter={hasKey:result.hasKey};
  $('sharedKeyStatus').textContent='已保存，所有 OpenRouter 选手可共用；单独填写的 Key 优先。';renderLobby();
}catch(e){$('sharedKeyStatus').textContent=e.message;}};
$('clearSharedKey').onclick=async()=>{try{const result=await api('/api/openrouter-key',{clear:true});config.players=result.players;config.openrouter={hasKey:result.hasKey};$('sharedKeyStatus').textContent=result.hasKey?'已清除保存的密钥，环境变量密钥仍生效。':'统一密钥已清除。';renderLobby();}catch(e){$('sharedKeyStatus').textContent=e.message;}};
$('settingsButton').onclick=openSettings;$('closeSettings').onclick=()=>$('settingsDialog').close();
$('settingsPlayers').onchange=e=>{
  const row=e.target.closest('.provider-form');if(!row)return;
  if(e.target.hasAttribute('data-route-choice')){
    const source=e.target.value,family=row.querySelector('[data-field=characterId]').value;
    const choices=(modelCatalog?.models||[]).filter(m=>m.source===source&&(family==='none'||m.family===family)&&m.vision&&m.gameDrawing);
    const oldModel=row.querySelector('[data-field=model]').value;
    const similar=choices.find(m=>m.id.split('/').pop().toLowerCase()===oldModel.split('/').pop().toLowerCase())||choices[0];
    if(!similar){toast('此平台暂没有适合这位选手的型号。');refreshModelPicker(row);return;}
    row.querySelector('[data-field=provider]').value=source==='codex'?'codex':'compatible';
    row.querySelector('[data-field=baseUrl]').value=source==='qwen'?'https://maas.qianwenaiapi.com/compatible-mode/v1':source==='openrouter'?'https://openrouter.ai/api/v1':'';
    row.querySelector('[data-field=model]').value=similar.id;
    row.querySelector('[data-field=reasoningEffort]').value='auto';
    row.querySelector('[data-field=keySource]').value=source==='codex'?'':source;
    row.querySelector('[data-field=apiKey]').value='';
    row.querySelectorAll('.api-field').forEach(n=>n.hidden=source==='codex');
  }
  if(e.target.hasAttribute('data-model-choice')){row.querySelector('[data-field=model]').value=e.target.value;row.querySelector('[data-field=reasoningEffort]').value='auto';}
  if(e.target.hasAttribute('data-show-text'))row.dataset.showText=String(e.target.checked);
  if(e.target.dataset.field==='characterId')row.querySelector('.character-description').textContent=CHARACTER_MAP[e.target.value]?.personality||'自动匹配角色形象，回答保持模型默认风格。';
  if(['provider','baseUrl'].includes(e.target.dataset.field))row.querySelector('[data-field=keySource]').value='';
  if(['provider','model','baseUrl'].includes(e.target.dataset.field))row.querySelector('[data-field=reasoningEffort]').value='auto';
  if(e.target.dataset.field==='provider'){const type=e.target.value,pre=config.presets[type];row.querySelector('[data-field=model]').value=pre.model;row.querySelector('[data-field=baseUrl]').value=pre.baseUrl;row.querySelectorAll('.api-field').forEach(n=>n.hidden=type==='codex');row.querySelector('.provider-hint').textContent=pre.hint||'';}
  if(e.target.dataset.field!=='enabled'){row.querySelector('.test-status').textContent='';refreshModelPicker(row);}
};
function collectSettings(){return [...document.querySelectorAll('.provider-form')].map((row,i)=>{const value=f=>row.querySelector(`[data-field=${f}]`).value;return {id:row.dataset.id,name:value('name'),provider:value('provider'),characterId:value('characterId'),model:value('model'),baseUrl:value('baseUrl'),apiKey:value('apiKey'),keySource:value('keySource'),replyMode:value('replyMode'),reasoningEffort:value('reasoningEffort'),timeoutSeconds:Number(value('timeoutSeconds')),enabled:row.querySelector('[data-field=enabled]').checked,color:config.players.find(p=>p.id===row.dataset.id)?.color||['#3155d9','#9670dc','#cc795c','#258aab','#39795b'][i%5]};});}
async function saveSettings(){const players=collectSettings();for(const player of players){const issue=connectionIssue(player);if(issue)throw new Error(player.name+'：'+issue);}const result=await api('/api/config',{players});config.players=result.players;config.checks=result.checks;selected=new Set(result.players.filter(p=>p.enabled).map(p=>p.id));if(mode==='duel')selected=new Set([[...selected][0]||result.players[0].id]);document.querySelectorAll('.provider-form').forEach(row=>{const input=row.querySelector('[data-field=apiKey]');input.value='';row.querySelector('[data-field=keySource]').value='';input.placeholder=config.players.find(p=>p.id===row.dataset.id)?.hasKey?'已有密钥，留空保留':'填入 API Key，仅保存在本机';refreshModelPicker(row);});renderLobby();$('settingsStatus').textContent='已保存 · 下一场比赛使用新配置';}
$('saveSettings').onclick=async()=>{try{await saveSettings();toast('AI 设置已保存。');}catch(e){$('settingsStatus').textContent=e.message;}};
$('settingsPlayers').onclick=async e=>{const remove=e.target.closest('[data-remove]'),test=e.target.closest('[data-test]');if(remove){remove.closest('.provider-form').remove();return;}if(test){const row=test.closest('.provider-form'),status=row.querySelector('.test-status');test.disabled=true;try{await saveSettings();status.textContent='正在看图猜词，再画一辆自行车…';const tested=rowPlayer(row);const result=await api('/api/test',{id:test.dataset.test});if(sameSetup(rowPlayer(row),tested)){config.checks[test.dataset.test]=result;refreshModelPicker(row);status.textContent=result.ok?`✓ 两项实测通过 · ${(result.elapsed/1000).toFixed(1)} 秒`:'本次未全部通过，请展开实测结果查看。';}else status.textContent='测试期间型号已更改，请保存后重新测试。';}catch(e){status.textContent=e.message;}finally{test.disabled=false;}}};
$('addPlayer').onclick=()=>{$('settingsPlayers').insertAdjacentHTML('beforeend',settingsRow({id:'ai-'+crypto.randomUUID().slice(0,8),name:'新 AI',provider:'openrouter',model:config.presets.openrouter.model,baseUrl:config.presets.openrouter.baseUrl,enabled:false,color:'#3155d9'}));refreshModelPicker($('settingsPlayers').lastElementChild);$('settingsPlayers').lastElementChild.scrollIntoView({behavior:'smooth',block:'nearest'});};
$('closeRelayPicture').onclick=()=>$('relayPictureDialog').close();
try{await loadConfig(true);await poll();}catch(e){toast(e.message);$('connectionInfo').textContent=e.message;}
setInterval(poll,950);

