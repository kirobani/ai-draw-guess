import test from 'node:test';
import assert from 'node:assert/strict';
import {seatCharacter,seatPresentation,tablePlaces,updateArenaLayout} from '../public/seat-presentation.mjs';
import {characterPrompt} from '../public/characters.mjs';

test('every AI has a visual character, including custom providers without a personality',()=>{
  assert.equal(seatCharacter({human:true}),null);
  assert.equal(seatCharacter({id:'codex-sol',characterId:'none'}).id,'chatgpt');
  assert.equal(seatCharacter({id:'custom-api',characterId:'none'}).id,'chatgpt');
  assert.equal(seatCharacter({id:'custom-api',characterId:'qwen'}).id,'qwen');
  assert.equal(characterPrompt({id:'codex-sol',characterId:'none'},'original'),'original');
});
test('artist and guessers animate independently, with the real score on each seat',()=>{
  const players=[{id:'claude',total:7},{id:'kimi',total:3},{id:'glm',total:0}];
  const game={phase:'guessing',artistId:'claude',results:{kimi:{status:'confident',confidence:90},glm:{status:'thinking'}}};
  assert.equal(seatPresentation(game,players[0],true).state,'drawing');
  assert.equal(seatPresentation(game,players[0],true).total,7);
  assert.equal(seatPresentation(game,players[1],true).state,'confident');
  assert.equal(seatPresentation(game,players[2],true).state,'thinking');
  game.results.kimi={solved:true,points:3,status:'correct'};game.results.glm={status:'wrong',attempts:1};
  assert.equal(seatPresentation(game,players[1]).state,'happy');
  assert.equal(seatPresentation(game,players[2]).state,'sad');
  assert.match(seatPresentation(game,players[2]).status,/1/);
});
test('artist stays represented during reveal and human stays a simple seat',()=>{
  const game={phase:'reveal',artistId:'artist',roundGain:3,results:{human:{status:'waiting'}}};
  assert.equal(seatPresentation(game,{id:'artist'}).status,'本题作画 +3 分');
  assert.equal(seatPresentation(game,{id:'human',human:true}).status,'未作答');
});

test('all supported tables have distinct seats, reserving south for the human',()=>{
  for(let count=2;count<=13;count++)for(const human of [false,true]){
    const players=Array.from({length:count},(_,i)=>({id:`p${i}`,human:human&&i===0}));
    const places=tablePlaces(players);
    assert.equal(places.size,count);
    assert.equal(new Set(places.values()).size,count,`${count} players, human=${human}`);
    assert.ok([...places.values()].every(Boolean));
    if(human)assert.equal(places.get('p0'),'south');
    const perimeter=[...places.values()].filter(p=>p!=='south');
    assert.ok(perimeter.filter(p=>p.startsWith('north')).length<=4);
    assert.ok(perimeter.filter(p=>p.startsWith('west')).length<=4);
    assert.ok(perimeter.filter(p=>p.startsWith('east')).length<=4);
  }
});

test('11–13 player battle and relay games keep the roundtable without remounting panels',t=>{
  const selectors=['.arena','.guess-heading','.game-controls','.play-sidebar','.canvas-column'];
  const ids=['privacyNote','conversationPanel','results'];
  let moves=0;const classes=new Set();
  const node=()=>({dataset:{},parentElement:null,prepend(child){moves++;child.parentElement=this;},append(child){moves++;child.parentElement=this;}});
  const elements=Object.fromEntries([...selectors,...ids].map(key=>[key,node()]));
  elements.results.parentElement=node();
  const previous=globalThis.document;
  globalThis.document={body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},querySelector:key=>elements[key],getElementById:key=>elements[key]};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  for(const mode of ['battle','relay'])for(const count of [10,11,12,13]){
    const game={mode,phase:'guessing',players:Array.from({length:count},(_,i)=>({id:`p${i}`,human:i===0}))};
    updateArenaLayout(game);
    assert.ok(classes.has('roundtable'),`${mode}, ${count} players`);
    assert.equal(elements['.arena'].dataset.tableSize,count>10?'large':'standard');
    assert.equal(elements['.arena'].dataset.sideRows,count>11?'4':'3');
    assert.equal(elements['.guess-heading'].parentElement,elements['.game-controls']);
    assert.equal(elements.privacyNote.parentElement,elements['.canvas-column']);
    assert.equal(elements.conversationPanel.parentElement,elements['.arena']);
    const previousMoves=moves;updateArenaLayout(game);assert.equal(moves,previousMoves);
  }
  const modal=node();elements.conversationPanel.dataset.panelExpanded='true';elements.conversationPanel.parentElement=modal;
  updateArenaLayout({mode:'battle',phase:'reveal',players:Array.from({length:11},(_,i)=>({id:`p${i}`}))});
  assert.equal(elements.conversationPanel.parentElement,modal,'expanded chat stays in its drawer');
  assert.equal(elements['.arena'].dataset.sideRows,'4');
  delete elements.conversationPanel.dataset.panelExpanded;
  updateArenaLayout({mode:'battle',phase:'finished',players:[]});
  assert.ok(!classes.has('roundtable'));
  assert.equal(elements.conversationPanel.parentElement,elements.results.parentElement);
  updateArenaLayout({mode:'duel',phase:'guessing',players:[{id:'human',human:true},{id:'ai'}]});
  assert.ok(!classes.has('roundtable'));
  assert.equal(elements['.guess-heading'].parentElement,elements['.play-sidebar']);
  assert.doesNotThrow(()=>updateArenaLayout(null));
});
