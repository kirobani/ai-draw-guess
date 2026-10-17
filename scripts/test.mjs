import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=(await readdir('tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:process.env});
process.exit(result.status??1);
