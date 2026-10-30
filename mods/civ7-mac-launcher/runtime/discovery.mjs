import {readdir, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const ID=/^[a-z][a-z0-9-]{2,79}$/;
export async function modRoots(home=os.homedir()) {
  const steam=path.join(home,'Library/Application Support/Steam');
  const libraries=new Set([steam]);
  for(const file of ['steamapps/libraryfolders.vdf','config/libraryfolders.vdf']) {
    try { for(const m of (await readFile(path.join(steam,file),'utf8')).matchAll(/"path"\s*"([^"\r\n]+)"/g)) libraries.add(m[1].replaceAll('\\\\','\\')); } catch(e) {if(e.code!=='ENOENT')throw e;}
  }
  return [path.join(home,'Library/Application Support/Civilization VII/Mods'),...Array.from(libraries,p=>path.join(p,'steamapps/workshop/content/1295660'))];
}
// Discovery reads declarations only. No extension code executes until its
// loaded game UI registers the same ID and the player enables it in Options.
export async function discoverExtensions(roots) {
  const found=new Map(), duplicates=new Set();
  for(const root of roots) {
    let children;try {children=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const child of children) {
      if(!child.isDirectory()&&!child.isSymbolicLink())continue;
      const folder=path.join(root,child.name);
      let raw;try{raw=await readFile(path.join(folder,'better-mod-support.json'),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
      try {
        if(raw.length>16384)throw Error('manifest too large');
        const spec=JSON.parse(raw);
        if(spec.apiVersion!==1||!ID.test(spec.id)||typeof spec.entry!=='string'||path.isAbsolute(spec.entry)||spec.entry.split(/[\\/]/).includes('..'))throw Error('invalid manifest');
        const base=await realpath(folder), entry=await realpath(path.join(base,spec.entry));
        if(!entry.startsWith(base+path.sep)||!entry.endsWith('.mjs'))throw Error('entry outside extension');
        const infos=(await readdir(base)).filter(f=>f.endsWith('.modinfo'));
        const owned=(await Promise.all(infos.map(f=>readFile(path.join(base,f),'utf8')))).some(text=>new RegExp(`<Mod\\s[^>]*\\bid=["']${spec.id}["']`).test(text));
        if(!owned)throw Error('manifest ID does not belong to this mod');
        if(found.has(spec.id)){duplicates.add(spec.id);continue;}
        found.set(spec.id,{...spec,entry,root:base});
      }catch(error){console.warn(`Ignoring invalid enhanced-mod declaration in ${child.name}: ${error.message}`);}
    }
  }
  for(const id of duplicates)found.set(id,{id,error:'duplicate-installation'});
  return found;
}
