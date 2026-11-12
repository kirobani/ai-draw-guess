import {MODEL_FAMILY_AVATAR_MAP} from './model-family-avatars.mjs';

export const CAST_NINE_REVISION='live2d-all-characters-r1';
const aliases={chatgpt:'astra',claude:'opus',gemini:'gemini-ultra'};
const otherIds=['deepseek','mimo','minimax','grok','glm','kimi','qwen','doubao','hunyuan'];
const ids=[...Object.keys(MODEL_FAMILY_AVATAR_MAP),...otherIds];
const urls=Object.fromEntries(ids.map(id=>[id,`/models/${CAST_NINE_REVISION}/${id}/${id}-expressions.model3.json`]));

export const castNineModelUrl=id=>urls[aliases[id]||id];

export function castNineModelId(url){
  const id=url.split('/').at(-2);
  return urls[id]===url?id:null;
}
