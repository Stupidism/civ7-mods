// Pure deterministic world model. No game APIs, wall clock, or DOM dependencies.
import {landRoutes} from './topology.js';
export const RULES = Object.freeze({decay:5,revoltPerPoint:0.02,peaceTurns:10,conquestPenalty:5,mergeBonus:10,mergeDuration:2});
export const DEFAULTS = Object.freeze({...RULES,mode:'balanced',smallRecovery:6.5,scalePressure:0.12,dynasticWear:0.018,fractureShock:6,renewal:28,grace:12,shockRecovery:1.2,acceptance:0.65,defense:1.15,mobilization:0.7,attrition:0.12,reinforce:0.035});
export function rng(seed=1){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
export function revoltProbability(h,rate=0.02){return clamp(-h*rate,0,1);}
export function cityStateType(s){
 const focus={PROJECT_TOWN_TRADE:'gold',PROJECT_TOWN_FISHING:'food',PROJECT_TOWN_GRANARY:'food',PROJECT_TOWN_PRODUCTION:'production',PROJECT_TOWN_RESORT:'diplomacy',PROJECT_TOWN_FORT:'military',PROJECT_TOWN_URBAN_CENTER:'science',PROJECT_TOWN_TEMPLE:'culture'};
 if(focus[s.focus])return focus[s.focus];
 const y=s.yields, scores={gold:Math.max(0,y.gold),food:2*Math.max(0,y.food),science:4*Math.max(0,y.science),culture:4*Math.max(0,y.culture),production:4*Math.max(0,y.production),diplomacy:8*(Math.max(0,y.diplomacy)+Math.max(0,y.happiness))};
 return Object.keys(scores).sort((a,b)=>scores[b]-scores[a]||a.localeCompare(b))[0];
}
export function validateInput(data){
 if(data.schemaVersion!==1||!Array.isArray(data.settlements)||!data.settlements.length)throw Error('Empty or unsupported world snapshot');
 const ids=new Set(),owners=new Set(data.players.map(p=>p.id));
 for(const s of data.settlements){if(ids.has(s.id)||!owners.has(s.owner))throw Error('Duplicate settlement or unknown owner');ids.add(s.id);for(const k of ['happiness','population','military','x','y'])if(!Number.isFinite(s[k]))throw Error('Invalid '+s.id+'.'+k);for(const k of ['gold','food','science','culture','production','happiness','diplomacy'])if(!Number.isFinite(s.yields[k]))throw Error('Invalid yield '+k);}
 for(const [a,b]of data.edges)if(a===b||!ids.has(a)||!ids.has(b))throw Error('Invalid border');
 for(const a of ids)for(const b of ids)if(!Number.isFinite(data.distances[a]?.[b]))throw Error('Missing engine distance');
 return true;
}
export function initialize(data,params={},seed=1){
 validateInput(data);const p={...DEFAULTS,...params};
 for(const[k,v]of Object.entries(p))if(k!=='mode'&&(!Number.isFinite(v)||v<0))throw Error('Invalid parameter '+k);
 if(!['balanced','baseline'].includes(p.mode)||!Number.isInteger(p.peaceTurns)||p.peaceTurns<1||!Number.isInteger(p.grace)||!Number.isInteger(p.mergeDuration)||p.mergeDuration<1||p.revoltPerPoint>1||p.attrition>0.5||p.acceptance>1||p.mobilization>1||p.reinforce>1)throw Error('Parameter outside model bounds');
 const cities=data.settlements.map(s=>({...s,yields:{...s.yields},buildings:(s.buildings??[]).map(b=>({...b})),owner:s.owner,origin:s.owner,baseH:s.happiness,relief:0,shock:0,buildingH:0,protectedUntil:0,purchased:[],military:s.military}));
 const nations=new Map(data.players.map(n=>[n.id,{...n,origin:n.id,parent:null,age:0,fatigue:0,peace:0,lastWar:0,bonuses:[],generation:0}]));
 const adjacency=new Map(cities.map(c=>[c.id,new Set()]));for(const[a,b]of data.edges){adjacency.get(a).add(b);adjacency.get(b).add(a);}
 const warAdjacency=new Map(cities.map(c=>[c.id,new Set()]));for(const[a,b]of (data.warEdges??(data.map?.tiles?landRoutes(data):data.edges))){warAdjacency.get(a).add(b);warAdjacency.get(b).add(a);}
 return{data,p,cities,nations,adjacency,warAdjacency,random:rng(seed),seed,round:0,serial:0,events:[],history:[],totalRevolts:0,totalConquests:0,totalMerges:0};
}
function members(w,id){return w.cities.filter(c=>c.owner===id);}
function alive(w){return [...new Set(w.cities.map(c=>c.owner))].map(id=>w.nations.get(id));}
export function happiness(w,c){const n=w.nations.get(c.owner);return c.baseH+c.buildingH+c.relief-c.shock-n.fatigue+sum(n.bonuses,b=>b.until>=w.round?b.amount:0);}
function power(w,id){return sum(members(w,id),c=>c.military+Math.sqrt(c.population)*3);}
function emit(w,type,fields){const e={round:w.round,type,...fields};w.events.push(e);return e;}
function chooseLeader(w,c,old){
 // Affinity is a transparent model configuration, not a claim about native AI.
 const affinities={gold:['LEADER_AMINA','LEADER_XERXES_THE_ACHAEMENID','LEADER_NAPOLEON_EMPEROR'],food:['LEADER_HATSHEPSUT','LEADER_PACHACUTI'],production:['LEADER_FRIEDRICH','LEADER_AUGUSTUS'],science:['LEADER_ADA_LOVELACE','LEADER_CONFUCIUS','LEADER_BENJAMIN_FRANKLIN'],culture:['LEADER_HIMIKO','LEADER_ASHOKA','LEADER_JOSE_RIZAL'],diplomacy:['LEADER_TECUMSEH','LEADER_LAFAYETTE','LEADER_ASHOKA'],military:['LEADER_ALEXANDER','LEADER_CHARLEMAGNE','LEADER_GENGHIS_KHAN']};
 const all=w.data.leaders??[],used=new Set(alive(w).map(n=>n.leader));const pool=all.filter(l=>l.id!==old.leader&&!used.has(l.id));
 const ranked=pool.sort((a,b)=>Number(!(affinities[cityStateType(c)]??[]).some(x=>a.id.startsWith(x)))-Number(!(affinities[cityStateType(c)]??[]).some(x=>b.id.startsWith(x)))||a.id.localeCompare(b.id));
 return ranked[0]??{id:null,name:'待分配领袖'};
}
function renew(w,c){if(w.p.mode==='baseline')return;c.relief=Math.max(c.relief,w.p.renewal-Math.min(0,c.baseH));c.shock=0;c.protectedUntil=w.round+w.p.grace;}
function makeNation(w,source,group){
 const old=w.nations.get(source.owner),id='f'+(++w.serial),leader=chooseLeader(w,source,old),count=members(w,old.id).length;
 const goldShare=old.gold*group.length/count;old.gold-=goldShare;
 w.nations.set(id,{...old,id,nativeId:null,name:source.name+(source.isCity?'国':'城邦'),leader:leader.id,leaderName:leader.name,civilization:old.civilization,parent:old.id,origin:old.origin,gold:goldShare,human:false,major:source.isCity,independent:!source.isCity,type:source.isCity?null:cityStateType(source),age:0,fatigue:0,peace:0,lastWar:w.round,bonuses:[],generation:old.generation+1});
 for(const c of group){c.owner=id;renew(w,c);}
 emit(w,'secede',{city:source.id,from:old.id,to:id,settlements:group.map(c=>c.id),leader:leader.id,cityStateType:source.isCity?null:cityStateType(source)});return id;
}
export function cityCatchment(w,source){
 const own=members(w,source.owner),cities=own.filter(c=>c.isCity);
 return own.filter(c=>c.id===source.id||!c.isCity&&cities.every(other=>other.id===source.id||w.data.distances[c.id][source.id]<w.data.distances[c.id][other.id]));
}
function borderNations(w,c){return [...new Set([...w.adjacency.get(c.id)].map(id=>w.cities.find(x=>x.id===id).owner))].filter(id=>id!==c.owner);}
function transferSingle(w,c,to){const from=w.nations.get(c.owner),target=w.nations.get(to),fraction=1/members(w,from.id).length,treasury=from.gold*fraction;from.gold-=treasury;target.gold+=treasury;c.owner=to;return treasury;}
function revolt(w,c,changed){
 const former=w.nations.get(c.owner);former.peace=0;w.totalRevolts++;
 if(c.isCity){const group=cityCatchment(w,c).filter(x=>!changed.has(x.id));makeNation(w,c,group);if(w.p.mode!=='baseline')former.fatigue+=w.p.fractureShock;for(const x of group)changed.add(x.id);return;}
 const neighbors=borderNations(w,c).sort((a,b)=>power(w,b)-power(w,a)||a.localeCompare(b));
 for(const id of neighbors){const n=w.nations.get(id),own=members(w,id),avg=sum(own,x=>happiness(w,x))/own.length;
  const willing=clamp(w.p.acceptance+avg/100-(own.length/Math.max(1,w.cities.length))*0.5,0.05,0.95);
  if(w.random()<willing){const from=c.owner,treasury=transferSingle(w,c,id);renew(w,c);n.bonuses.push({amount:w.p.mergeBonus,until:w.round+w.p.mergeDuration-1});changed.add(c.id);w.totalMerges++;emit(w,'merge',{city:c.id,from,to:id,treasury,bonus:w.p.mergeBonus,expires:w.round+w.p.mergeDuration});return;}
  emit(w,'reject',{city:c.id,by:id});
 }
 makeNation(w,c,[c]);changed.add(c.id);
}
function develop(w){
 for(const n of alive(w)){
  const own=members(w,n.id);n.age++;n.peace++;n.bonuses=n.bonuses.filter(b=>b.until>=w.round);
  // Small polities can govern locally; large states accumulate administrative strain.
  const recovery=w.p.smallRecovery-w.p.scalePressure*Math.max(0,own.length-1);
  n.fatigue=w.p.mode==='baseline'?0:Math.max(0,n.fatigue+w.p.decay-recovery+n.age*w.p.dynasticWear);
  n.gold+=sum(own,c=>Math.max(0,c.yields.gold)+(c.isCity?Math.max(0,c.yields.production):0));
  for(const c of own){
   if(w.p.mode==='baseline')c.baseH-=w.p.decay;
   if(w.p.mode!=='baseline'){c.shock=Math.max(0,c.shock-w.p.shockRecovery);c.relief=Math.max(0,c.relief-0.6);const capacity=c.population*2+Math.max(0,c.yields.production);c.military+=Math.max(0,capacity-c.military)*w.p.reinforce;}
  }
  // One real, finite happiness-building candidate per nation and round. No repeat purchases.
  const options=own.filter(c=>happiness(w,c)<5).flatMap(c=>c.buildings.filter(b=>!c.purchased.includes(b.type)&&b.cost<=n.gold).map(b=>({c,b}))).sort((a,b)=>b.b.happiness/b.b.cost-a.b.happiness/a.b.cost||a.c.id.localeCompare(b.c.id));
  if(options[0]){const{c,b}=options[0];n.gold-=b.cost;c.buildingH+=b.happiness;c.purchased.push(b.type);emit(w,'purchase',{city:c.id,by:n.id,building:b.type,cost:b.cost,happiness:b.happiness});}
 }
}
function fight(w,changed){
 // Shuffled order avoids giving low numbered leaders a systematic first strike.
 const order=alive(w).map(n=>({n,r:w.random()})).sort((a,b)=>a.r-b.r).map(x=>x.n);
 const engaged=new Set();
 for(const n of order){
  const own=members(w,n.id);if(!own.length||n.peace<w.p.peaceTurns||w.round-n.lastWar<w.p.peaceTurns||engaged.has(n.id))continue;
  const targets=w.cities.filter(c=>c.owner!==n.id&&!changed.has(c.id)&&own.some(s=>w.warAdjacency.get(s.id).has(c.id)));
  if(!targets.length)continue;
  targets.sort((a,b)=>power(w,a.owner)-power(w,b.owner)||a.military-b.military||a.id.localeCompare(b.id));const target=targets[0],defender=w.nations.get(target.owner);
  if(engaged.has(defender.id))continue;
  n.lastWar=w.round;engaged.add(n.id);engaged.add(defender.id);
  const atk=power(w,n.id)*w.p.mobilization,def=(target.military+Math.sqrt(target.population)*3+power(w,defender.id)*0.12)*w.p.defense;
  const won=atk*(0.85+0.3*w.random())>def;
  for(const c of own)c.military*=1-w.p.attrition;
  target.military*=1-w.p.attrition*(won?2:0.6);
  emit(w,'battle',{from:n.id,to:defender.id,city:target.id,attack:atk,defense:def,won});
  if(won){const from=target.owner,treasury=transferSingle(w,target,n.id);changed.add(target.id);target.protectedUntil=w.round+(w.p.mode==='baseline'?0:Math.floor(w.p.grace/2));for(const c of members(w,n.id))c.shock+=w.p.conquestPenalty;w.totalConquests++;emit(w,'conquer',{city:target.id,from,to:n.id,treasury});}
 }
}
export function snapshot(w,detail=true){
 const ns=alive(w),counts=ns.map(n=>members(w,n.id).length),N=w.cities.length,hhi=sum(counts,n=>(n/N)**2),max=Math.max(...counts);
 const s={round:w.round,nations:ns.length,fragmentation:1-hhi,effectiveNations:1/hhi,largestShare:max/N,revolts:w.totalRevolts,conquests:w.totalConquests,merges:w.totalMerges,meanHappiness:sum(w.cities,c=>happiness(w,c))/N,totalGold:sum(ns,n=>n.gold)};
 if(detail){s.settlements=w.cities.map(c=>({id:c.id,owner:c.owner,happiness:happiness(w,c),military:c.military,purchased:[...c.purchased]}));s.polities=ns.map(n=>({id:n.id,name:n.name,leader:n.leader,leaderName:n.leaderName,civilization:n.civilization,parent:n.parent,origin:n.origin,major:!!n.major,independent:!!n.independent,type:n.type??null,gold:n.gold,count:members(w,n.id).length}));}
 return s;
}
export function step(w,detail=true){
 w.round++;develop(w);const changed=new Set();
 // Snapshot revolt probabilities, then shuffle and resolve: no low-id advantage, no double transfer.
 const rolls=w.cities.map(c=>({c,owner:c.owner,p:c.protectedUntil>=w.round?0:revoltProbability(happiness(w,c),w.p.revoltPerPoint),r:w.random(),order:w.random()})).sort((a,b)=>a.order-b.order);
 for(const{c,owner,p,r}of rolls)if(!changed.has(c.id)&&c.owner===owner&&r<p)revolt(w,c,changed);
 fight(w,changed);const s=snapshot(w,detail);w.history.push(s);return s;
}
export function simulate(data,params={},seed=1,rounds=240,detail=true){
 const w=initialize(data,params,seed);w.history.push(snapshot(w,detail));for(let i=0;i<rounds;i++)step(w,detail);
 const eligible=w.history.filter(s=>s.round>=Math.min(10,rounds));
 const most=eligible.reduce((a,b)=>b.fragmentation>a.fragmentation?b:a),least=eligible.reduce((a,b)=>b.fragmentation<a.fragmentation?b:a);
 return{schemaVersion:1,seed,params:w.p,rounds,history:w.history,events:w.events,nations:[...w.nations.values()].map(n=>({id:n.id,origin:n.origin,parent:n.parent,leader:n.leader,leaderName:n.leaderName,civilization:n.civilization,name:n.name})),choices:{mostFragmented:most.round,leastFragmented:least.round},metrics:metrics(w.history,w.events)};
}
export function metrics(history,events=[]){
 // Hysteresis on largest territorial share ignores trivial singleton leader churn.
 const shares=history.map(s=>s.largestShare),threshold=0.08;let anchor=shares[0],trend=0,reversals=0,up=0,down=0;
 for(const x of shares.slice(1)){if(!trend){if(Math.abs(x-anchor)>=threshold){trend=Math.sign(x-anchor);anchor=x;}}else if(trend>0){if(x>anchor)anchor=x;else if(anchor-x>=threshold){up++;reversals++;trend=-1;anchor=x;}}else{if(x<anchor)anchor=x;else if(x-anchor>=threshold){down++;reversals++;trend=1;anchor=x;}}}
 const tail=history.slice(Math.floor(history.length/2)),final=history.at(-1),range=Math.max(...shares)-Math.min(...shares);
 let united=false,macroCycles=0;for(const s of history){if(s.largestShare>=0.30)united=true;if(united&&s.largestShare<=0.18){macroCycles++;united=false;}}
 return{reversals,cycles:Math.min(up,down),macroCycles,peakShare:Math.max(...shares),range,tailRange:Math.max(...tail.map(x=>x.largestShare))-Math.min(...tail.map(x=>x.largestShare)),finalNations:final.nations,finalLargestShare:final.largestShare,meanNations:sum(history,s=>s.nations)/history.length,meanLargestShare:sum(history,s=>s.largestShare)/history.length,revolts:final.revolts,conquests:final.conquests,merges:final.merges,meanHappiness:final.meanHappiness,battles:events.filter(e=>e.type==='battle').length};
}
export function interventionOptions(data,run,round){
 const state=run.history.find(s=>s.round===round);if(!state?.polities)throw Error('Detailed snapshot required');
 const original=data.players.find(p=>p.id===data.provenance.localPlayer);const retained=state.polities.find(n=>n.leader===original.leader&&n.civilization===original.civilization);
 return{round,preferred:retained?.id??null,options:retained?[retained]:state.polities.filter(n=>n.origin===original.id),fallback:state.polities,engineApplication:'unavailable-until-native-identity-and-transfer-apis-verified'};
}
