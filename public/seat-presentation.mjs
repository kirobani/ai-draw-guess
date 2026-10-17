import {submittedLabel} from './guess-confidence.mjs';
import {CHARACTER_MAP,resolveCharacter} from './characters.mjs';
import {characterState} from './avatar-state.mjs';

// A visual fallback never changes the model identity or its personality prompt.
export function seatCharacter(player){
  if(player.human)return null;
  return resolveCharacter({...player,characterId:player.characterId==='none'?undefined:player.characterId})||CHARACTER_MAP.chatgpt;
}
export function seatPresentation(game,player,animating=false){
  if(game.mode==='relay'){
    const result=game.results?.[player.id],artist=game.relay.kind==='draw',status=result?.status;
    return {state:characterState(game,player),status:status==='queued'?'排队中…':status==='error'?'连接失败':status==='skipped'?'本棒留空':status==='submitted'?(artist?'画好了，等大家交卷':submittedLabel(result?.confidence)):artist?'正在画画':'正在看图猜词',role:artist?'本棒画手':'本棒猜手',artist,result,total:0};
  }
  const result=game.results?.[player.id],artist=game.artistId===player.id;
  let status='等待中';
  if(artist){
    status=animating?'正在画画':({drawing:'正在画画','drawing-ai':'正在构思','draw-error':'作画连接失败',ready:'画好了',reveal:`本题作画 +${game.roundGain||0} 分`})[game.phase]||'等待大家猜题';
  }else if(result){
    status=result.solved?`猜中！+${result.points} 分`:result.status==='confident'?submittedLabel(result.confidence):result.status==='submitted'?'已交卷':result.status==='queued'?'排队中…':result.status==='thinking'?'模型处理中…':result.status==='wrong'?`没猜中 · 已猜 ${result.attempts} 次`:result.status==='error'?'连接失败':game.phase==='reveal'?'未作答':player.human&&game.phase==='guessing'?'轮到你了':'等待中';
  }
  const state=characterState(game,player,animating);
  if(state==='spectator')status=`已猜中 · 围观中 · +${result.points} 分`;
  return {state,status,role:artist?'画手':'猜手',artist,result,total:player.total||0};
}

// Stable places around the canvas. The human sits nearest the drawing controls.
export function tablePlaces(players){
  const guests=players.filter(p=>!p.human),human=players.find(p=>p.human);
  const large=players.length>10;
  const top=large?['north-west','north-inner-west','north-inner-east','north-east']:guests.length<3?['north']:guests.length<5?['north-west','north-east']:['north-west','north','north-east'];
  // Up to twelve AI seats surround the canvas; the thirteenth seat is south.
  // When a human plays, south is reserved for them and never shared with an AI.
  const places=[...top,'west-middle','east-middle','west-top','east-top','west-bottom','east-bottom',...(large?['west-lower','east-lower']:[]),...(!human?['south']:[])];
  return new Map([...guests.map((p,i)=>[p.id,places[i]]),...(human?[[human.id,'south']]:[])]);
}


export function updateArenaLayout(game){
  const active=!!game&&game.phase!=='finished';
  const roundtable=active&&game.mode!=='duel';
  document.body.classList.toggle('roundtable',roundtable);
  const arena=document.querySelector('.arena');
  arena.dataset.players=String(game?.players.length||0);
  arena.dataset.tableSize=game?.players.length>10?'large':'standard';
  arena.dataset.sideRows=game?.players.filter(p=>!p.human).length>10?'4':'3';
  // Reparent only on entering/leaving the table; existing canvases and drafts survive polling.
  const heading=document.querySelector('.guess-heading');
  const headingHome=roundtable?document.querySelector('.game-controls'):document.querySelector('.play-sidebar');
  if(heading.parentElement!==headingHome)headingHome.prepend(heading);
  const privacy=document.getElementById('privacyNote');
  const privacyHome=roundtable?document.querySelector('.canvas-column'):document.querySelector('.play-sidebar');
  if(privacy.parentElement!==privacyHome)privacyHome.append(privacy);
  const panel=document.getElementById('conversationPanel');
  const chatHome=game?.phase==='finished'?document.getElementById('results').parentElement:roundtable?arena:document.querySelector('.canvas-column');
  if(game&&!panel.dataset.panelExpanded&&panel.parentElement!==chatHome)chatHome.append(panel);
}
