import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lib/game.mjs';
import {tablePlaces} from '../public/seat-presentation.mjs';

const players=Array.from({length:9},(_,i)=>({id:'ai'+i,name:'AI '+i}));
const shapes=[{type:'ellipse',x:300,y:300,rx:50,ry:50,width:4,color:'#000000'}];
const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(1000,16);bytes.writeUInt32BE(650,20);
const image='data:image/png;base64,'+bytes.toString('base64');
const options={players,human:true,mode:'battle',rounds:3,category:'动物',words:Array.from({length:30},()=>({answer:'猫',category:'动物'})),revealDelay:0,run:async(_p,_prompt,img)=>img?{guess:'猫'}:{shapes}};

test('多人每局随机出场，包含玩家；十人三轮无重复漏人且赛中不变座位',async()=>{
 let draws=0;const g=new Game({...options,orderRandom:n=>{draws++;return 0;}}),order=g.players.map(p=>p.id);
 assert.equal(draws,9);assert.equal(order.at(-1),'human');assert.equal(new Set(order).size,10);
 assert.deepEqual(players.map(p=>p.id),Array.from({length:9},(_,i)=>'ai'+i),'不改写配置选手顺序');
 const places=[...tablePlaces(g.players)],actual=[];
 try{
  for(let i=0;i<30;i++){
   await g.next();actual.push(g.artist.id);await g.beginGuess({image,shapes});if(g.results.human)g.humanGuess('猫');
   assert.equal(g.phase,'reveal');assert.deepEqual([...tablePlaces(g.players)],places);assert.deepEqual(g.snapshot().players.map(p=>p.id),order);
  }
  await g.next();assert.equal(g.phase,'finished');assert.deepEqual(actual,[...order,...order,...order]);assert.equal(draws,9);
  assert(g.players.every(p=>p.drawn===3&&p.drawPossible===81&&p.guessPossible===81));
 }finally{g.finish();}
 const second=new Game({...options,orderRandom:n=>n-1});assert.notDeepEqual(second.players.map(p=>p.id),order);second.finish();
});

test('单人对战仍由玩家先画，旁观多人局也打乱 AI 顺序',()=>{
 const duel=new Game({...options,players:players.slice(0,1),mode:'duel',rounds:1,orderRandom:()=>{throw Error('单人不应抽签');}});
 assert.equal(duel.players[0].id,'human');duel.finish();
 const watch=new Game({...options,human:false,orderRandom:()=>0});assert.equal(watch.players[0].id,'ai1');assert.equal(watch.players.at(-1).id,'ai0');watch.finish();
});
