import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseJSON} from './shapes.mjs';
import {resolveCharacter,CHARACTERS} from '../public/characters.mjs';
import {DEFAULT_MODELS,OPENROUTER_BASE} from './default-models.mjs';
import {QWEN_BASE,qwenProfile} from './qwen-models.mjs';
import {modelCatalog} from './model-catalog.mjs';
import {modelSource,chosenEffort,resolveEffort,validateControls,waitSeconds} from '../public/reasoning.mjs';

import {withCodexPath} from './codex-runtime.mjs';
import {getApiKey} from './credentials.mjs';
export {detectCodex} from './codex-runtime.mjs';
export const PRESETS = {
  openrouter:{label:'OpenRouter（默认）',baseUrl:OPENROUTER_BASE,model:DEFAULT_MODELS.chatgpt},
  codex:{label:'Codex 命令行',baseUrl:'',model:'gpt-6.1-sol'},
  openai:{label:'OpenAI API',baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol'},
  anthropic:{label:'Claude API',baseUrl:'https://api.anthropic.com/v1',model:'claude-opus-5-5'},
  gemini:{label:'Gemini API',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash'},
  glm:{label:'智谱 GLM API',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.6v-flash'},
  deepseek:{label:'DeepSeek API',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
  grok:{label:'Grok API',baseUrl:'https://api.x.ai/v1',model:'grok-4.7'},
  kimi:{label:'Kimi API',baseUrl:'https://api.moonshot.ai/v1',model:'kimi-k2.5'},
  qwen:{label:'千问 API',baseUrl:QWEN_BASE,model:'qwen3.8-flash',hint:'默认用于千问 AI 平台的按量付费 Key。若使用百炼，请改填百炼控制台提供的完整地址，不要保留示例占位符。'},
  doubao:{label:'豆包 API',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seed-2-1-lite-260915'},
  compatible:{label:'OpenAI 兼容接口',baseUrl:'',model:''}
};
export const DEFAULT_PLAYERS = CHARACTERS.map(c=>({id:c.id,name:c.name,characterId:c.id,provider:'openrouter',baseUrl:OPENROUTER_BASE,model:DEFAULT_MODELS[c.id],enabled:c.id==='chatgpt',color:c.color,reasoningEffort:'auto',timeoutSeconds:180}));
export const NEW_PLAYERS = DEFAULT_PLAYERS.filter(p=>['mimo','minimax'].includes(p.id));
export function migrateConfig(saved){
  let players=saved.players.map(p=>({...p,characterId:p.characterId||resolveCharacter(p)?.id||'none'}));
  if((saved.version||1)<2)for(const p of DEFAULT_PLAYERS.filter(p=>['deepseek','grok','kimi','qwen','doubao'].includes(p.id)))if(players.length<12&&!players.some(x=>x.id===p.id))players.push({...p,characterId:resolveCharacter(p)?.id||'none'});
  if((saved.version||1)<3&&players.some(p=>p.id==='codex-sol'&&p.provider==='codex')){
    players=players.filter(p=>!(p.id==='codex-luna'&&p.provider==='codex'));
    for(const p of players)if(p.id==='codex-sol'&&p.name==='Codex · Sol')p.name='GPT';
  }
  if((saved.version||1)<4)for(const p of NEW_PLAYERS)if(players.length<12&&!players.some(x=>x.id===p.id))players.push({...p});
  return {version:4,players};
}
export const getKey=getApiKey;
export const publicPlayer=p=>({id:p.id,name:p.name,provider:p.provider,model:p.model,baseUrl:p.baseUrl||'',enabled:!!p.enabled,color:p.color,hasKey:!!getKey(p),replyMode:p.replyMode==='thinking'?'thinking':'fast',reasoningEffort:chosenEffort(p),timeoutSeconds:waitSeconds(p),characterId:resolveCharacter(p)?.id||'none'});

const standardPool={active:0,limit:12,queue:[]},relayPool={active:0,limit:12,queue:[]};
function drain(pool){while(pool.active<pool.limit&&pool.queue.length)pool.queue.shift().start();}
function slot(signal,pool){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('已取消'));
    const cancel=()=>{const i=pool.queue.indexOf(entry);if(i>=0){pool.queue.splice(i,1);reject(new Error('已取消'));}};
    const entry={start:()=>{signal?.removeEventListener('abort',cancel);pool.active++;resolve();}};
    pool.queue.push(entry);signal?.addEventListener('abort',cancel,{once:true});drain(pool);
  });
}
function release(pool){pool.active--;drain(pool);}

export function codexEffortArgs(player,profile){const effort=resolveEffort(player,profile);return effort==='default'?[]:['-c',`model_reasoning_effort="${effort}"`];}
async function codexCall(player,prompt,image,signal,codexPath,profile) {
  const dir=await mkdtemp(join(tmpdir(),'drawguess-'));
  const output=join(dir,'reply.txt'), img=join(dir,'canvas.png');
  try {
    if(image) await writeFile(img,Buffer.from(image.split(',')[1],'base64'));
    const args=['exec','--ignore-user-config','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--color','never',...codexEffortArgs(player,profile),'-c','features.shell_tool=false','-C',dir,'-o',output];
    if(player.model)args.push('-m',player.model);
    if(image)args.push('-i',img);
    args.push('-');
    await withCodexPath(path=>new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(new Error('已取消'));
      const child=spawn(path,args,{cwd:dir,windowsHide:true,stdio:['pipe','pipe','pipe']});
      let stderr='',timedOut=false;
      child.stdout.on('data',()=>{});child.stderr.on('data',x=>{stderr=(stderr+x).slice(-5000);});
      child.stdin.on('error',()=>{});child.stdin.end(prompt,'utf8');
      const timer=setTimeout(()=>{timedOut=true;child.kill();},waitSeconds(player)*1000);
      const cancel=()=>child.kill();signal?.addEventListener('abort',cancel,{once:true});
      child.on('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(Object.assign(new Error('无法启动 Codex。'),{code:e.code}));});
      child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        if(signal?.aborted)return reject(new Error('已取消'));
        if(timedOut)return reject(new Error(`Codex 已处理 ${waitSeconds(player)} 秒仍未完成。可在 AI 设置降低思考强度或调整最长等待。`));
        if(code!==0){const detail=/not supported|not found|does not exist|not available/i.test(stderr)?'模型不可用，请在 AI 设置里修改模型 ID。':/login|auth|401/i.test(stderr)?'请重新登录 Codex。':/rate|quota|limit/i.test(stderr)?'当前额度或频率受限，稍后重试。':'请检查 Codex 登录、网络或模型设置。';return reject(new Error('Codex 调用失败。'+detail));}
        resolve();
      });
    }),{preferred:codexPath,signal});
    return await readFile(output,'utf8');
  }finally {for(const file of [output,img])await unlink(file).catch(()=>{});await rmdir(dir).catch(()=>{});}
}

export function buildRequest(p,prompt,image,profile=qwenProfile(p)) {
  const base=String(p.baseUrl||PRESETS[p.provider]?.baseUrl||'').replace(/\/+$/,'');
  if(!base)throw new Error('请填写这位选手的接口基础地址。');
  if(/[{}]|%7[bd]/i.test(base))throw new Error('接口地址还是示例模板，请复制申请 Key 的平台提供的完整 Base URL；不能保留 {WorkspaceId}。');
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('接口地址必须是纯 HTTP(S) 基础地址。');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('远程 API 必须使用 HTTPS，本地模型可使用 HTTP。');
  const headers={'Content-Type':'application/json'};const key=getKey(p);
  if(p.provider==='anthropic') {
    headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    return {url:base+'/messages',headers,body:{model:p.model,max_tokens:image?600:6500,messages:[{role:'user',content:[...(image?[{type:'image',source:{type:'base64',media_type:'image/png',data:image.split(',')[1]}}]:[]),{type:'text',text:prompt}]}]}};
  }
  if(key)headers.Authorization='Bearer '+key;
  if(['openai','grok'].includes(p.provider))return {url:base+'/responses',headers,body:{model:p.model,store:false,input:[{role:'user',content:[{type:'input_text',text:prompt},...(image?[{type:'input_image',image_url:image}]:[])]}]}};
  const body={model:p.model,messages:[{role:'user',content:[{type:'text',text:prompt},...(image?[{type:'image_url',image_url:{url:image}}]:[])]}]};
  const effort=resolveEffort(p,profile);
  if(url.hostname==='maas.qianwenaiapi.com'&&profile?.source==='qwen'){
    if(effort==='none')body.enable_thinking=false;
    else if(effort!=='default'){body.enable_thinking=true;if(effort!=='enabled')body.reasoning_effort=effort;}
    if(effort==='none')body.response_format={type:'json_object'};
    body.max_tokens=effort==='none'?(image?2048:8192):(image?32768:65536);
  }
  if(url.hostname==='openrouter.ai'){
    // Reasoning and visible output share the router's token ceiling. Higher effort needs headroom.
    const deep=['medium','high','xhigh','max','ultra','enabled','default'].includes(effort);
    body.max_tokens=deep?(image?32768:65536):image?4096:12288;
    body.response_format={type:'json_object'};
    if(effort==='none')body.reasoning={enabled:false,exclude:true};
    else if(effort!=='default')body.reasoning=effort==='enabled'?{enabled:true,exclude:true}:{effort,exclude:true};
  }
  return {url:base+'/chat/completions',headers,body};
}
function extractResponse(p,data) {
  if(p.provider==='anthropic')return (data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');
  if(['openai','grok'].includes(p.provider))return data.output_text||(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const c=data.choices?.[0]?.message?.content;return typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join(''):'';
}
export function responseReceipt(p,data={}) {
  const safe=x=>typeof x==='string'?x.slice(0,180):'';
  return {requestedModel:p.model,responseModel:safe(data.model),provider:safe(data.provider),requestId:safe(data.id),source:p.provider==='codex'?'codex':new URL(p.baseUrl||PRESETS[p.provider]?.baseUrl).hostname==='openrouter.ai'?'openrouter':'api',costUSD:Number.isFinite(data.usage?.cost)?data.usage.cost:null};
}
export async function callModel(p,prompt,image,signal,codexPath,{parallel=false,onProgress=()=>{},onDiagnostic=()=>{},modelProfile}={}) {
  const queuedAt=Date.now(),source=modelSource(p);
  onProgress('queued');
  const profile=modelProfile===undefined?(source==='qwen'?qwenProfile(p):source?(await modelCatalog()).models.find(m=>m.source===source&&m.id===p.model):null):modelProfile;
  validateControls(p,profile);
  const pool=parallel?relayPool:standardPool;await slot(signal,pool);const start=Date.now();
  const diagnostic={playerId:p.id,model:p.model,source,effort:resolveEffort(p,profile),queueMs:start-queuedAt,promptChars:prompt.length,imageBytes:image?Math.floor(image.split(',')[1].length*3/4):0,timeoutSeconds:waitSeconds(p)};
  try {
    if(signal?.aborted)throw new Error('已取消');
    onProgress('running');
    let text,receipt=responseReceipt(p);
    if(p.provider==='codex')text=await codexCall(p,prompt,image,signal,codexPath,profile);
    else {
      if(!getKey(p)&&(p.provider!=='compatible'||source==='openrouter'))throw new Error('请先在 AI 设置中填写 API Key。');
      const req=buildRequest(p,prompt,image,profile);
      const signals=[AbortSignal.timeout(waitSeconds(p)*1000),...(signal?[signal]:[])];
      const res=await fetch(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(req.body),signal:AbortSignal.any(signals),redirect:'error'});
      if(!res.ok){
        const problem=await res.json().catch(()=>({})),detail=String(problem.error?.message||problem.message||'');
        // Classify upstream errors without reflecting arbitrary text, credentials or prompts to the page.
        const msg=/not activated|activate.*product/i.test(detail)?'此型号尚未在平台开通，请到模型市场开通后重试':res.status===401||res.status===403?'密钥无效或没有此模型权限':res.status===429?'额度不足或请求过快':res.status===404?'模型或接口地址不存在':res.status===400?'参数不受支持，请确认型号的图片输入与思考档位':'服务暂时不可用';throw new Error(`API ${res.status}：${msg}。`);
      }
      const data=await res.json();text=extractResponse(p,data);receipt=responseReceipt(p,data);
      diagnostic.finishReason=data.choices?.[0]?.finish_reason||data.status||'';
      diagnostic.reasoningTokens=data.usage?.completion_tokens_details?.reasoning_tokens??null;
      diagnostic.outputTokens=data.usage?.completion_tokens??data.usage?.output_tokens??null;
      if(diagnostic.finishReason==='length'||data.incomplete_details?.reason==='max_output_tokens')throw new Error('模型回复达到长度上限，未完整作答。请降低思考强度后重试。');
      if(!text)throw new Error('模型没有返回文本，可能被内容策略拦截或模型不支持此任务。');
    }
    const result={...parseJSON(text),elapsed:Date.now()-start,queueMs:start-queuedAt,receipt:{...receipt,reasoningEffort:diagnostic.effort}};diagnostic.ok=true;return result;
  }catch(e){diagnostic.ok=false;diagnostic.errorType=e.name;diagnostic.error=e.name==='TimeoutError'?'timeout':e.message;if(e.name==='TimeoutError')throw new Error(`接口已处理 ${waitSeconds(p)} 秒仍未完成（不含排队）。可在 AI 设置降低思考强度或调整最长等待。`);if(e.name==='AbortError')throw new Error('已取消');throw e;}
  finally {release(pool);try{onDiagnostic({...diagnostic,elapsed:Date.now()-start,at:new Date().toISOString()});}catch{}}
}
