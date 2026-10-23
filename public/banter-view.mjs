import {escapeText as esc} from './conversation.mjs';
export const banterPending=b=>!!b&&!['complete','empty','skipped'].includes(b.status);
export function banterMarkup(b,{controls=true}={}){
 if(!b)return '';
 const e=b.exchanges[b.index],waiting=b.status==='waiting-human',owed=b.exchanges.find(x=>x.manual&&!x.reply&&x.status!=='skipped');
 const status={empty:'这回大家暂时休战。',complete:'这一轮回嘴结束，聊天记录已保留。',skipped:'已跳过剩余互怼，已说的内容保留。',error:e?.error,waiting:'准备开麦…','waiting-human':`${e?.fromName||'对方'} 点了你的名，轮到你回嘴了。`,working:e?.status==='replying'?`${e.toName} 正在回嘴…`:`${e?.fromName||'选手'} 正在组织语言…`}[b.status]||'';
 const speech=(name,target,text,reply)=>`<article class="banter-line ${reply?'banter-reply':''}"><header><strong>${esc(name)}</strong><span>→ ${esc(target)} · ${reply?'回应':'开麦'}</span></header><p>${esc(text)}</p></article>`;
 const challenge=controls&&b.canChallenge&&b.targets?.length?`<form id="challenge-${esc(b.id)}" data-banter-challenge class="banter-challenge"><label for="challenge-text-${esc(b.id)}">你也来开麦</label><div class="banter-input-row"><select id="challenge-target-${esc(b.id)}" data-banter-target aria-label="点名哪位 AI">${b.targets.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><input id="challenge-text-${esc(b.id)}" data-banter-input maxlength="120" autocomplete="off" placeholder="想吐槽哪一笔、哪次猜词？直接说！"><button type="submit" class="primary" data-waiting="${!!owed}" ${owed?'disabled':''}>点名开麦</button></div><p class="banter-help">${owed?`${esc(owed.toName)} 还欠你一句回应；失败可重试，前面的互动结束后会轮到它。`:'点谁谁回应；一次点名一位，回完可以继续。你的原话和 AI 回应都会保留。'}</p></form>`:'';
 return `<section class="round-banter" data-banter-id="${esc(b.id)}"><header class="banter-heading"><h3>赛后互怼</h3><span>自动最多两组 · 你可主动点名</span></header>${b.exchanges.map(x=>`<div class="banter-exchange">${x.opener?speech(x.fromName,x.toName,x.opener,false):''}${x.reply?speech(x.toName,x.fromName,x.reply,true):''}</div>`).join('')}<p class="banter-status" role="status">${esc(status)}</p>${controls&&waiting?`<form data-banter-form data-exchange-id="${esc(e.id)}"><label for="banter-${esc(e.id)}">你来回应 ${esc(e.fromName)}</label><div class="banter-input-row"><input id="banter-${esc(e.id)}" data-banter-input maxlength="120" autocomplete="off" placeholder="别替我说，让我自己来！"><button type="submit" class="primary">回嘴</button></div></form>`:''}${controls&&banterPending(b)?`<div class="button-row">${b.status==='error'?'<button data-banter-action="retry">重试这一句</button>':''}<button data-banter-action="skip">跳过剩余互怼</button></div>`:''}${challenge}</section>`;
}
export function bindBanterControls(container,act){
 container.addEventListener('submit',async event=>{
  const challenge=event.target.closest('[data-banter-challenge]');
  if(challenge){
   event.preventDefault();if(challenge.dataset.submitting)return;
   const input=challenge.querySelector('[data-banter-input]'),target=challenge.querySelector('[data-banter-target]'),text=input.value.trim();if(!text)return;
   const requestId=challenge.dataset.requestId||crypto.randomUUID();challenge.dataset.requestId=requestId;challenge.dataset.submitting='true';
   const button=challenge.querySelector('button');if(button.disabled){delete challenge.dataset.submitting;return;}button.disabled=true;
   try{
    const accepted=await act('banter-challenge',{banterId:challenge.closest('[data-banter-id]').dataset.banterId,targetId:target.value,text,requestId});
    const current=[...container.querySelectorAll('[data-banter-challenge]')].find(f=>f.id===challenge.id),field=current?.querySelector('[data-banter-input]');
    if(accepted&&current?.dataset.requestId===requestId&&field?.value.trim()===text){field.value='';delete current.dataset.requestId;}
   }finally{
    const current=[...container.querySelectorAll('[data-banter-challenge]')].find(f=>f.id===challenge.id);
    if(current){delete current.dataset.submitting;const send=current.querySelector('button');send.disabled=send.dataset.waiting==='true';}
   }
   return;
  }
  const form=event.target.closest('[data-banter-form]');if(!form)return;event.preventDefault();
  const text=form.querySelector('[data-banter-input]').value.trim();if(!text)return;
  const button=form.querySelector('button');button.disabled=true;
  try{await act('banter-reply',{banterId:form.closest('[data-banter-id]').dataset.banterId,exchangeId:form.dataset.exchangeId,text});}finally{if(button.isConnected)button.disabled=false;}
 });
 const changed=event=>{const form=event.target.closest('[data-banter-challenge]');if(form)delete form.dataset.requestId;};
 container.addEventListener('input',changed);container.addEventListener('change',changed);
 container.addEventListener('click',async event=>{
  const button=event.target.closest('[data-banter-action]');if(!button)return;button.disabled=true;
  try{await act('banter-'+button.dataset.banterAction,{banterId:button.closest('[data-banter-id]').dataset.banterId});}finally{if(button.isConnected)button.disabled=false;}
 });
}
export function captureBanterDraft(container){
 return {fields:[...container.querySelectorAll('[data-banter-input],[data-banter-target]')].map(input=>({id:input.id,value:input.value,focused:input===document.activeElement,start:input.selectionStart,end:input.selectionEnd})),
  forms:[...container.querySelectorAll('[data-banter-challenge]')].map(form=>({id:form.id,requestId:form.dataset.requestId,submitting:form.dataset.submitting}))};
}
export function restoreBanterDraft(container,draft){
 for(const field of draft?.fields||[]){
  const input=[...container.querySelectorAll('[data-banter-input],[data-banter-target]')].find(input=>input.id===field.id);if(!input)continue;
  input.value=field.value;if(field.focused){input.focus({preventScroll:true});if(input.setSelectionRange)input.setSelectionRange(field.start,field.end);}
 }
 for(const saved of draft?.forms||[]){
  const form=[...container.querySelectorAll('[data-banter-challenge]')].find(form=>form.id===saved.id);if(!form)continue;
  if(saved.requestId)form.dataset.requestId=saved.requestId;
  if(saved.submitting){form.dataset.submitting=saved.submitting;form.querySelector('button').disabled=true;}
 }
}
