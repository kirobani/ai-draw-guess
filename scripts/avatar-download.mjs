import {createReadStream} from 'node:fs';
import {mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const size=async path=>stat(path).then(s=>s.size,()=>0);
const checksum=async path=>{
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
};
export const downloadFailureMessage=release=>
  `角色下载未完成。已下载的部分会保留，重新运行即可继续。\n`+
  `也可以用浏览器下载：${release.url}\n`+
  `下载后无需解压，在游戏文件夹运行：\n`+
  `npm run setup:avatars -- --archive "你的下载目录/avatars-v1.zip"\n`+
  `浏览器能下载、命令行不能下载时，请使用上面的离线安装方式；终端不一定沿用浏览器的代理设置。`;

export async function downloadAvatarArchive(release,{cacheDir,log=console.log,fetchImpl=fetch,attempts=3,retryDelay=attempt=>new Promise(r=>setTimeout(r,attempt*1000))}={}){
  if(!/^[a-f0-9]{64}$/.test(release.sha256)||!Number.isSafeInteger(release.bytes)||release.bytes<1)throw new Error('角色资源的版本信息无效。');
  await mkdir(cacheDir,{recursive:true});
  const archive=join(cacheDir,`avatars-${release.sha256.slice(0,16)}.zip`),partial=archive+'.part';
  if(await size(archive)===release.bytes&&await checksum(archive)===release.sha256){log('使用已经下载并校验过的角色包。');return archive;}
  if(await size(partial)>release.bytes)await rm(partial,{force:true});
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    let response;
    try{
      let received=await size(partial);
      if(received===release.bytes)break;
      log(`${received?'继续下载':'开始下载'} 11 位高清角色：${(received/1048576).toFixed(1)} / ${(release.bytes/1048576).toFixed(1)} MiB`);
      response=await fetchImpl(release.url,{headers:received?{Range:`bytes=${received}-`}:{},signal:AbortSignal.timeout(15*60*1000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      if(!response.body)throw new Error('下载服务器没有返回文件内容。');
      if(response.status===206){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
        if(!range||+range[1]!==received||+range[2]<received||+range[2]>=release.bytes||+range[3]!==release.bytes)throw new Error('下载服务器返回了不匹配的续传范围。');
      }else if(response.status===200){
        // A server may ignore Range. Start from zero instead of appending a full ZIP.
        if(received)log('服务器未支持本次续传，将重新下载完整文件。');
        received=0;
      }else throw new Error(`不支持的下载响应：HTTP ${response.status}`);
      const handle=await open(partial,received?'a':'w');
      let lastPercent=-1,lastLog=0;
      try{
        for await(const chunk of response.body){
          if(received+chunk.length>release.bytes)throw new Error('下载内容大于发布包大小，请检查下载地址。');
          await handle.writeFile(chunk);received+=chunk.length;
          const percent=Math.floor(received/release.bytes*100),now=Date.now();
          if(percent>=lastPercent+5||now-lastLog>=5000||received===release.bytes){
            log(`下载 ${percent}% · ${(received/1048576).toFixed(1)} / ${(release.bytes/1048576).toFixed(1)} MiB`);
            lastPercent=percent;lastLog=now;
          }
        }
      }finally{await handle.close();}
      if(received!==release.bytes)throw new Error('连接提前结束，文件尚未下载完整。');
      break;
    }catch(error){
      lastError=error;
      if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});
      if(attempt===attempts)throw new Error(downloadFailureMessage(release)+`\n错误：${error.cause?.code||error.code||error.message}`,{cause:error});
      log(`下载暂时中断（${error.cause?.code||error.message}），准备第 ${attempt+1}/${attempts} 次尝试。`);
      await retryDelay(attempt);
    }
  }
  if(await size(partial)!==release.bytes)throw new Error(downloadFailureMessage(release),{cause:lastError});
  log('下载完成，正在核对 SHA-256…');
  if(await checksum(partial)!==release.sha256){
    await rm(partial,{force:true});
    throw new Error('角色包校验不通过，已丢弃损坏的下载，尚未安装任何文件。请重新下载，或使用 --archive 安装完整原包。');
  }
  await rm(archive,{force:true});await rename(partial,archive);
  return archive;
}
