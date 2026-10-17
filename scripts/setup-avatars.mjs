import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const release=JSON.parse(await readFile(join(root,'data/avatar-release.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(root,'licenses/avatars-manifest.json'),'utf8'));
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' requires a path');return args[i+1];};
const hash=b=>createHash('sha256').update(b).digest('hex');
let complete=true;
for(const f of manifest.files){try{if(hash(await readFile(join(root,f.path)))!==f.sha256)complete=false;}catch{complete=false;}}
if(!complete){
  const archive=arg('--archive');let buffer;
  if(archive)buffer=await readFile(resolve(archive));
  else{
    console.log(`Downloading 11 HD avatars (${Math.round(release.bytes/1024/1024)} MB)…`);
    const res=await fetch(release.url,{signal:AbortSignal.timeout(15*60*1000)});
    if(!res.ok)throw new Error(`Download failed: HTTP ${res.status}. Download the release ZIP manually, then use --archive <path>.`);
    buffer=new Uint8Array(await res.arrayBuffer());
  }
  if(hash(buffer)!==release.sha256)throw new Error('Archive checksum mismatch; nothing was installed.');
  const files=unzipSync(buffer);
  // Only the exact manifest paths are ever written; ZIP paths are never trusted.
  for(const f of manifest.files){const data=files[f.path];if(!data||data.length!==f.size||hash(data)!==f.sha256)throw new Error('Invalid asset: '+f.path);}
  for(const f of manifest.files){const path=join(root,f.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,files[f.path]);}
  console.log('HD avatars installed and SHA-256 verified.');
}else console.log('HD avatars already installed and verified.');
const sdk=arg('--sdk');
if(sdk){
  const core=join(resolve(sdk),'Core/live2dcubismcore.min.js');
  if(!(await stat(core)).isFile())throw new Error('Expected Core/live2dcubismcore.min.js under the SDK directory.');
  await copyFile(core,join(root,'public/vendor/live2dcubismcore.min.js'));
  console.log('Installed your local Cubism Core copy; its original Live2D license applies.');
}
try{await stat(join(root,'public/vendor/live2dcubismcore.min.js'));console.log('Live2D is ready. Run npm start.');}
catch{console.log('Next: download Cubism SDK for Web from https://www.live2d.com/en/sdk/download/web/ and accept its terms. Then run npm run setup:avatars -- --sdk <extracted SDK folder>. See docs/ASSETS.md.');}
