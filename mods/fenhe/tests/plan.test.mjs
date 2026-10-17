import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan} from '../tools/plan.mjs';
const world={provenance:{age:'AGE_ANTIQUITY',localPlayer:'p0'},map:{width:84,height:54},players:[{id:'p0',nativeId:0,major:true,leader:'LEADER_ISABELLA',civilization:'CIVILIZATION_ICELAND'}],settlements:[{id:'a',x:2,y:3,name:'甲',population:10,isCity:true},{id:'b',x:5,y:4,name:'乙',population:7,isCity:false}]};
const run={history:[{round:0,settlements:[{id:'a',owner:'f1'},{id:'b',owner:'f2'}],polities:[{id:'f1',origin:'p0',major:true,leader:'LEADER_AMINA',civilization:'CIVILIZATION_ICELAND',gold:500,count:1},{id:'f2',origin:'p0',major:false,leader:'LEADER_CONFUCIUS',civilization:'CIVILIZATION_ICELAND',type:'science',gold:250,count:1}]}]};
test('分裂后的国家保留文明，独立城邦使用原生小文明身份',()=>{const p=makePlan(world,run,0,'f1');assert.equal(p.targetAge,'AGE_EXPLORATION');assert.equal(p.polities[0].civilization,'CIVILIZATION_ICELAND');assert.equal(p.polities[1].leader,'LEADER_MINOR_CIV_DEFAULT');assert.deepEqual(p.settlements.map(s=>s.owner),[0,1]);assert.equal(p.settlements[0].plot,254);});
test('拒绝接管城邦，避免自动把小文明升级为国家',()=>{assert.throws(()=>makePlan(world,run,0,'f2'),/大文明/);});
test('拒绝缺失城市与错误所有权，不允许部分写回',()=>{const bad=structuredClone(run);bad.history[0].settlements[1].owner='missing';assert.throws(()=>makePlan(world,bad,0,'f1'),/归属/);});
test('原领袖的新文明选择不会串改衍生国家的文明',()=>{const r=structuredClone(run);r.history[0].polities[0]={...r.history[0].polities[0],id:'p0',leader:'LEADER_ISABELLA'};r.history[0].settlements[0].owner='p0';const p=makePlan(world,r,0,undefined,{p0:'CIVILIZATION_MING'});assert.equal(p.faction,'p0');assert.equal(p.polities[0].civilization,'CIVILIZATION_MING');assert.equal(p.polities[1].type,'science');});
test('近世结束没有隐式回到古典时代',()=>{assert.throws(()=>makePlan({...world,provenance:{...world.provenance,age:'AGE_MODERN'}},run,0,'f1'),/古典/);});

