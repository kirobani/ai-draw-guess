import {resolveCharacter,characterSpeech} from '../public/characters.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {routerModels,codexModels} from '../lib/model-catalog.mjs';
import {matchingModels,sameSetup,connectionIssue} from '../public/model-picker.mjs';
import {callModel,migrateConfig,DEFAULT_PLAYERS,buildRequest,EXTRA_PLAYERS,publicPlayer} from '../lib/providers.mjs';
import {checkKey,checkCapabilities} from '../lib/model-checks.mjs';
const p={id:'claude',provider:'compatible',baseUrl:'https://openrouter.ai/api/v1',model:'anthropic/vision',characterId:'claude',apiKey:'private-fixture'};
test('型号目录按输入能力、输出能力和厂商筛选，文字与原生生图不冒充游戏适用',()=>{
 const entry=(id,input=['text','image'],output=['text'])=>({id,architecture:{input_modalities:input,output_modalities:output},pricing:{prompt:'0.000001',completion:'0.000002'}});
 const models=routerModels([entry('anthropic/vision'),entry('anthropic/text',['text']),entry('anthropic/art',['text','image'],['text','image']),entry('google/vision'),entry('anthropic/vision:batch'),entry('other/vision')]);
 assert.deepEqual(matchingModels(p,{models}).map(x=>x.id),['anthropic/vision']);
 assert.equal(matchingModels(p,{models},true).length,2);
 assert.equal(models.find(x=>x.id===p.model).inputPrice,1);
 assert.deepEqual(codexModels([{slug:'hidden',visibility:'hide'},{slug:'visible',visibility:'list',input_modalities:['text','image']}]).map(m=>m.id),['visible']);
});
test('只合并旧默认 GPT，不删除自定义选手；以后保存的自定义配置不会再被迁移删除',()=>{
 const cfg=migrateConfig({version:2,players:[{id:'codex-sol',name:'Codex · Sol',provider:'codex',apiKey:'keep'},{id:'codex-luna',provider:'codex'},{id:'custom',provider:'codex'}]});
 assert.equal(DEFAULT_PLAYERS.filter(p=>p.provider==='codex').length,0);assert.equal(cfg.players.length,5+EXTRA_PLAYERS.length);assert.equal(cfg.players[0].name,'GPT');assert.equal(cfg.players[0].apiKey,'keep');assert.deepEqual(migrateConfig(cfg),cfg);
});
test('换型号、地址、接入方式或密钥使验收记录失效，不向网页提供密钥指纹',()=>{
 for(const changed of [{model:'anthropic/new'},{baseUrl:'https://other.test/v1'},{provider:'anthropic'},{apiKey:'new-private'}])assert.notEqual(checkKey(p),checkKey({...p,...changed}));
 const clean={...p,apiKey:''};assert(sameSetup(clean,clean));assert(!sameSetup({...clean,model:'changed'},clean));assert(!sameSetup({...clean,apiKey:'new'},clean));
});
test('真实响应元数据独立于模型文本，不能被模型自称的型号或伪造 receipt 覆盖',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({id:'gen-real',model:'anthropic/vision-actual',provider:'Real Host',usage:{cost:0.001},choices:[{message:{content:JSON.stringify({ok:true,receipt:{responseModel:'forged'}})}}],secret:'private-fixture'}),{status:200}));
 const result=await callModel(p,'test',null);
 assert.equal(result.receipt.responseModel,'anthropic/vision-actual');assert.equal(result.receipt.requestedModel,p.model);assert.equal(result.receipt.requestId,'gen-real');assert(!JSON.stringify(result).includes('private-fixture'));
});
test('识图猜错或画图坐标错误不能标为通过，两项检查分别保存结果',async()=>{
 let calls=0;const result=await checkCapabilities(p,async(_p,_prompt,image)=>{calls++;return image?{guess:'西瓜',receipt:{responseModel:p.model}}:{shapes:[{type:'line',points:[[-1,0],[2,2]]}]};},'fixture');
 assert.equal(calls,2);assert.equal(result.ok,false);assert.equal(result.vision.ok,false);assert.equal(result.drawing.ok,false);assert.equal(result.vision.guess,'西瓜');
 const success=await checkCapabilities(p,async(_p,_prompt,image)=>image?{guess:'雨伞'}:{shapes:[{type:'line',points:[[0,0],[2,2]]}]},'fixture');assert.equal(success.ok,true);assert.equal(success.drawing.shapes.length,1);
});

test('示例地址在保存和请求前拦截，完整千问平台地址可以正常组装',()=>{
 for(const token of ['{WorkspaceId}','%7BWorkspaceId%7D']){
  const invalid={...p,baseUrl:'https://'+token+'.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'};
  assert.match(connectionIssue(invalid),/示例模板/);
  assert.throws(()=>buildRequest(invalid,'test',null),/示例模板/);
 }
 const official={...p,provider:'qwen',baseUrl:'https://maas.qianwenaiapi.com/compatible-mode/v1',model:'qwen3.8-flash'};
 assert.equal(connectionIssue(official),'');
 assert.equal(buildRequest(official,'test',null).url,official.baseUrl+'/chat/completions');
 assert.equal(buildRequest(official,'test',null).body.model,'qwen3.8-flash');
});

test('各模型席位匹配自己的 Live2D，换型号仍按系列自动匹配',()=>{
 const ids=['astra','luna','sol','terra','opus','sonnet','haiku-5.5','fable-5.2','gemini-ultra'];
 for(const [i,player] of EXTRA_PLAYERS.entries()){
  const seat=publicPlayer(player);
  assert.equal(seat.characterId,ids[i]);
  assert.equal(seat.characterChoice,player.characterId);
 }
 const gemini={id:'gemini',provider:'compatible',baseUrl:'https://openrouter.ai/api/v1',characterId:'gemini',model:'google/gemini-4-argon'};
 const seat=publicPlayer(gemini);
 assert.equal(seat.characterId,'gemini-pro');
 assert.equal(characterSpeech(gemini,'看图。'),'看图喵。');
 assert.equal(resolveCharacter({...seat,characterId:seat.characterChoice,model:'google/gemini-3.8-flash-lite'}).id,'gemini-flash-lite');
 assert.equal(resolveCharacter({...gemini,model:'google/gemini-3.8-flash'}).id,'gemini-flash');
 assert.equal(resolveCharacter({...gemini,characterId:'gemini-pro',model:'google/gemini-4-carbon'}).id,'gemini-pro');
 assert.equal(resolveCharacter({...gemini,characterId:'qwen'}).id,'qwen');
 assert.deepEqual(matchingModels({...gemini,characterId:'gemini-pro'},{models:[
  {id:gemini.model,source:'openrouter',family:'gemini',vision:true,gameDrawing:true},
  {id:'anthropic/vision',source:'openrouter',family:'claude',vision:true,gameDrawing:true}
 ]}).map(m=>m.id),[gemini.model]);
});

test('Packy 混元请求使用独立 API Key、图片输入和平台思考参数',()=>{
  const player={id:'hunyuan',provider:'packy',model:'hy4',baseUrl:'https://cf.api.fan/v1',apiKey:'fixture-only'};
  const image='data:image/png;base64,fixture';
  const request=buildRequest(player,'猜图',image);
  assert.equal(request.url,'https://cf.api.fan/v1/chat/completions');
  assert.equal(request.headers.Authorization,'Bearer fixture-only');
  assert.equal(request.body.messages[0].content[1].image_url.url,image);
  assert.deepEqual(request.body.thinking,{type:'disabled'});
  assert.equal(request.body.reasoning_effort,'no_think');
  assert.equal(buildRequest({...player,reasoningEffort:'high'},'画图',null).body.reasoning_effort,'high');
});
