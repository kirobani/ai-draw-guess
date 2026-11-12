import test from 'node:test';
import assert from 'node:assert/strict';

test('a fresh install without Cubism Core can import the avatar API and report the optional resource failure',async()=>{
  assert.equal(globalThis.Live2DCubismCore,undefined);
  // Importing the renderer directly used to throw before the game initialized.
  const {CharacterView}=await import('../public/avatar-runtime.mjs');
  const canvas={dataset:{}},errors=[];
  const view=new CharacterView(canvas,{onError:e=>errors.push(e)});
  view.setState('drawing');view.setPaused(false);view.setSuspended(true);
  view.setFraming('portrait');view.setPose(0,0);view.setEyesClosed(false);view.blink();view.resize();
  assert.equal(await view.load(),view);
  assert.equal(view.ready,false);
  assert.equal(canvas.dataset.state,'drawing');
  assert.equal(canvas.dataset.loaded,'error');
  assert.equal(errors.length,1);
  assert.match(errors[0].message,/Cubism Core/);
  assert.match(errors[0].message,/API 设置可正常使用/);
  view.destroy();await view.load();
  assert.equal(errors.length,1,'destroyed views must not notify their removed UI');
});
