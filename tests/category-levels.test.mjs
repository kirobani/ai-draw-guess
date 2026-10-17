import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,CATEGORY_LEVELS,getWordPool} from '../lib/words.mjs';
import {Game} from '../lib/game.mjs';
import {RelayGame} from '../lib/relay.mjs';
import {playerModelLabel,playerLabel} from '../public/characters.mjs';

test('六类三档均去重且逐档扩大，最低档至少200个，题目长度适合游戏输入',()=>{
 for(const category of CATEGORIES.filter(c=>c.name!=='成语')){
  let previous=[];
  for(const level of CATEGORY_LEVELS[category.name]){
   const pool=getWordPool(category.name,level.id),answers=new Set(pool.map(w=>w.answer));
   assert.equal(pool.length,answers.size);assert.equal(pool.length,level.count);
   assert(pool.length>previous.length);assert(pool.length>=200);
   assert(previous.every(w=>answers.has(w.answer)));
   assert(pool.every(w=>w.category===category.name&&w.answer.trim()===w.answer&&w.answer.length<=60));
   previous=pool;
  }
  assert.equal(category.count,previous.length);
  for(const level of ['missing',null,{},'__proto__'])assert.throws(()=>getWordPool(category.name,level));
 }
 for(const category of ['__proto__','constructor','不存在'])assert.throws(()=>getWordPool(category));
});
test('普通比赛和接龙每个分类都按所选难度抽题；旧成语参数仍兼容',()=>{
 const players=Array.from({length:12},(_,i)=>({id:'p'+i,name:'AI'+i,model:'local-test'}));
 for(const category of CATEGORIES)for(const level of CATEGORY_LEVELS[category.name]){
  const allowed=new Set(getWordPool(category.name,level.id).map(w=>w.answer));
  const opts={players,category:category.name,wordLevel:level.id,rounds:5};
  const g=new Game(opts),r=new RelayGame(opts);
  assert.equal(g.deck.length,65);assert.equal(new Set(g.deck.map(w=>w.answer)).size,65);
  assert(g.deck.every(w=>allowed.has(w.answer)));assert(r.chains.every(c=>allowed.has(c.answer)));
  assert.equal(new Set(r.chains.map(c=>c.answer)).size,13);
  for(const game of [g,r]){assert.equal(game.snapshot().wordLevel,level.id);assert.equal(game.snapshot().wordLevelName,level.name);game.finish();}
 }
 const old=new Game({players:players.slice(0,1),idiomLevel:'normal'});assert.equal(old.wordLevel,'normal');old.finish();
});
test('型号取实际配置，不按角色外形猜型号，也不改写人名',()=>{
 const p={name:'千问',characterId:'qwen',model:'DEEPSEEK/DeepSeek-V4-Flash'};
 assert.equal(playerModelLabel(p),p.model);assert.equal(playerLabel(p),'千问 · DEEPSEEK/DeepSeek-V4-Flash');
 assert.equal(playerModelLabel({name:'GPT'}),'默认型号（未指定）');
 assert.equal(playerLabel({name:'你',human:true,model:'wrong'}),'你');assert.equal(p.name,'千问');
});
