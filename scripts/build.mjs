import {build} from 'esbuild';
await build({entryPoints:['src/avatar-renderer.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'public/avatar-renderer.mjs',legalComments:'eof'});
console.log('Built public/avatar-renderer.mjs (Cubism Core remains an external runtime).');
