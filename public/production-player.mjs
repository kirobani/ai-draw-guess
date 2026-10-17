// Self-contained so the same player can be packed into an offline HTML file.
export function mountProduction(root,input,options={}){
  if(!input||!Array.isArray(input.players)||!input.recording?.events?.length)throw new Error('需要新版完整素材记录。旧复盘只有最终结果，无法恢复缺失的改画过程。');
  const rec=input.recording,assets=rec.assets||{},players=input.players,events=[...rec.events].sort((a,b)=>a.t-b.t||a.seq-b.seq);
  const expressionNames={idle:'等待',drawing:'画画',thinking:'思考',finished:'画好了',confident:'很有把握',uncertain:'有点犹豫',random:'试着蒙蒙',happy:'猜中了',spectator:'围观',sad:'猜错了'};
  const kindNames={hint:'提示',guess:'猜词',answer:'揭晓',recap:'复盘','relay-vote':'投票理由','relay-reflection':'通关感言','relay-guess':'接龙猜词','relay-status':'交卷','relay-round':'接力','relay-reveal':'揭晓'};
  const phaseNames={idle:'开局',drawing:'画画','drawing-ai':'构思',ready:'画好了',guessing:'猜词',locked:'等待揭晓',review:'准备改画',reveal:'答案揭晓',finished:'赛后记录','relay-work':'接力中','relay-pass':'传给下一位'};
  let state={},message=null,bySpeaker={};const scenes=[],drafts=new Map();
  const add=(e,extra={})=>scenes.push({t:e.t,seq:e.seq,state,message,bySpeaker,...extra});
  for(const e of events){
    if(e.type==='state'){
      const old=state;state={...state,...e.data};
      const changed=Object.keys(state.results||{}).find(id=>JSON.stringify(state.results[id])!==JSON.stringify(old.results?.[id]));
      if(old.index!==state.index||old.turn!==state.turn){message=null;bySpeaker={};}
      if(e.data.drawingId||e.data.phase||e.data.relay||e.data.expressions||!scenes.length)add(e,{focus:changed});
    }else if(e.type==='message'){message=e.data;if(message.playerId)bySpeaker={...bySpeaker,[message.playerId]:message};add(e,{focus:message.playerId});}
    else if(e.type==='drawing-edit'){
      const d=e.data,key=`${d.index}:${d.chainId||''}`,shapes=[...(drafts.get(key)||[]).slice(0,d.keep),...d.append];drafts.set(key,shapes);
      add(e,{draft:shapes,focus:'human',draftIndex:d.index,label:d.operation==='undo'?'撤销一笔':d.operation==='clear'?'清空画布':'人类落笔'});
    }else if(e.type==='presentation'&&e.data.action==='sync-audio')add(e,{label:'录音对时标记'});
  }
  if(!scenes.length)throw new Error('记录里没有可回放的场景。');
  let index=0,timer=null,drawTimer=null,current=null,playing=false;
  root.innerHTML=`<section class="production-player"><div class="production-stage"><header><span class="production-brand">你画我猜 · 素材回放</span><span data-time></span><h1 data-title></h1><p data-subtitle></p></header><div class="production-main"><div class="production-art"><canvas data-art width="2000" height="1300" aria-label="高清回放画布"></canvas><p data-answer></p></div><aside class="production-speaker"><div data-avatar class="production-avatar"><span>✦</span></div><h2 data-speaker></h2><p data-model></p><b data-expression></b><div class="production-bubble"><small data-kind></small><p data-text></p><p data-reason></p></div></aside></div><footer data-roster></footer></div><div class="production-controls"><button data-prev>上一条</button><button data-play>播放</button><button data-next>下一条</button><label>进度 <input data-seek type="range" min="0" value="0" step="1" aria-label="回放进度"></label><select data-speed aria-label="播放速度"><option value="edit">精简等待</option><option value="1">原时间</option><option value="2">2 倍速</option><option value="4">4 倍速</option></select><select data-focus aria-label="镜头角色"><option value="auto">跟随说话的人</option></select><select data-chain aria-label="选择接龙链条" hidden></select><button data-redraw>重演笔画</button><button data-png>保存 4K 分镜</button><button data-full>全屏</button></div><p class="production-note">画作按矢量重新绘制，文字独立排版。麦克风音轨请用 OBS 录音对齐；待机呼吸重新演绎，未录制逐帧动作。</p><p data-notice role="status"></p></section>`;
  const el=name=>root.querySelector(`[data-${name}]`),canvas=el('art'),ctx=canvas.getContext('2d');el('seek').max=scenes.length-1;
  const imageDialog=document.createElement('dialog');imageDialog.className='production-image-dialog';imageDialog.innerHTML='<h2>4K 分镜预览</h2><img data-frame-image alt="已生成的 3840 × 2160 分镜"><p><a data-frame-save class="production-link">下载 PNG</a> <button data-frame-close>关闭预览</button></p>';root.append(imageDialog);el('frame-close').onclick=()=>imageDialog.close();
  for(const p of players){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name;el('focus').append(opt);}
  const finalChains=input.chains||state.chains||[];
  if(finalChains.length){el('chain').hidden=false;const auto=document.createElement('option');auto.value='auto';auto.textContent='跟随展示的链条';el('chain').append(auto);for(const [i,c] of finalChains.entries()){const opt=document.createElement('option');opt.value=c.id;opt.textContent=`第 ${i+1} 条 · ${players.find(p=>p.id===c.ownerId)?.name||''}`;el('chain').append(opt);}}
  const clock=ms=>`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(Math.floor(ms%1000)).padStart(3,'0')}`;
  const person=id=>players.find(p=>p.id===id);
  function paint(target,shapes){
    const c=target.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,target.width,target.height);c.save();c.scale(target.width/1000,target.height/650);
    for(const s of shapes){c.save();c.strokeStyle=s.color||'#202633';c.fillStyle=s.fill||'transparent';c.lineWidth=s.width||5;c.lineCap='round';c.lineJoin='round';c.beginPath();
      if(s.type==='ellipse')c.ellipse(s.x,s.y,s.rx,s.ry,0,0,Math.PI*2);else if(s.type==='rect')c.rect(s.x,s.y,s.w,s.h);else{(s.points||[]).forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(s.type==='polygon')c.closePath();}
      if(s.fill&&s.fill!=='none')c.fill();if(s.color!=='none')c.stroke();c.restore();
    }c.restore();
  }
  function sceneInfo(scene){
    const s=scene.state;let m=el('focus').value==='auto'?scene.message:scene.bySpeaker[el('focus').value];let drawingId=s.drawingId,actor=s.artistId,title=s.index<0?'准备开场':s.phase==='finished'?'本局结束 · 完整记录':`第 ${(s.index??0)+1} 题 · ${person(actor)?.name||'画手'} 作画`,answer=['reveal','finished'].includes(s.phase)?s.answer||s.history?.at(-1)?.answer:'',text=m?.text||'',reason=m?.reason||'',kind=m?kindNames[m.kind]||'对局消息':phaseNames[s.phase]||'',subtitle=`${rec.category} · ${s.wordLevelName||''} · ${phaseNames[s.phase]||''}`;
    if(s.mode==='relay'){
      const show=s.relay?.showcase,chains=s.chains||[],chain=el('chain').value!=='auto'?chains.find(c=>c.id===el('chain').value):chains[show?.chainIndex??0];
      const stepIndex=show?Math.max(0,show.stepIndex):s.index,step=chain?.steps?.[stepIndex],drawingStep=chain?.steps?.slice(0,stepIndex+1).reverse().find(x=>x?.kind==='draw'&&!x.skipped);
      drawingId=drawingStep?.drawingId;actor=step?.playerId||actor;answer=show||s.phase==='finished'?chain?.answer:'';
      title=`接龙 · 第 ${Math.max(0,chains.indexOf(chain))+1} 条链 · 第 ${stepIndex+1} 棒`;
      if(step?.kind==='draw'){const word=step.position===0?chain.answer:chain.steps[step.position-1]?.text;subtitle=`${person(step.playerId)?.name||'选手'} 画的：${word||'本棒留空'}`;if(show?.status==='playing'){m=null;text='';reason='';kind='画作展示';}}
      else if(step?.kind==='guess'){subtitle=`${person(step.playerId)?.name||'选手'} 猜的是：${step.text||'本棒留空'}`;if(show?.status==='playing'||!m||m.kind==='relay-status'){m={playerId:step.playerId};text=step.text||'';reason=step.reason||'';kind='接龙猜词';}}
      if(show&&!['intro','playing'].includes(show.status)){const b=show.ballots?.[show.chainIndex];subtitle=b?.verdict?b.verdict.passed?'这条链通过了':'这条链没有通过':show.status==='pass-vote'?'正在投通过票':'正在选择最大害群之马';}
    }
    if(el('focus').value!=='auto'){m=scene.bySpeaker[el('focus').value];text=m?.text||'';reason=m?.reason||'';kind=m?kindNames[m.kind]||'对局消息':'等待发言';}
    const focus=el('focus').value==='auto'?(m?.playerId||actor||scene.focus):el('focus').value;
    const p=person(focus)||person(actor)||players[0];
    if(m?.recipientId)kind+=` · 只给 ${m.recipientName||person(m.recipientId)?.name||''}`;
    if(m?.kind==='guess')kind+=m.skipped?' · 跳过':m.correct?' · 猜中':' · 没猜中';
    if(scene.label)kind=scene.label;
    return {title,subtitle,answer:answer?`原题：${answer}`:'答案尚未揭晓',text,reason,kind,player:p,expression:s.expressions?.[p?.id]||'idle',shapes:scene.draft&&scene.draftIndex===s.index?scene.draft:assets[drawingId]?.shapes||[],time:clock(scene.t),state:s};
  }
  function show(i){
    clearInterval(drawTimer);index=Math.max(0,Math.min(scenes.length-1,i));const scene=scenes[index],v=sceneInfo(scene);current=v;
    for(const key of ['title','subtitle','answer','text','reason','kind','time'])el(key).textContent=v[key]||'';
    el('speaker').textContent=v.player?.name||'';el('model').textContent=v.player?.model||'人类选手';el('expression').textContent=expressionNames[v.expression]||v.expression;
    el('seek').value=index;paint(canvas,v.shapes);el('roster').replaceChildren();
    for(const p of v.state.players||players){const span=document.createElement('span');span.className=p.id===v.player?.id?'active':'';span.textContent=`${p.name}${Number.isFinite(p.total)?` ${p.total} 分`:''}`;el('roster').append(span);}
    options.onFrame?.({scene,view:v,avatarHost:el('avatar')});
    el('notice').textContent=`${index+1} / ${scenes.length} 条 · 原对局 ${clock(scene.t)}${rec.warning?' · '+rec.warning:''}`;
  }
  function stop(){playing=false;clearTimeout(timer);el('play').textContent='播放';}
  function schedule(){
    if(!playing)return;if(index>=scenes.length-1){stop();return;}
    const gap=Math.max(450,scenes[index+1].t-scenes[index].t),speed=el('speed').value;
    timer=setTimeout(()=>{show(index+1);schedule();},speed==='edit'?Math.min(4000,gap):gap/Number(speed));
  }
  el('play').onclick=()=>{if(playing)stop();else{playing=true;el('play').textContent='暂停';schedule();}};
  el('prev').onclick=()=>{stop();show(index-1);};el('next').onclick=()=>{stop();show(index+1);};el('seek').oninput=()=>{stop();show(+el('seek').value);};
  el('focus').onchange=el('chain').onchange=()=>show(index);
  el('speed').onchange=()=>{clearTimeout(timer);schedule();};
  el('full').onclick=()=>root.querySelector('.production-stage').requestFullscreen?.();
  el('redraw').onclick=()=>{stop();clearInterval(drawTimer);let n=0;paint(canvas,[]);drawTimer=setInterval(()=>{paint(canvas,current.shapes.slice(0,++n));if(n>=current.shapes.length)clearInterval(drawTimer);},120);};
  function wrap(c,text,x,y,maxWidth,lineHeight,maxLines=12){let line='',n=0;for(const ch of String(text||'')){if(ch==='\n'||c.measureText(line+ch).width>maxWidth){c.fillText(line,x,y+n*lineHeight);n++;line='';if(n>=maxLines)return y+n*lineHeight;}if(ch!=='\n')line+=ch;}if(line)c.fillText(line,x,y+n++*lineHeight);return y+n*lineHeight;}
  function lines(c,text,width){let line='',count=1;for(const ch of String(text||'')){if(ch==='\n'||c.measureText(line+ch).width>width){count++;line='';}if(ch!=='\n')line+=ch;}return text?count:0;}
  el('png').onclick=async()=>{
    await document.fonts?.ready;
    const out=document.createElement('canvas');out.width=3840;out.height=2160;const c=out.getContext('2d'),v=current;c.fillStyle='#edf5fb';c.fillRect(0,0,out.width,out.height);c.fillStyle='#19334c';c.font='bold 88px "Microsoft YaHei",sans-serif';wrap(c,v.title,100,145,3600,100,1);c.font='48px "Microsoft YaHei",sans-serif';wrap(c,v.subtitle,100,230,3600,64,2);
    const drawing=document.createElement('canvas');drawing.width=2580;drawing.height=1677;paint(drawing,v.shapes);c.drawImage(drawing,80,320);c.font='bold 68px "Microsoft YaHei",sans-serif';c.fillText(v.player?.name||'',2770,420);c.font='38px "Microsoft YaHei",sans-serif';let y=wrap(c,v.player?.model||'人类选手',2770,490,950,52,3)+60;
    c.font='bold 42px "Microsoft YaHei",sans-serif';y=wrap(c,v.kind,2770,y,960,60,3)+50;
    let font=58;for(;font>30;font-=2){c.font=`bold ${font}px "Microsoft YaHei",sans-serif`;const textHeight=lines(c,v.text,930)*font*1.42;c.font=`${font*.8}px "Microsoft YaHei",sans-serif`;if(textHeight+lines(c,v.reason,930)*font*1.14+55<2000-y)break;}
    c.font=`bold ${font}px "Microsoft YaHei",sans-serif`;y=wrap(c,v.text,2770,y,930,font*1.42,100)+55;c.font=`${font*.8}px "Microsoft YaHei",sans-serif`;wrap(c,v.reason,2770,y,930,font*1.14,100);c.font='bold 58px "Microsoft YaHei",sans-serif';c.fillText(v.answer,100,2090);c.font='32px "Microsoft YaHei",sans-serif';c.fillText('原对局 '+v.time,3000,2090);
    const uri=out.toDataURL('image/png');el('frame-image').src=uri;el('frame-save').download=`分镜-${String(index+1).padStart(4,'0')}-4K.png`;el('frame-save').href=uri;imageDialog.showModal();el('notice').textContent='3840 × 2160 分镜已生成，可在预览中下载。角色动画另存于角色资源包。';
  };
  show(0);
  return {seek:show,seekTime:t=>{let i=0;while(i+1<scenes.length&&scenes[i+1].t<=t)i++;show(i);},count:scenes.length,getFrame:()=>current,destroy:()=>{stop();clearInterval(drawTimer);root.replaceChildren();}};
}
