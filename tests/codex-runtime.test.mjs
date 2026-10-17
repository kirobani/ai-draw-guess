import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveCodexPath,withCodexPath} from '../lib/codex-runtime.mjs';
test('版本目录替换后，运行中的进程可找到新程序，旧 PATH 不影响恢复',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'codex-update-test-'));
  try{
    const old=join(dir,'OpenAI','Codex','bin','old'),next=join(dir,'OpenAI','Codex','bin','new');
    await mkdir(old,{recursive:true});await mkdir(next,{recursive:true});await writeFile(join(old,'codex.exe'),'fixture');
    const opts={env:{LOCALAPPDATA:dir,PATH:old},platform:'win32'};assert.equal(await resolveCodexPath(opts),join(old,'codex.exe'));
    await unlink(join(old,'codex.exe'));await writeFile(join(next,'codex.exe'),'fixture');
    assert.equal(await resolveCodexPath({...opts,preferred:join(old,'codex.exe')}),join(next,'codex.exe'));
    await unlink(join(next,'codex.exe'));assert.equal(await resolveCodexPath(opts),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('支持官方独立安装的稳定目录',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'codex-stable-test-'));
  try{const bin=join(dir,'Programs','OpenAI','Codex','bin');await mkdir(bin,{recursive:true});await writeFile(join(bin,'codex.exe'),'fixture');assert.equal(await resolveCodexPath({env:{LOCALAPPDATA:dir},platform:'win32'}),join(bin,'codex.exe'));}
  finally{await rm(dir,{recursive:true,force:true});}
});
test('检查存在之后恰好更新导致 ENOENT，只重新启动一次',async()=>{
  const calls=[],lookups=[];const result=await withCodexPath(async path=>{calls.push(path);if(path==='old')throw Object.assign(new Error('removed'),{code:'ENOENT'});return 'ok';},{preferred:'old',locate:async opts=>{lookups.push(opts);return opts.exclude?'new':'old';}});
  assert.equal(result,'ok');assert.deepEqual(calls,['old','new']);assert.deepEqual(lookups[1].exclude,['old']);
});
test('已启动请求的错误与取消不会重复调用模型',async()=>{
  for(const code of ['ETIMEDOUT','MODEL_ERROR','EACCES']){let count=0;await assert.rejects(withCodexPath(async()=>{count++;throw Object.assign(new Error(code),{code});},{locate:async()=> 'current'}),new RegExp(code));assert.equal(count,1);}
  const controller=new AbortController();let count=0;
  await assert.rejects(withCodexPath(async()=>{count++;controller.abort();throw Object.assign(new Error(),{code:'ENOENT'});},{signal:controller.signal,locate:async()=> 'current'}),/已取消/);assert.equal(count,1);
});
test('更新中没有程序时提供重试说明，不误报需要重新安装',async()=>{
  await assert.rejects(withCodexPath(()=>{}, {locate:async()=>null}),/更新完成后/);
  let count=0;await assert.rejects(withCodexPath(async()=>{count++;throw Object.assign(new Error(),{code:'ENOENT'});},{locate:async()=> 'gone'}),/重新查找/);assert.equal(count,2);
});
