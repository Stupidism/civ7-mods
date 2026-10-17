import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),mod=new URL('mod/civ7-fenhe/',root);
await fs.mkdir(new URL('ui/',mod),{recursive:true});await fs.mkdir(new URL('sim/',mod),{recursive:true});
for(const f of ['engine.js','topology.js'])await fs.copyFile(new URL('sim/'+f,root),new URL('sim/'+f,mod));
const config=JSON.parse(await fs.readFile(new URL('data/calibrated.json',root),'utf8'));
await fs.writeFile(new URL('sim/config.js',mod),'export default '+JSON.stringify(config)+';\n');
const extract=await fs.readFile(new URL('tools/capture-expression.js',root),'utf8');
await fs.writeFile(new URL('ui/snapshot.js',mod),'export function captureWorld() '+extract.trim().replace(/^\(\(\)=>/,'').replace(/\)\(\)$/,'')+'\n');
// The gameplay package correctly affects saves; this separate UI package can
// also load into saves created before Fenhe was installed.
const uiMod=new URL('mod/civ7-fenhe-ui/',root);
for(const dir of ['ui','sim']){await fs.mkdir(new URL(dir+'/',uiMod),{recursive:true});for(const file of await fs.readdir(new URL(dir+'/',mod)))await fs.copyFile(new URL(dir+'/'+file,mod),new URL(dir+'/'+file,uiMod));}
console.log('Built runtime modules from tested sources.');
