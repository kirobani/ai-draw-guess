import {ExpressionAgentKitDriver} from './expression-agentkit-driver.mjs';
import {expressionRegion} from './expression-regions.mjs';
import {OriginalAgentKitDriver,CORE_MEMORY_BYTES} from './original-agentkit-driver.mjs';
import {sourceRegion} from './original-regions.mjs';
import {CubismFramework} from '../vendor/cubism-framework/src/live2dcubismframework';
import {CubismMoc} from '../vendor/cubism-framework/src/model/cubismmoc';
import {CubismRenderer_WebGL} from '../vendor/cubism-framework/src/rendering/cubismrenderer_webgl';
import {CubismShaderManager_WebGL} from '../vendor/cubism-framework/src/rendering/cubismshader_webgl';
import {CubismMatrix44} from '../vendor/cubism-framework/src/math/cubismmatrix44';
import {CubismPhysics} from '../vendor/cubism-framework/src/physics/cubismphysics';

let frameworkReady=false;
let viewSequence=0;
let loadingModels=Promise.resolve();
const SHADERS='/vendor/shaders/WebGL/';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function bytes(url:string){const r=await fetch(url);if(!r.ok)throw new Error(`角色文件读取失败 (${r.status})`);return r.arrayBuffer();}

/** Official Cubism model renderer. Game events drive parameters, never CSS transforms. */
export class CharacterView {
  canvas:HTMLCanvasElement; gl:any; moc:any; model:any; renderer:any; physics:any;
  textures:WebGLTexture[]=[]; parameters=new Map<string,number>(); defaults:number[]=[];
  state='idle'; time=0; stateTime=0; last=0; frame=0; paused=false; suspended=false; disposed=false; ready=false; framing='full';
  pointer={x:0,y:0}; pose={x:0,y:0}; smooth={x:0,y:0,z:0,brow:0,mouth:0,open:0,eye:1,gazeX:0,gazeY:0};
  nextBlink=3.4; blinkAt=-10; eyesClosed=false; bounds:number[]=[]; observer:ResizeObserver;
  // Live2D playback is explicitly controlled by the page's pause buttons.
  // A system UI-transition preference must not silently freeze this animation.
  reduce=false;
  onReady:Function; onError:Function; metadata:any; modelUrl:string; motion:any; rig:any={};
  originalKit=false; expressionKit=false; driver:any; expressionState='idle'; pendingExpression:string|null=null; expressionSwitchAt=0;

  constructor(canvas:HTMLCanvasElement,options:any={}){
    canvas.dataset.viewInstance=String(++viewSequence);
    this.canvas=canvas;this.onReady=options.onReady||(()=>{});this.onError=options.onError||(()=>{});this.framing=options.framing||'full';
    this.modelUrl=options.modelUrl||'/models/agentkit-expressions-r3/deepseek/deepseek-expressions.model3.json';this.motion=options.motion||{sway:1,joy:1};
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointermove',this.follow);
    canvas.addEventListener('pointerleave',this.leave);
    canvas.addEventListener('webglcontextlost',this.contextLost);
  }
  follow=(e:PointerEvent)=>{const r=this.canvas.getBoundingClientRect();this.pointer={x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2};};
  leave=()=>{this.pointer={x:0,y:0};};
  contextLost=(e:Event)=>{e.preventDefault();this.fail(new Error('角色显示暂时中断，请刷新页面重新加载。'));};
  async load(){
    const pending=loadingModels.then(()=>this.disposed?this:this.loadNow());
    loadingModels=pending.catch(()=>{});return pending;
  }
  async loadNow(){
    try{
      if(!(globalThis as any).Live2DCubismCore)throw new Error('尚未安装 Cubism Core，请按 README 的 Live2D 步骤安装。');
      if(!frameworkReady){CubismFramework.startUp();CubismFramework.initialize(CORE_MEMORY_BYTES);frameworkReady=true;}
      const response=await fetch(this.modelUrl);if(!response.ok)throw new Error('找不到角色模型。');
      const settings=await response.json(),base=new URL(this.modelUrl,location.href);if(this.disposed)return this;
      this.rig=settings.AvatarRig||{};
      this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
      if(!this.gl)throw new Error('浏览器未启用 WebGL，暂时无法显示可动角色。');
      const refs=settings.FileReferences;
      const mocBytes=await bytes(new URL(refs.Moc,base).href);if(this.disposed)return this;
      this.moc=CubismMoc.create(mocBytes,true);
      if(!this.moc)throw new Error('模型完整性检查未通过。');
      this.model=this.moc.createModel();if(!this.model)throw new Error('模型加载失败。');
      for(let i=0;i<this.model.getParameterCount();i++){
        this.parameters.set(this.model.getParameterId(i).getString(),i);
        this.defaults.push(this.model.getParameterDefaultValue(i));
      }
      this.expressionKit=this.modelUrl.startsWith('/models/agentkit-expressions-r3/');
      this.originalKit=this.expressionKit||this.modelUrl.startsWith('/models/agentkit-original-hd/');
      if(!['ParamAngleX','ParamAngleY','ParamBreath'].every(id=>this.parameters.has(id))||!(['ParamPaintedEyes','ParamPaintedHead'].some(id=>this.parameters.has(id))))throw new Error('模型动作参数不完整。');
      if(this.originalKit)this.driver=new (this.expressionKit?ExpressionAgentKitDriver:OriginalAgentKitDriver)(this.modelUrl.split('/').at(-2));
      this.model.update();
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(let i=0;i<this.model.getDrawableCount();i++){
        const v=this.model.getDrawableVertices(i);
        for(let j=0;j<v.length;j+=2){minX=Math.min(minX,v[j]);maxX=Math.max(maxX,v[j]);minY=Math.min(minY,v[j+1]);maxY=Math.max(maxY,v[j+1]);}
      }
      this.bounds=[minX,minY,maxX,maxY];
      this.renderer=new CubismRenderer_WebGL();this.renderer.initialize(this.model);
      this.renderer.setIsPremultipliedAlpha(true);
      if(this.originalKit)this.renderer.setClippingMaskBufferSize(1024);
      this.renderer.startUp(this.gl);
      await Promise.all(refs.Textures.map(async(file:string,i:number)=>{
        const img=new Image();img.src=new URL(file,base).href;await img.decode();
        if(this.disposed)return;
        const gl=this.gl,texture=gl.createTexture();this.textures.push(texture);
        if(img.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||img.height>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('此设备不支持高清角色图集。');
        this.canvas.dataset.textureSize=String(img.width);
        gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);this.renderer.bindTexture(i,texture);img.src="";
      }));
      if(this.disposed)return this;
      if(refs.Physics){const buffer=await bytes(new URL(refs.Physics,base).href);if(this.disposed)return this;this.physics=CubismPhysics.create(buffer,buffer.byteLength);}
      this.renderer.loadShaders(SHADERS);
      const shader=CubismShaderManager_WebGL.getInstance().getShader(this.gl);
      for(let i=0;i<150&&!shader._isShaderLoaded&&!this.disposed;i++)await sleep(50);
      if(this.disposed)return this;
      if(!shader._isShaderLoaded)throw new Error('角色着色器加载失败。');
      this.metadata={drawables:this.model.getDrawableCount(),parameters:this.model.getParameterCount(),mocVersion:this.moc.getMocVersion()};
      this.canvas.dataset.modelUrl=this.modelUrl;this.canvas.dataset.rig=this.expressionKit?'agentkit-expressions-r3':this.originalKit?'agentkit-original-hd':'legacy';
      this.ready=true;this.canvas.dataset.loaded='true';this.canvas.dataset.parameters=String(this.metadata.parameters);
      this.resize();this.render(0);this.onReady(this.metadata);if(!this.suspended)this.frame=requestAnimationFrame(this.tick);
      return this;
    }catch(e){if(!this.disposed)this.fail(e);return this;}
  }
  fail(e:any){this.paused=true;cancelAnimationFrame(this.frame);this.canvas.dataset.loaded='error';this.onError(e instanceof Error?e:new Error(String(e)));}
  resize(){if(!this.gl)return;const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);if(this.model)this.render(0);}
  setState(state:string){this.canvas.dataset.state=state;if(this.state===state)return;this.stateTime=0;this.state=state;if(this.expressionKit&&this.ready&&!this.paused){this.pendingExpression=state;this.expressionSwitchAt=this.time+.14;this.blink();}else{this.expressionState=state;this.pendingExpression=null;}if(this.paused)this.render(0);}
  setFraming(framing:string){this.framing=framing;this.render(0);}
  setPose(x:number,y:number){this.pose={x,y};if(this.paused)this.render(0);}
  blink(){this.blinkAt=this.time;this.nextBlink=this.time+3.8;}
  setEyesClosed(closed:boolean){this.eyesClosed=closed;if(this.paused)this.render(0);}
  setPaused(paused:boolean){this.paused=paused;this.last=0;if(paused&&this.pendingExpression){this.expressionState=this.pendingExpression;this.pendingExpression=null;this.render(0);}}
  setSuspended(value:boolean){if(this.suspended===value||this.disposed)return;this.suspended=value;this.last=0;cancelAnimationFrame(this.frame);if(!value&&this.ready){this.resize();this.frame=requestAnimationFrame(this.tick);}}
  set(name:string,value:number){const i=this.parameters.get(name);if(i!==undefined)this.model.setParameterValueByIndex(i,value);}
  tick=(now:number)=>{
    if(this.disposed||this.suspended)return;this.frame=requestAnimationFrame(this.tick);
    if(this.paused||document.hidden||this.canvas.getBoundingClientRect().width<1){this.last=0;return;}
    if(this.last&&now-this.last<32)return;
    const dt=this.last?Math.min((now-this.last)/1000,.07):0;this.last=now;
    try{this.render(dt);}catch(e){this.fail(e);}
  };
  render(dt:number){
    if(!this.ready||!this.model||!this.renderer||!this.canvas.width||!this.bounds.length)return;
    if(this.originalKit){this.renderOriginalKit(dt);return;}
    this.time+=dt;this.stateTime+=dt;const t=this.time,s=this.stateTime,amp=this.reduce?0:this.motion.sway||1;
    let x=this.pointer.x*14+this.pose.x,y=this.pointer.y*6+this.pose.y,z=Math.sin(t*.9)*3*amp,brow=0,mouth=.12,open=.03,eye=1;
    let gazeX=this.pointer.x*.5,gazeY=this.pointer.y*.3;
    if(this.state==='thinking'){
      // Closed painted eyelids and a small bow keep the thinking pose relaxed.
      x=this.pose.x+Math.sin(t*.65)*1.5*amp;y=this.pose.y-3.5;
      z=-1.5+Math.sin(t*.65)*1.2*amp;
      brow=0;mouth=0;open=0;eye=0;gazeX=0;gazeY=0;
    }
    if(this.state==='happy'){const joy=this.reduce?0:this.motion.joy||1;y+=Math.sin(s*4.5)*6*joy;z+=5+Math.sin(s*2.3)*5*joy;brow=.8;mouth=1;open=.9+Math.sin(s*3)*.1*amp;eye=0;}
    if(this.state==='drawing'){
      x=this.pose.x+Math.sin(s*2.4)*3*amp;y=this.pose.y-6;z=-5+Math.sin(s*3.3)*2.5*amp;
      gazeX=Math.sin(s*2.4)*.2;gazeY=-.7;mouth=.3;open=0;
    }
    if(this.state==='confident'){
      x=this.pose.x+5;y=this.pose.y+5;z=7+Math.sin(s*1.6)*2*amp;
      gazeX=.2;gazeY=.25;brow=.65;mouth=.8;open=0;
    }
    if(this.state==='sad'){
      // A short startled nod settles into the user's hollow O-square-O face.
      x=this.pose.x;y=this.pose.y+Math.sin(s*9)*Math.exp(-s*3)*4*amp;
      z=Math.sin(t*.8)*1.2*amp;brow=0;mouth=0;open=0;eye=1;
      gazeX=0;gazeY=0;
    }
    // This auto-rig's face paint exceeds its hair cover outside these verified ranges.
    x=Math.max(-22,Math.min(22,x));y=Math.max(-7,Math.min(7,y));
    const mix=dt>0?1-Math.exp(-dt*5):1;
    const targets={x,y,z,brow,mouth,open,eye,gazeX,gazeY};
    for(const key of Object.keys(targets))this.smooth[key]+=(targets[key]-this.smooth[key])*mix;
    this.defaults.forEach((v,i)=>this.model.setParameterValueByIndex(i,v));
    this.set('ParamAngleX',this.smooth.x);this.set('ParamAngleY',this.smooth.y);this.set('ParamAngleZ',this.smooth.z);
    this.set('ParamBodyAngleX',this.smooth.x*.25);this.set('ParamBodyAngleZ',this.smooth.z*.22+Math.sin(t*.9)*1.4*amp);
    this.set('ParamBreath',.5+Math.sin(t*1.7)*.48*amp);
    this.set('ParamDrawingBody',this.state==='drawing'?1:0);
    this.set('ParamEyeBallX',this.smooth.gazeX);this.set('ParamEyeBallY',this.smooth.gazeY);
    this.set('ParamBrowLY',this.smooth.brow);this.set('ParamBrowRY',this.smooth.brow);
    this.set('ParamMouthForm',this.smooth.mouth);this.set('ParamMouthOpenY',this.smooth.open);
    if(t>this.nextBlink&&!this.reduce)this.blink();
    const blink=t-this.blinkAt;
    const wholeHead=this.parameters.has('ParamPaintedHead');
    const painted=wholeHead||this.parameters.has('ParamPaintedEyes');
    if(wholeHead){
      // Legacy whole-head drafts are retained until each character is rebuilt.
      const expression=this.state==='thinking'?1:this.state==='happy'?2:this.state==='closed'?3:this.state==='sad'?4:this.state==='confident'?5:0;
      const blinkClosed=expression===0&&blink>=.025&&blink<.175;
      this.set('ParamPaintedHead',this.eyesClosed||blinkClosed?3:expression);
      this.canvas.dataset.expressionArtwork=this.eyesClosed?'closed':this.state;
    }else if(painted){
      // These switches select newly painted meshes inside the Cubism model.
      // Blink changes only the eyes, so the mouth and brows keep their emotion.
      const confident=this.state==='confident';
      const hasConfident=this.model.getParameterMaximumValue(this.parameters.get('ParamPaintedEyes'))>=5;
      const expression=this.state==='thinking'?1:this.state==='happy'?2:this.state==='closed'?3:this.state==='sad'?4:confident?(hasConfident?5:2):0;
      const blinkClosed=blink>=.025&&blink<.175;
      const eyes=this.eyesClosed?3:confident&&this.rig.independentGaze?(blinkClosed?3:0):confident?2:expression!==0?expression:blinkClosed?3:expression;
      this.set('ParamPaintedEyes',eyes);
      this.set('ParamPaintedFace',this.eyesClosed?3:confident&&!hasConfident?0:expression);
      this.canvas.dataset.expressionArtwork=this.eyesClosed?'closed':this.state;
    }
    const lid=painted?1:this.eyesClosed?0:this.smooth.eye*(blink>=0&&blink<.23?1-Math.sin(blink/.23*Math.PI):1);
    this.set('ParamEyeLOpen',lid);this.set('ParamEyeROpen',lid);
    if(dt>0&&!this.reduce)this.physics?.evaluate(this.model,dt);
    this.model.update();
    this.draw();
  }
  renderOriginalKit(dt:number){
    this.time+=dt;this.stateTime+=dt;
    if(this.time>this.nextBlink&&!this.reduce)this.blink();
    if(this.pendingExpression&&this.time>=this.expressionSwitchAt){this.expressionState=this.pendingExpression;this.pendingExpression=null;}
    const p=this.driver.frame({state:this.expressionKit?this.expressionState:this.state,time:this.time,since:this.stateTime,blinkAt:this.blinkAt,x:this.pointer.x,y:this.pointer.y,headX:this.pose.x,headY:this.pose.y,eyesClosed:this.eyesClosed,reduce:this.reduce},dt);
    this.defaults.forEach((v,i)=>this.model.setParameterValueByIndex(i,v));
    for(const [id,value] of Object.entries(p))this.set(id,value as number);
    if(dt>0&&!this.reduce)this.physics?.evaluate(this.model,dt);
    // The source preview reapplies explicit inputs after physics too.
    for(const [id,value] of Object.entries(p))this.set(id,value as number);
    this.canvas.dataset.expressionArtwork=this.expressionKit?this.expressionState:this.eyesClosed?'closed':this.state;
    this.canvas.dataset.expressionIndex=String(p.ParamPaintedEyes);
    this.canvas.dataset.drawingBody=String(p.ParamDrawingBody);
    this.canvas.dataset.animationTime=this.time.toFixed(3);
    this.canvas.dataset.breath=this.model.getParameterValueByIndex(this.parameters.get('ParamBreath')).toFixed(3);
    this.model.update();this.draw();
  }
  draw(){
    const gl=this.gl,w=this.canvas.width,h=this.canvas.height;
    let [x0,y0,x1,y1]=this.bounds;
    if(this.originalKit){
      const info=this.model.getModel().canvasinfo,ppu=info.PixelsPerUnit;
      const r=(this.expressionKit?expressionRegion:sourceRegion)(this.modelUrl.split('/').at(-2),this.framing);
      x0=(r.x-info.CanvasOriginX)/ppu;x1=(r.x+r.w-info.CanvasOriginX)/ppu;
      y0=(info.CanvasOriginY-r.y-r.h)/ppu;y1=(info.CanvasOriginY-r.y)/ppu;
    }else if(this.framing==='face'){const cx=(x0+x1)/2,half=(x1-x0)*.23;y0=y1-(y1-y0)*.33;x0=cx-half;x1=cx+half;}else if(this.framing==='portrait'){const cx=(x0+x1)/2,half=(x1-x0)*.36;y0=y1-(y1-y0)*.58;x0=cx-half;x1=cx+half;}
    const scale=Math.min(w/(x1-x0),h/(y1-y0))*(this.originalKit?.94:.9);
    const matrix=new CubismMatrix44(),m=matrix.getArray();
    m[0]=2*scale/w;m[5]=2*scale/h;m[12]=-(x0+x1)*scale/w;m[13]=-(y0+y1)*scale/h;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderer.setMvpMatrix(matrix);this.renderer.setRenderState(null,[0,0,w,h]);this.renderer.drawModel(SHADERS);
  }
  destroy(){this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.canvas.removeEventListener('pointermove',this.follow);this.canvas.removeEventListener('pointerleave',this.leave);this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.renderer?.release();this.textures.forEach(t=>this.gl.deleteTexture(t));if(this.model)this.moc?.deleteModel(this.model);this.moc?.release();this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
}
