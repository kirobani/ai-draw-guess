import {mountProduction} from './production-player.mjs';
import {CharacterView} from './avatar-renderer.mjs';
import {CHARACTER_MAP} from './characters.mjs';
const $=id=>document.getElementById(id);let player,view,characterId='',avatarHost=null;
async function get(url){const r=await fetch(url,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'读取记录失败。');return d;}
function frame({view:v,avatarHost:host}){
  const c=CHARACTER_MAP[v.player?.characterId];
  if(!c){view?.destroy();view=null;characterId='';host.textContent=v.player?.human?'✎':'✦';return;}
  if(characterId!==c.id||avatarHost!==host){
    view?.destroy();host.replaceChildren();const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',c.name+' 的回放角色');host.append(canvas);characterId=c.id;avatarHost=host;
    view=new CharacterView(canvas,{modelUrl:c.modelUrl,motion:c.motion,framing:'portrait',onError:()=>{$('productionStatus').textContent='画作和文字可正常回放；角色加载失败，可刷新重试。';}});view.load();
  }view.setState(v.expression);
}
function load(data,id=''){
  if(!data?.recording?.events?.length)throw new Error('这是旧版结果复盘，没有完整素材时间线。请使用升级后的新局记录。');
  player?.destroy();view?.destroy();view=null;characterId='';avatarHost=null;
  player=mountProduction($('productionRoot'),data,{onFrame:frame});window.drawGuessProduction=player;
  for(const [button,type] of [['downloadProduction','production'],['downloadCharacters','characters']]){const a=$(button);a.hidden=!id;a.href=`/api/${type}?id=${encodeURIComponent(id)}`;a.setAttribute('download','');}
  $('productionStatus').textContent=`${new Date(data.recording.startedAt).toLocaleString('zh-CN')} · ${data.recording.events.length} 条记录 · ${Object.keys(data.recording.assets).length} 版画作。角色资源较大，同一套角色保存一次即可。${data.recording.status==='interrupted'?' 这场对局曾中断，当前显示已保存部分。':''}`;
}
async function select(id){if(!id)return;try{load(await get('/api/recording?id='+encodeURIComponent(id)),id);}catch(e){$('productionStatus').textContent=e.message;}}
async function refresh(){
  try{const {recordings}=await get('/api/recordings'),sel=$('recordingLibrary'),old=sel.value;sel.replaceChildren(new Option('选择已保存的比赛',''));for(const r of recordings)sel.add(new Option(`${new Date(r.startedAt).toLocaleString('zh-CN')} · ${r.mode==='relay'?'接龙':'比赛'} · ${r.category} · ${r.players.length} 人${r.status==='interrupted'?' · 中断记录':''}`,r.id));sel.value=old;
    if(!recordings.length)$('productionStatus').textContent='目前没有新版记录。升级后开始的新局会自动保存，结束后可在这里回放。';
  }catch(e){$('productionStatus').textContent=e.message;}
}
$('recordingLibrary').onchange=()=>select($('recordingLibrary').value);$('refreshRecordings').onclick=refresh;
$('importRecording').onchange=async()=>{const f=$('importRecording').files[0];if(!f)return;try{if(f.size>150_000_000)throw new Error('记录文件过大，请使用本机记录列表。');load(JSON.parse(await f.text()));}catch(e){$('productionStatus').textContent=e.message;}};
await refresh();const id=new URL(location.href).searchParams.get('id');if(id){$('recordingLibrary').value=id;await select(id);}else if(new URL(location.href).searchParams.has('current')){try{const data=await get('/api/export');load(data,data.id);}catch(e){$('productionStatus').textContent=e.message;}}
addEventListener('pagehide',()=>{view?.destroy();player?.destroy();});
