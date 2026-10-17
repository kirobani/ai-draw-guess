import {escapeText as esc} from './conversation.mjs';
export const banterPending=b=>!!b&&!['complete','empty','skipped'].includes(b.status);
export function banterMarkup(b,{controls=true}={}){
 if(!b)return '';
 const e=b.exchanges[b.index],waiting=b.status==='waiting-human';
 const status={empty:'这回大家暂时休战。',complete:'这一轮回嘴结束，聊天记录已保留。',skipped:'已跳过剩余互怼，已说的内容保留。',error:e?.error,waiting:'准备开麦…','waiting-human':`${e?.fromName||'对方'} 点了你的名，轮到你回嘴了。`,working:e?.status==='replying'?`${e.toName} 正在回嘴…`:`${e?.fromName||'选手'} 正在组织语言…`}[b.status]||'';
 const speech=(name,target,text,reply)=>`<article class="banter-line ${reply?'banter-reply':''}"><header><strong>${esc(name)}</strong><span>→ ${esc(target)} · ${reply?'回应':'开麦'}</span></header><p>${esc(text)}</p></article>`;
 return `<section class="round-banter" data-banter-id="${esc(b.id)}"><header class="banter-heading"><h3>赛后互怼</h3><span>一来一回 · 最多两组</span></header>${b.exchanges.map(x=>`<div class="banter-exchange">${x.opener?speech(x.fromName,x.toName,x.opener,false):''}${x.reply?speech(x.toName,x.fromName,x.reply,true):''}</div>`).join('')}<p class="banter-status" role="status">${esc(status)}</p>${controls&&waiting?`<form data-banter-form data-exchange-id="${esc(e.id)}"><label for="banter-${esc(e.id)}">你来回应 ${esc(e.fromName)}</label><div class="banter-input-row"><input id="banter-${esc(e.id)}" data-banter-input maxlength="120" autocomplete="off" placeholder="别替我说，让我自己来！"><button type="submit" class="primary">回嘴</button></div></form>`:''}${controls&&banterPending(b)?`<div class="button-row">${b.status==='error'?'<button data-banter-action="retry">重试这一句</button>':''}<button data-banter-action="skip">跳过剩余互怼</button></div>`:''}</section>`;
}
export function bindBanterControls(container,act){
 container.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-banter-form]');if(!form)return;event.preventDefault();
  const text=form.querySelector('[data-banter-input]').value.trim();if(!text)return;
  const button=form.querySelector('button');button.disabled=true;
  try{await act('banter-reply',{banterId:form.closest('[data-banter-id]').dataset.banterId,exchangeId:form.dataset.exchangeId,text});}finally{if(button.isConnected)button.disabled=false;}
 });
 container.addEventListener('click',async event=>{
  const button=event.target.closest('[data-banter-action]');if(!button)return;button.disabled=true;
  try{await act('banter-'+button.dataset.banterAction,{banterId:button.closest('[data-banter-id]').dataset.banterId});}finally{if(button.isConnected)button.disabled=false;}
 });
}
export function captureBanterDraft(container){
 const input=container.querySelector('[data-banter-input]');return input?{id:input.id,value:input.value,focused:input===document.activeElement,start:input.selectionStart,end:input.selectionEnd}:null;
}
export function restoreBanterDraft(container,draft){
 const input=container.querySelector('[data-banter-input]');if(!draft||input?.id!==draft.id)return;
 input.value=draft.value;if(draft.focused){input.focus({preventScroll:true});input.setSelectionRange(draft.start,draft.end);}
}
