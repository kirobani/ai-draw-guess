import test from 'node:test';
import assert from 'node:assert/strict';
import {routerModels,codexModels} from '../lib/model-catalog.mjs';
import {matchingModels,sameSetup,connectionIssue} from '../public/model-picker.mjs';
import {callModel,migrateConfig,DEFAULT_PLAYERS,buildRequest} from '../lib/providers.mjs';
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
 assert.equal(DEFAULT_PLAYERS.filter(p=>p.provider==='codex').length,0);assert.equal(cfg.players.length,4);assert.equal(cfg.players[0].name,'GPT');assert.equal(cfg.players[0].apiKey,'keep');assert.deepEqual(migrateConfig(cfg),cfg);
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
