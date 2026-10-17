import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest} from '../lib/providers.mjs';
test('OpenRouter 限制回复长度并保持图片和 JSON 协议，不影响其他兼容服务',()=>{
  const p={provider:'compatible',baseUrl:'https://openrouter.ai/api/v1',model:'deepseek/deepseek-v4.1-flash',apiKey:'test-private'};
  const image='data:image/png;base64,fixture';
  const profile={source:'openrouter',reasoning:{mandatory:true,supported_efforts:['low','high']}};
  const guess=buildRequest(p,'猜图',image,profile),draw=buildRequest(p,'绘图',null,profile);
  assert.equal(guess.body.max_tokens,4096);assert.equal(draw.body.max_tokens,12288);
  assert.deepEqual(guess.body.reasoning,{effort:'low',exclude:true});
  assert.equal(guess.body.response_format.type,'json_object');
  assert.equal(guess.body.messages[0].content[1].image_url.url,image);
  assert.equal(guess.headers.Authorization,'Bearer test-private');
  assert(!JSON.stringify(guess.body).includes('test-private'));
  const kimi=buildRequest({...p,model:'moonshotai/kimi-k2.6'},'猜图',image,{reasoning:{mandatory:false,supported_efforts:['low','high']}});
  assert.equal(kimi.body.reasoning.enabled,false);
  const other=buildRequest({...p,baseUrl:'https://example.com/v1'},'猜图',image);
  assert.equal(other.body.max_tokens,undefined);assert.equal(other.body.reasoning,undefined);
});
