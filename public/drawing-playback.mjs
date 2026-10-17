export function drawingTransition(previous,next){
  const signature=s=>JSON.stringify(Object.keys(s).sort().map(key=>[key,s[key]]));
  let keep=0;while(keep<previous.length&&keep<next.length&&signature(previous[keep])===signature(next[keep]))keep++;
  return {keep,remove:previous.length-keep,append:next.slice(keep)};
}
export function shapePath(s){
  if(s.type==='ellipse')return Array.from({length:65},(_,i)=>[s.x+Math.cos(i*Math.PI/32)*s.rx,s.y+Math.sin(i*Math.PI/32)*s.ry]);
  if(s.type==='rect')return [[s.x,s.y],[s.x+s.w,s.y],[s.x+s.w,s.y+s.h],[s.x,s.y+s.h],[s.x,s.y]];
  return s.type==='polygon'?[...s.points,s.points[0]]:s.points;
}
export function pathLength(points){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);}
export const playbackFactor=speed=>({slow:1,normal:.55,fast:.15})[speed]||1;
// These are explicit drawing speeds. Reduced-motion preferences must not turn
// the selected drawing process into an instant reveal; a separate skip button does that.
export function strokeDuration(shape,speed='slow'){
  return Math.min(1000,Math.max(340,pathLength(shapePath(shape))*1.5))*playbackFactor(speed);
}
export async function animateProgress(duration,{draw,isActive=()=>true,frame=()=>new Promise(requestAnimationFrame),now=()=>performance.now()}){
  let elapsed=0,previous=now();
  if(!isActive())return false;
  draw(0);
  while(elapsed<duration){
    const time=await frame();
    if(!isActive())return false;
    // A delayed frame (background tab or a busy Live2D frame) must not skip a stroke.
    elapsed+=Math.max(0,Math.min(64,time-previous));previous=time;
    draw(Math.min(1,elapsed/duration));
  }
  return true;
}
export function partialStroke(shape,progress){
  if(progress>=1)return shape;
  const path=shapePath(shape),points=[path[0]];let remaining=pathLength(path)*Math.max(0,progress);
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(remaining>=length){points.push(b);remaining-=length;}
    else {const t=length?remaining/length:0;points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);break;}
  }
  return {type:'line',points,color:shape.color==='none'?shape.fill:shape.color,width:shape.width};
}
