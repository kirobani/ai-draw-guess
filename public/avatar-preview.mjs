import {CharacterView} from './avatar-renderer.mjs';
import {CHARACTERS,CHARACTER_MAP} from './characters.mjs';
const $=id=>document.getElementById(id),labels={"idle":"待机","drawing":"画画","finished":"画完等待","confident":"自信","uncertain":"犹豫","random":"瞎蒙","happy":"庆祝","spectator":"吃瓜","sad":"猜错"};
let paused=false,eyesClosed=false,framing='portrait',currentState='idle',view;
const selector=$('characterSelect');
selector.innerHTML=CHARACTERS.map(c=>`<option value="${c.id}">${c.name} · ${c.title}</option>`).join('');
async function select(id){
 const c=CHARACTER_MAP[id]||CHARACTERS[0];selector.value=c.id;view?.destroy();
 const url=new URL(location.href);url.searchParams.set('character',c.id);history.replaceState(null,'',url);
 const old=$('avatarCanvas'),canvas=document.createElement('canvas');canvas.id='avatarCanvas';canvas.setAttribute('aria-label',c.name+' Live2D 角色');old.replaceWith(canvas);
 document.title=c.name+' · 角色预览';document.querySelector('.avatar-stage').setAttribute('aria-label',c.name+' 动作预览');$('characterName').textContent=c.name+'.';$('characterIntro').textContent=c.personality;$('characterNumber').textContent=String(CHARACTERS.indexOf(c)+1).padStart(2,'0')+' / '+String(CHARACTERS.length).padStart(2,'0');$('stageName').textContent=c.name.toUpperCase();$('stageTitle').textContent=c.title;
 $('loadStatus').hidden=false;$('loadStatus').textContent='正在唤醒 '+c.name+'…';$('modelStatus').textContent='正在加载模型…';
 view=new CharacterView(canvas,{modelUrl:c.modelUrl,motion:c.motion,framing,onReady:()=>{$('loadStatus').hidden=true;$('modelStatus').textContent='Kit 九表情高清版 · 已加载';},onError:e=>{$('loadStatus').hidden=false;$('loadStatus').textContent=e.message;}});
 state(currentState);view.setPaused(paused);pose();await view.load();
}
selector.onchange=()=>select(selector.value);
$('framingButton').onclick=()=>{framing=framing==='face'?'portrait':'face';view.setFraming(framing);$('framingButton').textContent=framing==='face'?'看半身':'看表情';};
function state(value){currentState=value;view?.setState(value);setEyes(value==='closed');$('stateLabel').textContent=labels[value];document.querySelectorAll('[data-expression]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.expression===value)));}
document.querySelector('.expression-grid').onclick=e=>{const b=e.target.closest('[data-expression]');if(b)state(b.dataset.expression);};
function pose(){view?.setPose(+$('poseX').value,+$('poseY').value);$('poseXValue').textContent=$('poseX').value+'°';$('poseYValue').textContent=$('poseY').value+'°';}
$('poseX').oninput=pose;$('poseY').oninput=pose;
$('blinkButton').onclick=()=>{state('idle');setEyes(false);if(paused)setPaused(false);view.blink();};
function setEyes(value){eyesClosed=value;view?.setEyesClosed(value);const shownClosed=value||currentState==='closed';$('eyesButton').textContent=shownClosed?'睁开眼睛':'闭眼看看';$('eyesButton').setAttribute('aria-pressed',String(shownClosed));}
$('eyesButton').onclick=()=>{if(currentState==='closed')state('idle');else setEyes(!eyesClosed);};
function setPaused(value){paused=value;view?.setPaused(paused);$('pauseButton').textContent=value?'继续动作':'暂停动作';$('pauseButton').setAttribute('aria-pressed',String(value));}
$('pauseButton').onclick=()=>setPaused(!paused);
$('resetButton').onclick=()=>{$('poseX').value='0';$('poseY').value='0';pose();state('idle');setEyes(false);setPaused(false);};
select(new URLSearchParams(location.search).get('character')||'deepseek');
addEventListener('pagehide',()=>view?.destroy(),{once:true});
