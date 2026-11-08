import test from 'node:test';
import assert from 'node:assert/strict';
import {cyclePreference,normalizePreferences,hasPreferences,utility,marginal,planUtility,planAllocation} from '../ui/rp-planner.js';
const city=(key,tendency,extra={})=>({key,tendency,base:[0,0,0,0,0,-3,0],multiplier:Array(7).fill(1),capacity:2,tags:{},...extra});
const resource=(key,effects,extra={})=>({key,allowed:['a','b'],effects:effects.map(([yieldType,amount])=>({yield:yieldType,amount,kind:'flat'})),...extra});
test('legacy marks migrate and each yield cycles independently without mutating persisted data',()=>{
 const original='YIELD_FOOD';
 const a=cyclePreference(original,'YIELD_SCIENCE');
 assert.deepEqual(a,{YIELD_FOOD:2,YIELD_SCIENCE:2});
 const b=cyclePreference(a,'YIELD_FOOD');assert.deepEqual(b,{YIELD_FOOD:0,YIELD_SCIENCE:2});
 assert.equal(a.YIELD_FOOD,2);
 const c=cyclePreference(b,'YIELD_FOOD');assert.deepEqual(c,{YIELD_SCIENCE:2});
 assert.deepEqual(cyclePreference(c,'YIELD_FOOD'),a);
 assert.equal(hasPreferences({YIELD_FOOD:0}),true);assert.equal(hasPreferences({}),false);
 assert.deepEqual(normalizePreferences({bad:2,YIELD_GOLD:3,YIELD_FOOD:0}),{YIELD_FOOD:0});
});
test('prefer and avoid multiply each original contribution rather than the complete resource score',()=>{
 const v=[2,3,4,5,6,-3,7];
 assert.equal(utility(v),40);
 assert.equal(utility(v,{YIELD_FOOD:2,YIELD_SCIENCE:2,YIELD_CULTURE:0}),40);
 const r=resource('r',[['YIELD_FOOD',2],['YIELD_SCIENCE',5],['YIELD_CULTURE',6]]);
 const c=city('a',{YIELD_FOOD:2,YIELD_SCIENCE:2,YIELD_CULTURE:0});
 assert.equal(marginal(c,r).score,48);
 assert.equal(planUtility({r:'a'},[r],[c])-planUtility({},[r],[c]),48);
});
test('avoided-only yields do not attract resources; mixed resources retain non-avoided contributions',()=>{
 const c=city('a',{YIELD_SCIENCE:0});
 const pure=resource('science',[['YIELD_SCIENCE',20]]);
 const mixed=resource('mixed',[['YIELD_SCIENCE',20],['YIELD_GOLD',2]]);
 assert.deepEqual(planAllocation([pure,mixed],[c]),{mixed:'a'});
 assert.deepEqual(planAllocation([pure],[city('a',undefined)]),{});
});
test('different multi-preference factors change global assignment, including iterative refinement',()=>{
 const rs=[resource('food',[['YIELD_FOOD',5]]),resource('science',[['YIELD_SCIENCE',4]])];
 const a=city('a',{YIELD_FOOD:2,YIELD_SCIENCE:0},{capacity:1});
 const b=city('b',{YIELD_SCIENCE:2,YIELD_FOOD:0},{capacity:1});
 assert.deepEqual(planAllocation(rs,[a,b]),{food:'a',science:'b'});
 assert.deepEqual(planAllocation(rs,[{...a,tendency:b.tendency},{...b,tendency:a.tendency}]),{food:'b',science:'a'});
});
test('happiness still clips at zero before the preference multiplier',()=>{
 const r=resource('h',[['YIELD_HAPPINESS',6]]);
 assert.equal(marginal(city('a',{YIELD_HAPPINESS:2}),r).score,48);
 assert.equal(marginal(city('a',{YIELD_HAPPINESS:0}),r).score,0);
 assert.equal(marginal(city('a',{YIELD_HAPPINESS:2},{base:Array(7).fill(0)}),r).score,0);
});
test('avoid does not forcibly strip an already assigned resource with no improving destination',()=>{
 const r=resource('r',[['YIELD_SCIENCE',5]],{original:'a'});
 assert.deepEqual(planAllocation([r],[city('a',{YIELD_SCIENCE:0})]),{r:'a'});
});
