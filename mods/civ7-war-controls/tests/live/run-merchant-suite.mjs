// 固定 T106 隔离样本的可重复场景准备＋鼠标/地图焦点手柄验收。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {evaluate,sleep,waitFor} from '../../../fenhe/tools/cdp.mjs';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const fixture=resolve(arg('--fixture','')),dir=resolve(arg('--outdir',''));assert(args.includes('--fixture')&&args.includes('--outdir'));
mkdirSync(dir,{recursive:true});const base=JSON.parse(readFileSync(fixture,'utf8'));assert(base.verified&&existsSync(base.archive),'完整恢复备份未就绪');
const root=fileURLToPath(new URL('../../../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url));
function guard(){execFileSync('/usr/bin/python3',[join(root,'scripts/game-lock.py'),'assert'],{stdio:'pipe'})}
async function ev(s,context='root-game.html'){guard();return evaluate(s,context,20000)}
const receipt={时间:new Date().toISOString(),结论:'未完成',场景:'T106，己方商人占格；脚本注入，非实体手柄',步骤:[]};
try {
 const file=arg('--load',null);
 if(file){
  assert(/^WarMerchant_[\w-]+\.Civ7Save$/.test(file),'只允许隔离测试副本');const expected=base.files['Single/'+file];assert(expected,'本轮完整备份须包含该测试副本');const raw=readFileSync(join(base.source,'Single',file));assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256);
  const code=`(()=>{if(Modding.getInstalledMods().some(m=>m.id==='civ7-rest-guard'&&m.enabled))throw Error('休息 Mod 必须暂停');setTimeout(()=>Network.loadGame({Location:SaveLocations.LOCAL_STORAGE,LocationCategories:SaveLocationCategories.NORMAL,Type:SaveTypes.SINGLE_PLAYER,ContentType:SaveFileTypes.GAME_STATE,FileName:${JSON.stringify(file)}},ServerType.SERVER_TYPE_NONE),150);return true})()`;
  await ev(code);await sleep(1500);
  await waitFor(()=>ev(`Loading.isLoaded&&Game.turn===106&&!![...document.querySelectorAll('[data-name="HeroButton2"]')].find(e=>e.textContent.includes('开始游戏'))`),v=>v===true,{timeout:90000,interval:1000});
  await ev(`(async()=>{Input.setActiveDeviceType(InputDeviceType.Controller);engine.trigger('input-source-changed',InputDeviceType.Controller,InputDeviceLayout.XBox);const f=(await import('/core/ui-next/services/focus-manager.js')).FocusManager.get();const e=[...document.querySelectorAll('[data-name="HeroButton2"]')].find(e=>e.textContent.includes('开始游戏'));if(!e)throw Error('开始按钮未就绪');f.setFocus(e);f.realizeFocus(false);engine.trigger('InputAction','accept',InputActionStatuses.START,0,0);await new Promise(r=>setTimeout(r,100));engine.trigger('InputAction','accept',InputActionStatuses.FINISH,0,0);return true})()`);
  await waitFor(()=>ev(`(async()=>Loading.isLoaded&&(await import('/core/ui/interface-modes/interface-modes.js')).InterfaceMode.getCurrent()!=='INTERFACEMODE_UNSET')()`),v=>v===true,{timeout:20000,interval:500});receipt.步骤.push('完整备份匹配隔离副本，原生重新载入并开始');
 }
 guard();execFileSync(process.execPath,[join(here,'prepare-merchant-fixture.mjs'),'--fixture',fixture,'--out',join(dir,'scene.json')],{stdio:'inherit',cwd:root});const scene=JSON.parse(readFileSync(join(dir,'scene.json'),'utf8'));receipt.步骤.push(scene.结论);
 for(const device of ['mouse','controller']){
  const s=scene[device];guard();execFileSync(process.execPath,[join(here,'quick-transfer-civilian.mjs'),'run','--fixture',fixture,'--unit',JSON.stringify(s.unit),'--commander',JSON.stringify(scene.commander),'--source',JSON.stringify(s.source),'--target',JSON.stringify(scene.target),'--device',device,'--out',join(dir,device+'.json')],{stdio:'inherit',cwd:root});receipt.步骤.push(device+' 断言通过');
  guard();execFileSync('/usr/bin/python3',[join(root,'work/civ7-four-wonders-video-20261018/capture-window.py'),join(dir,device==='mouse'?'鼠标占格转移通过.png':'地图焦点手柄占格转移通过.png')],{stdio:'inherit',cwd:root});
  if(device==='mouse'){
   await ev(`(()=>{const id=${JSON.stringify(s.unit)},args={X:17,Y:23};if(!Game.UnitCommands.canStart(id,'UNITCOMMAND_ADD_TO_ARMY',args,false).Success)throw Error('无法重置第一名单位');return Game.UnitCommands.sendRequest(id,'UNITCOMMAND_ADD_TO_ARMY',args)})()`);
   await waitFor(()=>ev(`Units.get(${JSON.stringify(s.unit)}).location.x<0`),v=>v===true,{timeout:10000,interval:150});
  }
 }
 receipt.结论='两条实机脚本路径通过；外方商人及实体手柄未包含';
} catch(e){receipt.结论='未完成，见步骤与子脚本结果';receipt.错误=String(e);process.exitCode=1}finally{writeFileSync(join(dir,'suite.json'),JSON.stringify(receipt,null,2)+'\n');console.log(receipt.结论)}
