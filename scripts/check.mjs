import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(readFileSync(join(root,'catalog.json'),'utf8'));
// Keep the source inventory and catalog aligned; uncatalogued projects must not slip into a release.
const directories=readdirSync(join(root,'mods'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
const catalogDirectories=catalog.mods.map(mod=>mod.manifest.split('/')[1]).sort();
if(JSON.stringify(directories)!==JSON.stringify(catalogDirectories))throw Error('Mod directories and catalog must match exactly');
let references=0,scripts=0;
for(const mod of catalog.mods){
  const manifest=join(root,mod.manifest),xml=readFileSync(manifest,'utf8');
  if(!xml.includes(`id="${mod.id}"`)||!xml.includes(`<Version>${mod.version}</Version>`))throw Error('Catalog mismatch: '+mod.id);
  for(const [,file]of xml.matchAll(/<Item>([^<]+)<\/Item>/g)){
    const resolved=resolve(dirname(manifest),file);
    if(!resolved.startsWith(dirname(manifest)))throw Error('Invalid manifest path: '+file);
    if(!existsSync(resolved))throw Error('Missing runtime file: '+resolved);
    references++;
  }
}
function walk(dir){for(const f of readdirSync(dir,{withFileTypes:true})){
  if(['.git','node_modules','__pycache__'].includes(f.name))continue;
  const path=join(dir,f.name);
  if(f.isDirectory()){walk(path);continue;}
  if(/\.(Civ7Save|Civ7Map|zip|log)$/i.test(f.name))throw Error('Local artifact must not be published: '+path);
  if(/\.(m?js)$/.test(f.name)){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    if(result.error)throw result.error;
    if(result.status!==0)throw Error(result.stderr||'Syntax check failed: '+path);
    scripts++;
  }
}}
walk(root);
console.log(JSON.stringify({mods:catalog.mods.length,manifestReferences:references,javascriptFiles:scripts}));
