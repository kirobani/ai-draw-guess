import {CharacterView} from './avatar-renderer.mjs';
import {seatCharacter,seatPresentation,tablePlaces} from './seat-presentation.mjs';
import {latestSpeech,messageBody,messageLabel} from './conversation.mjs';
import {playerModelLabel,playerLabel} from './characters.mjs';


const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createPlayerSeats(container,{View=CharacterView,onPreparation=()=>{}}={}){
  const seats=new Map();let gameId=null,paused=false,prepared=[],active=false;
  // Keep initialized canvases connected and sized while the lobby is visible.
  const parking=document.createElement('div');parking.className='seat-preload-parking';parking.setAttribute('aria-hidden','true');parking.inert=true;document.body.append(parking);
  function report(){const chosen=prepared.map(p=>seats.get(p.id)).filter(Boolean);onPreparation({total:prepared.length,ready:chosen.filter(s=>s.status==='ready').length,failed:chosen.filter(s=>s.status==='error').length});}
  function remove(id){const seat=seats.get(id);seat.view?.destroy();seat.card.remove();seats.delete(id);}
  function clear(){for(const id of seats.keys())remove(id);gameId=null;parking.remove();}
  function mount(player,character,home){
    const card=document.createElement('article');
    card.className=player.human?'player-seat human-seat':'player-seat ai-seat';card.dataset.playerId=player.id;
    card.innerHTML='<header><div class="seat-identity"><strong class="seat-name"></strong><small class="seat-model"></small></div><span class="seat-score"></span></header><div class="seat-stage"></div><div class="seat-dialogue" hidden></div><div class="seat-caption"><span class="seat-role"></span><span class="seat-status"></span></div><div class="seat-feedback"></div>';
    const seat={card,characterId:character?.id,modelUrl:character?.modelUrl,view:null,feedbackKey:'',status:'loading'};seats.set(player.id,seat);home.append(card);
    if(character){
      const stage=card.querySelector('.seat-stage');
      stage.innerHTML='<canvas></canvas><span class="seat-loading" role="status">角色加载中…</span><button class="seat-retry" hidden>重新加载角色</button>';
      const canvas=stage.querySelector('canvas'),loading=stage.querySelector('.seat-loading'),retry=stage.querySelector('button');
      canvas.setAttribute('aria-label',`${player.name} 的 Live2D 角色`);card.dataset.character=character.id;
      seat.load=()=>{
        seat.view?.destroy();const next=canvas.cloneNode();stage.querySelector('canvas').replaceWith(next);loading.hidden=false;loading.textContent='角色加载中…';retry.hidden=true;
        seat.status='loading';report();
        const view=new View(next,{modelUrl:character.modelUrl,motion:character.motion,framing:'portrait',onReady:()=>{if(seat.view!==view||seats.get(player.id)!==seat)return;loading.hidden=true;seat.status='ready';report();},onError:()=>{if(seat.view!==view||seats.get(player.id)!==seat)return;loading.textContent='角色加载失败';retry.hidden=false;seat.status='error';report();}});
        seat.view=view;view.setState(card.dataset.state||'idle');view.setPaused(paused);view.setSuspended?.(!active);view.load();
      };
      retry.onclick=seat.load;seat.load();
    }else{card.querySelector('.seat-stage').remove();const mark=document.createElement('span');mark.className='human-mark';mark.setAttribute('aria-hidden','true');mark.textContent='✎';card.append(mark);}
    return seat;
  }
  function reconcile(players,home){
    const ids=new Set(players.map(p=>p.id));for(const id of seats.keys())if(!ids.has(id))remove(id);
    for(const [i,player] of players.entries()){
      const character=seatCharacter(player);let seat=seats.get(player.id);
      if(seat&&(seat.characterId!==character?.id||seat.modelUrl!==character?.modelUrl)){remove(player.id);seat=null;}
      seat||=mount(player,character,home);
      if(home.children[i]!==seat.card)home.insertBefore(seat.card,home.children[i]||null);
      seat.view?.setSuspended?.(!active);
    }
  }
  function prepare(players){prepared=players.filter(p=>!p.human);if(!active)reconcile(prepared,parking);report();}
  function retryPrepared(){if(active)return;for(const seat of seats.values())if(seat.status==='error')seat.load?.();}
  function update(game,animating=false){
    if(!game||game.phase==='finished'){
      if(active){active=false;gameId=null;reconcile(prepared,parking);report();}
      return;
    }
    active=true;const changed=gameId!==game.id;gameId=game.id;reconcile(game.players,container);
    const places=tablePlaces(game.players);
    // Stable seats and canvases survive polling, scoring and artist changes.
    for(const player of game.players){
      const character=seatCharacter(player),seat=seats.get(player.id);
      const {card}=seat,presentation=seatPresentation(game,player,animating),r=presentation.result;
      if(changed)seat.feedbackKey='';
      card.dataset.place=places.get(player.id);
      card.style.setProperty('--p-color',player.color||character?.color||'#67738f');
      card.setAttribute('aria-label',`${playerLabel(player)} · ${presentation.role}`);
      card.dataset.state=presentation.state;card.classList.toggle('is-artist',presentation.artist);card.classList.toggle('solved',!!r?.solved);
      card.querySelector('.seat-name').textContent=player.name;
      card.querySelector('.seat-model').textContent=playerModelLabel(player);
      card.querySelector('.seat-model').hidden=!!player.human;
      card.querySelector('.seat-score').textContent=game.mode==='relay'?`第 ${game.index+1} 棒`:`${presentation.total} 分`;
      card.querySelector('.seat-role').textContent=(player.human?'你 · ':'')+presentation.role;
      card.querySelector('.seat-status').textContent=presentation.status;
      seat.view?.setState(presentation.state);
      const speech=latestSpeech(game,player.id),key=JSON.stringify([speech,r?.error]);
      if(key!==seat.feedbackKey){
        seat.feedbackKey=key;
        const dialogue=card.querySelector('.seat-dialogue');dialogue.hidden=!speech;
        if(speech){dialogue.dataset.kind=speech.kind;dialogue.tabIndex=0;dialogue.setAttribute('aria-label',`${player.name} 的消息`);dialogue.innerHTML=`<span class="speech-label">${escape(messageLabel(speech))}</span>${messageBody(speech)}`;}
        card.querySelector('.seat-feedback').innerHTML=r?.error?`<div class="error-message">${escape(r.error)}</div>`:'';
      }
    }
  }
  function setPaused(value){paused=value;for(const seat of seats.values())seat.view?.setPaused(paused);}
  addEventListener('pagehide',clear,{once:true});
  return {update,prepare,retryPrepared,setPaused,destroy:clear};
}
