import {playerModelLabel} from './characters.mjs';
export const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeText;
export const matchNote=match=>({'idiom-order':'四个字齐全，顺序不同也算对','idiom-three':'三个字位置正确，也算对'})[match]||'';
export function messageLabel(message){
  if(message.kind==='banter')return `${message.reply?'回嘴':'互怼'} → ${message.targetName||'对方'}`;
  if(message.mode==='relay')return ({'relay-round':'接龙进度','relay-status':'交卷','relay-guess':'接龙猜词','relay-reveal':'拆开接龙','relay-vote':'投票','relay-reflection':'通关感言'})[message.kind]||'接龙';
  return ({round:'新题目',answer:'揭晓',guess:message.skipped?'跳过':'猜词',hint:message.recipientId?`只对 ${message.recipientName||'你'} 说`:'公开提示',recap:message.source==='model'?'一句话复盘':'记录摘要'})[message.kind]||'消息';
}
export function messageBody(message){
  if(message.kind==='guess')return `<p class="speech-guess">${message.skipped?'这次先跳过。':`我猜：<strong>${esc(message.text)}</strong>`}</p>${message.reason?`<p class="speech-reason">${esc(message.reason)}</p>`:''}${!message.skipped?`<p class="speech-verdict ${message.correct?'right':'wrong'}">${message.correct?`猜中 · +${message.points} 分`:'这次没猜中'}${matchNote(message.match)?`<br>${matchNote(message.match)}`:''}</p>`:''}`;
  let html=`<p>${esc(message.text)}</p>`;
  if(message.kind==='answer')html+=`<p class="speech-reason">${message.solved||0} 位选手猜中</p>`;
  if(message.kind==='recap'&&message.trail?.length)html+=`<details class="speech-trail"><summary>心路历程 · ${message.trail.length} 次猜词</summary><ol>${message.trail.map(h=>`<li><b>第 ${h.turn} 次：${esc(h.guess)}</b>${h.reason?`<span>${esc(h.reason)}</span>`:''}</li>`).join('')}</ol><small>回顾已提交的猜词与简短理由</small></details>`;
  return html;
}
export function latestSpeech(game,playerId){
  const messages=(game?.conversation||[]).filter(m=>m.index===game.index&&m.playerId===playerId&&['guess','hint','recap','relay-status','banter'].includes(m.kind));
  return messages.findLast(m=>m.kind==='banter')||messages.at(-1)||null;
}
export function recapMarkup(recap){
  if(!recap)return '';
  return `<details class="round-recap"><summary>心路历程与一句话复盘${recap.status==='loading'?' · 整理中':''}</summary>${recap.entries.map(entry=>`<article><strong>${esc(entry.name)}${entry.artist?' · 画手':''}</strong>${messageBody({kind:'recap',text:entry.status==='pending'?'正在整理一句话复盘…':entry.summary,trail:entry.trail})}${entry.status==='record'?'<small>根据已提交记录整理</small>':''}</article>`).join('')}</details>`;
}
export function createConversation(panel){
  const log=panel.querySelector('.chat-log'),filter=panel.querySelector('select'),follow=panel.querySelector('input'),newButton=panel.querySelector('.chat-new'),count=panel.querySelector('.chat-count');
  let gameId=null,messages=[],key='',filterKey='',nodes=new Map(),rendering=false;
  function render(){
    const nextKey=JSON.stringify(messages);if(nextKey===key&&filterKey===filter.value)return;
    const oldIds=new Set(nodes.keys()),oldScroll=log.scrollTop,top=log.getBoundingClientRect().top;
    const anchor=[...log.children].find(node=>node.getBoundingClientRect().bottom>top);
    const anchorId=anchor?.dataset.messageId,anchorTop=anchor?.getBoundingClientRect().top;
    key=nextKey;filterKey=filter.value;rendering=true;
    const visible=messages.filter(m=>filter.value==='all'||m.kind===filter.value||filter.value==='guess'&&m.kind==='relay-guess'||filter.value==='recap'&&m.kind==='relay-reflection'),ids=new Set(visible.map(m=>m.id));
    for(const [id,node] of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
    let previous=null;
    for(const m of visible){
      let node=nodes.get(m.id);
      if(!node){node=document.createElement('article');node.className=`chat-message chat-${m.kind}`;node.dataset.messageId=m.id;node.style.setProperty('--speaker',/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:'#67738f');
        node.innerHTML=`<header><span class="chat-round">第 ${(m.chainIndex??m.index)+1} ${m.chainIndex!=null?'条链':m.mode==='relay'?'棒':'题'}${['guess','hint'].includes(m.kind)?` · 第 ${m.turn} 轮`:''}</span><strong>${esc(m.name)}</strong>${m.model?`<small class="chat-model">${esc(m.model)}</small>`:''}<span class="chat-kind">${esc(messageLabel(m))}</span></header>${messageBody(m)}`;nodes.set(m.id,node);
      }
      // Previously private messages may be revealed later: insert them at their original place.
      const expected=previous?previous.nextElementSibling:log.firstElementChild;if(node!==expected)log.insertBefore(node,expected);previous=node;
    }
    panel.querySelector('.chat-empty').hidden=visible.length>0;
    count.textContent=`${visible.length} 条`;
    const added=visible.filter(m=>!oldIds.has(m.id)).length;
    if(follow.checked){log.scrollTop=log.scrollHeight;newButton.hidden=true;}else{
      log.scrollTop=oldScroll;
      if(anchorId&&nodes.has(anchorId))log.scrollTop+=nodes.get(anchorId).getBoundingClientRect().top-anchorTop;
      if(added){newButton.hidden=false;newButton.textContent='有新消息 ↓';}
    }
    rendering=false;
  }
  filter.onchange=()=>render();
  follow.onchange=()=>{if(follow.checked){log.scrollTop=log.scrollHeight;newButton.hidden=true;}};
  newButton.onclick=()=>{follow.checked=true;follow.onchange();};
  log.addEventListener('scroll',()=>{if(!rendering){follow.checked=log.scrollHeight-log.scrollTop-log.clientHeight<24;if(follow.checked)newButton.hidden=true;}});
  log.addEventListener('toggle',event=>{if(event.target.matches('details'))follow.checked=false;},true);
  const keepLatest=()=>{if(follow.checked){log.scrollTop=log.scrollHeight;newButton.hidden=true;}};
  const resize=new ResizeObserver(keepLatest);resize.observe(log);
  document.fonts?.ready.then(keepLatest);
  addEventListener('pagehide',()=>resize.disconnect(),{once:true});
  function update(game){
    panel.hidden=!game;if(!game)return;
    if(gameId!==game.id){gameId=game.id;nodes.clear();log.replaceChildren();key='';filterKey='';filter.value='all';follow.checked=true;newButton.hidden=true;}
    messages=(game.conversation||[]).map(m=>{const p=game.players?.find(p=>p.id===m.playerId);return {...m,model:p&&!p.human?playerModelLabel(p):''};});render();
  }
  return {update};
}
