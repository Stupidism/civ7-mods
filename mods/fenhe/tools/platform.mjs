import path from 'node:path';
import {homedir} from 'node:os';

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
