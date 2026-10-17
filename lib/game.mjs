import {normalizeConfidence} from '../public/guess-confidence.mjs';
import {randomUUID,randomInt} from 'node:crypto';
import {getWordPool,getWordLevels,judgeGuess} from './words.mjs';
import {validateShapes,guessPrompt,DrawingFormatError} from './shapes.mjs';
import {requestDrawing} from './drawing-response.mjs';
import {resolveCharacter,characterSpeech} from '../public/characters.mjs';
import {recapEntry,recapPrompt} from './recap.mjs';
import {visualHint,normalizeHintMode,hintModeInfo} from '../public/visual-hints.mjs';
import {Banter,battleBanterPairs,battleBanterContext} from './banter.mjs';

export class Game {
  constructor({players,human=true,rounds=1,category='成语',idiomLevel='easy',wordLevel=idiomLevel,hintMode='visual',mode='battle',run,words,revealDelay=2800,orderRandom=randomInt,banter=false,banterRandom=Math.random}) {
    this.banterEnabled=banter;this.banterRandom=banterRandom;this.banter=null;
    this.hintMode=normalizeHintMode(hintMode);
    this.id=randomUUID();this.run=run;this.revealDelay=revealDelay;this.controller=new AbortController();this.phase='idle';this.notice='';this.history=[];this.index=-1;
    this.conversation=[];this.recap=null;this.recapTask=Promise.resolve();
    this.players=[...(human?[{id:'human',name:'你',color:'#d63656',human:true}]:[]),...players].map(p=>({...p,drawScore:0,guessScore:0,drawPossible:0,guessPossible:0,hits:0,guesses:0,drawn:0}));
    if(mode==='duel'&&(this.players.length!==2||!human))throw new Error('单人模式需要你和 1 位 AI。');
    if(this.players.length<2||this.players.length>13)throw new Error('请选择 2–13 位选手（可以包含你）。');
    // Shuffle once per match, including the human; keep this order stable within the match.
    if(mode==='battle')for(let i=this.players.length-1;i>0;i--){const j=orderRandom(i+1);[this.players[i],this.players[j]]=[this.players[j],this.players[i]];}
    this.category=category;this.rounds=rounds;this.total=this.players.length*rounds;this.mode=mode;
    const categoryPool=getWordPool(category,wordLevel);
    this.wordLevel=wordLevel;this.wordLevelName=getWordLevels(category).find(level=>level.id===wordLevel)?.name||null;this.idiomLevel=category==='成语'?wordLevel:null;
    this.idiomLevelName=category==='成语'?this.wordLevelName:null;
    let pool=(words||categoryPool).slice();
    if(pool.length<this.total)throw new Error(`此分类共有 ${pool.length} 题，请减少选手或每人题数。`);
    for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
    this.deck=pool.slice(0,this.total);
  }
  get artist(){return this.players[this.index%this.players.length];}
  get word(){return this.deck[this.index];}
  get aborted(){return this.controller.signal.aborted;}
  touch(){this.updated=Date.now();}
  async next() {
    if(!['idle','reveal'].includes(this.phase))throw new Error('先完成当前题。');
    if(this.aborted)this.controller=new AbortController();
    if(this.index>=0){this.banter?.stop();this.stopRecap();this.archive();}this.banter=null;
    this.index++;
    if(this.index>=this.total){this.phase='finished';this.touch();return;}
    clearTimeout(this.revealTimer);this.revealAt=0;this.privateHints={};this.privateHintChoices={};this.hintChoice=null;this.turn=1;this.shapes=[];this.image=null;this.hint='';this.revision=0;this.notice='';this.drawErrorKind=null;this.roundGain=0;this.recap=null;
    this.addMessage(`round:${this.index}`,{kind:'round',text:`第 ${this.index+1} 题 · ${this.artist.name} 作画 · ${this.word.category} · ${Array.from(this.word.answer).length} 个字 · ${hintModeInfo(this.hintMode).name}`});
    // Every artist sits out their own question, regardless of connection type.
    this.results=Object.fromEntries(this.players.filter(p=>p.id!==this.artist.id).map(p=>[p.id,{history:[],solved:false,status:'waiting',error:'',points:0}]));
    this.artist.drawn++;this.artist.drawPossible+=Object.keys(this.results).length*3;
    for(const p of this.players)if(this.results[p.id])p.guessPossible+=3;
    if(this.artist.human){this.phase='drawing';this.touch();}
    else await this.drawAI();
  }
  async drawAI() {
    const signal=this.controller.signal,previous=this.shapes;this.phase='drawing-ai';this.notice='';this.drawErrorKind=null;this.touch();
    try {
      const wrong=Object.entries(this.results).filter(([,r])=>!r.solved).map(([id,r])=>({id,name:this.players.find(p=>p.id===id).name,guesses:r.history.filter(h=>!h.correct).map(h=>h.guess).filter(Boolean)}));
      const {data,shapes,elapsed}=await requestDrawing({run:this.run,player:this.artist,word:this.word,previous,wrong,hintMode:this.hintMode,signal});
      if(signal.aborted)return;
      this.shapes=shapes;this.revision++;this.image=null;
      const hint=this.turn>1?this.prepareHint(data.hint,true):{text:'',choice:null};
      this.hint=hint.text;this.hintChoice=hint.choice;
      this.setPrivateHints(data.hints||{},true);
      this.phase='ready';this.drawElapsed=elapsed;this.logHints();this.touch();
    }catch(e){if(signal.aborted)return;this.phase='draw-error';this.drawErrorKind=e instanceof DrawingFormatError?'format':'request';this.notice=e.message;this.touch();}
  }
  prepareHint(value,fromAI=false,shapes=this.shapes){
    try{const hint=visualHint(value,shapes,this.hintMode);if(this.hintMode==='preset'&&hint.text&&hint.text.includes(this.word.answer))throw new Error('提示不能直接包含答案。');if(fromAI&&this.hintMode==='visual'&&hint.text){hint.text=characterSpeech(this.artist,hint.text,300);hint.choice=hint.text||null;}return hint;}
    catch(e){if(fromAI)return {text:'',choice:null};throw e;}
  }
  setPrivateHints(hints={},fromAI=false,shapes=this.shapes) {
    if(!hints||typeof hints!=='object'||Array.isArray(hints)){if(fromAI)hints={};else throw new Error('单独提示格式无效。');}
    const next={},choices={};
    for(const [id,value] of Object.entries(hints)){
      const r=this.results[id],{text,choice}=this.prepareHint(value,fromAI,shapes);
      if(!text)continue;
      if(this.turn<=1||!r||r.solved||!r.history.some(h=>!h.correct)){if(fromAI)continue;throw new Error('只能向此前未猜中的选手单独提示。');}
      next[id]=text;choices[id]=choice;
    }
    this.privateHints=next;this.privateHintChoices=choices;
  }
  async beginGuess({image,shapes,hint='',hints={}}) {
    if(!['drawing','ready'].includes(this.phase))throw new Error('现在不能提交画面。');
    if(typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>2500000)throw new Error('画布图片无效或超过大小限制。');
    const bytes=Buffer.from(image.split(',')[1],'base64');
    if(bytes.length<24||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==1000||bytes.readUInt32BE(20)!==650)throw new Error('画布必须是 1000×650 的 PNG。');
    if(this.artist.human){const validated=validateShapes(shapes),prepared=this.prepareHint(hint,false,validated);if(this.turn<=1&&prepared.text)throw new Error('第一轮只看画，不发送提示。');this.setPrivateHints(hints,false,validated);this.shapes=validated;this.revision++;this.hint=prepared.text;this.hintChoice=prepared.choice;}
    this.image=image;this.phase='guessing';this.notice='';this.logHints();
    for(const r of Object.values(this.results))if(!r.solved){r.status='waiting';r.error='';}
    this.touch();await this.guessAIs();
  }
  async guessAIs(retry=false) {
    const signal=this.controller.signal;
    const candidates=this.players.filter(p=>!p.human&&this.results[p.id]&&!this.results[p.id].solved&&(retry?this.results[p.id].status==='error':this.results[p.id].status==='waiting'));
    for(const p of candidates){this.results[p.id].status='thinking';this.results[p.id].error='';}
    this.touch();
    await Promise.all(candidates.map(async p=>{
      const result=this.results[p.id];
      try {
        // Deliberately allowlist only the blind guesser's information. Never include the secret word or drawing commands.
        const prompt=guessPrompt({category:this.word.category,length:Array.from(this.word.answer).length,hint:this.hint,privateHint:this.privateHints[p.id],hintMode:this.hintMode,history:result.history.filter(h=>!h.correct).map(h=>h.guess)});
        const data=await this.run(p,prompt,this.image,signal,{onProgress:state=>{if(signal.aborted)return;result.status=state==='queued'?'queued':'thinking';this.touch();}});
        if(signal.aborted)return;
        if(typeof data.guess!=='string'||!data.guess.trim()||data.guess.length>80)throw new Error('模型未返回一个有效答案，请重试。');
        this.record(p.id,data.guess,characterSpeech(p,data.reason,150),data.elapsed,false,data.confidence);
      }catch(e){if(signal.aborted)return;result.status='error';result.error=e.message;this.touch();}
    }));
    if(!signal.aborted)this.settle();
  }
  record(id,guess,reason='',elapsed=0,skipped=false,confidence=null) {
    const r=this.results[id],p=this.players.find(p=>p.id===id);
    if(!r||r.solved||r.pending||r.history.some(h=>h.turn===this.turn))throw new Error('这次已经提交过了。');
    r.pending={guess,reason,turn:this.turn,elapsed,skipped,confidence:normalizeConfidence(confidence)};r.status=skipped?'submitted':'confident';r.error='';this.touch();
  }
  scorePending(){
    for(const [id,r] of Object.entries(this.results||{})){
      if(!r.pending)continue;
      const h=r.pending,p=this.players.find(p=>p.id===id),{correct,match}=judgeGuess(this.word,h.guess),points=correct?4-h.turn:0;
      r.judgedAt=Date.now();r.history.push({...h,correct,match,points});delete r.pending;r.solved=correct;r.status=correct?'solved':'wrong';r.points=points;
      this.addMessage(`guess:${this.index}:${h.turn}:${id}`,{kind:'guess',playerId:id,turn:h.turn,text:h.guess,reason:h.reason,confidence:h.confidence,correct,match,points,skipped:h.skipped});
      if(correct){p.guessScore+=points;p.hits++;this.artist.drawScore+=points;this.roundGain+=points;}
      if(!h.skipped)p.guesses++;
    }
  }
  publishGuesses(){
    if(this.phase!=='locked'||this.aborted)return;
    clearTimeout(this.revealTimer);this.revealAt=0;this.scorePending();
    this.phase=Object.values(this.results).every(r=>r.solved)||this.turn>=3?'reveal':'review';
    if(this.phase==='reveal')this.roundEnded();this.touch();
  }
  humanGuess(guess,pass=false) {
    if(this.phase!=='guessing')throw new Error('当前不在猜题阶段。');
    if(!pass&&(!String(guess).trim()||String(guess).length>80))throw new Error('请输入一个不超过 80 字的答案。');
    this.record('human',pass?'':String(guess).trim(),pass?'跳过本次':'',0,pass);this.settle();
  }
  settle() {
    if(this.phase!=='guessing')return;
    const all=Object.values(this.results);
    if(all.some(r=>['thinking','queued','waiting'].includes(r.status)))return;
    if(all.some(r=>r.status==='error')){this.notice='部分模型调用失败。可重试失败选手，或跳过他们这次机会。';this.touch();return;}
    this.phase='locked';this.revealAt=Date.now()+this.revealDelay;this.touch();
    if(!this.revealDelay)this.publishGuesses();
    else {this.revealTimer=setTimeout(()=>this.publishGuesses(),this.revealDelay);this.revealTimer.unref?.();}
  }
  skipErrors(){if(this.phase!=='guessing')throw new Error('当前不能跳过。');for(const [id,r] of Object.entries(this.results))if(r.status==='error')this.record(id,'','调用失败，跳过',0,true);this.notice='';this.settle();}
  async revise() {
    if(this.phase!=='review')throw new Error('当前不能改画。');
    this.turn++;if(this.artist.human){this.phase='drawing';this.touch();}else await this.drawAI();
  }
  addMessage(id,data){
    if(this.conversation.some(m=>m.id===id))return;
    const player=this.players.find(p=>p.id===data.playerId),recipient=this.players.find(p=>p.id===data.recipientId);
    this.conversation.push({id,index:this.index,turn:this.turn,at:Date.now(),artistHuman:!!this.artist?.human,name:player?.name||'系统',color:player?.color||'#71809b',recipientName:recipient?.name,...data});
  }
  logHints(){
    if(this.hint)this.addMessage(`hint:${this.index}:${this.turn}:public`,{kind:'hint',playerId:this.artist.id,text:this.hint});
    for(const [recipientId,text] of Object.entries(this.privateHints||{}))this.addMessage(`hint:${this.index}:${this.turn}:${recipientId}`,{kind:'hint',playerId:this.artist.id,recipientId,text});
  }
  visibleConversation(){
    const spectator=!this.players.some(p=>p.human);
    return this.conversation.filter(m=>{
      const ended=m.index<this.index||['reveal','finished'].includes(this.phase);
      if(m.kind==='hint'&&m.recipientId)return ended||m.artistHuman||m.recipientId==='human';
      if(m.kind==='guess')return ended||m.artistHuman||m.playerId==='human'||spectator;
      return true;
    }).map(({artistHuman,...message})=>message);
  }
  roundEnded(){
    this.addMessage(`answer:${this.index}`,{kind:'answer',text:`答案是「${this.word.answer}」`,solved:Object.values(this.results).filter(r=>r.solved).length});
    if(this.banterEnabled&&!this.banter){
      const index=this.index;
      this.banter=new Banter({players:this.players,pairs:battleBanterPairs(this.players,this.artist.id,this.results,this.banterRandom),context:battleBanterContext(this),image:this.image,run:this.run,
        publish:data=>this.addMessage(`banter:${index}:${data.exchangeId}:${data.reply}`,{index,...data}),touch:()=>this.touch()});
      this.banter.start();
    }
    if(this.recap||Object.values(this.results).some(r=>r.solved)||!Object.values(this.results).some(r=>r.history.some(h=>h.guess&&!h.skipped)))return;
    const recap={index:this.index,status:'loading',entries:this.players.map(p=>recapEntry(p,this.results[p.id],this.artist.id,this.word.answer))};
    this.recap=recap;const controller=new AbortController();this.recapController=controller;
    const image=this.image,answer=this.word.answer,hint=this.hint;
    this.recapTask=Promise.all(recap.entries.map(async entry=>{
      const player=this.players.find(p=>p.id===entry.playerId);
      if(player.human){this.publishRecap(recap,entry);return;}
      try{
        const data=await this.run(player,recapPrompt(answer,entry,hint),image,controller.signal);
        if(controller.signal.aborted)return;
        if(typeof data.summary!=='string'||!data.summary.trim())throw new Error('复盘内容为空');
        entry.summary=characterSpeech(player,data.summary,100);entry.source='model';entry.status='ready';
      }catch{if(controller.signal.aborted)return;entry.status='record';}
      this.publishRecap(recap,entry);
    })).then(()=>{if(!controller.signal.aborted){recap.status='complete';this.touch();}});
  }
  publishRecap(recap,entry){
    this.addMessage(`recap:${recap.index}:${entry.playerId}`,{index:recap.index,kind:'recap',playerId:entry.playerId,text:entry.summary,source:entry.source,trail:entry.trail,artist:entry.artist});this.touch();
  }
  stopRecap(){
    this.recapController?.abort();
    if(this.recap?.status==='loading'){
      for(const entry of this.recap.entries)if(entry.status==='pending'){entry.status='record';this.publishRecap(this.recap,entry);}
      this.recap.status='complete';
    }
  }
  archive(){if(this.history.some(r=>r.index===this.index))return;this.history.push({index:this.index,answer:this.word.answer,category:this.word.category,artistId:this.artist.id,artistName:this.artist.name,shapes:this.shapes,hint:this.hint,privateHints:this.privateHints,results:structuredClone(this.results),recap:structuredClone(this.recap),banter:this.banter?.snapshot()||null,drawGain:this.roundGain});}
  finish(){clearTimeout(this.revealTimer);this.controller.abort();this.banter?.stop();this.stopRecap();this.scorePending();if(this.index>=0&&this.index<this.total){this.addMessage(`answer:${this.index}`,{kind:'answer',text:`答案是「${this.word.answer}」`,solved:Object.values(this.results).filter(r=>r.solved).length});this.archive();}this.phase='finished';this.touch();}
  reveal(){if(['finished','reveal'].includes(this.phase))return;clearTimeout(this.revealTimer);this.controller.abort();this.scorePending();this.phase='reveal';this.notice='本题已提前结束，已获得的分数保留。';this.roundEnded();this.touch();}
  snapshot() {
    const ended=this.phase==='reveal'||this.phase==='finished';const artist=this.index>=0&&this.index<this.total?this.artist:null;
    return {
      id:this.id,phase:this.phase,index:this.index,total:this.total,turn:this.turn||1,category:this.category,wordLevel:this.wordLevel,wordLevelName:this.wordLevelName,idiomLevel:this.idiomLevel,idiomLevelName:this.idiomLevelName,hintMode:this.hintMode,hintModeName:hintModeInfo(this.hintMode).name,
      answer:artist&&(ended||artist.human)?this.word.answer:null,length:artist?Array.from(this.word.answer).length:0,
      artistId:artist?.id,artistName:artist?.name,artistHuman:artist?.human||false,shapes:this.shapes||[],revision:this.revision||0,drawErrorKind:this.drawErrorKind||null,
      hintChoice:artist?.human?this.hintChoice:null,privateHintChoices:artist?.human?this.privateHintChoices||{}:{},hint:this.hint||'',myHint:this.privateHints?.human||'',privateHints:ended||artist?.human?this.privateHints||{}:{},revealAt:this.phase==='locked'?this.revealAt:null,notice:this.notice,drawElapsed:this.drawElapsed,roundGain:this.roundGain||0,
      players:this.players.map(p=>{const {id,name,color,human,model,drawScore,guessScore,drawPossible,guessPossible,hits,guesses,drawn}=p;return {id,name,color,human:!!human,model,characterId:resolveCharacter(p)?.id||'none',drawScore,guessScore,drawPossible,guessPossible,hits,guesses,drawn,total:drawScore+guessScore};}),
      results:Object.fromEntries(Object.entries(this.results||{}).map(([id,r])=>[id,{solved:r.solved,status:r.status,error:r.error,points:r.points,confidence:r.pending?r.pending.confidence:r.history.at(-1)?.confidence??null,judgedAt:r.judgedAt||null,attempts:r.history.length,history:ended||artist?.human||id==='human'?r.history:[]} ])),
      conversation:this.visibleConversation(),recap:ended?this.recap:null,banterEnabled:this.banterEnabled,banter:ended?this.banter?.snapshot()||null:null,history:this.phase==='finished'?this.history:[],updated:this.updated
    };
  }
}
