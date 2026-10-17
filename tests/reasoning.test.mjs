import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,callModel,codexEffortArgs,publicPlayer} from '../lib/providers.mjs';
import {QWEN_BASE,QWEN_MODELS} from '../lib/qwen-models.mjs';
import {routerModels,codexModels} from '../lib/model-catalog.mjs';
import {chosenEffort,resolveEffort,effortChoices,validateControls} from '../public/reasoning.mjs';
import {checkKey} from '../lib/model-checks.mjs';
import {sameSetup,matchingModels} from '../public/model-picker.mjs';
import {seatPresentation} from '../public/seat-presentation.mjs';
const p={id:'ds',provider:'compatible',baseUrl:QWEN_BASE,model:'deepseek-v4.1-flash',apiKey:'secret-fixture'};
const router={source:'openrouter',reasoning:{mandatory:true,supported_efforts:['low','medium','high','max']}};
test('DS 关闭思考、原生三档参数和千问三档不会混用，禁止发无效档位',()=>{
 assert.equal(buildRequest(p,'JSON','image').body.enable_thinking,false);
 for(const effort of ['low','high','max']){const b=buildRequest({...p,reasoningEffort:effort},'JSON','image').body;assert.equal(b.enable_thinking,true);assert.equal(b.reasoning_effort,effort);assert.equal(b.thinking_budget,undefined);}
 assert.throws(()=>buildRequest({...p,reasoningEffort:'medium'},'JSON'),/不支持/);
 const q={...p,model:'qwen3.8-max',reasoningEffort:'medium'};
 assert.equal(buildRequest(q,'JSON').body.reasoning_effort,'medium');
 assert.equal(buildRequest({...q,reasoningEffort:'default'},'JSON').body.reasoning_effort,undefined);
 const glm={...p,model:'ZHIPU/GLM-5.3-FlashX'};
 assert.equal(buildRequest(glm,'JSON').body.reasoning_effort,'low');assert.throws(()=>buildRequest({...glm,reasoningEffort:'none'},'JSON'),/不支持/);
 assert.equal(buildRequest({...p,model:'kimi-k3'},'JSON').body.enable_thinking,false);
});
test('平台目录保留真实思考能力，不给强制思考型号提供关闭选项；Codex 参数采用所选档',()=>{
 const r=routerModels([{id:'anthropic/test',architecture:{input_modalities:['image','text'],output_modalities:['text']},reasoning:router.reasoning}])[0];
 assert(!effortChoices(r).includes('none'));assert.equal(resolveEffort({},r),'low');
 const optional={reasoning:{mandatory:false,supported_efforts:['minimal','high']}};
 assert.equal(resolveEffort({},optional),'none');
 const c=codexModels([{slug:'gpt-test',visibility:'list',supported_reasoning_levels:[{effort:'low'},{effort:'ultra'}]}])[0];
 assert.deepEqual(codexEffortArgs({reasoningEffort:'ultra'},c),['-c','model_reasoning_effort="ultra"']);
 assert.throws(()=>codexEffortArgs({reasoningEffort:'none'},c),/不支持/);
 assert.deepEqual(codexEffortArgs({reasoningEffort:'default'},c),[]);
 assert.deepEqual(effortChoices(null),['auto','default']);
});
test('OpenRouter 每次按型号支持发送有效值，思考强度增大时预留输出空间',()=>{
 const p={provider:'compatible',baseUrl:'https://openrouter.ai/api/v1',model:'anthropic/test',reasoningEffort:'high'};
 const b=buildRequest(p,'JSON','image',router).body;assert.deepEqual(b.reasoning,{effort:'high',exclude:true});assert.equal(b.max_tokens,32768);
 assert.throws(()=>buildRequest({...p,reasoningEffort:'none'},'JSON',null,router),/不支持/);
 const optional={...router,reasoning:{mandatory:false,supported_efforts:['minimal','high']}};
 assert.deepEqual(buildRequest({...p,reasoningEffort:'none'},'JSON',null,optional).body.reasoning,{enabled:false,exclude:true});
});
test('思考强度、等待上限参与实测有效性；公开配置无密钥',()=>{
 for(const changed of [{reasoningEffort:'high'},{timeoutSeconds:300}]){assert.notEqual(checkKey(p),checkKey({...p,...changed}));assert(!sameSetup({...p,apiKey:'',...changed},{...p,apiKey:''}));}
 assert.equal(publicPlayer(p).reasoningEffort,'auto');assert.equal(publicPlayer({...p,timeoutSeconds:300}).timeoutSeconds,300);assert(!JSON.stringify(publicPlayer(p)).includes('secret-fixture'));
 assert.throws(()=>validateControls({...p,timeoutSeconds:9999},QWEN_MODELS[0]),/最长等待/);
 assert.equal(chosenEffort({replyMode:'thinking'}),'default');
});
test('千问按角色展示真实型号；纯文字 GLM 和 DS 不被默认列为看图选手',()=>{
 for(const [family,model] of [['deepseek','deepseek-v4.1-flash'],['glm','ZHIPU/GLM-5.3-FlashX'],['kimi','kimi-k3']]){
  const options=matchingModels({...p,characterId:family,model},{models:QWEN_MODELS});assert(options.some(m=>m.id===model));assert(options.every(m=>m.family===family&&m.vision));
 }
});
test('超时信息包含所选处理时限；记录耗时与请求阶段而不记录密钥和提示全文',async t=>{
 let timeout;const diagnostic=[],progress=[];
 t.mock.method(AbortSignal,'timeout',ms=>{timeout=ms;return new AbortController().signal;});
 t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('upstream','TimeoutError');});
 await assert.rejects(callModel({...p,timeoutSeconds:60},'private prompt','data:image/png;base64,AAAA',null,null,{onProgress:s=>progress.push(s),onDiagnostic:d=>diagnostic.push(d)}),/已处理 60 秒.*不含排队/);
 assert.equal(timeout,60000);assert.deepEqual(progress,['queued','running']);assert.equal(diagnostic[0].error,'timeout');assert(!JSON.stringify(diagnostic).includes('secret-fixture'));assert(!JSON.stringify(diagnostic).includes('private prompt'));
});
test('平台未开通和思考耗尽输出预算提供明确错误，不暴露服务返回的任意文本',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({message:'The product is not activated secret-fixture'}),{status:400}));
 await assert.rejects(callModel(p,'JSON'),e=>/尚未在平台开通/.test(e.message)&&!e.message.includes('secret-fixture'));
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"guess":"断'}}]})));
 await assert.rejects(callModel(p,'JSON'),/回复达到长度上限/);
});
test('排队和已发出的处理状态在比赛席位分开显示',()=>{
 const player={id:'ds',characterId:'deepseek'},g={phase:'guessing',artistId:'human',results:{ds:{status:'queued'}}};
 assert.equal(seatPresentation(g,player).status,'排队中…');assert.equal(seatPresentation(g,player).state,'idle');
 g.results.ds.status='thinking';assert.equal(seatPresentation(g,player).status,'模型处理中…');
});
