import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {existsSync} from 'node:fs';
const hasAssets=existsSync(new URL('../public/models/agentkit-expressions-r3/deepseek/deepseek-expressions.model3.json',import.meta.url));
const hasCore=existsSync(new URL('../public/vendor/live2dcubismcore.min.js',import.meta.url));
const required=process.env.REQUIRE_AVATAR_ASSETS==='1';
import {CORE_MEMORY_BYTES} from '../src/original-agentkit-driver.mjs';
import {CastNineDriver} from '../src/cast-nine-driver.mjs';
import {ExpressionAgentKitDriver} from '../src/expression-agentkit-driver.mjs';
import {reactionFrame,REACTIONS} from '../src/cast-expression-reactions.mjs';
import {blinkOpen} from '../src/expression-breath.mjs';
import {CHARACTERS as ALL_CHARACTERS,recordedCharacter} from '../public/characters.mjs';
const CHARACTERS=ALL_CHARACTERS.filter(c=>!c.family&&c.id!=='hunyuan').map(c=>recordedCharacter(c.id));
const hasLatest=existsSync(new URL('../public/models/live2d-all-characters-r1/deepseek/deepseek-expressions.model3.json',import.meta.url));
const latestOptions={skip:!required&&!hasLatest};
const legacyOptions={skip:!hasAssets};
const legacyCoreOptions={skip:!hasAssets||!hasCore};

test('十一位角色均使用 Kit 九表情高清包，所有运行引用完整',legacyOptions,async()=>{
 for(const c of CHARACTERS){
  assert.match(c.modelUrl,/^\/models\/agentkit-expressions-r3\//);
  const url=new URL('../public'+c.modelUrl,import.meta.url),settings=JSON.parse(await readFile(url,'utf8')),r=settings.FileReferences;
  for(const f of [r.Moc,r.DisplayInfo,r.Physics,...r.Textures,...Object.values(r.Motions).flat().map(m=>m.File)].filter(Boolean))assert((await readFile(new URL(f,url))).length>0);
  const png=await readFile(new URL(r.Textures[0],url));assert.equal(png.readUInt32BE(16),8192);
 }
});
test('公开角色包的完整文件与发布清单一致',legacyOptions,async()=>{
 const {files}=JSON.parse(await readFile(new URL('../licenses/avatars-manifest.json',import.meta.url),'utf8'));
 assert.equal(new Set(files.map(f=>f.path.split('/')[3])).size,11);
 for(const f of files)assert.equal(createHash('sha256').update(await readFile(new URL('../'+f.path,import.meta.url))).digest('hex'),f.sha256);
});
test('九种反应精确复用预览 Kit 参数，保留画完姿势、连续眨眼和呼吸',()=>{
 assert.equal(REACTIONS.length,9);
 for(const c of CHARACTERS)for(const [index,[state]] of REACTIONS.entries()){
  const d=new ExpressionAgentKitDriver(c.id),time=2.4,blinkAt=-100;
  const frame=d.frame({state,time,blinkAt});
  assert.deepEqual(frame,reactionFrame({character:c.id,reaction:state,time,blinkAt,headX:0,headY:0,gazeX:0,gazeY:0,pointerX:0,pointerY:0,follow:true,talking:false},'kit'));
  assert.equal(frame.ParamPaintedEyes,index);assert.equal(frame.ParamPaintedFace,index);
  const inhale=d.frame({state,time:Math.PI/2/1.25}),exhale=d.frame({state,time:3*Math.PI/2/1.25});
  assert(Math.abs(inhale.ParamBreath-.98)<1e-6);assert(Math.abs(exhale.ParamBreath-.02)<1e-6);
  const closed=d.frame({state,time:1,blinkAt:.85});
  assert.equal(closed.ParamEyeLOpen,0);assert.equal(closed.ParamPaintedEyes,index);assert.equal(closed.ParamDrawingBody,frame.ParamDrawingBody);
 }
 const d=new ExpressionAgentKitDriver('deepseek');
 assert.equal(d.frame({state:'drawing'}).ParamEyeBallY,.85);
 assert.equal(d.frame({state:'finished'}).ParamDrawingBody,1);
 assert.equal(d.frame({state:'finished'}).ParamDrawingStroke,0);
 assert(blinkOpen(.07)>0&&blinkOpen(.07)<1);
 assert.equal(d.frame({state:'spectator',eyesClosed:true}).ParamPaintedEyes,7);
 assert.equal(d.frame({state:'spectator',eyesClosed:true}).ParamEyeLOpen,0);
});
test('12 位角色共存时原生内存不扩容，所有角色的画画网格和高清版连续眼睑生效',legacyCoreOptions,async()=>{
 const context=vm.createContext({console:{log(){},warn(){},error(){}},WebAssembly,TextDecoder,TextEncoder,setTimeout,clearTimeout,atob,btoa});
 vm.runInContext(await readFile(new URL('../public/vendor/live2dcubismcore.min.js',import.meta.url),'utf8'),context);
 const core=context.Live2DCubismCore;
 for(let attempt=0;attempt<100;attempt++){try{if(core.Version.csmGetVersion())break;}catch{}await new Promise(r=>setTimeout(r,10));}
 core.Memory.initializeAmountOfMemory(CORE_MEMORY_BYTES);
 const models=[];
 try{
  for(let i=0;i<12;i++){
   const c=CHARACTERS[i%CHARACTERS.length],base=new URL('../public'+c.modelUrl,import.meta.url),settings=JSON.parse(await readFile(base,'utf8')),b=await readFile(new URL(settings.FileReferences.Moc,base));
   const moc=core.Moc.fromArrayBuffer(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),model=core.Model.fromMoc(moc);models.push({model,moc,id:c.id});
  }
  for(const {model,id} of models){
   const p=model.parameters,ids=Array.from(p.ids),d=new ExpressionAgentKitDriver(id);
   const apply=state=>{for(const [id,value] of Object.entries(d.frame({state})))if(ids.includes(id))p.values[ids.indexOf(id)]=value;model.update();};
   assert.equal(p.maximumValues[ids.indexOf('ParamPaintedEyes')],8,id+' nine expression slots');
   apply('idle');const idle=Array.from(model.drawables.opacities);
   apply('drawing');assert.notDeepEqual(Array.from(model.drawables.opacities),idle,id+' drawing meshes');
   assert.equal(p.values.buffer,models[0].model.parameters.values.buffer);
   {
    apply('idle');const before=Array.from(model.drawables.vertexPositions, v=>Array.from(v));
    p.values[ids.indexOf('ParamEyeLOpen')]=.4;model.update();
    assert.notDeepEqual(Array.from(model.drawables.vertexPositions,v=>Array.from(v)),before,id+' continuous eyelid geometry');
    for(const [state] of REACTIONS){
     apply(state);p.values[ids.indexOf('ParamBreath')]=0;model.update();
     const exhale=Array.from(model.drawables.vertexPositions,v=>Array.from(v));
     p.values[ids.indexOf('ParamBreath')]=1;model.update();
     assert.notDeepEqual(Array.from(model.drawables.vertexPositions,v=>Array.from(v)),exhale,id+' '+state+' breathing geometry');
    }
   }
  }
 }finally{for(const {model,moc} of models){model.release();moc._release();}}
});

test('新版交付的 21 个高清九态模型运行引用完整',latestOptions,async()=>{
 const unique=new Map(ALL_CHARACTERS.filter(c=>c.rigRevision==='live2d-all-characters-r1').map(c=>[c.modelUrl,c]));
 assert.equal(unique.size,21);
 assert.equal(unique.get(ALL_CHARACTERS.find(c=>c.id==='chatgpt').modelUrl).id,'astra');
 assert.equal(unique.get(ALL_CHARACTERS.find(c=>c.id==='claude').modelUrl).id,'opus');
 assert.equal(unique.get(ALL_CHARACTERS.find(c=>c.id==='gemini').modelUrl).id,'gemini-ultra');
 for(const c of unique.values()){
  assert.match(c.modelUrl,/^\/models\/live2d-all-characters-r1\//);
  const url=new URL('../public'+c.modelUrl,import.meta.url),settings=JSON.parse(await readFile(url,'utf8')),r=settings.FileReferences;
  assert.equal(r.Expressions.length,9);
  for(const f of [r.Moc,r.DisplayInfo,r.Physics,...r.Textures,...Object.values(r.Motions).flat().map(m=>m.File),...(r.Expressions||[]).map(e=>e.File)].filter(Boolean))assert((await readFile(new URL(f,url))).length>0);
  const png=await readFile(new URL(r.Textures[0],url));assert.equal(png.readUInt32BE(16),8192);
 }
});
test('型号专属角色切换画猜时保持头部角度，作画仍有视线与落笔动作',()=>{
 for(const {id} of ALL_CHARACTERS.filter(c=>c.family)){
  const driver=new ExpressionAgentKitDriver(id),pose={time:.5,headX:2,headY:1};
  const frames=['uncertain','drawing','finished','confident'].map(state=>driver.frame({...pose,state}));
  for(const p of frames){
   assert.equal(p.ParamAngleX,2,id);
   assert.equal(p.ParamAngleY,1,id);
   assert.equal(p.ParamAngleZ,0,id);
  }
  assert.deepEqual(frames.map(p=>p.ParamDrawingBody),[0,1,1,0],id);
  assert.equal(frames[1].ParamEyeBallY,.85,id);
  assert.notEqual(frames[1].ParamDrawingStroke,0,id);
  assert.equal(frames[2].ParamDrawingStroke,0,id);
 }
});

test('新版九态各用原生表情和持续姿态，状态切换时头部没有固定跳转',()=>{
 for(const c of ALL_CHARACTERS.filter(c=>c.rigRevision==='live2d-all-characters-r1')){
  const driver=new CastNineDriver(c.id,{seed:12345});
  let maxPose=0,lowest=1,highest=0;
  for(let i=0;i<1000;i++){
   const p=driver.frame({time:i/30},1/30);
   maxPose=Math.max(maxPose,Math.abs(p.ParamAngleX),Math.abs(p.ParamAngleY),Math.abs(p.ParamAngleZ));
   lowest=Math.min(lowest,p.ParamBreath);highest=Math.max(highest,p.ParamBreath);
  }
  assert(maxPose>8,c.id);
  assert(lowest<.06&&highest>.94,c.id);
  const frames=REACTIONS.map(([state])=>driver.frame({state,time:34}));
  assert.deepEqual(frames.map(p=>p.ParamPaintedEyes),[0,1,2,3,4,5,6,7,8],c.id);
  assert.deepEqual(frames.map(p=>p.ParamPaintedFace),frames.map(p=>p.ParamPaintedEyes),c.id);
  assert.deepEqual(frames.map(p=>p.ParamDrawingBody),[0,1,1,0,0,0,0,0,0],c.id);
  assert(frames.every(p=>p.ParamAngleY===frames[0].ParamAngleY),c.id);
  assert.equal(frames[1].ParamEyeBallY,.85,c.id);
  assert.notEqual(frames[1].ParamDrawingStroke,0,c.id);
  assert.equal(frames[2].ParamDrawingStroke,0,c.id);
 }
});

test('新版高清包文件与三个下载附件的清单一致',latestOptions,async()=>{
 const {files}=JSON.parse(await readFile(new URL('../licenses/avatars-v2-manifest.json',import.meta.url),'utf8'));
 const {archives}=JSON.parse(await readFile(new URL('../data/avatar-release-v2.json',import.meta.url),'utf8'));
 for(const archive of archives)assert.equal(files.filter(file=>file.archive===archive.name).length,archive.files);
 for(const file of files){
  const data=await readFile(new URL('../'+file.path,import.meta.url));
  assert.equal(data.length,file.size);
  assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);
 }
});
