import test from 'node:test';
import assert from 'node:assert/strict';
import {marginal,planAllocation,planAllocationAsync,planUtility,cityYieldVector} from '../ui/rp-planner.js';
const city=(extra={})=>({key:'a',base:[0,60,0,0,0,0,0],multiplier:[1,1.5,1,1,1,1,1],tags:{},capacity:5,productionRemaining:80,queue:{kind:'unit',tags:[]},...extra});
const resource=(key,amount,kind='flat')=>({key,allowed:['a','b'],effects:[{kind,amount,yield:'YIELD_PRODUCTION',...(kind==='construction'?{queue:{kind:'unit'}}:{})}]});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
for(const [base,R,add,expected] of [[60,80,2,0],[60,30,2,2],[78,80,5,3],[50,80,2,3],[52,80,4,2],[79,80,2,1]])test(`基础${base}、加成50%、剩余${R}：增加${add}基础锤计${expected}有效锤`,()=>{
 const c=city({base:[0,base,0,0,0,0,0],productionRemaining:R}),r=resource('r',add);
 const before=JSON.stringify(c);
 close(marginal(c,r).score,expected*4);
 close(marginal(c,r).yields[1],add*1.5);
 close(planUtility({r:'a'},[r],[c])-planUtility({},[r],[c]),expected*4);
 assert.equal(JSON.stringify(c),before);
 c.tendency={YIELD_PRODUCTION:2};close(marginal(c,r).score,expected*8);
 c.tendency={YIELD_PRODUCTION:0};assert.equal(marginal(c,r).score,0);
});
test('普通百分比、后乘百分比和固定盐加成使用同一浪费区间',()=>{
 for(const c of [city(),city({multiplier:Array(7).fill(1),postMultiplier:[1,1.5,1,1,1,1,1]}),city({multiplier:Array(7).fill(1),construction:50}),city({multiplier:Array(7).fill(1),productionRateOffset:30})]){
  assert.equal(marginal(c,resource('r',2)).score,0);
  c.productionRemaining=30;assert.equal(marginal(c,resource('r',2)).score,8);
  for(const kind of ['percent','construction'])assert.equal(marginal(c,resource('bonus',5,kind)).score,0,'百分比不能转成保留的基础锤');
 }
});
test('无百分比时完成前后的普通加锤均计收益，附加基础值也参与边界',()=>{
 for(const R of [30,80])close(marginal(city({multiplier:Array(7).fill(1),productionRemaining:R}),resource('r',2)).score,8);
 const c=city({base:[0,58,0,0,0,0,0],offset:[0,20,0,0,0,0,0]});
 close(marginal(c,resource('r',5)).score,12);
});
test('多份资源共用区间，移除的损失与加入的收益相反',()=>{
 const c=city({base:[0,78,0,0,0,0,0]}),rs=[resource('x',1),resource('y',5)];
 assert.equal(marginal(c,rs[0]).score,0);
 assert.equal(marginal(c,rs[1],[rs[0]]).score,16);
 const all={x:'a',y:'a'},one={x:'a'};
 assert.equal(planUtility(all,rs,[c])-planUtility(one,rs,[c]),marginal(c,rs[1],[rs[0]]).score);
 close(cityYieldVector(c,rs)[1],126);
});
test('未知、空值、字符串与无效剩余需求保留未截断估算',()=>{
 for(const productionRemaining of [undefined,null,'80',NaN,Infinity,-1]){
  const c=city({productionRemaining});close(marginal(c,resource('r',2)).score,12);
 }
});
test('自动分配选择有效收益城市，而非仅原始产量增长更大的浪费区间城市',()=>{
 const a=city(),b=city({key:'b',base:[0,10,0,0,0,0,0],multiplier:Array(7).fill(1)}),r=resource('r',2);
 assert.deepEqual(planAllocation([r],[a,b],'score'),{r:'b'});
});
test('多份单独零分但合计跨出区间时可以成组加入，容量和避免仍限制',async()=>{
 const c=city({base:[0,15,0,0,0,0,0],multiplier:[1,2,1,1,1,1,1],productionRemaining:30,capacity:3});
 const rs=[resource('x',2),resource('y',5),resource('z',10)];
 for(const r of rs)assert.equal(marginal(c,r).score,0);
 const plan=planAllocation(rs,[c],'score');
 assert.deepEqual(await planAllocationAsync(rs,[c],'score'),plan);
 assert.equal(Object.values(plan).filter(Boolean).length,3);
 assert.equal(planUtility(plan,rs,[c])-planUtility({},rs,[c]),8);
 c.capacity=2;assert.equal(Object.values(planAllocation(rs,[c],'score')).filter(Boolean).length,0);
 c.capacity=3;c.tendency={YIELD_PRODUCTION:0};assert.equal(Object.values(planAllocation(rs,[c],'score')).filter(Boolean).length,0);
});
