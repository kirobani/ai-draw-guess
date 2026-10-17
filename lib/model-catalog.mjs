import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {QWEN_MODELS} from './qwen-models.mjs';
const fallback=JSON.parse(await readFile(new URL('../data/openrouter-models.json',import.meta.url),'utf8'));

const families={'anthropic':'claude','google':'gemini','deepseek':'deepseek','z-ai':'glm','x-ai':'grok','moonshotai':'kimi','qwen':'qwen','bytedance-seed':'doubao','openai':'chatgpt','minimax':'minimax','xiaomi':'mimo'};
const price=value=>value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value)*1e6:null;
export function routerModels(data){
  return (data||[]).filter(m=>typeof m.id==='string'&&families[m.id.split('/')[0]]&&(!m.id.startsWith('google/')||m.id.startsWith('google/gemini'))&&!m.id.includes(':batch')&&m.architecture?.output_modalities?.includes('text')).map(m=>{
    const inputs=m.architecture.input_modalities||[],outputs=m.architecture.output_modalities||[];
    return {id:m.id,name:m.name||m.id,family:families[m.id.split('/')[0]],source:'openrouter',vision:inputs.includes('image'),gameDrawing:outputs.length===1&&outputs[0]==='text',imageGeneration:outputs.includes('image'),inputPrice:price(m.pricing?.prompt),outputPrice:price(m.pricing?.completion),created:m.created||0,reasoning:m.reasoning||null,supportedParameters:m.supported_parameters||[]};
  }).sort((a,b)=>b.created-a.created||a.name.localeCompare(b.name));
}
export function codexModels(data){
  return (data||[]).filter(m=>m.visibility==='list'&&m.slug).map(m=>({id:m.slug,name:m.display_name||m.slug,family:'chatgpt',source:'codex',vision:m.input_modalities?.includes('image')||false,gameDrawing:true,imageGeneration:false,inputPrice:null,outputPrice:null,reasoning:m.supported_reasoning_levels?.length?{mandatory:true,supported_efforts:m.supported_reasoning_levels.map(x=>x.effort),default_effort:m.default_reasoning_level}:null}));
}
let cached=null,pending=null;
export async function modelCatalog(){
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<30*60e3)return cached;
  if(pending)return pending;
  pending=(async()=>{
    const results=await Promise.allSettled([
      fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw new Error('目录暂时不可用');return routerModels((await r.json()).data);}),
      readFile(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'models_cache.json'),'utf8').then(s=>codexModels(JSON.parse(s).models)).catch(()=>[])
    ]);
    const warnings=[],models=[...QWEN_MODELS];
    for(let i=0;i<results.length;i++)if(results[i].status==='fulfilled')models.push(...results[i].value);else{warnings.push(i===0?'OpenRouter 目录暂时未能更新，仍可保留或手填型号。':'本机 Codex 型号目录暂时不可用，仍可保留或手填型号。');if(cached)models.push(...cached.models.filter(m=>m.source===(i===0?'openrouter':'codex')));else if(i===0)models.push(...routerModels(fallback.data));}
    const result={models,warnings,fetchedAt:new Date().toISOString()};
    cached=result;
    return result;
  })();
  try{return await pending;}finally{pending=null;}
}
