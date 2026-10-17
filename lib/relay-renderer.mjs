import {createCanvas} from '@napi-rs/canvas';
import {paint,W,H} from '../public/drawing.mjs';

// Render privately on the server: another player's drawing never has to visit the human's browser.
export function renderRelayDrawing(shapes){const canvas=createCanvas(W,H);paint(canvas,shapes);return canvas.toDataURL('image/png');}
