import {createHash} from 'node:crypto';
import {mkdir,appendFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {CHARACTER_MAP} from '../public/characters.mjs';
import {characterState} from '../public/avatar-state.mjs';
import {validateShapes} from './shapes.mjs';

const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
const ID=/^[a-f0-9-]{36}$/;
const safeReceipt=r=>Object.fromEntries(['requestedModel','responseModel','provider','requestId','source','costUSD','reasoningEffort'].filter(k=>r?.[k]!==undefined).map(k=>[k,r[k]]));

// Recording lives beside the game. It never changes guessing visibility or prompts.
export class MatchRecording {
  constructor(game,{write=()=>{},clock=Date.now,secrets=[]}={}){
    this.game=game;this.clock=clock;this.write=write;this.started=clock();this.events=[];this.assets={};this.state={};this.seenMessages=new Set();this.seenClient=new Set();this.clientDrafts=new Map();this.seq=0;this.persistenceError='';
    this.secrets=[...new Set([...secrets,...game.players.map(p=>p.apiKey)].filter(k=>typeof k==='string'&&k))];
    const players=this.clean(game.snapshot().players.map(p=>{const source=game.players.find(x=>x.id===p.id)||{};return {...p,...Object.fromEntries(['provider','reasoningEffort','replyMode'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]))};}));
    this.meta={schema:'draw-guess-production',schemaVersion:2,appVersion:'2.9.1',id:game.id,startedAt:new Date(this.started).toISOString(),startedAtMs:this.started,mode:game.mode,category:game.category,wordLevel:game.wordLevel,canvas:{width:1000,height:650,format:'vector-shapes'},players,
      characters:[...new Set(players.map(p=>p.characterId))].map(id=>CHARACTER_MAP[id]).filter(Boolean).map(c=>({id:c.id,name:c.name,modelUrl:c.modelUrl,motion:c.motion,rigRevision:'agentkit-expressions-r3'})),
      capabilities:{drawingVersions:true,guessesAndReasons:true,privateHints:true,banter:true,relayVotes:true,clientDrawingOperations:true,expressionStates:true,audio:false},
      timing:{unit:'milliseconds',origin:'startedAtMs',server:'state changes and message publication',client:'browser actions; stroke start/end and AI playback timings when browser connected',idleAnimation:'re-simulated; not per-frame motion capture'},
      notes:['提示、猜词理由是游戏输出；不记录模型内部思考。','人类笔迹记录原坐标、顺序和每笔起止时间；笔内速度可重新演绎。','麦克风、桌面声音不在素材包内，请保留 OBS 录音。']};
    this.persist({type:'header',data:this.meta});
    const touch=game.touch.bind(game);game.touch=(...args)=>{const result=touch(...args);this.capture();return result;};
    const run=game.run;game.run=async(p,...args)=>{const data=await run(p,...args);if(!game.aborted)this.event('model-response',{playerId:p.id,receipt:safeReceipt(data?.receipt),elapsed:data?.elapsed||0,queueMs:data?.queueMs||0});return data;};
    game.recording=this;this.capture();
  }
  clean(value){
    return JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='string'?this.secrets.reduce((s,key)=>s.split(key).join('[已隐藏密钥]'),v).replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [已隐藏]').replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[已隐藏密钥]'):v));
  }
  persist(entry){try{this.write(this.clean(entry));}catch{this.persistenceError='素材自动保存失败，请在结束后立即下载。';}}
  event(type,data,occurredAt=this.clock()){
    const t=Math.max(0,Math.min(this.clock()-this.started,occurredAt-this.started));
    const event=this.clean({seq:++this.seq,t,type,data});this.events.push(event);this.persist({type:'event',data:event});return event;
  }
  asset(shapes){
    const id='drawing-'+hash(shapes);
    if(!this.assets[id]){this.assets[id]={id,width:1000,height:650,shapes:clone(shapes)};this.persist({type:'asset',data:this.assets[id]});}
    return id;
  }
  compact(value){
    if(Array.isArray(value))return value.map(v=>this.compact(v));
    if(!value||typeof value!=='object')return value;
    const out={};for(const [key,v] of Object.entries(value)){
      if(key==='image'||key==='updated'||v===undefined)continue;
      if(key==='shapes'&&Array.isArray(v))out.drawingId=this.asset(v);else out[key]=this.compact(v);
    }return out;
  }
  capture(){
    const g=this.game,now=this.clock(),snapshot=g.snapshot();
    const {conversation,history,...base}=snapshot;
    const currentWord=g.word;
    const raw={...base,mode:g.mode,answer:currentWord?.answer??snapshot.answer??null,
      results:g.mode==='relay'?snapshot.results:clone(g.results||{}),privateHints:clone(g.privateHints||{}),
      history:clone(g.history||[]),expressions:Object.fromEntries(snapshot.players.map(p=>[p.id,characterState(snapshot,p,false,now)]))};
    if(g.mode==='relay'){
      raw.chains=g.chains.map(c=>({...c,steps:c.steps.map(s=>s?({...s}):null)}));
      raw.relayTasks=[...g.tasks.values()].map(t=>({playerId:t.playerId,chainId:t.chainId,kind:t.kind,status:t.status,fromId:t.fromId,input:t.input}));
      if(g.showcase)raw.relay={...snapshot.relay,showcase:{...snapshot.relay.showcase,ballots:clone(g.showcase.ballots)}};
    }
    const state=this.clean(this.compact(raw)),patch={};
    for(const [key,value] of Object.entries(state))if(JSON.stringify(value)!==JSON.stringify(this.state[key]))patch[key]=value;
    if(Object.keys(patch).length){this.state=state;this.event('state',patch);}
    for(const message of g.conversation||[])if(!this.seenMessages.has(message.id)){
      this.seenMessages.add(message.id);const {artistHuman,...m}=message;this.event('message',m,message.at);
    }
  }
  client(batch){
    if(!Array.isArray(batch)||batch.length>24)throw new Error('素材记录批次无效。');
    for(const item of batch){
      if(!item||typeof item.id!=='string'||item.id.length>100||!Number.isFinite(item.at)||!Number.isInteger(item.index)||item.index<0||item.index>=this.game.total)throw new Error('素材记录格式无效。');
      if(this.seenClient.has(item.id))continue;
      const data={clientId:item.id,index:item.index,turn:Number(item.turn)||1,chainId:typeof item.chainId==='string'?item.chainId:null};
      if(item.type==='drawing-edit'){
        const key=`${data.index}:${data.chainId||''}`,old=this.clientDrafts.get(key)||[];
        if(!Number.isInteger(item.keep)||item.keep<0||item.keep>old.length)throw new Error('笔迹记录需要重新同步。');
        const append=item.append?.length?validateShapes(item.append):[];
        const next=[...old.slice(0,item.keep),...append];if(next.length>450)throw new Error('笔迹记录过大。');
        this.clientDrafts.set(key,next);Object.assign(data,{keep:item.keep,append,operation:['stroke','undo','clear','sync'].includes(item.operation)?item.operation:'sync',startedAt:Math.max(0,Math.min(item.at,Number(item.startedAt)||item.at)-this.started)});
      }else if(item.type==='drawing-playback'){
        if(!['start','stroke','end','skip','speed'].includes(item.action))throw new Error('回放记录无效。');
        Object.assign(data,{action:item.action,revision:Number(item.revision)||0,speed:['slow','normal','fast'].includes(item.speed)?item.speed:'slow',shapeIndex:Number(item.shapeIndex)||0,duration:Math.max(0,Math.min(10000,Number(item.duration)||0))});
      }else if(item.type==='presentation'){
        if(!['pause-characters','resume-characters','sync-audio'].includes(item.action))throw new Error('展示记录无效。');data.action=item.action;
      }else throw new Error('未知素材记录。');
      this.seenClient.add(item.id);this.event(item.type,data,item.at);
    }
  }
  export(){this.capture();return this.clean(makeExport(this.meta,this.events,this.assets,this.state,this.game.snapshot(),this.persistenceError));}
}

function expand(value,assets){
  if(Array.isArray(value))return value.map(v=>expand(v,assets));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>k==='drawingId'?['shapes',clone(assets[v]?.shapes||[])]:[k,expand(v,assets)]));
}
function makeExport(meta,events,assets,state,snapshot=null,warning=''){
  const messages=events.filter(e=>e.type==='message').map(e=>e.data);
  return {version:2,exportedAt:new Date().toISOString(),...(snapshot||{...expand(state,assets),conversation:messages}),recording:{...meta,durationMs:events.reduce((max,e)=>Math.max(max,e.t),0),status:state.phase==='finished'?'finished':'interrupted',warning,events:clone(events),assets:clone(assets)}};
}
export function readJournal(text){
  let meta,state={},assets={},events=[];const lines=text.trimEnd().split('\n');let warning='';
  for(let i=0;i<lines.length;i++){
    let entry;try{entry=JSON.parse(lines[i]);}catch(e){if(i!==lines.length-1)throw new Error('素材记录文件损坏。');warning='最后一条记录未写完，已恢复此前完整内容。';break;}
    if(entry.type==='header')meta=entry.data;
    else if(entry.type==='asset')assets[entry.data.id]=entry.data;
    else if(entry.type==='event'){events.push(entry.data);if(entry.data.type==='state')Object.assign(state,entry.data.data);}
  }
  if(!meta)throw new Error('素材记录缺少开局信息。');return makeExport(meta,events,assets,state,null,warning);
}

export class RecordingStore {
  constructor(directory){this.directory=directory;this.live=new Map();this.writes=new Map();}
  attach(game,options={}){
    let queue=mkdir(this.directory,{recursive:true});
    const recorder=new MatchRecording(game,{...options,write:entry=>{
      queue=queue.then(()=>appendFile(join(this.directory,game.id+'.jsonl'),JSON.stringify(entry)+'\n','utf8'));
      this.writes.set(game.id,queue);queue.catch(()=>{recorder.persistenceError='素材自动保存失败，请在结束后立即下载。';});
    }});
    this.live.set(game.id,recorder);return recorder;
  }
  async flush(){await Promise.allSettled(this.writes.values());}
  async get(id){
    if(!ID.test(id))throw new Error('记录编号无效。');
    const recorder=this.live.get(id);
    if(recorder){if(recorder.game.phase!=='finished')throw new Error('先结束本局，再导出含答案的素材。');return recorder.export();}
    return readJournal(await readFile(join(this.directory,id+'.jsonl'),'utf8'));
  }
  async list(){
    await this.flush();let files;try{files=await readdir(this.directory);}catch{return [];}
    const items=[];for(const file of files.filter(f=>ID.test(f.slice(0,-6))&&f.endsWith('.jsonl'))){
      const id=file.slice(0,-6);if(this.live.get(id)?.game.phase!=='finished'&&this.live.has(id))continue;
      try{const data=await this.get(id),r=data.recording;items.push({id,startedAt:r.startedAt,mode:r.mode,category:r.category,players:r.players.map(p=>p.name),durationMs:r.durationMs,status:r.status});}catch{}
    }return items.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  }
}
