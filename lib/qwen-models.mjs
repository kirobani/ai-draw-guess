// Curated from the official model pages, checked 2026-10-09.
// This platform does not expose GET /models; this is not an account permission list.
export const QWEN_BASE='https://maas.qianwenaiapi.com/compatible-mode/v1';
export const QWEN_MODELS=[
  ['qwen3.8-flash','Qwen 3.8 Flash',true,true],
  ['qwen3.8-max','Qwen 3.8 Max',true,true],
  ['qwen3.7-plus','Qwen 3.7 Plus',true,true],
  ['qwen3.7-flash','Qwen 3.7 Flash',true,true],
  ['qwen3.7-max-2026-06-08','Qwen 3.7 Max · 视觉版 06-08',true,true],
  ['qwen3.7-max','Qwen 3.7 Max',false,true],
  ['qwen3.8-2.4t-a95b','Qwen 3.8 2.4T A95B',false,false]
].map(([id,name,vision,thinkingSwitch])=>({id,name,vision,thinkingSwitch,family:'qwen',reasoning:{mandatory:!thinkingSwitch,supported_efforts:id.startsWith('qwen3.8-')?['low','medium','xhigh']:[]}}));
// OpenAI-compatible API reference and model market, checked 2026-10-09.
// Pure-text variants remain selectable only with the explicit text-only filter.
QWEN_MODELS.push(...[
  ['deepseek-v4.1-flash','DeepSeek V4.1 Flash',true,'deepseek',false,['low','high','max']],
  ['deepseek-v4-pro-0813','DeepSeek V4 Pro 0813',false,'deepseek',false,['low','high','max']],
  ['deepseek-v4-flash-0731','DeepSeek V4 Flash 0731',false,'deepseek',false,['low','high','max']],
  ['deepseek-v4-pro','DeepSeek V4 Pro',false,'deepseek',false,['high','max']],
  ['deepseek-v4-flash','DeepSeek V4 Flash',false,'deepseek',false,['high','max']],
  ['ZHIPU/GLM-5.3-FlashX','GLM 5.3 FlashX · 智谱直供',true,'glm',true,['low','high','max']],
  ['ZHIPU/GLM-5.3-Flash','GLM 5.3 Flash · 智谱直供',true,'glm',true,['low','high','max']],
  ['glm-5.3','GLM 5.3',false,'glm',true,['low','high','max']],
  ['glm-5.2','GLM 5.2',false,'glm',false,['high','max']],
  ['kimi-k3','Kimi K3',true,'kimi',false,['low','high','max']],
  ['kimi-k2.7-code','Kimi K2.7 Code',true,'kimi',true,[]],
  ['kimi-k2.6','Kimi K2.6',true,'kimi',false,[]],
  ['kimi-k2.5','Kimi K2.5',true,'kimi',false,[]]
].map(([id,name,vision,family,mandatory,supported_efforts])=>({id,name,vision,family,thinkingSwitch:!mandatory,reasoning:{mandatory,supported_efforts}})));
for(const m of QWEN_MODELS)Object.assign(m,{source:'qwen',gameDrawing:true,imageGeneration:false,inputPrice:null,outputPrice:null,reference:'https://www.qianwenai.com/models',verifiedAt:'2026-10-09'});
export function qwenProfile(p){
  try{if(new URL(p.baseUrl||'').hostname!=='maas.qianwenaiapi.com')return null;}catch{return null;}
  return QWEN_MODELS.find(m=>m.id===p.model)||null;
}
export function qwenMode(p){return qwenProfile(p)?.thinkingSwitch?(p.replyMode==='thinking'?'thinking':'fast'):null;}
