// Shared presentation and validation; capabilities come from the selected platform's catalogue.
export const EFFORT_LABELS={auto:'自动快速档',default:'平台默认',none:'关闭思考',enabled:'开启思考',minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最大',ultra:'超强'};
export const WAIT_SECONDS=[60,120,150,180,300,600];
export function modelSource(p){if(p.provider==='codex')return 'codex';try{const host=new URL(p.baseUrl).hostname;if(host==='openrouter.ai')return 'openrouter';if(host==='maas.qianwenaiapi.com')return 'qwen';}catch{}return '';}
export const chosenEffort=p=>p.reasoningEffort||(p.replyMode==='thinking'?'default':'auto');
export const waitSeconds=p=>p.timeoutSeconds??(p.provider==='codex'?180:150);
export function effortChoices(profile){
  const r=profile?.reasoning;if(!r)return ['auto','default'];
  const levels=Array.isArray(r.supported_efforts)?r.supported_efforts:r.supported_efforts===null?['minimal','low','medium','high','xhigh','max']:[];
  return [...new Set(['auto','default',...(r.mandatory===false?['none']:[]),...levels.filter(e=>EFFORT_LABELS[e]&&e!=='none'),...(r.mandatory===false&&!levels.length?['enabled']:[])])];
}
export function resolveEffort(p,profile){
  const choice=chosenEffort(p),available=effortChoices(profile);
  if(!available.includes(choice))throw new Error(`此型号不支持「${EFFORT_LABELS[choice]||choice}」思考档位，请重新选择。`);
  if(choice!=='auto')return choice;
  if(!profile?.reasoning)return 'default';
  if(profile.reasoning.mandatory===false)return 'none';
  return ['minimal','low','medium','high','xhigh','max','ultra'].find(e=>available.includes(e))||'default';
}
export function validateControls(p,profile){
  resolveEffort(p,profile);
  if(!WAIT_SECONDS.includes(waitSeconds(p)))throw new Error('最长等待时间须从列表中选择。');
}
export function reasoningSummary(p,profile){
  let effort;try{effort=resolveEffort(p,profile);}catch(e){return e.message;}
  if(!profile?.reasoning)return '尚未取得此型号的思考参数，自动档会保留平台默认。';
  return `${chosenEffort(p)==='auto'?'自动快速档实际使用：':''}${EFFORT_LABELS[effort]}。${profile.reasoning.mandatory?'此型号不能关闭思考。':''}更高档位通常等待更久，也可能消耗更多额度。`;
}
