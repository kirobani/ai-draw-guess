import {access} from 'node:fs/promises';
const core=new URL('../public/vendor/live2dcubismcore.min.js',import.meta.url);
await access(core).catch(()=>{
  throw new Error('请先按 docs/ASSETS.md 安装官方 Cubism Core，再运行 test:assets。');
});
process.env.REQUIRE_AVATAR_ASSETS='1';
await import('./test.mjs');
