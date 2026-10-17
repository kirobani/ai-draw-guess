import {createHash} from 'node:crypto';
import {getKey} from './providers.mjs';
import {drawPrompt,guessPrompt,validateShapes} from './shapes.mjs';
import {chosenEffort,waitSeconds} from '../public/reasoning.mjs';

export function checkKey(p){return createHash('sha256').update(JSON.stringify([p.provider,p.baseUrl||'',p.model,getKey(p),chosenEffort(p),waitSeconds(p)])).digest('hex');}
export async function checkCapabilities(p,run,image){
  const start=Date.now(),result={checkedAt:new Date().toISOString(),model:p.model,vision:{ok:false},drawing:{ok:false}};
  // Independent tasks: failure to recognize the picture must not hide drawing support.
  try{
    const r=await run(p,guessPrompt({category:'物品',length:2}),image);
    const guess=String(r.guess||'').trim().slice(0,40),recognized=['雨伞','阳伞','洋伞'].includes(guess);
    result.vision={ok:recognized,guess,message:recognized?'看图猜对了雨伞':guess?'收到看图回复，但本次未猜对雨伞':'回复缺少猜词',receipt:r.receipt,elapsed:r.elapsed};
  }catch(e){result.vision.message=e.message;}
  try{
    const r=await run(p,drawPrompt({answer:'自行车',category:'交通工具'}),null);
    const shapes=validateShapes(r.shapes);
    result.drawing={ok:true,shapes,message:`已生成 ${shapes.length} 个有效游戏笔画`,receipt:r.receipt,elapsed:r.elapsed};
  }catch(e){result.drawing.message=e.message;}
  result.ok=result.vision.ok&&result.drawing.ok;
  result.elapsed=Date.now()-start;
  result.costUSD=[result.vision,result.drawing].reduce((n,r)=>n+(r.receipt?.costUSD||0),0);
  return result;
}
