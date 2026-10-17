export const W = 1000, H = 650;
export class DrawingHistory {
  constructor(){this.operations=[];}
  reset(){this.operations=[];}
  stroke(length){this.operations.push({type:'stroke',length});}
  clear(shapes){if(shapes.length)this.operations.push({type:'clear',shapes:structuredClone(shapes)});return [];}
  undo(shapes){const operation=this.operations.pop();return !operation?shapes:operation.type==='clear'?operation.shapes:shapes.slice(0,operation.length);}
}
export function drawShape(ctx, s) {
  ctx.save(); ctx.strokeStyle=s.color||'#202633'; ctx.fillStyle=s.fill||'transparent';
  ctx.lineWidth=s.width||5; ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  if (s.type === 'ellipse') ctx.ellipse(s.x,s.y,s.rx,s.ry,0,0,Math.PI*2);
  else if (s.type === 'rect') ctx.rect(s.x,s.y,s.w,s.h);
  else { (s.points||[]).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); if(s.type==='polygon')ctx.closePath(); }
  if (s.fill && s.fill !== 'none')ctx.fill(); if(s.color !== 'none') ctx.stroke(); ctx.restore();
}
export function paint(canvas, shapes) { const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.save();c.scale(canvas.width/W,canvas.height/H);shapes.forEach(s=>drawShape(c,s));c.restore(); }
export function png(shapes) { const c=document.createElement('canvas');c.width=W;c.height=H;paint(c,shapes);return c.toDataURL('image/png'); }
