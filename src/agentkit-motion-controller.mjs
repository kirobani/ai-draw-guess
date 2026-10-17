// Native pose weights and alignment warps. Scene numbers are never interpolated.
export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const smooth=n=>{n=clamp(n);return n*n*n*(n*(n*6-15)+10)};
export function poseParameters(scene){
 const p={ParamScenePose:scene};
 for(let i=0;i<9;i++){p['ParamPoseWeight'+i]=i===scene?1:0;p['ParamPoseMatch'+i]=i;p['ParamPoseMorph'+i]=0;}
 return p;
}
export class PoseTransition{
 constructor(scene=0){this.reset(scene)}
 reset(scene){this.current=this.requested=scene;this.transition=null;this.age=0;}
 request(scene){if(!Number.isInteger(scene)||scene<0||scene>8)throw Error('Invalid scene');this.requested=scene;if(!this.transition)this.begin();}
 // r2 optical-flow pose morph rejected: it changes anatomy into clothing.
 // Disable immediately while articulated limb rig is authored separately.
 begin(){this.current=this.requested;this.transition=null;this.age=0;}
 step(dt){
  if(this.transition){const t=this.transition;t.elapsed+=dt;if(t.elapsed>=t.duration-1e-9){this.current=t.to;this.transition=null;this.age=0;if(this.requested!==this.current)this.begin();}}
  else this.age+=dt;
 }
 parameters(){
  if(!this.transition)return poseParameters(this.current);
  const t=this.transition,u=smooth(t.elapsed/t.duration),mix=smooth((u-.42)/.16),p=poseParameters(t.from);
  p.ParamScenePose=t.to;
  p['ParamPoseWeight'+t.from]=1-mix;p['ParamPoseWeight'+t.to]=mix;
  p['ParamPoseMatch'+t.from]=t.to;p['ParamPoseMorph'+t.from]=u;
  p['ParamPoseMatch'+t.to]=t.from;p['ParamPoseMorph'+t.to]=1-u;
  return p;
 }
 get active(){return !!this.transition}
}
