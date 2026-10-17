// DS reactions from draw-guess/public/avatar-state.mjs and avatar-renderer.mjs.
// Both new models share these IDs; original retains its original fallback.
export const REACTIONS = [
  ['idle', '待机'], ['drawing', '正在画画'], ['thinking', '闭眼思考'],
  ['confident', '自信等待'], ['happy', '猜中了！'], ['closed', '闭眼休息'],
  ['sad', 'O□O 猜错了！'],
];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function blinkOpen(elapsed) {
  if (elapsed < 0 || elapsed > .32) return 1;
  if (elapsed < .12) return 1 - Math.sin(elapsed / .12 * Math.PI / 2);
  if (elapsed < .16) return 0;
  return .5 - .5 * Math.cos((elapsed - .16) / .16 * Math.PI);
}
export function reactionFrame({reaction = 'idle', time = 0, since = time,
  headX = 0, headY = 0, gazeX = 0, gazeY = 0, blink = 1, original = false} = {}) {
  let x = headX + Math.sin(time * .7) * 2, y = headY + Math.sin(time * .9) * 1.2;
  let z = Math.sin(time * .8) * 2, eye = 1, eyes = 0, face = 0, gx = gazeX * .5, gy = gazeY * .3;
  let brow = .05, mouth = .12, open = .03;
  switch (reaction) {
    case 'drawing':
      x = headX + Math.sin(since * 2.4) * 3; y = headY - 6; z = -5 + Math.sin(since * 3.3) * 2.5;
      gx = Math.sin(since * 2.4) * .2; gy = -.7; mouth = .3; open = 0; break;
    case 'thinking':
      x = headX + Math.sin(time * .65) * 1.5; y = headY - 3.5;
      z = -1.5 + Math.sin(time * .65) * 1.2; eye = 0; eyes = 1; face = 1;
      gx = gy = brow = mouth = open = 0; break;
    case 'confident':
      x = headX + 5; y = headY + 5; z = 7 + Math.sin(since * 1.6) * 2;
      gx = .2; gy = .25; brow = .65; mouth = .8; open = 0;
      if (original) { eyes = 2; face = 0; eye = 0; } else { face = 5; }
      break;
    case 'happy':
      y = headY + Math.sin(since * 4.5) * 6; z = 5 + Math.sin(since * 2.3) * 5;
      eyes = face = 2; eye = 0; brow = .8; mouth = 1; open = .9 + Math.sin(since * 3) * .1; break;
    case 'closed':
      eyes = face = 3; eye = 0; gx = gy = brow = mouth = open = 0; break;
    case 'sad':
      x = headX; y = headY + Math.sin(since * 9) * Math.exp(-since * 3) * 4;
      z = Math.sin(time * .8) * 1.2; eyes = face = 4;
      gx = gy = brow = mouth = open = 0; break;
  }
  if (eyes === 0) {
    if (original) { if (blink < .65) eyes = 3; }
    else eye = blink;
  }
  return {
    ParamAngleX: clamp(x, -22, 22), ParamAngleY: clamp(y, -7, 7), ParamAngleZ: clamp(z, -15, 15),
    ParamEyeBallX: clamp(gx, -1, 1), ParamEyeBallY: clamp(gy, -1, 1),
    ParamEyeLOpen: original ? 1 : eye, ParamEyeROpen: original ? 1 : eye,
    ParamBrowLY: brow, ParamBrowRY: brow, ParamMouthForm: mouth, ParamMouthOpenY: open,
    ParamPaintedEyes: eyes, ParamPaintedFace: face, ParamDrawingBody: reaction === 'drawing' ? 1 : 0,
    ParamBreath: .5 + Math.sin(time * 1.25) * .45,
  };
}
