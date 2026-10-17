import {blinkOpen} from './expression-breath.mjs';
const moods={
  idle:[1,0,.12,0,0,0],drawing:[.85,-.15,.18,0,-5,-3],
  finished:[1,.25,.55,.06,2,2],confident:[.8,.55,.85,.05,4,5],
  uncertain:[.85,-.55,-.45,.08,-2,-4],random:[.65,.7,.1,.35,1,6],
  happy:[.35,.8,1,.75,3,3],spectator:[.95,.2,.5,.2,0,-2],sad:[.9,-.9,-.85,.25,-3,-1],
  thinking:[0,-.1,.05,0,-3,-2],closed:[0,0,.12,0,0,0]
};
export class NativeAgentKitDriver{
 constructor(id){this.id=id;this.previous=null;}
 frame({state='idle',time=0,blinkAt=-100,x=0,y=0,headX=0,headY=0,eyesClosed=false,reduce=false},dt=0){
  const t=reduce?0:time,alias=state==='drawingFinished'?'finished':state;
  const [eye,brow,mouth,open,nod,roll]=moods[alias]||moods.idle;
  const p={ParamAngleX:Math.max(-14,Math.min(14,headX+x*8+Math.sin(t*.6)*1.8)),
    ParamAngleY:Math.max(-6,Math.min(6,headY+y*3+nod)),ParamAngleZ:roll+Math.sin(t*.8)*1.4,
    ParamBodyAngleX:x*.8,ParamBodyAngleY:0,ParamBodyAngleZ:Math.sin(t*.8)*.65,
    ParamEyeLOpen:eyesClosed?0:eye*blinkOpen(time-blinkAt),ParamEyeROpen:eyesClosed?0:eye*blinkOpen(time-blinkAt),
    ParamEyeBallX:state==='drawing'?Math.sin(t*2)*.1:x*.3,ParamEyeBallY:state==='drawing'?.45:-y*.2,
    ParamEyeBallForm:0,ParamBrowLY:brow,ParamBrowRY:alias==='random'?-brow:brow,
    ParamMouthForm:mouth,ParamMouthOpenY:open,ParamBreath:.5+Math.sin(t*1.25)*.48,
    ParamHairFront:Math.sin(t*.8)*.12,ParamHairBack:Math.sin(t*.65)*.1};
  if(this.previous&&dt>0){const k=1-Math.exp(-dt*7);for(const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamBrowLY','ParamBrowRY','ParamMouthForm','ParamMouthOpenY'])p[id]=this.previous[id]+(p[id]-this.previous[id])*k;}
  this.previous={...p};return p;
 }
}
