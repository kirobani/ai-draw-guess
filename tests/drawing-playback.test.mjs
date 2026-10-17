import test from 'node:test';
import assert from 'node:assert/strict';
import {animateProgress,strokeDuration,partialStroke} from '../public/drawing-playback.mjs';
const shape={type:'line',points:[[0,0],[600,0]],width:5,color:'#202633'};
test('三档落笔速度有实际时长，慢慢画逐帧显示后才完成',async()=>{
  assert(strokeDuration(shape,'slow')>strokeDuration(shape,'normal'));
  assert(strokeDuration(shape,'normal')>strokeDuration(shape,'fast'));
  const shown=[];let time=0,finished=false;
  const work=animateProgress(strokeDuration(shape,'slow'),{now:()=>time,frame:async()=>time+=16,draw:p=>shown.push(partialStroke(shape,p))}).then(()=>finished=true);
  assert.equal(finished,false);assert.equal(shown.length,1);assert.equal(shown[0].points.at(-1)[0],0);
  await work;assert(shown.length>40);assert(shown.some(s=>s.points.at(-1)[0]>0&&s.points.at(-1)[0]<600));assert.deepEqual(shown.at(-1),shape);
});
test('卡顿或从后台回来时，不把整笔一口气补完',async()=>{
  let time=0,first=true;const frames=[];
  await animateProgress(900,{now:()=>time,frame:async()=>{time+=first?5000:16;first=false;return time;},draw:p=>frames.push(p)});
  assert(frames[1]>0&&frames[1]<.1);assert(frames.length>40);assert.equal(frames.at(-1),1);
});
test('跳过或切题后，旧动画不能覆盖已经显示的完整画面',async()=>{
  let active=true,time=0;const frames=[];
  const completed=await animateProgress(900,{now:()=>time,frame:async()=>{active=false;return time+=16;},isActive:()=>active,draw:p=>frames.push(p)});
  assert.equal(completed,false);assert.deepEqual(frames,[0]);
});
