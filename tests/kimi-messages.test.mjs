import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,callModel} from '../lib/providers.mjs';
import {compatibleKimiProfile,effortChoices,resolveEffort,validateControls} from '../public/reasoning.mjs';
import {mountModelPicker} from '../public/model-picker.mjs';

const player={id:'kimi',name:'Kimi',characterId:'kimi',provider:'anthropic',baseUrl:'https://cf.api.fan/v1',model:'kimi-k3.1-pro-highspeed',reasoningEffort:'auto',timeoutSeconds:600,apiKey:'private-key-fixture'};
const image='data:image/png;base64,AAAA';

test('Packy Kimi preserves Messages identity and maps auto/explicit thinking to supported native effort',()=>{
  for(const model of ['kimi-k3.1-pro','kimi-k3.1-pro-highspeed']){
    const p={...player,model},profile=compatibleKimiProfile(p);
    assert.deepEqual(effortChoices(profile),['auto','default','low','high','max']);
    assert.equal(resolveEffort(p,null),'low');validateControls(p,null);
    for(const effort of ['auto','low','high','max','default']){
      const request=buildRequest({...p,reasoningEffort:effort},'guess',image);
      assert.equal(request.url,'https://cf.api.fan/v1/messages');
      assert.equal(request.body.model,model);
      assert.equal(request.body.max_tokens,32768);
      assert.equal(request.body.output_config?.effort,effort==='default'?undefined:effort==='auto'?'low':effort);
      assert.equal(request.body.reasoning_effort,undefined);
      assert.equal(request.body.thinking?.type,undefined);
      assert.equal(request.headers['x-api-key'],player.apiKey);
    }
    assert.equal(buildRequest(p,'draw',null).body.max_tokens,65536);
    for(const effort of ['none','medium'])assert.throws(()=>buildRequest({...p,reasoningEffort:effort},'guess',image),/不支持/);
  }
});

test('Kimi-specific controls do not affect unrelated hosts, Claude, or a different protocol',()=>{
  for(const change of [{baseUrl:'https://example.com/v1'},{model:'claude-opus-5-5'},{provider:'compatible'}]){
    const p={...player,...change};assert.equal(compatibleKimiProfile(p),null);
    assert.equal(buildRequest(p,'test',image).body.output_config,undefined);
  }
});

test('Kimi Messages truncation reports a neutral error and records receipts and limits without private content',async t=>{
  const diagnostics=[];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({id:'msg-kimi-receipt',model:player.model,stop_reason:'max_tokens',content:[{type:'thinking',thinking:'private-thought-fixture'}],usage:{output_tokens:32768,output_tokens_details:{thinking_tokens:32768}}})));
  await assert.rejects(callModel(player,'private-prompt-fixture',image,null,null,{modelProfile:null,onDiagnostic:d=>diagnostics.push(d)}),e=>e.message.includes('输出长度上限')&&!e.message.includes('Claude'));
  assert.equal(diagnostics[0].responseModel,player.model);
  assert.equal(diagnostics[0].requestId,'msg-kimi-receipt');
  assert.equal(diagnostics[0].maxOutputTokens,32768);
  assert.equal(diagnostics[0].reasoningTokens,32768);
  assert.equal(diagnostics[0].effort,'low');
  assert(!JSON.stringify(diagnostics).includes('fixture'));
});

test('Kimi custom-interface settings display real effort options without needing an OpenRouter catalog',()=>{
  const host={innerHTML:'',querySelector:()=>null};
  const row={dataset:{},querySelector:()=>host};
  mountModelPicker(row,{...player,apiKey:undefined},{models:[]},null);
  const select=host.innerHTML.match(/<select data-field="reasoningEffort"[^>]*>(.*?)<\/select>/s)[1];
  for(const value of ['auto','default','low','high','max'])assert(select.includes(`value="${value}"`));
  assert(!select.includes('value="none"'));
  assert(!select.includes('请核对型号支持'));
});
