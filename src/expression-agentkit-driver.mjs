import {reactionFrame} from './cast-expression-reactions.mjs';
import {MODEL_FAMILY_AVATAR_MAP} from '../public/model-family-avatars.mjs';
const ALIASES={drawingFinished:'finished',thinking:'idle',closed:'idle'};
const clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value));
export class ExpressionAgentKitDriver{
  constructor(id){this.id=id;this.family=MODEL_FAMILY_AVATAR_MAP[id]?.family;this.previous=null;}
  frame({state='idle',time=0,blinkAt=-100,x=0,y=0,headX=0,headY=0,eyesClosed=false,reduce=false},dt=0){
    const t=reduce?0:time,reaction=ALIASES[state]||state;
    const p=reactionFrame({character:this.id,reaction,time:t,blinkAt,headX,headY,gazeX:0,gazeY:0,pointerX:x,pointerY:y,follow:true,talking:false},'kit');
    if(this.family){
      const drawing=reaction==='drawing';
      Object.assign(p,{
        ParamAngleX:clamp(headX,16),
        ParamAngleY:clamp(headY,6),
        ParamAngleZ:0,ParamBodyAngleX:0,ParamBodyAngleY:0,ParamBodyAngleZ:0,
        ParamEyeBallX:drawing?-.12:clamp(x*.4,.42),
        ParamEyeBallY:drawing?.85:clamp(y*.3,.32),
        ParamDrawingStroke:drawing?Math.sin(t*3.3)*.55:0,
        ParamBreath:.5-.25*Math.cos(t*Math.PI/3),
        ParamMouthForm:0
      });
    }
    if(eyesClosed||state==='closed')p.ParamEyeLOpen=p.ParamEyeROpen=0;
    if(this.previous&&dt>0){const k=1-Math.exp(-dt*8);for(const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamEyeBallX','ParamEyeBallY'])p[id]=this.previous[id]+(p[id]-this.previous[id])*k;}
    this.previous={...p};return p;
  }
}
