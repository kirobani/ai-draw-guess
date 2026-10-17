import {reactionFrame} from './cast-expression-reactions.mjs';
const ALIASES={drawingFinished:'finished',thinking:'idle',closed:'idle'};
export class ExpressionAgentKitDriver{
  constructor(id){this.id=id;this.previous=null;}
  frame({state='idle',time=0,blinkAt=-100,x=0,y=0,headX=0,headY=0,eyesClosed=false,reduce=false},dt=0){
    const p=reactionFrame({character:this.id,reaction:ALIASES[state]||state,time:reduce?0:time,blinkAt,headX,headY,gazeX:0,gazeY:0,pointerX:x,pointerY:y,follow:true,talking:false},'kit');
    if(eyesClosed||state==='closed')p.ParamEyeLOpen=p.ParamEyeROpen=0;
    if(this.previous&&dt>0){const k=1-Math.exp(-dt*8);for(const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamEyeBallX','ParamEyeBallY'])p[id]=this.previous[id]+(p[id]-this.previous[id])*k;}
    this.previous={...p};return p;
  }
}
