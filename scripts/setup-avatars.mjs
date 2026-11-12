import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {downloadAvatarArchive} from './avatar-download.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const legacy={name:'avatars-v1.zip',...await json('data/avatar-release.json')};
const {archives}=await json('data/avatar-release-v2.json');
const {files}=await json('licenses/avatars-v2-manifest.json');
const {files:legacyFiles}=await json('licenses/avatars-manifest.json');
const args=process.argv.slice(2);
const arg=name=>{
  const i=args.indexOf(name);
  if(i<0)return null;
  if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' 后需要填写路径。');
  return resolve(args[i+1]);
};
const hash=data=>createHash('sha256').update(data).digest('hex');

function entries(release){
  return release===legacy?legacyFiles:files.filter(file=>file.archive===release.name);
}

async function installed(release){
  for(const file of entries(release)){
    const data=await readFile(join(root,file.path)).catch(()=>null);
    if(!data||data.length!==file.size||hash(data)!==file.sha256)return false;
  }
  return true;
}

async function install(release,buffer){
  if(buffer.length!==release.bytes||hash(buffer)!==release.sha256)throw new Error(release.name+' 校验不通过，请重新下载完整压缩包。');
  console.log('正在解压并校验 '+release.name+' …');
  const expected=entries(release);
  const selected=new Set(expected.map(file=>file.path));
  const unpacked=unzipSync(buffer,{filter:file=>selected.has(file.name)});
  // Verify all expected files before writing, and only use destinations from the trusted manifest.
  for(const file of expected){
    const data=unpacked[file.path];
    if(!data||data.length!==file.size||hash(data)!==file.sha256)throw new Error('角色文件校验不通过：'+file.path);
  }
  for(const file of expected){
    const path=join(root,file.path);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,unpacked[file.path]);
  }
  console.log(release.name+' 已安装，SHA-256 校验通过。');
}

async function installCurrent(directory){
  for(const release of archives){
    if(await installed(release)){
      console.log(release.name+' 已安装，SHA-256 校验通过。');
      continue;
    }
    const path=directory?join(directory,release.name):await downloadAvatarArchive(release,{cacheDir:join(root,'.local','downloads')});
    await install(release,await readFile(path));
  }
}

async function setup(){
  if(args.includes('--help')){
    console.log('安装高清角色：npm run setup:avatars\n离线安装：npm run setup:avatars -- --archive "放有新版三个 ZIP 的目录"\n也可通过 --archive 指定一个 ZIP 单独安装（兼容旧版 avatars-v1.zip）。\n安装官方运行库：npm run setup:avatars -- --sdk "Cubism SDK for Web 解压目录"\n详见 docs/ASSETS.md。');
    return;
  }
  const archive=arg('--archive'),sdk=arg('--sdk');
  const core=sdk?join(sdk,'Core/live2dcubismcore.min.js'):null;
  if(core&&!(await stat(core).catch(()=>null))?.isFile())throw new Error('指定 SDK 中找不到 Core/live2dcubismcore.min.js。');

  console.log('正在检查已安装的角色资源…');
  if(archive&&!(await stat(archive)).isDirectory()){
    const buffer=await readFile(archive),sha256=hash(buffer);
    const release=[...archives,legacy].find(item=>item.sha256===sha256);
    if(!release)throw new Error('角色包校验不通过，请使用发布页上的完整角色 ZIP。');
    if(!await installed(release))await install(release,buffer);
    else console.log(release.name+' 已安装，SHA-256 校验通过。');
    if(release===legacy)console.log('已安装旧版角色包，用于旧对局。新版对局还需要三个 avatars-v2 ZIP。');
  }else await installCurrent(archive);

  if(core){
    await copyFile(core,join(root,'public/vendor/live2dcubismcore.min.js'));
    console.log('已安装本机 Cubism Core，其原有 Live2D 许可仍适用。');
  }
  if(!await stat(join(root,'public/vendor/live2dcubismcore.min.js')).catch(()=>null)){
    console.log('角色还需 Cubism Core。请从 https://www.live2d.com/en/sdk/download/web/ 获取官方 SDK，再使用 --sdk 安装。');
  }
  console.log('完成。请启动或重启游戏以加载已安装的文件。');
}

try{await setup();}catch(error){console.error('\n安装未完成：'+error.message);process.exitCode=1;}
