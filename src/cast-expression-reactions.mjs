import { reactionFrame as breathFrame, blinkOpen } from './expression-breath.mjs';
export const REACTIONS=[['idle','待机'],['drawing','正在画画'],['finished','画完等人猜'],['confident','已提交·自信'],['uncertain','已提交·犹豫'],['random','已提交·瞎蒙'],['happy','猜中庆祝'],['spectator','已答对·吃瓜'],['sad','猜错']];
const base={finished:'confident',uncertain:'idle',random:'idle',spectator:'confident'};
export function reactionFrame(state,route){
 const mapped={...state,reaction:base[state.reaction]||state.reaction};
 const frame=breathFrame(mapped,route);
 if(state.reaction==='finished'){
  frame.ParamDrawingBody=1;
  frame.ParamDrawingStroke=0;
 }
 if(route==='original'){
  // DeepSeek's older reference has no confident slot: 5 clamps to its wrong slot.
  if(state.character==='deepseek'&&frame.ParamPaintedEyes===5)frame.ParamPaintedEyes=frame.ParamPaintedFace=0;
  return frame;
 }
 // These extracted iris meshes use image coordinates: positive Y looks down.
 if(state.reaction==='drawing')frame.ParamEyeBallY=.85;
 const index=REACTIONS.findIndex(([id])=>id===state.reaction);
 frame.ParamPaintedEyes=frame.ParamPaintedFace=Math.max(0,index);
 frame.ParamEyeLOpen=frame.ParamEyeROpen=blinkOpen(state.time-state.blinkAt);
 // Keep breath-r1's breath and head drivers; waiting retains the drawing body.
 return frame;
}
