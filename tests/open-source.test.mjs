import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_PLAYERS,buildRequest,publicPlayer} from '../lib/providers.mjs';
import {getApiKey,setSharedOpenRouterKey} from '../lib/credentials.mjs';
import {routerModels} from '../lib/model-catalog.mjs';
import {matchingModels} from '../public/model-picker.mjs';
import {validateControls} from '../public/reasoning.mjs';

test('all eleven characters use their own editable OpenRouter vision model, including GPT',async()=>{
  assert.equal(DEFAULT_PLAYERS.length,11);
  const models=routerModels(JSON.parse(await readFile(new URL('../data/openrouter-models.json',import.meta.url),'utf8')).data);
  for(const p of DEFAULT_PLAYERS){
    assert.equal(p.provider,'openrouter');assert.equal(p.baseUrl,'https://openrouter.ai/api/v1');
    const m=matchingModels(p,{models}).find(m=>m.id===p.model);assert(m,p.name);assert(m.vision&&m.gameDrawing);
    validateControls(p,m);
    const req=buildRequest(p,'draw',null,m);assert.equal(req.url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(req.body.model,p.model);
  }
  assert.equal(DEFAULT_PLAYERS.filter(p=>p.characterId==='chatgpt').length,1);
});

test('shared credentials never follow a custom endpoint or enter public player data',()=>{
  const p=DEFAULT_PLAYERS[0],secret='shared-secret-for-test';
  setSharedOpenRouterKey(secret);
  try{
    assert.equal(getApiKey(p),secret);
    assert.equal(buildRequest(p,'test',null).headers.Authorization,'Bearer '+secret);
    assert.equal(getApiKey({...p,apiKey:'individual-test'}),'individual-test');
    for(const baseUrl of ['https://example.test/v1','https://openrouter.ai.evil.test/api/v1','http://openrouter.ai/api/v1','https://openrouter.ai:444/api/v1','https://openrouter.ai/api/other'])assert.equal(getApiKey({...p,baseUrl}),'');
    assert(!JSON.stringify(publicPlayer(p)).includes(secret));assert(publicPlayer(p).hasKey);
  }finally{setSharedOpenRouterKey('');}
});
