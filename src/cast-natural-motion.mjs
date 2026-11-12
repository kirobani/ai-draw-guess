// Native joint choreography from Live2D-All-Characters-R1/preview/motion-controller.js.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const profiles={deepseek:{energy:.94,tempo:1,seed:21971},minimax:{energy:1.08,tempo:1.12,seed:75031}};
/** Native parameter choreography; no DOM/canvas transformations. */
export class NaturalMotion{
 constructor(id,{seed}={}){
  this.profile=profiles[id]||profiles.deepseek;
  this.seed=(seed??crypto.getRandomValues(new Uint32Array(1))[0])||this.profile.seed;
  this.t=0;this.nextPose=0;this.nextBlink=2.7;this.blinkAt=-10;this.lastShift=-20;
  this.gesture='settle';this.previousGesture=null;this.speed=1;this.joints={};
  for(const k of ['bx','by','bz','hx','hy','hz','gx','gy','forward'])this.joints[k]={x:0,v:0,target:0,delay:0};
 }
 random(){let x=this.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
 between(a,b){return a+(b-a)*this.random();}
 choose(){
  const e=this.profile.energy,j=this.joints,previous=this.gesture;
  let choices=[['tilt',24],['lean',20],['shift',13],['glance',18],['settle',15],['rest',10]];
  choices=choices.filter(([name])=>name!==previous&&name!==this.previousGesture&&(name!=='shift'||this.t-this.lastShift>8));
  if(previous==='lean')choices=choices.map(([n,w])=>[n,n==='settle'?w*2:w]);
  let roll=this.random()*choices.reduce((s,[,w])=>s+w,0),kind=choices.at(-1)[0];
  for(const [name,weight]of choices){roll-=weight;if(roll<=0){kind=name;break;}}
  const next=Object.fromEntries(Object.entries(j).map(([k,v])=>[k,v.target]));
  const side=this.random()<.5?-1:1;let move,hold;
  if(kind==='tilt'){
   next.hz=side*this.between(12,22)*e;next.hy=this.between(-3,5);next.hx=j.hx.target*.6;
   next.forward*=.6;move=this.between(.9,1.9);hold=this.between(1.4,4.3);
  }else if(kind==='lean'){
   next.forward=this.between(.65,1);next.hy=this.between(3,8);next.hx=this.between(-5,5);next.hz*=.45;
   next.bz*=.55;next.bx*=.5;next.gx=0;next.gy=.08;move=this.between(1,2.1);hold=this.between(1.3,3.8);
  }else if(kind==='shift'){
   next.bz=side*this.between(4.5,8.3)*e;next.bx=side*this.between(1.5,3.5)*e;
   next.by=this.between(-2,2);next.forward*=.3;next.hz=j.hz.target*.45-side*this.between(3,7);
   this.lastShift=this.t;move=this.between(1,2.5);hold=this.between(1.1,3.5);
  }else if(kind==='glance'){
   next.hx=side*this.between(11,20)*e;next.gx=side*this.between(.16,.30);next.gy=this.between(-.08,.12);
   next.hy=this.between(-4,5);next.hz*=.8;move=this.between(.55,1.3);hold=this.between(.8,2.3);
  }else if(kind==='settle'){
   Object.assign(next,{bx:this.between(-1,1),by:0,bz:this.between(-1.5,1.5),hx:this.between(-4,4),hy:0,hz:this.between(-3,3),forward:0,gx:0,gy:0});
   move=this.between(1.2,2.7);hold=this.between(1.5,4.5);
  }else{move=.6;hold=this.between(3.5,7.5);}
  this.previousGesture=previous;this.gesture=kind;this.speed=1.4/(move/this.profile.tempo);
  for(const k in next){j[k].target=next[k];j[k].delay=this.t+(k.startsWith('g')?0:kind==='glance'&&k.startsWith('h')?.18:kind==='shift'&&k.startsWith('h')?.22:0);}
  this.nextPose=this.t+move+hold;
 }
 update(dt,{scene,pointer,headX,headY}){
  dt=clamp(dt,0,.1);this.t+=dt;const t=this.t;if(t>=this.nextPose)this.choose();
  if(t>=this.nextBlink){this.blinkAt=t;this.nextBlink=t+this.between(2.9,5.1);}
  const count=Math.max(1,Math.ceil(dt/.016));for(let i=0;i<count;i++){const h=dt/count;for(const [k,j]of Object.entries(this.joints)){const omega=k.startsWith('g')?8.5:(k.startsWith('h')?3.4:4.2)*this.speed;const target=t<j.delay?j.x:j.target;j.v+=(omega*omega*(target-j.x)-2*omega*j.v)*h;j.x+=j.v*h;}}
  const drawing=scene===1,desiredActivity=drawing?.5:1;
  this.activity??=desiredActivity;this.activity+=(desiredActivity-this.activity)*(1-Math.exp(-dt*2.8));
  const a=this.activity;const j=this.joints;let open=1;const b=t-this.blinkAt;
  if(b>=0&&b<.105)open=.5+.5*Math.cos(Math.PI*b/.105);else if(b<.15&&b>=.105)open=0;else if(b>=.15&&b<.33)open=.5-.5*Math.cos(Math.PI*(b-.15)/.18);
  const breath=t%5.6,cycle=breath<2.1?breath/2.1:(5.6-breath)/3.5;
  return {ParamPaintedEyes:scene,ParamPaintedFace:scene,ParamDrawingBody:drawing||scene===2?1:0,ParamDrawingStroke:drawing?Math.sin(t*3.3)*.55:0,
   ParamAngleX:clamp(j.hx.x*a+headX,-23,23),ParamAngleY:clamp(j.hy.x*a+headY,-17,17),ParamAngleZ:clamp(j.hz.x*a,-25,25),
   ParamBodyAngleX:clamp(j.bx.x*a,-7,7),ParamBodyAngleY:clamp(j.by.x*a,-6,6),ParamBodyAngleZ:clamp(j.bz.x*a,-9.5,9.5),ParamLeanForward:clamp(j.forward.x*a,0,1),ParamBreath:.05+.9*cycle*cycle*(3-2*cycle),
   ParamEyeBallX:drawing?-.12:clamp(pointer?pointer.x*.4:j.gx.x,-.42,.42),ParamEyeBallY:drawing?.85:clamp(pointer?pointer.y*.3:j.gy.x,-.32,.32),ParamEyeLOpen:open,ParamEyeROpen:open};
 }
}
