import {drawingTransition} from './drawing-playback.mjs';
export function createRecordingClient({getGame,send,onError=()=>{}}){
  let queue=[],flushing=null,previous=[],scope='',strokeStarted=0,failed=false;
  function context(){const g=getGame();return g?{gameId:g.id,index:g.index,turn:g.turn||1,chainId:g.relay?.myTask?.chainId||null}:null;}
  function emit(type,data={}){const c=context();if(!c||c.index<0)return;queue.push({...c,id:crypto.randomUUID(),at:Date.now(),type,...data});if(queue.length>=20)flush();}
  async function flush(){
    if(flushing){await flushing;if(queue.length)return flush();return;}
    const active=context()?.gameId;
    if(active)queue=queue.filter(e=>e.gameId===active);
    if(!queue.length)return;
    const batch=queue.slice(0,20),gameId=batch[0].gameId,items=batch.filter(e=>e.gameId===gameId);
    flushing=send('/api/recording-events',{gameId,events:items}).then(()=>{queue=queue.filter(e=>!items.includes(e));failed=false;}).catch(()=>{if(!failed)onError('落笔过程暂未保存，正在重试；最终提交画作仍会记录。');failed=true;}).finally(()=>{flushing=null;});
    await flushing;if(!failed&&queue.length)await flush();
  }
  function sync(shapes){const c=context();if(!c)return;scope=`${c.gameId}:${c.index}:${c.chainId||''}`;previous=structuredClone(shapes);emit('drawing-edit',{keep:0,append:shapes,operation:'sync'});}
  function edit(shapes,operation='stroke'){
    const c=context();if(!c)return;const key=`${c.gameId}:${c.index}:${c.chainId||''}`;
    if(key!==scope){scope=key;previous=[];}
    const plan=drawingTransition(previous,shapes);emit('drawing-edit',{keep:plan.keep,append:plan.append,operation,startedAt:strokeStarted||Date.now()});previous=structuredClone(shapes);strokeStarted=0;
  }
  const timer=setInterval(()=>flush(),1200);addEventListener('pagehide',()=>{flush();clearInterval(timer);},{once:true});
  return {emit,edit,sync,beginStroke(){strokeStarted=Date.now();},flush};
}
