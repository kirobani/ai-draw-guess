// Secrets stay server-side. Environment/shared keys are scoped to exact known endpoints.
import {OPENROUTER_BASE} from './default-models.mjs';
let sharedKey='';
export function setSharedOpenRouterKey(value){sharedKey=String(value||'').trim();}
export function hasSharedOpenRouterKey(){return !!(sharedKey||process.env.OPENROUTER_API_KEY);}
const official={openai:['https://api.openai.com/v1','OPENAI_API_KEY'],anthropic:['https://api.anthropic.com/v1','ANTHROPIC_API_KEY'],gemini:['https://generativelanguage.googleapis.com/v1beta/openai','GEMINI_API_KEY'],glm:['https://open.bigmodel.cn/api/paas/v4','ZHIPU_API_KEY'],deepseek:['https://api.deepseek.com','DEEPSEEK_API_KEY'],grok:['https://api.x.ai/v1','XAI_API_KEY'],kimi:['https://api.moonshot.ai/v1','MOONSHOT_API_KEY'],qwen:['https://maas.qianwenaiapi.com/compatible-mode/v1','DASHSCOPE_API_KEY'],doubao:['https://ark.cn-beijing.volces.com/api/v3','ARK_API_KEY']};
export function getApiKey(p){
  if(p.apiKey)return p.apiKey;
  const base=String(p.baseUrl||'').replace(/\/+$/,'');
  if(base===OPENROUTER_BASE)return sharedKey||process.env.OPENROUTER_API_KEY||'';
  const spec=official[p.provider];return spec&&base===spec[0]?process.env[spec[1]]||'':'';
}
