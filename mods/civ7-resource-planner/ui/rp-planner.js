// Pure allocation model. No game APIs or UI state in this module.
export const YIELDS = ['YIELD_FOOD','YIELD_PRODUCTION','YIELD_GOLD','YIELD_SCIENCE','YIELD_CULTURE','YIELD_HAPPINESS','YIELD_DIPLOMACY'];
export const WEIGHTS = [2,4,1,4,4,8,0];
const EPS = 1e-7;
export const resourceKey = r => `${r.isOffMap ? 'off' : 'plot'}:${r.value}`;
export const cityKey = c => `${c.id.owner}:${c.id.id}:${c.id.type ?? 0}`;

export function effectsFor(resource, city) {
  const flat = Array(7).fill(0), percent = Array(7).fill(0);
  let construction=0;
  for (const e of resource.effects || []) {
    if (e.town !== undefined && e.town !== city.isTown) continue;
    if (e.capital !== undefined && e.capital !== city.isCapital) continue;
    if (e.distant !== undefined && e.distant !== city.isDistantLands) continue;
    const i = YIELDS.indexOf(e.yield);
    if (i < 0) continue;
    if(e.kind==='construction') {
      const q=city.queue,filter=e.queue;
      if(!q||q.kind!==filter.kind||filter.type&&filter.type!==q.type||filter.class&&filter.class!==q.class||filter.domain&&filter.domain!==q.domain||filter.tag&&!q.tags.includes(filter.tag))continue;
      construction+=e.amount;
    } else if (e.kind === 'percent') percent[i] += e.amount;
    else flat[i] += e.amount * (e.tag ? (city.tags[e.tag] || 0) : 1);
  }
  return {flat, percent, construction};
}

export function cityYieldVector(city, resources) {
  const flat = Array(7).fill(0), percent = Array(7).fill(0);
  let construction=0;
  for (const r of resources) {
    const e = effectsFor(r, city);
    construction+=e.construction;
    for (let i=0;i<7;i++) { flat[i] += e.flat[i]; percent[i] += e.percent[i]; }
  }
  const result=city.base.map((b,i) => ((b + flat[i]) * (city.multiplier[i] + percent[i]/100) + (city.offset?.[i]||0)) * (city.postMultiplier?.[i]??1));
  result[1]*=1+construction/100;
  return result;
}

export function utility(values) {
  return values.reduce((sum, v, i) => sum + (i === 5 ? Math.min(0,v)*8 : v*WEIGHTS[i]), 0);
}

export function marginal(city, resource, assigned = []) {
  const before = cityYieldVector(city, assigned);
  const after = cityYieldVector(city, [...assigned,resource]);
  return { score: utility(after)-utility(before), yields: after.map((v,i)=>v-before[i]) };
}

function permitted(r,c,mode) {
  if (!r.allowed.includes(c.key)) return false;
  const m=marginal(c,r);
  if (mode === 'happiness') return cityYieldVector(c,[])[5]<0 && m.yields[5]>EPS;
  return (c.tendency && m.yields[YIELDS.indexOf(c.tendency)]>EPS) || r.original === c.key;
}

// Maximum-weight bipartite allocation, with reverse edges to undo early choices.
// Unlike sorting pairs greedily, this can reserve the sole legal slot of a resource.
function* matching(resources,cities,mode,eligible) {
  const source=0, ro=1, co=ro+resources.length, sink=co+cities.length;
  const graph=Array.from({length:sink+1},()=>[]);
  const add=(u,v,cap,cost,data)=>{
    const edge={v,cap,cost,rev:graph[v].length,data};
    graph[u].push(edge); graph[v].push({v:u,cap:0,cost:-cost,rev:graph[u].length-1});
  };
  resources.forEach((r,ri)=>{
    add(source,ro+ri,1,0);
    cities.forEach((c,ci)=>{
      if (!eligible(r,c)) return;
      const value=marginal(c,r).score;
      if(value>EPS || r.original===c.key) add(ro+ri,co+ci,1,-value-(r.original===c.key?1e-8:0),{ri,ci});
    });
  });
  cities.forEach((c,i)=>add(co+i,sink,Math.max(0,c.capacity),0));
  for(let iteration=0;iteration<resources.length;iteration++) {
    yield;
    const dist=Array(graph.length).fill(Infinity), prev=Array(graph.length); dist[source]=0;
    // Bellman-Ford works with negative costs; the residual network has no negative cycles.
    for(let pass=0;pass<graph.length-1;pass++) {
      let changed=false;
      graph.forEach((edges,u)=>{if(!Number.isFinite(dist[u]))return; edges.forEach((e,ei)=>{
        if(e.cap>0 && dist[e.v]>dist[u]+e.cost+1e-10) {dist[e.v]=dist[u]+e.cost;prev[e.v]=[u,ei];changed=true;}
      });});
      if(!changed)break;
    }
    if(!prev[sink] || dist[sink]>=-1e-10)break;
    for(let v=sink;v!==source;) {const [u,ei]=prev[v],e=graph[u][ei];e.cap--;graph[v][e.rev].cap++;v=u;}
  }
  const result={};
  resources.forEach((r,i)=>{const edge=graph[ro+i].find(e=>e.data&&e.cap===0);if(edge)result[r.key]=cities[edge.data.ci].key;});
  return result;
}

export function planUtility(assignment, resources,cities) {
  return cities.reduce((sum,c)=>sum+utility(cityYieldVector(c,resources.filter(r=>assignment[r.key]===c.key))),0);
}

function* improve(assignment,resources,cities,mode,eligible) {
  const byCity=new Map(cities.map(c=>[c.key,c]));
  // Eligibility and resource effects are invariant during one plan. Cache them
  // locally; never reuse live-game data across runs.
  const effects=new Map(cities.map(c=>[c.key,new Map(resources.map(r=>[r.key,effectsFor(r,c)]))]));
  const value=(key,held)=>{
    if(!key)return 0;
    const c=byCity.get(key),flat=Array(7).fill(0),percent=Array(7).fill(0);let construction=0;
    for(const r of held){const e=effects.get(key).get(r.key);construction+=e.construction;for(let i=0;i<7;i++){flat[i]+=e.flat[i];percent[i]+=e.percent[i];}}
    const vector=c.base.map((b,i)=>((b+flat[i])*(c.multiplier[i]+percent[i]/100)+(c.offset?.[i]||0))*(c.postMultiplier?.[i]??1));
    vector[1]*=1+construction/100;return utility(vector);
  };
  for(const r of resources) {
    const key=assignment[r.key],held=resources.filter(x=>assignment[x.key]===key);
    if(key && r.original!==key && marginal(byCity.get(key),r,held.filter(x=>x.key!==r.key)).score<=EPS)delete assignment[r.key];
  }
  for(let pass=0;pass<resources.length*2+4;pass++) {
    // Build membership once per pass instead of scanning every resource for
    // every possible move and swap.
    const held=new Map(cities.map(c=>[c.key,[]]));
    for(const r of resources)if(assignment[r.key])held.get(assignment[r.key]).push(r);
    const current=new Map(cities.map(c=>[c.key,value(c.key,held.get(c.key))]));
    const trial=(key,remove,add)=>key?value(key,[...held.get(key).filter(r=>r!==remove),...(add?[add]:[])]):0;
    let bestGain=EPS,best;
    for(let i=0;i<resources.length;i++) {
      yield;
      const a=resources[i],from=assignment[a.key];
      for(const c of [...cities,null]) {
        const to=c?.key;
        if(from===to || (c&&(!eligible(a,c)||held.get(to).length>=c.capacity)))continue;
        const gain=trial(from,a,null)+trial(to,null,a)-(current.get(from)||0)-(current.get(to)||0);
        if(gain>bestGain){bestGain=gain;best=[a.key,to];}
      }
      for(let j=i+1;j<resources.length;j++) {
        const b=resources[j],to=assignment[b.key];
        if(from===to || (to&&!eligible(a,byCity.get(to))) || (from&&!eligible(b,byCity.get(from))))continue;
        const gain=trial(from,a,b)+trial(to,b,a)-(current.get(from)||0)-(current.get(to)||0);
        if(gain>bestGain){bestGain=gain;best=[a.key,to,b.key,from];}
      }
    }
    if(!best)break;
    assignment[best[0]]=best[1];if(best.length>2)assignment[best[2]]=best[3];
  }
  return assignment;
}

function* allocationSteps(resources,cities,mode='tendency') {
  const eligibility=new Map(cities.map(c=>[c.key,new Map(resources.map(r=>[r.key,permitted(r,c,mode)]))]));
  const eligible=(r,c)=>eligibility.get(c.key).get(r.key);
  const normal=resources.filter(r=>!r.bonusSlots);
  const camels=resources.filter(r=>r.bonusSlots>0);
  const state=cities.map(c=>({...c}));
  const camelAssignments={};
  for(const camel of camels)if(camel.original&&state.some(c=>c.key===camel.original)) {
    camelAssignments[camel.key]=camel.original;
    state.find(c=>c.key===camel.original).capacity+=camel.bonusSlots-1;
  }
  let assignment=yield* improve(yield* matching(normal,state,mode,eligible),normal,state,mode,eligible);
  for(const camel of camels) {
    let best, bestValue=planUtility(assignment,normal,state);
    const from=camelAssignments[camel.key],source=state.find(c=>c.key===from);
    for(const c of state) {
      if(c.key===from || !camel.allowed.includes(c.key) || (mode==='tendency'&&!c.tendency) || c.capacity<0)continue;
      if(source && source.capacity<camel.bonusSlots-1)continue;
      if(source)source.capacity-=camel.bonusSlots-1;
      c.capacity += camel.bonusSlots-1;
      const next=yield* improve(yield* matching(normal,state,mode,eligible),normal,state,mode,eligible);
      const value=planUtility(next,normal,state);
      c.capacity -= camel.bonusSlots-1;
      if(source)source.capacity+=camel.bonusSlots-1;
      if(value>bestValue+EPS) {bestValue=value;best={key:c.key,next};}
    }
    if(best) {if(source)source.capacity-=camel.bonusSlots-1;camelAssignments[camel.key]=best.key;state.find(c=>c.key===best.key).capacity+=camel.bonusSlots-1;assignment=best.next;}
  }
  const result={...assignment,...camelAssignments};
  if(mode==='tendency') {
    const previous=Object.fromEntries(resources.filter(r=>r.original).map(r=>[r.key,r.original]));
    if(planUtility(result,resources,cities)<=planUtility(previous,resources,cities)+EPS)return previous;
  }
  return result;
}

// The same iterator drives deterministic offline tests and cooperative UI work.
export function planAllocation(resources,cities,mode='tendency') {
  const steps=allocationSteps(resources,cities,mode);let next;
  do{next=steps.next();}while(!next.done);return next.value;
}
export async function planAllocationAsync(resources,cities,mode='tendency',{shouldContinue=()=>true}={}) {
  const steps=allocationSteps(resources,cities,mode);let deadline=performance.now()+8;
  const check=()=>{if(!shouldContinue()){steps.return();throw new Error('LOC_RP_CONTEXT_CHANGED');}};
  check();
  for(;;){
    const next=steps.next();if(next.done)return next.value;
    if(performance.now()>=deadline){
      await new Promise(resolve=>setTimeout(resolve,0));check();deadline=performance.now()+8;
    }
  }
}

export function groupedSettlements(sections) {
  const connected=sections[0]?.cityResources || [];
  return [connected.filter(c=>!c.settlementNameData.isTown),connected.filter(c=>c.settlementNameData.isTown),sections[1]?.cityResources||[]];
}

// Happiness filling keeps all occupied slots reserved, then adds or moves one
// resource at a time. This avoids overbooking slots when an existing resource
// has no better destination. City priority is explicit, rather than a score bias.
export function planHappiness(resources,cities,townsOnly=false) {
  const assignment=Object.fromEntries(resources.filter(r=>r.original).map(r=>[r.key,r.original]));
  const at=key=>resources.filter(r=>assignment[r.key]===key);
  const byKey=new Map(cities.map(c=>[c.key,c]));
  const groups=townsOnly?[cities.filter(c=>c.isTown)]:[cities.filter(c=>!c.isTown),cities.filter(c=>c.isTown)];
  const protectedResources=new Set();
  for(const targets of groups) {
    for(let pass=0;pass<resources.length*cities.length;pass++) {
      let best,bestGain=EPS;
      for(const c of targets) {
        const held=at(c.key);
        if(held.length>=c.capacity || cityYieldVector(c,held)[5]>=-EPS)continue;
        for(const r of resources) {
          const from=assignment[r.key];
          if(from===c.key||protectedResources.has(r.key)||!r.allowed.includes(c.key))continue;
          // Town-only mode never removes a resource from a city.
          if(townsOnly&&from&&!byKey.get(from).isTown)continue;
          const gain=marginal(c,r,held);
          if(gain.yields[5]<=EPS)continue;
          const donor=from?byKey.get(from):undefined;
          const cost=donor?marginal(donor,r,at(from).filter(x=>x.key!==r.key)).score:0;
          if(gain.score-cost>bestGain){bestGain=gain.score-cost;best={r,to:c.key};}
        }
      }
      if(!best)break;
      assignment[best.r.key]=best.to;
    }
    for(const r of resources)if(targets.some(c=>assignment[r.key]===c.key))protectedResources.add(r.key);
  }
  return assignment;
}
