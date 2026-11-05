// 只准备可丢弃的 T106 测试场景；不安装 Mod，不保存或推进回合。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluate,sleep} from '../../../fenhe/tools/cdp.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
assert(args.includes('--out')&&args.includes('--fixture'),'用法：--fixture 完整备份清单 --out 场景.json');
const baseline=JSON.parse(readFileSync(arg('--fixture'),'utf8'));assert(baseline.verified&&existsSync(baseline.archive),'必须保留本轮已核验的恢复压缩包');
const lock=fileURLToPath(new URL('../../../../scripts/game-lock.py',import.meta.url));
async function ev(s){execFileSync('/usr/bin/python3',[lock,'assert'],{stdio:'pipe'});return evaluate(s,'root-game.html',20000)}
async function poll(f,ok,label){for(let n=0;n<50;n++){const r=await f();if(ok(r))return r;await sleep(100)}throw Error(label)}
const report={时间:new Date().toISOString(),fixture:arg('--fixture'),结论:'未完成',preparation:[]};
try {
 const before=await ev(`(()=>{if(!Loading.isLoaded||Game.turn!==106||Configuration.getGame().gameSeed!==-526700269||document.querySelector('.c7r-root')||globalThis.__civ7RestGuardActivityV1)throw Error('必须先载入已备份的隔离 T106 存档并暂停休息限制');const c=Units.get({owner:0,id:262146,type:26});return {gold:Players.get(0).Treasury.goldBalance,via:c.location,commanderMoves:c.Movement.movementMovesRemaining,target:MapUnits.getUnits(17,22),sources:[589831,2686999].map(n=>{const id={owner:0,id:n,type:26},u=Units.get(id);return {id,location:u.location,moves:u.Movement.movementMovesRemaining,enemyTargets:Units.getReachableTargets(id)}}),ids:Players.get(0).Units.getUnitIds().map(id=>id.id)}})()`);
 assert.deepEqual(before.via,{x:17,y:23});assert(before.commanderMoves>0);assert.equal(before.target.length,0,'应从干净隔离存档重放，目标不能已被占据');assert(before.sources.every(u=>u.moves>=1&&u.enemyTargets.length===0),'源单位须可移动，且没有会优先触发攻击的目标');report.before=before;
 const cost=await ev(`Game.CityCommands.canStart({owner:0,id:131073,type:1},CityCommandTypes.PURCHASE,{UnitType:GameInfo.Units.lookup('UNIT_MERCHANT').$hash},false).Cost`);assert(Number.isFinite(cost));
 if(before.gold<cost){await ev(`Players.get(0).Treasury.changeGoldBalance(${Math.ceil(cost-before.gold)+1},-1);true`);await poll(()=>ev('Players.get(0).Treasury.goldBalance'),v=>v>=cost,'场景金币准备未生效');report.preparation.push('仅测试准备：通过原生调试接口补足购买商人的金币');}
 await ev(`(()=>{const id={owner:0,id:131073,type:1},a={UnitType:GameInfo.Units.lookup('UNIT_MERCHANT').$hash};if(!Game.CityCommands.canStart(id,CityCommandTypes.PURCHASE,a,false).Success)throw Error('原生购买不合法');return Game.CityCommands.sendRequest(id,CityCommandTypes.PURCHASE,a)})()`);
 const ids=await poll(()=>ev(`Players.get(0).Units.getUnitIds().filter(id=>!${JSON.stringify(before.ids)}.includes(id.id)).map(id=>({id,type:GameInfo.Units.lookup(Units.get(id).type).UnitType}))`),v=>v.length>0,'商人购买未完成');assert.equal(ids.length,1);assert.equal(ids[0].type,'UNIT_MERCHANT');const id=ids[0].id;report.merchant=id;
 const state=()=>ev(`(()=>{const u=Units.get(${JSON.stringify(id)});return {location:u.location,moves:u.Movement.movementMovesRemaining}})()`);const atTarget=r=>r.location.x===17&&r.location.y===22;
 for(let n=0;n<6;n++){
  if(atTarget(await state()))break;
  await ev(`Units.restoreMovement(${JSON.stringify(id)});true`);await poll(state,r=>r.moves>0,'场景商人移动力准备未生效');
  await ev(`(()=>{const id=${JSON.stringify(id)};if(Game.UnitCommands.canStart(id,'UNITCOMMAND_CANCEL',{},false).Success)Game.UnitCommands.sendRequest(id,'UNITCOMMAND_CANCEL',{});return true})()`);await sleep(150);
  await ev(`(()=>{const id=${JSON.stringify(id)},a={X:17,Y:22};if(!Game.UnitOperations.canStart(id,UnitOperationTypes.MOVE_TO,a,false).Success)throw Error('原生商人路线不合法');return Game.UnitOperations.sendRequest(id,UnitOperationTypes.MOVE_TO,a)})()`);
  report.preparation.push(await poll(state,r=>atTarget(r)||r.moves===0,'商人移动未完成'));
 }
 assert(atTarget(await state()),'商人未能到达占格位置');
 report.commander={owner:0,id:262146,type:26};report.target={x:17,y:22};report.mouse={unit:before.sources[0].id,source:before.sources[0].location};report.controller={unit:before.sources[1].id,source:before.sources[1].location};report.结论='场景准备完成；正式测试期间不恢复移动力、不改合法性';
} catch(e){report.结论='场景准备阻塞';report.错误=String(e);process.exitCode=2}finally{writeFileSync(arg('--out'),JSON.stringify(report,null,2)+'\n');console.log(report.结论)}
