import test from 'node:test';
import assert from 'node:assert/strict';
import {IDIOM_LEVELS,CATEGORIES,WORDS,getWordPool} from '../lib/words.mjs';
import {Game} from '../lib/game.mjs';

test('三档均为去重四字成语，词库逐档扩大且挑战覆盖全部成语',()=>{
  let previous=[];
  for(const level of IDIOM_LEVELS){
    const words=getWordPool('成语',level.id),answers=new Set(words.map(w=>w.answer));
    assert.equal(words.length,level.count);assert.equal(answers.size,words.length);
    assert(words.every(w=>/^\p{Script=Han}{4}$/u.test(w.answer)&&w.category==='成语'));
    assert(previous.every(w=>answers.has(w.answer)));assert(words.length>previous.length);previous=words;
  }
  assert(IDIOM_LEVELS[0].count>=65);assert(IDIOM_LEVELS[2].count>29000);
  assert.equal(previous.length,WORDS.filter(w=>w.category==='成语').length);
  assert.equal(CATEGORIES.find(c=>c.name==='成语').count,previous.length);
  for(const word of ['画蛇添足','妙笔生花','螳螂捕蝉','绿树成荫'])assert(previous.some(w=>w.answer===word));
});

test('最大赛程严格按所选档位抽取65道不重复的题，不修改公共词库',async()=>{
  const players=Array.from({length:12},(_,i)=>({id:'test-'+i,name:'AI '+i}));
  for(const level of IDIOM_LEVELS){
    const pool=getWordPool('成语',level.id),before=pool.map(w=>w.answer),allowed=new Set(before);
    const g=new Game({orderRandom:n=>n-1,players,rounds:5,category:'成语',idiomLevel:level.id,run:()=>{throw new Error('本测试禁止模型请求');}});
    assert.equal(g.deck.length,65);assert.equal(new Set(g.deck.map(w=>w.answer)).size,65);
    assert(g.deck.every(w=>allowed.has(w.answer)));assert.deepEqual(pool.map(w=>w.answer),before);
    await g.next();assert.equal(g.phase,'drawing');assert.equal(g.snapshot().idiomLevel,level.id);
    g.finish();assert.equal(g.snapshot().idiomLevelName,level.name);assert.equal(g.history.length,1);
  }
});

test('无效成语档位被拒绝；其他分类保留自己的难度元数据',()=>{
  for(const id of ['missing','constructor','__proto__',null,{}])assert.throws(()=>getWordPool('成语',id),/成语难度/);
  assert.deepEqual(getWordPool('成语'),getWordPool('成语','easy'));
  const g=new Game({orderRandom:n=>n-1,players:[{id:'a',name:'A'}],category:'动物',idiomLevel:'challenge'});
  assert.equal(g.idiomLevel,null);assert(g.deck.every(w=>w.category==='动物'));
  assert.equal(g.wordLevel,'challenge');assert.equal(g.snapshot().wordLevelName,'挑战');
  assert(CATEGORIES.filter(c=>c.name!=='成语').every(c=>getWordPool(c.name,'easy').length>=200));
});
