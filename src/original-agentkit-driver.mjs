import {reactionFrame} from './original-reactions.mjs';
import {reactionFrame as dsFrame,blinkOpen as dsBlink} from './ds-reactions.mjs';

// Avoid Cubism heap growth invalidating views of models already on screen.
export const CORE_MEMORY_BYTES=512*1024*1024;
const ALIASES={drawingFinished:'idle',uncertain:'thinking',random:'confident',spectator:'idle'};

// Keep the parameters and smoothing used by the user's 8898 preview.
export class OriginalAgentKitDriver{
 constructor(id='grok'){this.id=id;this.previous=null;}
 frame({state='idle',time=0,since=time,blinkAt=-100,x=0,y=0,headX=0,headY=0,eyesClosed=false,reduce=false},dt=0){
  const p=this.id==='deepseek'
   ?dsFrame({reaction:ALIASES[state]||state,time:reduce?0:time,since:reduce?0:since,headX,headY,gazeX:x,gazeY:y,blink:dsBlink(time-blinkAt)})
   :reactionFrame({reaction:ALIASES[state]||state,time:reduce?0:time,blinkAt,headX,headY,gazeX:0,gazeY:0,pointerX:x,pointerY:y,follow:true,talking:false},'kit');
  if(eyesClosed){p.ParamEyeLOpen=p.ParamEyeROpen=0;p.ParamPaintedEyes=3;}
  if(this.previous&&dt>0){const ds=this.id==='deepseek',k=1-Math.exp(-dt*(ds?5:8));for(const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamEyeBallX','ParamEyeBallY',...(ds?['ParamBrowLY','ParamBrowRY','ParamMouthForm','ParamMouthOpenY']:[])])p[id]=this.previous[id]+(p[id]-this.previous[id])*k;}
  this.previous={...p};return p;
 }
}
