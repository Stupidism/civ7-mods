import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const live=JSON.parse(await fs.readFile(path.join(root,'results/live-verification.json'),'utf8'));
const run=JSON.parse(await fs.readFile(path.join(root,'results/run.json'),'utf8'));
if(JSON.stringify(live.choices)!==JSON.stringify(run.choices))throw Error('Native/external replay choices differ');
const files=[];async function walk(dir){for(const x of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,x.name);if(x.isDirectory()){if(x.name!=='backups')await walk(p);}else files.push(p);}}
await walk(root);
const manifest=[];for(const file of files){const relative=path.relative(root,file).replaceAll('\\','/');if(relative==='results/package-manifest.json'||relative.startsWith('backups/'))continue;const bytes=await fs.readFile(file);manifest.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}
const imageHashes=manifest.filter(x=>/^evidence\/.*\.(png|jpg|jpeg)$/.test(x.path)).map(x=>x.sha256);if(new Set(imageHashes).size!==imageHashes.length)throw Error('Duplicate evidence screenshots');
const installed=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,"Firaxis Games/Sid Meier's Civilization VII/Mods");let checked=0;
if(installed){for(const f of manifest.filter(x=>x.path.startsWith('mod/'))){const p=path.join(installed,f.path.slice('mod/'.length));if(hash(await fs.readFile(p))!==f.sha256)throw Error('Installed asset differs: '+f.path);checked++;}}
await fs.writeFile(path.join(root,'results/package-manifest.json'),JSON.stringify({version,installedRuntimeFilesChecked:checked,files:manifest},null,2));
console.log(JSON.stringify({version,files:manifest.length,installedRuntimeFilesChecked:checked,distinctEvidenceImages:imageHashes.length,nativeAndExternalChoicesMatch:true}));
