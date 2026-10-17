import {paint} from './drawing.mjs';
import {escapeText as esc} from './conversation.mjs';
import {playerLabel,playerModelLabel} from './characters.mjs';
import {banterMarkup,banterPending,captureBanterDraft,restoreBanterDraft} from './banter-view.mjs';

function drawingCaption(chain,position,playerName){
  const step=chain.steps[position],previous=chain.steps[position-1];
  if(!step)return `${playerName} 的画作：未完成`;
  if(step.skipped)return `${playerName} 的画作：这一棒留空`;
  // Later painters receive the preceding guess, which may differ from the original word.
  const word=position===0?chain.answer:previous?.kind==='guess'&&!previous.skipped?previous.text:null;
  return `${playerName} 画的：${word||'未收到词语'}`;
}

export function relayActionMarkup(g){
  const task=g.relay.myTask,errors=Object.values(g.results).filter(r=>r.status==='error');
  let html='';
  if(g.phase==='relay-pass')return `<h3>大家都交卷了</h3><p>${g.index+1===g.total?'最后一棒完成，马上展开所有接龙。':'图和词已经封好，马上一起传给下一位。'}</p><div class="relay-wait">✉ 统一传递中</div>`;
  if(!task)html='<h3>正在旁观接龙</h3><p>所有选手正在同一棒行动。为保留最后揭晓的乐趣，中途只显示交卷进度。</p>';
  else if(task.status==='skipped')html='<h3>这一棒留空了</h3><p>本链没有可继续传递的内容，等待其他选手完成。</p>';
  else if(task.status==='submitted')html=`<h3>你的这一棒已封好</h3><p>${task.kind==='draw'?'画作已提交。':`你写下了「${esc(task.submitted?.text||'')}」。`}等所有人交卷，再一起传递。</p><div class="relay-wait">✓ 已交卷 · 等待大家</div>`;
  else if(task.status==='working')html='<h3>正在封好你的作品…</h3>';
  else if(task.kind==='draw')html=`<h3>${g.index===0?'画出你的起始题目':'只画收到的词语'}</h3><p>${g.index===0?'这个词只有你看得到。':'上一位写了什么，就按什么画，不必猜原题。'}不要写文字提示。</p><button class="primary" data-action="relay-draw-submit">画好了，封好传递</button><button class="relay-pass-button" data-action="relay-pass">这一棒留空</button><small>留空后，这条链接下来的棒次也会留空。</small>`;
  else html=`<h3>${g.category==='成语'?'给下一位写一个四字成语':'给下一位写一个词'}</h3><p>${g.category==='成语'?'本局题库：成语。请按画面猜一个四字成语。':g.category?`本局题库：${esc(g.category)}。`:''}只看上一棒的画，不显示原题或更早的词语。</p><form id="relayGuessForm" class="guess-form"><input id="relayGuessInput" maxlength="80" aria-label="你的接龙词语" placeholder="${g.category==='成语'?'这幅画对应哪个四字成语？':'它画的是什么？'}" autocomplete="off"><button type="submit">封好传递</button></form><button class="relay-pass-button" data-action="relay-pass">这一棒留空</button><small>猜偏了也照传，最后一起看。</small>`;
  if(errors.length)html+=`<div class="relay-errors"><p>${errors.length} 位选手连接失败。已交卷的内容会保留。</p><div class="button-row"><button data-action="relay-retry">重试失败选手</button><button data-action="relay-skip-errors">失败的棒次留空</button></div><small>留空的链不再补猜；失败原因显示在对应角色下方。</small></div>`;
  return html;
}
export function relayStageMarkup(g){return `<div class="relay-progress-copy"><strong>第 ${g.index+1} 棒 · 全员${g.relay.kind==='draw'?'画图':'猜词'}</strong><span>${g.relay.done} / ${g.players.length} 已交卷</span></div><div class="relay-stage-track" aria-label="接龙进度">${Array.from({length:g.total},(_,i)=>`<span class="${i<g.index?'done':i===g.index?'current':''}" aria-label="第 ${i+1} 棒 ${i%2?'猜词':'画图'}">${i<g.index?'✓':i+1}<small>${i%2?'猜':'画'}</small></span>`).join('')}</div>`;}

export function renderRelayResults(container,g,act){
  const name=id=>{const p=g.players.find(p=>p.id===id);return p?playerLabel(p):'未知选手';};
  const count=g.chains.reduce((n,c)=>n+c.steps.filter(Boolean).length,0);
  container.innerHTML=`<div class="results-head"><div><p class="eyebrow">传画接龙 · ${g.relay.completed?'所有链条已展开':'提前结束，保留已交卷内容'}</p><h1>传到最后，歪去哪了？</h1><p class="muted">${g.players.length} 位选手 · ${g.chains.length} 条链 · ${count} / ${g.total*g.chains.length} 棒已完成</p></div><div class="result-actions"><a class="quiet download-link" href="/api/export" download="relay-replay.json">导出全部接龙</a><button class="primary" id="relayHomeButton">再来一局</button></div></div><div class="relay-reveal-note">每一棒只收到上一棒的图或词。现在按链条展开，看看是从哪一步开始走样的。<br>每条链的画作可点开大图；横向滑动查看后面的棒次。</div><div class="relay-chains">${g.chains.map((chain,i)=>{
    const steps=chain.steps.filter(Boolean),last=steps.at(-1);
    const ending=!last?'尚未交卷':last.skipped?'后续留空':last.kind==='draw'?'以画作收尾':`「${last.text}」`;
    const note=last?.kind==='guess'&&!last.skipped?(last.text===chain.answer?'末棒文字与原词一致':'末棒文字发生变化'):last?.kind==='draw'?'对照原题，看末棒画成了什么':'保留已完成的内容';
    return `<details class="relay-chain" name="relay-chain" ${i===0?'open':''}><summary><span class="relay-chain-number">${i+1}</span><span><strong>${esc(name(chain.ownerId))} 的接龙 · ${esc(chain.answer)}</strong><small>原题 → ${esc(ending)} · ${note}</small></span><span class="relay-chain-expand">展开</span></summary><div class="relay-route">传递顺序：${chain.route.map(id=>esc(name(id))).join(' → ')}</div><div class="relay-timeline"><article class="relay-step relay-origin"><span class="relay-step-kind">原始题目</span><h3>${esc(chain.answer)}</h3><p>只给第一棒看</p></article>${chain.route.map((id,position)=>{
      const step=chain.steps[position],kind=position%2?'猜词':'画图';
      return `<article class="relay-step ${!step||step.skipped?'relay-empty':''}"><header><span>第 ${position+1} 棒 · ${kind}</span><strong>${esc(position%2?name(id):drawingCaption(chain,position,name(id)))}</strong></header>${!step?'<div class="relay-step-text">未完成</div>':step.skipped?`<div class="relay-step-text">这一棒留空</div><p>${esc(step.skipReason)}</p>`:step.kind==='draw'?`<button class="relay-picture" data-relay-picture="${i}:${position}" aria-label="放大 ${esc(name(id))} 第 ${position+1} 棒的画"><canvas width="500" height="325" data-chain="${i}" data-position="${position}"></canvas><span>点开看大图 ↗</span></button>`:`<div class="relay-step-text">${esc(step.text)}</div>${step.reason?`<p class="relay-step-reason">${esc(step.reason)}</p>`:''}`}</article>`;
    }).join('')}</div></details>`;
  }).join('')}</div>`;
  container.querySelectorAll('.relay-chain').forEach((el,i)=>{const ballot=g.relay.showcase?.ballots[i],record=relayVoteRecord(g,ballot)+banterMarkup(ballot?.banter,{controls:false});if(record)el.querySelector('.relay-route').insertAdjacentHTML('afterend',record);});
  container.querySelectorAll('canvas').forEach(c=>paint(c,g.chains[+c.dataset.chain].steps[+c.dataset.position].shapes));
  container.querySelector('#relayHomeButton').onclick=()=>act('home');
  container.onclick=e=>{const button=e.target.closest('[data-relay-picture]');if(!button)return;const [chainIndex,position]=button.dataset.relayPicture.split(':').map(Number),step=g.chains[chainIndex].steps[position];document.getElementById('relayPictureTitle').textContent=`第 ${position+1} 棒 · ${drawingCaption(g.chains[chainIndex],position,name(step.playerId))}`;paint(document.getElementById('relayPictureCanvas'),step.shapes);document.getElementById('relayPictureDialog').showModal();};
}


const name=(g,id)=>g.players.find(p=>p.id===id)?.name||'未知选手';
const modelBadge=(g,id)=>{const p=g.players.find(p=>p.id===id);return p&&!p.human?`<small class="showcase-model">${esc(playerModelLabel(p))}</small>`:'';};
const picture=(position,label)=>`<canvas width="1000" height="650" data-showcase-picture="${position}" aria-label="${esc(label)}"></canvas>`;
const drawing=(step,label)=>!step||step.skipped?'<div class="showcase-empty">这一棒留空</div>':picture(step.position,label);
export function ballotSummary(g,b){
  if(!b?.verdict)return '';
  const v=b.verdict,culprits=b.culprits;
  if(v.automatic)return '<div class="showcase-verdict passed"><strong>原词 → 末词，完全一致！直接通过！</strong><span>免投票通关 · 大家说句感言</span></div>';
  return `<div class="showcase-verdict ${v.passed?'passed':'failed'}"><strong>${v.passed===null?'无人投出有效票':v.passed?'这条链，通过！':'这条链，没过！'}</strong><span>${v.yes} 票通过 · ${v.no} 票不通过${v.abstained?' · '+v.abstained+' 票弃权':''}${v.yes===v.no&&v.yes?' · 平票不通过':''}</span>${culprits?`<p>${culprits.winners.length?`${culprits.winners.length>1?'并列':''}最大害群之马：<b>${culprits.winners.map(id=>esc(name(g,id))).join('、')}</b> · ${culprits.highest} 票`:'本轮全部弃权，没有选出最大害群之马。'}</p>`:''}</div>`;
}
function voteRows(g,votes,kind,revealed=false){
  return `<div class="showcase-voters">${g.players.map(p=>{const v=votes[p.id]||{status:'waiting'},status={waiting:p.human?'等你投票':'等待投票',working:'正在投票…',queued:'排队中…',error:'连接失败',submitted:'已投票',abstained:'弃权'}[v.status];
    const choice=revealed&&v.status==='submitted'?(kind==='pass'?v.pass?'通过':'不通过':name(g,v.targetId)):status;
    return `<article class="showcase-voter ${v.status}"><strong>${esc(p.name)}</strong>${modelBadge(g,p.id)}<span>${esc(choice)}</span>${revealed&&v.reason?`<p>${esc(v.reason)}</p>`:v.error?`<p>${esc(v.error)}</p>`:''}</article>`;
  }).join('')}</div>`;
}
function reflectionRows(g,b){return `<div class="showcase-voters showcase-reflections">${g.players.map(p=>{const entry=b.reflections?.[p.id]||{status:'optional'},text=entry.text||entry.error||({optional:'还没留言',working:'正在想通关感言…',queued:'感言排队中…',waiting:'等待感言'}[entry.status])||'未留言';return `<article class="showcase-voter ${esc(entry.status)}"><strong>${esc(p.name)}</strong>${modelBadge(g,p.id)}<p>${esc(text)}</p></article>`;}).join('')}</div>`;}
export function relayVoteRecord(g,b){return b?.verdict?`<div class="showcase-record">${ballotSummary(g,b)}${b.verdict.automatic?reflectionRows(g,b):`<details><summary>查看每位选手的投票与理由</summary><h4>通过 / 不通过</h4>${voteRows(g,b.passVotes,'pass',true)}${b.culprits?`<h4>最大害群之马</h4>${voteRows(g,b.culpritVotes,'culprit',true)}`:''}</details>`}</div>`:'';}
function reflectionControls(g,b){
  if(!b.verdict?.automatic)return '';
  return `<section class="showcase-reflection-controls">${b.reflections?.human?.status==='optional'?'<form id="relayReflectionForm"><label for="relayReflectionInput">你也来说一句（可选）</label><div><input id="relayReflectionInput" data-showcase="reflection-draft" maxlength="120" placeholder="这都能传回来，谁救的场？" autocomplete="off"><button class="primary" type="submit">发表感言</button></div></form>':''}${Object.values(b.reflections||{}).some(r=>r.status==='error')?'<p>有感言没生成成功，通过结果已保留。</p><button data-showcase="reflection-retry">重试失败感言</button>':''}</section>`;
}
function chainReview(g,chain){
  return `<details class="showcase-chain-review"><summary>回看本链每一棒</summary><div class="showcase-review-grid">${chain.steps.map(s=>`<article><header>第 ${s.position+1} 棒 · ${esc(s.kind==='draw'?drawingCaption(chain,s.position,name(g,s.playerId)):name(g,s.playerId))}</header>${s.skipped?'<p>这一棒留空</p>':s.kind==='draw'?drawing(s,'第 '+(s.position+1)+' 棒画作'):`<strong>${esc(s.text)}</strong>`}</article>`).join('')}</div></details>`;
}
export function relayShowcaseMarkup(g){
  const s=g.relay.showcase,chain=g.chains[s.chainIndex],b=s.ballots[s.chainIndex],current=chain.steps[s.stepIndex];
  const header=`<header class="showcase-head"><div><p class="eyebrow">传画接龙 · 揭晓时间</p><h1>${esc(name(g,chain.ownerId))} 的这条链</h1><p>第 ${s.chainIndex+1} / ${g.chains.length} 条链 <span>·</span> ${s.status==='intro'?'先看画，再看答案':s.status==='playing'?`正在揭晓第 ${s.stepIndex+1} / ${chain.route.length} 棒`:b.verdict?.automatic?'原词完整传回，来句通关感言':'原词到终点，大家来评一评'}</p></div><div class="showcase-controls"><button data-showcase="sound" aria-pressed="false">开启音效</button><a href="/api/export" download="relay-replay.json" class="quiet">导出接龙</a></div></header>`;
  const progress=`<nav class="showcase-progress" aria-label="揭晓进度">${chain.route.map((id,i)=>`<span class="${i===s.stepIndex&&s.status==='playing'?'current':i<=s.stepIndex||!['intro','playing'].includes(s.status)?'done':''}"><small>第 ${i+1} 棒 · ${i%2?'猜':'画'}</small><b>${esc(name(g,id))}</b>${modelBadge(g,id)}</span>`).join('')}</nav>`;
  let body='';
  if(s.status==='intro')body=`<div class="showcase-intro"><span class="showcase-envelope">✉</span><h2>这幅画，最后会变成什么？</h2><p>画作停留 4 秒，配一声揭晓音，再公布下一位猜的词。<br>首尾词完全相同直接通过，其余情况全员投票。</p><button class="primary" data-showcase="play">${s.chainIndex?'开始揭晓这一链':'开始展示'} ▶</button><small>可暂停、手动下一棒；刷新后会保留播放和投票进度。</small></div>`;
  else if(s.status==='playing'){
    const isGuess=current?.kind==='guess',drawStep=isGuess?chain.steps[s.stepIndex-1]:current,nextId=chain.route[s.stepIndex+1],drawPosition=drawStep?.position??(isGuess?s.stepIndex-1:s.stepIndex);
    body=`<div class="showcase-stage"><article class="showcase-art"><header><span>第 ${drawPosition+1} 棒 · 画作</span><strong>${esc(drawingCaption(chain,drawPosition,name(g,drawStep?.playerId||chain.route[drawPosition])))}</strong></header>${drawing(drawStep,'当前揭晓画作')}</article><article class="showcase-answer ${isGuess?'revealed':'sealed'}" aria-live="polite">${isGuess?`<p>第 ${s.stepIndex+1} 棒 · 猜词</p><h2>${esc(name(g,current.playerId))} 猜的是：</h2><strong class="showcase-word">${current.skipped?'这一棒留空':esc(current.text)}</strong>${current.reason?`<p class="showcase-reason">${esc(current.reason)}</p>`:''}`:`<span class="showcase-question">？</span><h2>${nextId?esc(name(g,nextId))+' 会猜什么？':'这是最后一棒的画'}</h2><p>${nextId?'先看看这幅画，答案马上揭晓。':'稍后把原词与这幅画放在一起，大家投票。'}</p>`}<div class="showcase-countdown" data-showcase-countdown></div></article></div><div class="showcase-playback"><button data-showcase="pause">${s.paused?'继续播放 ▶':'暂停展示 Ⅱ'}</button><button class="primary" data-showcase="step">${s.stepIndex+1===chain.route.length?'看起点与终点 →':'下一棒 →'}</button></div>`;
  }else{
    const last=chain.steps.at(-1),kind=s.status==='pass-vote'?'pass':'culprit',votes=kind==='pass'?b.passVotes:b.culpritVotes,hasHuman=g.players.some(p=>p.human),waiting=hasHuman&&votes.human?.status==='waiting';
    body=`<div class="showcase-compare"><article><p>最开始的词语</p><strong class="showcase-word">${esc(chain.answer)}</strong></article><span class="showcase-arrow">→</span><article><p>${last?.kind==='draw'?'最后一棒的画面':'最后一棒的词语'} · ${esc(name(g,last?.playerId))}</p>${last?.kind==='draw'?drawing(last,'最终画面'): `<strong class="showcase-word">${last?.skipped?'这一棒留空':esc(last?.text||'未完成')}</strong>`}</article></div>`;
    if(s.status==='result')body+=`${relayVoteRecord(g,b)}${reflectionControls(g,b)}${banterMarkup(b.banter)}<div class="showcase-playback"><button class="primary" data-showcase="next">${banterPending(b.banter)?'跳过剩余互怼，继续 →':Object.values(b.reflections||{}).some(r=>['waiting','working','queued'].includes(r.status))?'跳过未完成感言，继续 →':s.chainIndex+1===g.chains.length?'查看全部接龙与投票结果':'揭晓下一条链 →'}</button></div>${chainReview(g,chain)}`;
    else{
      const errors=Object.values(votes).some(v=>v.status==='error'),done=Object.values(votes).filter(v=>['submitted','abstained'].includes(v.status)).length;
      body+=`<section class="showcase-ballot"><header><div><p class="eyebrow">${kind==='pass'?'第一轮投票':'第二轮投票'}</p><h2>${kind==='pass'?'这条链，过不过？':'谁是这条链最大的害群之马？'}</h2></div><span>${done} / ${g.players.length} 已投票</span></header><p>${kind==='pass'?'看最后的词或画面是否保留了原词的核心意思。通过票须多于不通过票，平票不过。':'每人选一位造成最大偏离的选手，可以投自己；并列最高票会一起公布。'}</p>${kind==='culprit'?ballotSummary(g,b):''}${waiting?`<div class="showcase-vote-options">${kind==='pass'?'<button class="primary" data-showcase-vote="yes">通过 ✓</button><button data-showcase-vote="no">不过 ×</button>':chain.route.map((id,i)=>`<button data-showcase-target="${esc(id)}"><small>第 ${i+1} 棒 · ${i%2?'猜':'画'}</small>${esc(name(g,id))}</button>`).join('')}</div>`:`<p class="showcase-vote-wait">${hasHuman?'你的票已封好，等大家投完统一公开。':'你正在观战，参赛 AI 会各自投票。'}</p>`}${voteRows(g,votes,kind)}${errors?'<div class="showcase-vote-errors"><p>有选手投票失败，已投的票会保留。</p><button data-showcase="retry">重试失败选手</button><button data-showcase="abstain">失败选手记为弃权</button></div>':''}</section>${chainReview(g,chain)}`;
    }
  }
  return `<div class="relay-showcase">${header}${progress}${body}</div>`;
}

export function createRelayShowcase(container,act){
  let game=null,lastKey='',lastCue='',clock=null,audio=null,sound=false,soundWanted=true;
  const updateSound=()=>{const button=container.querySelector('[data-showcase="sound"]');if(button){button.textContent=sound?'音效开启 ♪':'开启音效';button.setAttribute('aria-pressed',String(sound));}};
  async function unlock(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();sound=audio.state==='running';}catch{sound=false;}updateSound();}
  function cue(revealed){
    if(!sound||audio?.state!=='running')return;
    const now=audio.currentTime,notes=revealed?[523.25,659.25,783.99]:[330,440];
    notes.forEach((frequency,i)=>{const tone=audio.createOscillator(),volume=audio.createGain(),at=now+i*.095;tone.type='sine';tone.frequency.value=frequency;volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(.07,at+.012);volume.gain.exponentialRampToValueAtTime(.001,at+.25);tone.connect(volume);volume.connect(audio.destination);tone.start(at);tone.stop(at+.27);tone.onended=()=>{tone.disconnect();volume.disconnect();};});
  }
  function countdown(){const s=game?.relay.showcase,label=container.querySelector('[data-showcase-countdown]');if(label&&s)label.textContent=s.paused?'已暂停':s.dueAt?`${Math.max(0,Math.ceil((s.dueAt-Date.now())/1000))} 秒后${s.stepIndex+1===game.chains[s.chainIndex].route.length?'对照起点与终点':'揭晓下一棒'}`:'';}
  return {
    update(g){
      game=g;const s=g?.relay?.showcase;if(!s||s.status==='complete'){clearInterval(clock);clock=null;lastKey='';return false;}
      if(!clock)clock=setInterval(countdown,200);
      const key=g.id+':'+g.updated;if(key!==lastKey){lastKey=key;const banterDraft=captureBanterDraft(container),focus=document.activeElement?.dataset,focusKey=focus?.showcase||null,reviewOpen=container.querySelector('.showcase-chain-review')?.open,recordOpen=container.querySelector('.showcase-record details')?.open,reflectionDraft=container.querySelector('#relayReflectionInput')?.value||'';container.innerHTML=relayShowcaseMarkup(g);
        restoreBanterDraft(container,banterDraft);
        if(container.querySelector('#relayReflectionInput'))container.querySelector('#relayReflectionInput').value=reflectionDraft;
        if(reviewOpen&&container.querySelector('.showcase-chain-review'))container.querySelector('.showcase-chain-review').open=true;
        if(recordOpen&&container.querySelector('.showcase-record details'))container.querySelector('.showcase-record details').open=true;
        for(const c of container.querySelectorAll('[data-showcase-picture]'))paint(c,g.chains[s.chainIndex].steps[+c.dataset.showcasePicture].shapes);
        updateSound();if(focusKey)container.querySelector(`[data-showcase="${focusKey}"]`)?.focus({preventScroll:true});
        const cueKey=`${g.id}:${s.chainIndex}:${s.stepIndex}`;if(s.status==='playing'&&cueKey!==lastCue){lastCue=cueKey;cue(g.chains[s.chainIndex].steps[s.stepIndex]?.kind==='guess');}
      }
      countdown();container.onclick=async e=>{
        const button=e.target.closest('button');if(!button)return;
        const data={chainId:s.chainId},command=button.dataset.showcase;
        if(command==='sound'){if(sound){sound=false;soundWanted=false;updateSound();}else{soundWanted=true;await unlock();cue(true);}return;}
        if(command==='play'){if(soundWanted)await unlock();await act('relay-show-play',data);}
        else if(command==='pause')await act('relay-show-pause',data);
        else if(command==='step')await act('relay-show-step',{...data,stepIndex:s.stepIndex});
        else if(command==='reflection-retry')await act('relay-reflection-retry',data);
        else if(command==='next')await act('relay-show-next',data);
        else if(command==='retry'||command==='abstain')await act(command==='retry'?'relay-vote-retry':'relay-vote-abstain',{...data,kind:s.status==='pass-vote'?'pass':'culprit'});
        else if(button.dataset.showcaseVote){button.disabled=true;await act('relay-vote',{...data,kind:'pass',pass:button.dataset.showcaseVote==='yes'});if(button.isConnected)button.disabled=false;}
        else if(button.dataset.showcaseTarget){button.disabled=true;await act('relay-vote',{...data,kind:'culprit',targetId:button.dataset.showcaseTarget});if(button.isConnected)button.disabled=false;}
      };container.onsubmit=async e=>{if(e.target.id!=='relayReflectionForm')return;e.preventDefault();const text=container.querySelector('#relayReflectionInput').value.trim();if(text)await act('relay-reflection',{chainId:s.chainId,text});};return true;
    },
    stop(){clearInterval(clock);clock=null;game=null;lastKey='';lastCue='';}
  };
}
