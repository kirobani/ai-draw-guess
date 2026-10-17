import {submittedExpression} from './guess-confidence.mjs';
export const CELEBRATION_MS=4500;
export function characterState(game,player,animating=false,now=Date.now()){
 if(!game||game.phase==='finished'||!player)return 'idle';
 const r=game.results?.[player.id];
 const submitted=()=>submittedExpression(r?.confidence,`${game.id}:${game.index}:${game.turn??game.relay?.step}:${player.id}`);
 if(game.mode==='relay'){const status=r?.status;return status==='submitted'?(game.relay.kind==='draw'?'finished':submitted()):['queued','error','skipped'].includes(status)?'idle':game.relay.kind==='draw'?'drawing':'thinking';}
 if(game.artistId===player.id){
  if(animating||['drawing-ai','drawing'].includes(game.phase))return 'drawing';
  if(game.phase==='reveal')return Object.values(game.results||{}).some(r=>r.solved)?'happy':'sad';
  return game.phase==='draw-error'?'idle':'finished';
 }
 if(r?.status==='confident')return submitted();
 if(r?.solved)return r.judgedAt&&now-r.judgedAt>=CELEBRATION_MS?'spectator':'happy';
 if(r?.status==='thinking')return 'thinking';
 if(r?.status==='wrong')return 'sad';
 return 'idle';
}
export function focusedPlayer(game,animating=false){
 const players=game?.players.filter(p=>!p.human&&p.characterId!=='none')||[];
 if(animating||['drawing-ai','ready'].includes(game?.phase))return players.find(p=>p.id===game.artistId)||players[0];
 return players.find(p=>game.results?.[p.id]?.status==='confident')||players.find(p=>game.results?.[p.id]?.status==='thinking')||players.find(p=>game.results?.[p.id])||players[0];
}
