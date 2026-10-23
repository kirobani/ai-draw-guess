import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,callModel} from '../lib/providers.mjs';

const player={id:'claude',provider:'anthropic',baseUrl:'https://api.anthropic.com/v1',model:'claude-opus-5-5',apiKey:'anthropic-private-fixture'};
const image='data:image/png;base64,AAAA';
const options={modelProfile:null};

test('Claude 原生看图及绘图为思考和完整 JSON 留出输出空间，保留原生协议',()=>{
  const vision=buildRequest(player,'guess JSON',image),drawing=buildRequest(player,'draw JSON',null);
  assert.equal(vision.url,player.baseUrl+'/messages');
  assert.equal(vision.headers['x-api-key'],player.apiKey);
  assert.equal(vision.headers.Authorization,undefined);
  assert.equal(vision.body.max_tokens,8192);
  assert.equal(drawing.body.max_tokens,16384);
  assert.deepEqual(vision.body.messages[0].content[0],{type:'image',source:{type:'base64',media_type:'image/png',data:'AAAA'}});
  assert.deepEqual(drawing.body.messages[0].content,[{type:'text',text:'draw JSON'}]);
});

test('Claude 原生截断优先于 JSON 解析，思考耗尽、半截和可解析文本都不能当作完整结果',async t=>{
  const cases=[[],[{type:'text',text:'{"guess":"雨'}],[{type:'text',text:'{"guess":"雨伞"}'}]];
  for(const content of cases){
    const diagnostics=[];
    t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({id:'msg-truncated',model:player.model,stop_reason:'max_tokens',content:[{type:'thinking',thinking:'private-reasoning-fixture'},...content],usage:{output_tokens:8192}})));
    await assert.rejects(callModel(player,'private-prompt-fixture',image,null,null,{...options,onDiagnostic:d=>diagnostics.push(d)}),/Claude 回复达到输出长度上限，未完整作答/);
    assert.equal(diagnostics[0].finishReason,'max_tokens');
    assert.equal(diagnostics[0].outputTokens,8192);
    assert.equal(diagnostics[0].ok,false);
    assert(!JSON.stringify(diagnostics).includes('fixture'));
    t.mock.restoreAll();
  }
});

test('Claude 原生完整返回超过旧 600 上限时正常解析，记录结束原因且不暴露思考与密钥',async t=>{
  const diagnostics=[];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({id:'msg-complete',model:player.model,stop_reason:'end_turn',content:[{type:'thinking',thinking:'private-reasoning-fixture'},{type:'text',text:'{"guess":"雨伞","reason":"圆顶下有弯柄","confidence":95}'}],usage:{output_tokens:1120}})));
  const result=await callModel(player,'guess JSON',image,null,null,{...options,onDiagnostic:d=>diagnostics.push(d)});
  assert.equal(result.guess,'雨伞');
  assert.equal(result.receipt.requestId,'msg-complete');
  assert.equal(diagnostics[0].finishReason,'end_turn');
  assert.equal(diagnostics[0].outputTokens,1120);
  assert.equal(diagnostics[0].ok,true);
  assert(!JSON.stringify({result,diagnostics}).includes('fixture'));
});

test('Claude 走 OpenRouter 仍沿用兼容协议与快速档预算',()=>{
  const p={...player,provider:'compatible',baseUrl:'https://openrouter.ai/api/v1',model:'anthropic/claude-opus-5.5',reasoningEffort:'auto'};
  const profile={reasoning:{mandatory:true,supported_efforts:['low','medium','high']}};
  const request=buildRequest(p,'guess JSON',image,profile);
  assert.equal(request.url,p.baseUrl+'/chat/completions');
  assert.equal(request.headers['x-api-key'],undefined);
  assert.equal(request.body.max_tokens,4096);
  assert.deepEqual(request.body.reasoning,{effort:'low',exclude:true});
});
