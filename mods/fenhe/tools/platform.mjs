import path from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';

// Keep export discovery, pre-intervention backups and installed maps on the
// same platform-specific roots. Explicit locations also support moved folders.
export function resolveRuntimeConfig({platform=process.platform,env=process.env,home=homedir()}={}){
 let saves,mods;
 if(platform==='darwin'){
  const root=path.posix.join(home,'Library','Application Support','Civilization VII');
  saves=path.posix.join(root,'Saves');
  mods=path.posix.join(root,'Mods');
 }else if(platform==='win32'){
  const profile=env.USERPROFILE||home;
  const local=env.LOCALAPPDATA||path.win32.join(profile,'AppData','Local');
  saves=path.win32.join(profile,'Documents','My Games',"Sid Meier's Civilization VII",'Saves');
  mods=path.win32.join(local,'Firaxis Games',"Sid Meier's Civilization VII",'Mods');
 }
 saves=env.FENHE_SAVES||saves;
 mods=env.FENHE_MODS||mods;
 if(!saves||!mods)throw Error('此平台需要显式设置 FENHE_SAVES 和 FENHE_MODS。');
 return {saves,mods,python:env.FENHE_PYTHON||(platform==='win32'?'python':'python3')};
}

// A migrated Mac can keep an Intel-only python3 first on PATH. Retry only a
// launch failure, never a Python script failure or an explicit user selection.
export function runPython(args,{command='python3',platform=process.platform,explicit=false,run=spawnSync}={}){
 const candidates=platform==='darwin'&&!explicit?[command,'/usr/bin/python3','/opt/homebrew/bin/python3']:[command];
 let result;
 for(const candidate of new Set(candidates)){
  result=run(candidate,args,{encoding:'utf8'});
  if(!result.error||!(['ENOENT','ENOEXEC'].includes(result.error.code)||result.error.errno===-86))return result;
 }
 return result;
}
