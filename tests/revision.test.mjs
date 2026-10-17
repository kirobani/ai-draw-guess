import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDrawingEdit,drawPrompt} from '../lib/shapes.mjs';
import {drawingTransition,partialStroke} from '../public/drawing-playback.mjs';
const stroke=n=>({type:'line',points:[[n,0],[n,100]],color:'#202633',width:5});
test('改画撤回末尾几笔，保留前面原笔画并追加',()=>{const before=[stroke(1),stroke(2),stroke(3)],copy=structuredClone(before);const after=applyDrawingEdit({undo:1,append:[stroke(4)]},before);assert.deepEqual(before,copy);assert.deepEqual(after,[stroke(1),stroke(2),stroke(4)]);assert.deepEqual(drawingTransition(before,after),{keep:2,remove:1,append:[stroke(4)]});assert.deepEqual(applyDrawingEdit({undo:0,append:[stroke(4)]},before),[...before,stroke(4)]);});
test('只撤回也可以改画，禁止越界撤销与空白最终画面',()=>{const before=[stroke(1),stroke(2)];assert.deepEqual(applyDrawingEdit({undo:1,append:[]},before),[stroke(1)]);for(const undo of [-1,3,.5])assert.throws(()=>applyDrawingEdit({undo,append:[]},before));assert.throws(()=>applyDrawingEdit({undo:2,append:[]},before));const prompt=drawPrompt({answer:'西瓜',category:'食物'},before,['苹果']);assert(prompt.includes('append'));assert(prompt.includes('优先保留'));});
test('一笔内部按长度逐渐显现，而不是整根瞬间出现',()=>{const half=partialStroke(stroke(20),.5);assert.deepEqual(half.points,[[20,0],[20,50]]);assert.deepEqual(partialStroke(stroke(20),1),stroke(20));});
