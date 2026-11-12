import {CharacterView} from './avatar-runtime.mjs';
import {CHARACTERS} from './characters.mjs';
import {MODEL_FAMILY_NAMES} from './model-family-avatars.mjs';
const filter=document.getElementById('familyFilter');
const url=new URL(location.href);
const family=url.searchParams.get('family');
for(const [id,name] of Object.entries(MODEL_FAMILY_NAMES))filter.add(new Option(name,id));
filter.value=Object.hasOwn(MODEL_FAMILY_NAMES,family)?family:'';
filter.onchange=()=>{
 if(filter.value)url.searchParams.set('family',filter.value);
 else url.searchParams.delete('family');
 location.href=url.href;
};
let state='drawing',paused=false;
const views=[],labels={"idle":"待机","drawing":"画画","finished":"画完等待","confident":"自信","uncertain":"犹豫","random":"瞎蒙","happy":"庆祝","spectator":"吃瓜","sad":"猜错"};
for(const c of CHARACTERS.filter(c=>(c.family||'')===filter.value)){
 const card=document.createElement('article');card.dataset.character=c.id;
 card.innerHTML=`<header><div><h2>${c.name}</h2><small>${c.title}</small></div><a href="/avatar.html?character=${c.id}" aria-label="单独看 ${c.name}">单独看 ↗</a></header><canvas aria-label="${c.name} 可动角色"></canvas><p class="status" role="status">正在唤醒…</p>`;
 document.getElementById('cards').append(card);
 const status=card.querySelector('.status');
 if(c.portraitUrl&&!c.ready){const portrait=new Image();portrait.className='review-portrait';portrait.src=c.portraitUrl;portrait.alt=c.name+'的立绘';card.querySelector('canvas').replaceWith(portrait);status.textContent='立绘预览 · Live2D 制作中';continue;}
 const view=new CharacterView(card.querySelector('canvas'),{modelUrl:c.modelUrl,motion:c.motion,framing:'full',onReady:()=>{status.textContent=labels[state];view.setState(state);view.setPaused(paused)},onError:e=>{status.textContent=e.message;status.classList.add('error')}});
 views.push({view,status});view.setState(state);await view.load();
}
document.querySelector('nav').onclick=e=>{
 const button=e.target.closest('[data-state]');if(!button)return;
 state=button.dataset.state;
 document.querySelectorAll('[data-state]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 views.forEach(({view,status})=>{view.setEyesClosed(state==='closed');view.setState(state);status.textContent=labels[state]});
};
document.getElementById('pause').onclick=e=>{paused=!paused;e.currentTarget.textContent=paused?'继续动作':'暂停动作';e.currentTarget.setAttribute('aria-pressed',String(paused));views.forEach(({view})=>view.setPaused(paused));};
addEventListener('pagehide',()=>views.forEach(({view})=>view.destroy()),{once:true});
