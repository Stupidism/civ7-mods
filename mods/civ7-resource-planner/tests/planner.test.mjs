import test from 'node:test';
import assert from 'node:assert/strict';
import {planAllocation,planHappiness,marginal,groupedSettlements,utility} from '../ui/rp-planner.js';
import {readSettings,writeSettings} from '../ui/rp-settings.js';
const city=(key,extra={})=>({key,id:{owner:0,id:key},isTown:false,base:[0,0,0,0,0,0,0],multiplier:Array(7).fill(1),tags:{WAREHOUSE:0},capacity:1,tendency:'YIELD_CULTURE',...extra});
const res=(key,effects,allowed=['a','b'],extra={})=>({key,value:key,effects,allowed,bonusSlots:0,...extra});
const effect=(yieldType,amount,extra={})=>({yield:yieldType,amount,kind:'flat',...extra});
test('weights and happiness clipping',()=>{
 assert.equal(utility([1,1,1,1,1,-1,0]),7);
 const r=res('r',[effect('YIELD_HAPPINESS',6)]);
 assert.equal(marginal(city('a',{base:[0,0,0,0,0,-2,0]}),r).score,16);
 assert.equal(marginal(city('a',{base:[0,0,0,0,0,2,0]}),r).score,0);
});
test('percentage prefers base yield, warehouse prefers count',()=>{
 const p=res('p',[effect('YIELD_CULTURE',10,{kind:'percent'})]);
 const w=res('w',[effect('YIELD_CULTURE',2,{tag:'WAREHOUSE'})]);
 const a=city('a',{base:[0,0,0,0,100,0,0],tags:{WAREHOUSE:1}}),b=city('b',{base:[0,0,0,0,30,0,0],tags:{WAREHOUSE:6}});
 assert.deepEqual(planAllocation([p,w],[a,b]),{p:'a',w:'b'});
});
test('global matching resolves greedy trap',()=>{
 const r=res('rare',[effect('YIELD_CULTURE',10)],['a']);
 const flex=res('flex',[effect('YIELD_CULTURE',11)],['a','b']);
 assert.deepEqual(planAllocation([flex,r],[city('a'),city('b')]),{flex:'b',rare:'a'});
});
test('different city/town effects use the requested conversion',()=>{
 const r=res('r',[effect('YIELD_GOLD',4,{town:false}),effect('YIELD_SCIENCE',2,{town:true})]);
 const a=city('a',{tendency:'YIELD_GOLD'}),b=city('b',{tendency:'YIELD_SCIENCE',isTown:true});
 assert.equal(planAllocation([r],[a,b]).r,'b');
});
test('happiness saturation does not consume a second pure happiness resource',()=>{
 const h=()=>[effect('YIELD_HAPPINESS',6)];
 const out=planAllocation([res('x',h()),res('y',h())],[city('a',{capacity:2,base:[0,0,0,0,0,-3,0],tendency:'YIELD_HAPPINESS'})]);
 assert.equal(Object.values(out).filter(Boolean).length,1);
});
test('camels increase useful capacity only',()=>{
 const r=res('x',[effect('YIELD_CULTURE',2)]),r2=res('y',[effect('YIELD_CULTURE',2)]),camel=res('camel',[],['a'],{bonusSlots:2});
 const out=planAllocation([r,r2,camel],[city('a')]);
 assert.equal(out.camel,'a');assert.equal(out.x,'a');assert.equal(out.y,'a');
 assert.equal(planAllocation([camel],[city('a')]).camel,undefined);
});
test('retain assigned resources on ties',()=>{
 const r=res('x',[effect('YIELD_CULTURE',2)],['a','b'],{original:'b'});
 assert.equal(planAllocation([r],[city('a'),city('b')]).x,'b');
});
test('groups preserve sort order inside connected city and town groups',()=>{
 const item=(name,isTown)=>({name,settlementNameData:{isTown}});
 const grouped=groupedSettlements([{cityResources:[item('b',true),item('c',false),item('a',true)]},{cityResources:[item('d',false)]}]);
 assert.deepEqual(grouped.map(g=>g.map(c=>c.name)),[['c'],['b','a'],['d']]);
});
test('shared settings preserve other mods and reject damaged JSON',()=>{
 let raw=JSON.stringify({other:{enabled:true}});const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 writeSettings({games:{seed:{city:'YIELD_CULTURE'}}},storage);
 assert.equal(JSON.parse(raw).other.enabled,true);assert.equal(readSettings(storage).games.seed.city,'YIELD_CULTURE');
 raw='{broken';assert.throws(()=>writeSettings({},storage));assert.equal(raw,'{broken');
});
test('existing camel can move when its new slots yield more overall',()=>{
 const camel=res('camel',[],['a','b'],{bonusSlots:2,original:'a'});
 const rs=[res('x',[effect('YIELD_CULTURE',10,{kind:'percent'})]),res('y',[effect('YIELD_CULTURE',10,{kind:'percent'})])];
 const out=planAllocation([...rs,camel],[city('a',{base:[0,0,0,0,1,0,0]}),city('b',{base:[0,0,0,0,100,0,0]})]);
 assert.equal(out.camel,'b');assert.equal(out.x,'b');assert.equal(out.y,'b');
});
test('percentage uses gross income before expenses and respects existing modifiers',()=>{
 const c=city('a',{base:[0,0,100,0,0,0,0],multiplier:[1,1,1.5,1,1,1,1],offset:[0,0,-140,0,0,0,0]});
 assert.equal(marginal(c,res('x',[effect('YIELD_GOLD',10,{kind:'percent'})])).score,10);
});
test('zero happiness and an irrelevant preference do not consume resources',()=>{
 const h=res('h',[effect('YIELD_HAPPINESS',6)]);
 assert.deepEqual(planAllocation([h],[city('a',{tendency:'YIELD_HAPPINESS'})]),{});
 const science=res('s',[effect('YIELD_SCIENCE',5)]);
 assert.deepEqual(planAllocation([science],[city('a')]),{});
});
test('unit production bonuses require a matching live build queue',()=>{
 const r=res('salt',[effect('YIELD_PRODUCTION',20,{kind:'construction',queue:{kind:'unit'}})]);
 const a=city('a',{tendency:'YIELD_PRODUCTION',base:[0,100,0,0,0,0,0],queue:{kind:'unit',tags:[]}});
 const b=city('b',{tendency:'YIELD_PRODUCTION',base:[0,200,0,0,0,0,0],queue:{kind:'building',tags:[]}});
 assert.equal(planAllocation([r],[a,b]).salt,'a');
 assert.equal(marginal(a,r).score,80);assert.equal(marginal(b,r).score,0);
});
test('happiness fill reserves original slots and prioritizes cities',()=>{
 const h=key=>res(key,[effect('YIELD_HAPPINESS',6)]);
 const a=city('a',{base:[0,0,0,0,0,-2,0]}),b=city('b',{isTown:true,base:[0,0,0,0,0,-10,0]});
 assert.equal(planHappiness([h('x')],[a,b]).x,'a');
 assert.equal(planHappiness([h('x')],[a,b],true).x,'b');
 const held=res('held',[effect('YIELD_HAPPINESS',6)],['a','b'],{original:'a'});
 const out=planHappiness([held,h('x')],[a,b]);
 assert.equal(out.held,'a');assert.equal(out.x,'b');
});
test('town happiness does not remove resources from cities or overfill towns',()=>{
 const r=res('held',[effect('YIELD_HAPPINESS',6)],['a','b'],{original:'a'});
 const a=city('a'),b=city('b',{isTown:true,base:[0,0,0,0,0,-10,0]});
 assert.deepEqual(planHappiness([r],[a,b],true),{held:'a'});
 const held=res('held',[effect('YIELD_HAPPINESS',6)],['b'],{original:'b'});
 const spare=res('spare',[effect('YIELD_HAPPINESS',20)],['b']);
 const out=planHappiness([held,spare],[a,b],true);
 assert.equal(Object.values(out).filter(x=>x==='b').length,1);
});
test('camel engine capacity includes its own slot plus the net bonus',()=>{
 const camel=res('camel',[],['a'],{bonusSlots:3});
 const rs=['x','y','z'].map(key=>res(key,[effect('YIELD_CULTURE',2)],['a']));
 const out=planAllocation([...rs,camel],[city('a')]);
 assert.equal(Object.values(out).filter(Boolean).length,4);
 assert.equal(out.camel,'a');
 const full=planAllocation([...rs.slice(0,2),camel],[city('a',{capacity:0})]);
 assert.equal(Object.values(full).filter(Boolean).length,3);
});

