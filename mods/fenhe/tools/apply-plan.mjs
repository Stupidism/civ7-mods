import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluate,waitFor,sleep} from './cdp.mjs';
import {enterWorld,reloadWorld,verifyWorld} from './native-session.mjs';
import {resolveRuntimeConfig,runPython} from './platform.mjs';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.replace(/^--/,''),all[i+1]]],[]));
if(!args.plan||!args.default||!args.transition)throw Error('需要 --plan、--default 和 --transition 文件路径');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const plan=JSON.parse(await fs.readFile(args.plan,'utf8'));
const runtime=resolveRuntimeConfig();
const installed=path.join(runtime.mods,'civ7-fenhe');
const out=path.join(root,'results','interventions',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});
await fs.copyFile(args.plan,path.join(out,'plan.json'));
const destination=path.join(out,'Fenhe_Intervention.Civ7Map');
const python=args.python??runtime.python;
const result=runPython([path.join(root,'tools','build-world.py'),'--default',path.resolve(args.default),'--transition',path.resolve(args.transition),'--plan',path.resolve(args.plan),'--out',destination],{command:python,explicit:!!(args.python||process.env.FENHE_PYTHON)});
if(result.error)throw Error('无法启动 Python（'+python+'）：'+result.error.message);
if(result.status!==0)throw Error(result.stderr||result.stdout);
console.log('数据库检查',result.stdout.trim());
await fs.writeFile(path.join(out,'database-check.json'),result.stdout);
if(args.prepare==='true'){console.log('已准备',destination);process.exit(0);}
// All mutations target a new scenario world; the user's original save is never
// overwritten. Keep a reloadable snapshot before leaving the current session.
const stamp='Fenhe_Before_'+Date.now();
let backupSaved=false;
try {
 const state=await evaluate('({ready:typeof Game!=="undefined",multiplayer:Configuration.getGame().isAnyMultiplayer})');
 if(state.multiplayer)throw Error('分合不支持多人游戏');
 if(state.ready){
  await evaluate(`Network.saveGame({Location:SaveLocations.LOCAL_STORAGE,LocationCategories:SaveLocationCategories.NORMAL,Type:SaveTypes.SINGLE_PLAYER,ContentType:SaveFileTypes.GAME_STATE,FileName:${JSON.stringify(stamp)},Overwrite:false})`);
  await sleep(2000);
  const saved=await fs.stat(path.join(runtime.saves,'Single',stamp+'.Civ7Save'));
  if(saved.size<10000)throw Error('接入前备份未完成');
  backupSaved=true;
  await evaluate('engine.call("exitToMainMenu")');
 }
}catch(e){if(!/界面尚未就绪/.test(e.message))throw e;}
await waitFor(()=>evaluate('({ready:typeof GameSetup!=="undefined"})','root-shell.html'),x=>x.ready);
// This is generated campaign data, not a hot replacement of executable scripts.
// Backup the previous generated campaign before atomically replacing this data.
const map=path.join(installed,'maps','Fenhe_Intervention.Civ7Map');
await fs.copyFile(map,path.join(out,'previous-generated-world.Civ7Map')).catch(e=>{if(e.code!=='ENOENT')throw e;});
await fs.copyFile(destination,map+'.pending');await fs.rename(map+'.pending',map);
try {
const actual=await enterWorld(plan);
await fs.writeFile(path.join(out,'native-plan.json'),JSON.stringify(plan,null,2));
await fs.writeFile(path.join(out,'actual.json'),JSON.stringify(actual,null,2));
console.log('全部定居点、国家身份和控制权核对通过',actual.players.length,actual.turn);
const save='Fenhe_After_R'+plan.round+'_'+Date.now();
await evaluate(`Configuration.editGame().setValue('FenheImportPhase','COMPLETE')`);
await evaluate(`Network.saveGame({Location:SaveLocations.LOCAL_STORAGE,LocationCategories:SaveLocationCategories.NORMAL,Type:SaveTypes.SINGLE_PLAYER,ContentType:SaveFileTypes.GAME_STATE,FileName:${JSON.stringify(save)},Overwrite:false})`);
await sleep(2500);
const reloaded=await reloadWorld(save);
const reloadErrors=verifyWorld(plan,reloaded);
await fs.writeFile(path.join(out,'reloaded.json'),JSON.stringify(reloaded,null,2));
const phase=await evaluate(`({phase:Configuration.getGame().getValue('FenheImportPhase'),normalPool:[...GameInfo.Independents].filter(x=>!x.IndependentType.startsWith('INDEPENDENT_FENHE_')&&x.TribeType==='TRIBE_DEFAULT'&&x.BiomeType!==null).length})`);
if(reloadErrors.length||phase.phase!=='COMPLETE'||phase.normalPool<1)throw Error('保存重载核对失败：'+JSON.stringify({reloadErrors,phase}));
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({plan:args.plan,backupSave:stamp,resultSave:save,verified:true,output:out},null,2));
console.log('结果存档',save,'记录',out);
} catch(error) {
 let recovered=false,recoveryError=null;
 if(backupSaved){try{await reloadWorld(stamp);recovered=true;}catch(e){recoveryError=e.message;}}
 await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({verified:false,backupSave:backupSaved?stamp:null,error:error.message,recovered,recoveryError,output:out},null,2));
 throw Error(error.message+(recovered?'；已重新载入介入前备份。':'；接入停止，原始存档未覆盖。'));
}
