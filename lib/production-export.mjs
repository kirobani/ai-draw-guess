import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {CHARACTER_MAP} from '../public/characters.mjs';
import {mountProduction} from '../public/production-player.mjs';

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=data=>{let c=0xffffffff;for(const n of data)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zipFiles(files){
  const chunks=[],central=[];let offset=0;
  for(const [name,value] of files){
    const path=Buffer.from(name,'utf8'),data=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8'),crc=crc32(data),header=Buffer.alloc(30),dir=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(path.length,26);
    dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(33,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(path.length,28);dir.writeUInt32LE(offset,42);
    chunks.push(header,path,data);central.push(dir,path);offset+=header.length+path.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
const xml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function drawingSVG(shapes){
  const nodes=shapes.map(s=>{const style=`fill="${xml(s.fill||'none')}" stroke="${xml(s.color||'#202633')}" stroke-width="${Number(s.width)||5}" stroke-linecap="round" stroke-linejoin="round"`;
    if(s.type==='ellipse')return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" ${style}/>`;
    if(s.type==='rect')return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${style}/>`;
    return `<${s.type==='polygon'?'polygon':'polyline'} points="${(s.points||[]).map(p=>p.join(',')).join(' ')}" ${style}/>`;
  });return `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="2600" viewBox="0 0 1000 650"><rect width="1000" height="650" fill="white"/>${nodes.join('')}</svg>`;
}
const tc=t=>{t=Math.round(t);return `${String(Math.floor(t/3600000)).padStart(2,'0')}:${String(Math.floor(t/60000)%60).padStart(2,'0')}:${String(Math.floor(t/1000)%60).padStart(2,'0')},${String(t%1000).padStart(3,'0')}`;};
const csv=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
export async function productionFiles(data,publicDir){
  const r=data.recording;if(!r?.events?.length)throw new Error('这场比赛没有新版完整素材记录。');
  const files=[],json=JSON.stringify(data),messages=r.events.filter(e=>e.type==='message').sort((a,b)=>a.t-b.t||a.seq-b.seq),css=await readFile(join(publicDir,'production.css'),'utf8');
  files.push(['replay.json',json]);
  const csvRows=[['序号','原对局毫秒','类型','题目序号','猜词轮次','选手','收件人','文本','理由','把握','正确','画作版本'].map(csv).join(',')];
  for(const e of r.events){const d=e.data;csvRows.push([e.seq,e.t,e.type,d.index??'',d.turn??'',d.name||d.playerId||'',d.targetName||d.recipientName||d.recipientId||'',d.text||d.action||d.phase||'',d.reason||'',d.confidence??'',d.correct??'',d.drawingId||''].map(csv).join(','));}
  files.push(['时间线.csv','\ufeff'+csvRows.join('\r\n')]);
  files.push(['完整对话.txt','\ufeff'+messages.map(e=>{const m=e.data;return `[${tc(e.t)}] ${m.name}${m.targetName?' → '+m.targetName:m.recipientId?' → '+(m.recipientName||m.recipientId):''}（${m.kind}）\n${m.text||''}${m.reason?'\n看图理由：'+m.reason:''}${m.confidence!=null?'\n把握：'+m.confidence:''}`;}).join('\n\n')]);
  for(const p of [...r.players,{id:null,name:'系统'}]){
    const list=messages.filter(e=>(e.data.playerId||null)===p.id);
    if(list.length)files.push([`字幕/${p.id||'system'}.srt`,'\ufeff'+list.map((e,i)=>`${i+1}\n${tc(e.t)} --> ${tc(Math.min(e.t+6000,list[i+1]?.t>e.t?list[i+1].t:e.t+6000))}\n${p.name}${e.data.targetName?' → '+e.data.targetName:e.data.recipientId?'（只给 '+(e.data.recipientName||e.data.recipientId)+'）':''}：${e.data.text||''}${e.data.reason?'\n'+e.data.reason:''}`).join('\n\n')+'\n']);
  }
  for(const asset of Object.values(r.assets))files.push([`画作/${asset.id}.svg`,drawingSVG(asset.shapes)]);
  files.push(['离线回放.html',`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>比赛素材回放</title><style>${css}</style></head><body><main class="production-page"><h1>比赛素材回放</h1><p>双击即可回放矢量画作和全部文本。Live2D 动画请在游戏的「视频素材」页面观看；角色文件可单独下载归档。</p><div id="root"></div></main><script id="recording" type="application/json">${json.replace(/</g,'\\u003c')}</script><script>(${mountProduction.toString()})(document.getElementById('root'),JSON.parse(document.getElementById('recording').textContent));</script></body></html>`]);
  files.push(['使用说明.txt',`视频重构素材包\n\n1. 双击「离线回放.html」可大画布回放、逐条翻阅，并保存 4K 分镜 PNG。离线页只重绘画作和文字。\n2. 在游戏的「视频素材」页面选择本局，可以用现有 Kit Live2D 重演表情。\n3. 「画作」内是所有服务器收到的版本的 SVG 矢量原图，放大或重新输出 4K 都不会变成录屏那样的小字。\n4. replay.json 保存完整状态变化、每次改画、猜词、理由、把握、公开和私下提示、比分，以及接龙链条、票数、投票理由和感言。\n5. 人类作画的原始坐标、撤销和清空保存在 drawing-edit 事件中；浏览器在线时另存每笔起止时间与 AI 落笔展示时间。模型回应一次给出整组笔画，落笔动画属于展示。\n6. 时间线.csv 与每位角色的 SRT 字幕使用同一个开局时钟，毫秒为单位。可按时间与 OBS 原声对齐；同一时刻多人发言的字幕可能重叠，剪辑时按镜头选用。\n7. 麦克风和桌面声音没有录在此包内。请保留原声录音。角色的待机呼吸和眨眼为重新演绎，不是逐帧动作录像。\n8. 角色 ID、模型具体型号、Kit 版本及表情状态都在记录中；「下载本局角色资源」另存完整 Kit 原文件，体积较大，同版本只需保留一次。\n\n本包不含 API Key，不需要重新调用 AI，不产生模型 Token 费用。不要把私下提示当成当时所有人都可见的公开发言。\n${r.status==='interrupted'?'这是一场中断后恢复的记录，保留的是已写入部分。\n':''}`]);
  files.push(['manifest.json',JSON.stringify({schema:r.schema,version:2,matchId:r.id,startedAt:r.startedAt,durationMs:r.durationMs,canvas:r.canvas,characters:r.characters,capabilities:r.capabilities,files:files.map(([path,value])=>({path,bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')}))},null,2)]);
  return files;
}
export async function characterFiles(data,publicDir){
  const files=[],ids=[...new Set(data.recording.players.map(p=>p.characterId))].filter(id=>CHARACTER_MAP[id]);
  async function collect(relative){for(const f of await readdir(join(publicDir,relative),{withFileTypes:true})){const path=relative+'/'+f.name;if(f.isDirectory())await collect(path);else if(f.isFile())files.push(['public/'+path,await readFile(join(publicDir,path))]);}}
  for(const id of ids)await collect('models/agentkit-expressions-r3/'+id);
  await collect('fonts');
  for(const path of ['avatar-renderer.mjs','characters.mjs','avatar-state.mjs','guess-confidence.mjs','fonts.css'])files.push(['public/'+path,await readFile(join(publicDir,path))]);
  files.push(['角色资源说明.txt','本包是本局角色所用 Kit 的原始模型、纹理和动画驱动，配合视频素材包中的角色 ID 与表情事件重新渲染。它不是单独可双击播放的视频。Cubism Core 不包含在导出包中，请依照 Live2D 官方许可自行安装。模型文件通过本机 HTTP 服务加载；游戏自带的视频素材页可直接使用这些资源。\n']);
  files.push(['manifest.json',JSON.stringify({rigRevision:'agentkit-expressions-r3',characters:ids,files:files.map(([path,value])=>({path,bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')}))},null,2)]);return files;
}
