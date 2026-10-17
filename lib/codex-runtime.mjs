import {access,readdir,stat} from 'node:fs/promises';
import {join,delimiter} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);
export async function codexCandidates({env=process.env,platform=process.platform,preferred}={}){
  const binary=platform==='win32'?'codex.exe':'codex';
  const paths=[preferred,env.CODEX_INSTALL_DIR&&join(env.CODEX_INSTALL_DIR,binary),
    ...(env.PATH||env.Path||'').split(platform==='win32'?';':delimiter).filter(Boolean).map(p=>join(p,binary))];
  if(platform==='win32'&&env.LOCALAPPDATA){
    paths.push(join(env.LOCALAPPDATA,'Programs','OpenAI','Codex','bin',binary));
    const bin=join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
    paths.push(join(bin,binary));
    const dirs=await readdir(bin,{withFileTypes:true}).catch(()=>[]);
    const entries=await Promise.all(dirs.filter(d=>d.isDirectory()).map(async d=>{
      const path=join(bin,d.name,binary),info=await stat(path).catch(()=>null);
      return {path,mtime:info?.isFile()?info.mtimeMs:0};
    }));
    paths.push(...entries.filter(e=>e.mtime).sort((a,b)=>b.mtime-a.mtime).map(e=>e.path));
  }
  return [...new Set(paths.filter(Boolean))];
}
export async function resolveCodexPath(options={}){
  for(const path of await codexCandidates(options)){
    if(options.exclude?.includes(path))continue;
    try{await access(path);return path;}catch{}
  }
  return null;
}
export async function detectCodex(options={}){
  let installed=null;
  for(const path of await codexCandidates(options)){
    try{await access(path);}catch{continue;}
    try{
      await exec(path,['login','status'],{windowsHide:true,timeout:10000});
      return {available:true,loggedIn:true,path};
    }catch(error){
      // An updater can remove a candidate between the filesystem check and spawn.
      if(error.code==='ENOENT')continue;
      installed??={available:true,loggedIn:false,path};
    }
  }
  return installed||{available:false,loggedIn:false,path:null};
}
const missing=()=>new Error('暂时找不到可用的 Codex 程序。若桌面端正在更新，等更新完成后点击“重试失败选手”，游戏会自动重新查找。');
export async function withCodexPath(run,{preferred,signal,locate=resolveCodexPath}={}){
  if(signal?.aborted)throw new Error('已取消');
  let path=await locate({preferred});
  if(!path)throw missing();
  try{return await run(path);}catch(error){
    // Retry only a failed process launch, never a model request that has started.
    if(signal?.aborted)throw new Error('已取消');
    if(error.code!=='ENOENT')throw error;
    path=await locate({exclude:[path]});
    if(!path)throw missing();
    try{return await run(path);}catch(retryError){if(retryError.code==='ENOENT')throw missing();throw retryError;}
  }
}
