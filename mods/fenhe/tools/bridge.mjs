import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {evaluate,sleep,waitFor} from './cdp.mjs';
import {makePlan} from './plan.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const saves=process.env.FENHE_SAVES??path.join(process.env.USERPROFILE,'Documents','My Games',"Sid Meier's Civilization VII",'Saves');
const exportDir=path.join(saves,'WorldBuilder');
const outgoingCivs={AGE_EXPLORATION:['CIVILIZATION_MING','CIVILIZATION_ABBASID','CIVILIZATION_SONGHAI','CIVILIZATION_CHOLA','CIVILIZATION_INCA','CIVILIZATION_MAJAPAHIT','CIVILIZATION_NORMAN'],AGE_MODERN:['CIVILIZATION_AMERICA','CIVILIZATION_FRENCH_EMPIRE','CIVILIZATION_MEXICO','CIVILIZATION_PRUSSIA','CIVILIZATION_RUSSIA','CIVILIZATION_SIAM']};
const consumed=new Set();
console.log('分合世界接入器运行中。请在游戏的“分合”面板推演并选择介入国家。');
for(;;){
 try{
  const request=await evaluate(`(()=>{if(typeof __fenheV1==='undefined')return null;__fenheV1.bridgeReadyUntil=Date.now()+10000;return __fenheV1.pending??null;})()`);
  if(request&&!consumed.has(request.token)){
   consumed.add(request.token);
   const setStatus=message=>evaluate(`(()=>{if(typeof __fenheV1!=='undefined')__fenheV1.setStatus(${JSON.stringify(message)});})()`);
   try{
    await setStatus('正在导出真实世界并生成新时代……');
    const now=await evaluate('({turn:Game.turn,age:GameInfo.Ages.lookup(Game.age).AgeType,local:"p"+GameContext.localPlayerID})');
    if(now.turn!==request.world.provenance.turn||now.age!==request.world.provenance.age||now.local!==request.world.provenance.localPlayer)throw Error('世界已在推演后变化，请重新推演。');
    const history=Array(request.round+1).fill(request.state);
    const plan=makePlan(request.world,{history},request.round,request.faction);
    // Surviving old leaders adopt a valid civilization in the new era. New
    // dynasties retain the old civilization. Explicit choices override defaults.
    let cursor=0;
    for(const n of plan.polities){if(n.major&&request.world.players.some(o=>o.id===n.id)){
      const options=outgoingCivs[plan.targetAge];
      n.civilization=request.civilizationChoices?.[n.id]??options[(cursor++)%options.length];
      if(n.civilization===request.world.players.find(o=>o.id===n.id).civilization)n.civilization=options[(cursor++)%options.length];
    }}
    const work=path.join(root,'results','requests',request.token);await fs.mkdir(work,{recursive:true});
    const planFile=path.join(work,'plan.json');await fs.writeFile(planFile,JSON.stringify(plan,null,2));
    const files={};
    for(const filter of ['Default','Transition']){
     const name='Fenhe_'+request.token+'_'+filter;
     await evaluate(`WorldBuilderContext.save({FileName:${JSON.stringify(name)},ContentType:SaveFileTypes.GAME_TRANSITION,ContentOptions:{ContentRange:'Complete',ContentFilter:${JSON.stringify(filter)}}})`);
     const file=path.join(exportDir,name+'.Civ7Map');
     await waitFor(()=>fs.stat(file).then(s=>s.size),n=>n>100000,{timeout:30000});await sleep(1500);
     files[filter]=path.join(work,name+'.Civ7Map');await fs.copyFile(file,files[filter]);
    }
    await fs.writeFile(path.join(work,'request.json'),JSON.stringify(request));
    await setStatus('方案已备份；正在载入新时代，请等待地图出现。');
    await new Promise((resolve,reject)=>{
     const child=spawn(process.execPath,[path.join(root,'tools','apply-plan.mjs'),'--plan',planFile,'--default',files.Default,'--transition',files.Transition],{stdio:'inherit',windowsHide:true});
     child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('世界接入未通过核对，退出码 '+code)));
    });
    console.log('已完成第',request.round,'轮介入。');
   }catch(e){console.error(e.stack);await setStatus('接入停止：'+e.message).catch(()=>{});}
  }
 }catch(e){if(!/fetch failed|界面尚未就绪|Cannot read/.test(e.message))console.error(e.message);}
 await sleep(2500);
}
