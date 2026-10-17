import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawingHistory} from '../public/drawing.mjs';
test('清空后一次撤销恢复整幅画，并继续按笔画撤销',()=>{
  const history=new DrawingHistory();let shapes=[];
  history.stroke(shapes.length);shapes.push({points:[[1,2],[3,4]]});
  history.stroke(shapes.length);shapes.push({points:[[5,6],[7,8]]});
  const whole=structuredClone(shapes);shapes=history.clear(shapes);
  assert.deepEqual(shapes,[]);shapes=history.undo(shapes);assert.deepEqual(shapes,whole);
  shapes=history.undo(shapes);assert.deepEqual(shapes,[whole[0]]);
});
test('清空后画新笔画，先撤销新笔画，再恢复清空；空画布清空不占撤销次数',()=>{
  const history=new DrawingHistory();let shapes=[{points:[[1,2],[3,4]]}];
  const original=structuredClone(shapes);shapes=history.clear(shapes);shapes=history.clear(shapes);
  history.stroke(shapes.length);shapes.push({points:[[5,6],[7,8]]},{points:[[7,8],[9,10]]});
  shapes=history.undo(shapes);assert.deepEqual(shapes,[]);
  shapes=history.undo(shapes);assert.deepEqual(shapes,original);
  history.reset();assert.deepEqual(history.undo(shapes),original);
});
