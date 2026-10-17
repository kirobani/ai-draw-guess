import {CharacterView} from './avatar-renderer.mjs';
import {CHARACTERS,CHARACTER_MAP} from './characters.mjs';
import {characterState,focusedPlayer} from './avatar-state.mjs';
export function createCompanion(){
 const panel=document.createElement('section');panel.className='companion';panel.setAttribute('aria-label','可动角色');
 panel.innerHTML='<canvas aria-label="Live2D 角色"></canvas><div class="companion-copy"><select aria-label="陪伴角色"><option value="auto">跟随比赛中的选手</option>'+CHARACTERS.map(c=>`<option value="${c.id}">${c.name} · ${c.title}</option>`).join('')+'</select><h3></h3><p class="companion-status" role="status"></p><a href="/avatar.html" target="_blank" rel="noopener">完整动作预览 ↗</a><button aria-pressed="false">暂停动作</button></div>';
 document.getElementById('lobby').append(panel);
 const status=panel.querySelector('.companion-status'),heading=panel.querySelector('h3'),select=panel.querySelector('select'),pause=panel.querySelector('button');
 let view,characterId,ready=false,failed=false,paused=false,currentText='',lastGame=null,lastAnimating=false;
 function show(c){
  if(characterId===c.id)return;characterId=c.id;ready=false;failed=false;delete panel.dataset.error;view?.destroy();
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',c.name+' Live2D 角色');panel.querySelector('canvas').replaceWith(canvas);status.textContent='正在加载 '+c.name+'…';
  panel.querySelector('a').href='/avatar.html?character='+c.id;
  view=new CharacterView(canvas,{modelUrl:c.modelUrl,motion:c.motion,framing:'portrait',onReady:()=>{ready=true;status.textContent=currentText;},onError:()=>{failed=true;panel.dataset.error='true';status.textContent='角色未能加载，请打开动作预览查看。';}});
  view.setPaused(paused);view.load();
 }
 function update(game,animating=false){
  lastGame=game;lastAnimating=animating;
  panel.hidden=!!game;
  if(game){view?.destroy();view=null;characterId=null;return;}
  const player=select.value==='auto'?focusedPlayer(game,animating):game?.players.find(p=>p.characterId===select.value);
  const c=CHARACTER_MAP[select.value==='auto'?player?.characterId||'deepseek':select.value]||CHARACTERS[0];show(c);
  const state=characterState(game,player,animating);currentText=c.lines[state]||c.lines.idle;
  heading.textContent=(player?.name||c.name)+' · '+({drawing:'正在画画',thinking:'正在思考',confident:'自信等待',happy:'猜中啦',sad:'O□O',idle:player?'参赛角色':'观赛伙伴'})[state];
  panel.dataset.state=state;view.setState(state);if(ready&&!failed)status.textContent=currentText;
 }
 select.onchange=()=>update(lastGame,lastAnimating);
 pause.onclick=()=>{paused=!paused;view?.setPaused(paused);pause.textContent=paused?'继续动作':'暂停动作';pause.setAttribute('aria-pressed',String(paused));};
 update(null);addEventListener('pagehide',()=>view?.destroy(),{once:true});return {update};
}
