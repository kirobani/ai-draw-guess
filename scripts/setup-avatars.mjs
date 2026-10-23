import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {downloadAvatarArchive} from './avatar-download.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const release=JSON.parse(await readFile(join(root,'data/avatar-release.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(root,'licenses/avatars-manifest.json'),'utf8'));
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' requires a path');return args[i+1];};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function setup(){
if(args.includes('--help')){
  console.log('安装高清角色：npm run setup:avatars\n离线角色包：npm run setup:avatars -- --archive "下载目录/avatars-v1.zip"\n安装官方运行库：npm run setup:avatars -- --sdk "Cubism SDK for Web 解压目录"\n两项可以同时指定。自动下载显示进度，中断后再次运行会继续下载。详见 docs/ASSETS.md。');
  return;
}
// Validate arguments before attempting a large download.
const archiveArg=arg('--archive'),sdk=arg('--sdk');
console.log('正在检查已安装的角色资源…');
let complete=true;
for(const f of manifest.files){try{if(hash(await readFile(join(root,f.path)))!==f.sha256)complete=false;}catch{complete=false;}}
if(!complete){
  const archive=archiveArg;let buffer;
  if(archive)buffer=await readFile(resolve(archive));
  else{
    const downloaded=await downloadAvatarArchive(release,{cacheDir:join(root,'.local','downloads')});
    buffer=await readFile(downloaded);
  }
  if(hash(buffer)!==release.sha256)throw new Error('角色包校验不通过，尚未安装任何文件。请下载完整的 avatars-v1.zip，不要选择 Source code 压缩包。');
  console.log('正在解压并校验角色文件…');
  const files=unzipSync(buffer);
  // Only the exact manifest paths are ever written; ZIP paths are never trusted.
  for(const f of manifest.files){const data=files[f.path];if(!data||data.length!==f.size||hash(data)!==f.sha256)throw new Error('Invalid asset: '+f.path);}
  for(const f of manifest.files){const path=join(root,f.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,files[f.path]);}
  console.log('HD avatars installed and SHA-256 verified.');
}else console.log('HD avatars already installed and verified.');
if(sdk){
  const core=join(resolve(sdk),'Core/live2dcubismcore.min.js');
  if(!(await stat(core)).isFile())throw new Error('Expected Core/live2dcubismcore.min.js under the SDK directory.');
  await copyFile(core,join(root,'public/vendor/live2dcubismcore.min.js'));
  console.log('Installed your local Cubism Core copy; its original Live2D license applies.');
}
try{await stat(join(root,'public/vendor/live2dcubismcore.min.js'));console.log('Live2D is ready. Run npm start.');}
catch{console.log('角色包已就绪，还需安装 Cubism Core：从 https://www.live2d.com/en/sdk/download/web/ 下载官方 SDK for Web 并阅读、接受其条款，再运行 npm run setup:avatars -- --sdk "解压后的 SDK 目录"。详见 docs/ASSETS.md。');}
}
try{await setup();}catch(error){console.error(`\n安装未完成：${error.message}`);process.exitCode=1;}
