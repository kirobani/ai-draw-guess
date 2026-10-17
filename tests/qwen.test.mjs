import test from 'node:test';
import assert from 'node:assert/strict';
import {QWEN_BASE,QWEN_MODELS} from '../lib/qwen-models.mjs';
import {buildRequest,publicPlayer} from '../lib/providers.mjs';
import {modelSource,matchingModels,sameSetup} from '../public/model-picker.mjs';
import {checkKey,checkCapabilities} from '../lib/model-checks.mjs';
const p={id:'qwen',provider:'compatible',characterId:'qwen',baseUrl:QWEN_BASE,model:'qwen3.8-flash',apiKey:'private-fixture'};
test('千问官方地址在兼容接入下也有型号目录，文字型号不冒充视觉型号',()=>{
 assert.equal(modelSource(p),'qwen');
 const catalog={models:QWEN_MODELS};
 const visible=matchingModels(p,catalog).map(m=>m.id);
 for(const id of ['qwen3.8-flash','qwen3.8-max','qwen3.7-plus','qwen3.7-flash','qwen3.7-max-2026-06-08'])assert(visible.includes(id));
 assert(!visible.includes('qwen3.7-max'));assert(!visible.includes('qwen3.8-2.4t-a95b'));
 assert(matchingModels(p,catalog,true).some(m=>m.id==='qwen3.7-max'));
 assert.equal(matchingModels({...p,baseUrl:'https://example.com/v1'},catalog).length,0);
});
test('千问默认快速回复，认真思考可选；不向其他服务或不支持关闭思考的型号发送参数',()=>{
 const image='data:image/png;base64,fixture';
 const fast=buildRequest(p,'返回 JSON',image);
 assert.equal(fast.body.enable_thinking,false);assert.equal(fast.body.response_format.type,'json_object');
 assert.equal(fast.body.messages[0].content[1].image_url.url,image);
 assert(!JSON.stringify(fast.body).includes(p.apiKey));
 const thinking=buildRequest({...p,replyMode:'thinking'},'返回 JSON',null);
 assert.equal(thinking.body.enable_thinking,undefined);assert.equal(thinking.body.response_format,undefined);
 for(const changed of [{baseUrl:'https://other.example/v1'},{model:'custom-future'}]){
  const r=buildRequest({...p,...changed},'返回 JSON',null);assert.equal(r.body.enable_thinking,undefined);assert.equal(r.body.response_format,undefined);
 }
});
test('切换思考方式使旧实测失效，不暴露密钥',()=>{
 const clean={...p,apiKey:''};
 assert.notEqual(checkKey(p),checkKey({...p,replyMode:'thinking'}));
 assert.equal(checkKey(p),checkKey({...p,replyMode:'fast'}));
 assert(sameSetup(clean,{...clean,replyMode:'fast'}));assert(!sameSetup(clean,{...clean,replyMode:'thinking'}));
 assert.equal(publicPlayer({...p,replyMode:'thinking'}).replyMode,'thinking');
 assert.equal(publicPlayer(p).apiKey,undefined);
 const other={...p,baseUrl:'https://openrouter.ai/api/v1'};
 assert.notEqual(checkKey(other),checkKey({...other,replyMode:'thinking'}));
});
test('识图与绘图各自保存真实耗时，不能把两次调用总耗时当单次延迟',async()=>{
 const r=await checkCapabilities(p,async(_p,_prompt,image)=>image?{guess:'雨伞',elapsed:1200}:{shapes:[{type:'line',points:[[0,0],[10,10]]}],elapsed:3400},'image');
 assert(r.ok);assert.equal(r.vision.elapsed,1200);assert.equal(r.drawing.elapsed,3400);
});
