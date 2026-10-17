import {PoseTransition,clamp} from './agentkit-motion-controller.mjs';

// Cubism's asm.js heap growth leaves existing model views pointing at the old
// buffer. Reserve enough native memory for the maximum 12 simultaneous seats.
export const CORE_MEMORY_BYTES=512*1024*1024;

export const SCENES={idle:0,closed:0,drawing:1,drawingFinished:2,confident:3,thinking:4,uncertain:4,random:5,happy:6,spectator:7,sad:8};
const ENERGY={deepseek:.7,gemini:1,claude:.6,chatgpt:.75,grok:1,glm:.55,kimi:.85,qwen:.8,doubao:1};

// Use the supplied AgentKit controller and its native parameters. In particular,
// never interpolate ScenePose or re-enable the source's rejected optical-flow morph.
export class AgentKitDriver{
 constructor(id='deepseek'){this.id=id;this.state='idle';this.motion=new PoseTransition();this.time=0;this.fx=0;this.fy=0;}
 setState(state){if(state===this.state)return;this.state=state;this.motion.request(SCENES[state]??0);}
 frame(dt,{x=0,y=0,eye=1,reduce=false}={}){
  this.time+=dt;this.motion.step(dt);
  if(this.state==='happy'&&this.motion.current===6&&this.motion.age>4.8)this.motion.request(7);
  const blend=dt>0?1-Math.exp(-dt*9):1;
  this.fx+=(clamp(x,-1,1)-this.fx)*blend;this.fy+=(clamp(y,-1,1)-this.fy)*blend;
  const scene=this.motion.current,t=this.motion.age;
  let action=scene===1?Math.sin(t*5.8)*.85:scene===6?Math.sin(t*6)*Math.exp(-t*.22)*(ENERGY[this.id]??.75):scene===5?Math.sin(Math.min(t,2.6)/2.6*Math.PI)*.9:[2,3,4,7,8].includes(scene)?Math.sin(t*1.7)*.55:Math.sin(this.time*.9)*.45;
  return {...this.motion.parameters(),ParamFollowX:this.fx,ParamFollowY:this.fy*.85,ParamEyeBallX:this.fx*.85,ParamEyeBallY:this.fy*.7,ParamEyeLOpen:eye,ParamEyeROpen:eye,ParamAction:reduce?0:action,ParamSway:reduce?0:Math.sin(this.time*1.45),ParamTalking:0,ParamMouthOpenY:0};
 }
}
