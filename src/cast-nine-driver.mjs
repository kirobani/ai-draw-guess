import {NaturalMotion} from './cast-natural-motion.mjs';
import {REACTIONS} from './cast-expression-reactions.mjs';
import {blinkOpen} from './expression-breath.mjs';

const slots=Object.fromEntries(REACTIONS.map(([id],i)=>[id,i]));
slots.drawingFinished=slots.finished;

export class CastNineDriver{
  constructor(id,options){this.motion=new NaturalMotion(id,options);}
  frame({state='idle',time=0,blinkAt=-100,x=0,y=0,headX=0,headY=0,eyesClosed=false,reduce=false},dt=0){
    const p=this.motion.update(reduce?0:dt,{scene:slots[state]??0,headX,headY,pointer:x||y?{x,y}:null});
    const lid=eyesClosed||state==='closed'?0:Math.min(p.ParamEyeLOpen,blinkOpen(time-blinkAt));
    p.ParamEyeLOpen=p.ParamEyeROpen=lid;
    return p;
  }
}
