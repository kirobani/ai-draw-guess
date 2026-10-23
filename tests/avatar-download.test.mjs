import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {downloadAvatarArchive} from '../scripts/avatar-download.mjs';

const data=Buffer.alloc(16384);for(let i=0;i<data.length;i++)data[i]=i%251;
const sha256=createHash('sha256').update(data).digest('hex');
async function fixture(t,handler){
  const cacheDir=await mkdtemp(join(tmpdir(),'draw-guess-download-'));
  const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{
    server.closeAllConnections();await new Promise(r=>server.close(r));
    assert(resolve(cacheDir).startsWith(resolve(tmpdir())+sep));await rm(cacheDir,{recursive:true,force:true});
  });
  const release={url:`http://127.0.0.1:${server.address().port}/avatars.zip`,bytes:data.length,sha256};
  const logs=[];
  return {release,cacheDir,logs,options:{cacheDir,log:s=>logs.push(s),retryDelay:async()=>{}}};
}
const partial=f=>join(f.cacheDir,`avatars-${sha256.slice(0,16)}.zip.part`);

test('角色下载显示进度，SHA-256 正确的缓存不重复请求',async t=>{
  let calls=0;const f=await fixture(t,(_,res)=>{calls++;res.end(data);});
  const path=await downloadAvatarArchive(f.release,f.options);assert.deepEqual(await readFile(path),data);
  assert(f.logs.some(s=>s.includes('100%')));assert(f.logs.some(s=>s.includes('SHA-256')));
  assert.equal(await downloadAvatarArchive(f.release,f.options),path);assert.equal(calls,1);
});

test('下载中断后使用 Range 继续，拼接后仍严格校验整个原包',async t=>{
  const ranges=[];const f=await fixture(t,(req,res)=>{
    ranges.push(req.headers.range||'');
    if(ranges.length===1){res.writeHead(200,{'Content-Length':data.length});res.write(data.subarray(0,4096));setTimeout(()=>res.destroy(),30);}
    else{assert.equal(req.headers.range,'bytes=4096-');res.writeHead(206,{'Content-Range':`bytes 4096-${data.length-1}/${data.length}`});res.end(data.subarray(4096));}
  });
  const path=await downloadAvatarArchive(f.release,f.options);
  assert.deepEqual(await readFile(path),data);assert.deepEqual(ranges,['','bytes=4096-']);
});

test('已有部分文件，但服务器忽略 Range 时重新写入而不是错误追加',async t=>{
  let range;const f=await fixture(t,(req,res)=>{range=req.headers.range;res.end(data);});
  await writeFile(partial(f),data.subarray(0,2048));
  assert.deepEqual(await readFile(await downloadAvatarArchive(f.release,f.options)),data);
  assert.equal(range,'bytes=2048-');assert(f.logs.some(s=>s.includes('重新下载')));
});

test('拒绝不匹配的续传响应，并保留已下载的正确部分',async t=>{
  const f=await fixture(t,(_,res)=>{res.writeHead(206,{'Content-Range':`bytes 0-${data.length-1}/${data.length}`});res.end(data);});
  await writeFile(partial(f),data.subarray(0,2048));
  await assert.rejects(downloadAvatarArchive(f.release,{...f.options,attempts:1}),/续传范围/);
  assert.deepEqual(await readFile(partial(f)),data.subarray(0,2048));
});

test('文件大小正确但内容损坏时不保留可安装压缩包',async t=>{
  const f=await fixture(t,(_,res)=>res.end(Buffer.alloc(data.length,9)));
  await assert.rejects(downloadAvatarArchive(f.release,f.options),/校验不通过/);
  assert.deepEqual(await readdir(f.cacheDir),[]);
});

test('网络连续失败时保留断点并给出准确的手动安装命令',async t=>{
  let calls=0;const f=await fixture(t,(_,res)=>{calls++;res.writeHead(503);res.end('temporary unavailable');});
  await writeFile(partial(f),data.subarray(0,1024));
  await assert.rejects(downloadAvatarArchive(f.release,f.options),e=>e.message.includes('HTTP 503')&&e.message.includes('--archive')&&e.message.includes(f.release.url));
  assert.equal(calls,3);assert.deepEqual(await readFile(partial(f)),data.subarray(0,1024));
});

test('上次已经下载完整的 part 文件直接校验完成，不再联网',async t=>{
  let calls=0;const f=await fixture(t,(_,res)=>{calls++;res.end(data);});
  await writeFile(partial(f),data);
  assert.deepEqual(await readFile(await downloadAvatarArchive(f.release,f.options)),data);assert.equal(calls,0);
});

test('安装器帮助不触发网络下载且包含角色包与 Core 两项步骤',()=>{
  const result=spawnSync(process.execPath,['scripts/setup-avatars.mjs','--help'],{encoding:'utf8'});
  assert.equal(result.status,0);assert.match(result.stdout,/--archive/);assert.match(result.stdout,/--sdk/);assert(!result.stdout.includes('开始下载'));
});
