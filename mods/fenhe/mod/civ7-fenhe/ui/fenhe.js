import {initialize,step,snapshot,interventionOptions} from '../sim/engine.js';
import config from '../sim/config.js';
import {captureWorld} from './snapshot.js';
import {ContextManager} from '/core/ui/context-manager/context-manager.js';
import Cursor from '/core/ui/input/cursor.js';

const KEY='__fenheV1';globalThis[KEY]?.destroy?.();
let panel=null,run=null,world=null,index=0,busy=false,cancelled=false,button=null,mountTimer=null,importing=false;
const actions=new Map();
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
const css=el('style');css.textContent=`
.fh-launch{color:#ead9a6;padding:0 .5rem;min-width:2.7rem;cursor:pointer;font-family:BodyFont-SC,BodyFont;}
.fh-overlay{position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;z-index:9000;background:#08111be8;display:flex;align-items:center;justify-content:center;pointer-events:auto;font-family:BodyFont-SC,BodyFont;}
.fh-card{width:80vw;max-width:78rem;height:83vh;padding:1.5rem;color:#eee1c8;background:#142430;border:1px solid #a18858;display:flex;flex-direction:column;}
.fh-title{font-family:TitleFont,BodyFont-SC;font-size:1.8rem;color:#e7c982;text-align:center;}
.fh-sub{font-size:.85rem;text-align:center;color:#aeb9bd;margin:.4rem 0 .7rem;}
.fh-controls{display:flex;justify-content:center;align-items:center;gap:.7rem;margin:.6rem 0;}
.fh-controls fxs-button{min-width:8rem;}
.fh-metrics{font-size:1.05rem;text-align:center;color:#efd4a0;margin:.5rem;}
.fh-chart{height:6rem;display:flex;align-items:flex-end;border-bottom:1px solid #6b695c;margin:0 .7rem;}
.fh-bar{flex:1;min-width:1px;background:#a9935d;margin-right:1px;}
.fh-selected{background:#e2c16e;}
.fh-details{flex:1;overflow-y:auto;font-size:.95rem;line-height:1.65;border-top:1px solid #52616a;padding:.6rem;margin-top:.6rem;}
.fh-note{color:#b7c1c4;font-size:.85rem;line-height:1.4;}
`;document.head.appendChild(css);
function nativeButton(label,id,fn){const n=el('fxs-button');n.setAttribute('caption',label);n.setAttribute('data-fh-action',id);n.setAttribute('tabindex','0');actions.set(id,fn);return n;}
function close(){if(importing)return;cancelled=true;panel?.remove();panel=null;actions.clear();}
function open(){if(panel)return;cancelled=false;panel=el('div','fh-overlay');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');const card=el('fxs-frame','fh-card');card.setAttribute('frame-style','f1');card.setAttribute('override-styling','relative flex flex-col pointer-events-auto');card.appendChild(el('div','fh-title','分 合'));card.appendChild(el('div','fh-sub','天下分久必合，合久必分 · 世界接入实验版'));panel.appendChild(card);document.body.appendChild(panel);
 const control=el('div','fh-controls');control.appendChild(nativeButton('推演当前世界','run',()=>start()));control.appendChild(nativeButton('关闭','close',close));card.appendChild(control);card.appendChild(el('div','fh-metrics','读取当前世界后，在独立模型中推演 600 轮。'));
 card.appendChild(el('div','fh-chart'));const nav=el('div','fh-controls');nav.appendChild(nativeButton('前十轮','prev',()=>select(index-10)));nav.appendChild(nativeButton('最分裂','max',()=>select(run?.choices.mostFragmented??0)));nav.appendChild(nativeButton('最统一','min',()=>select(run?.choices.leastFragmented??0)));nav.appendChild(nativeButton('后十轮','next',()=>select(index+10)));card.appendChild(nav);card.appendChild(el('div','fh-details'));card.appendChild(el('div','fh-note','选择国家可交给本地接入器重建新时代；会先保存独立备份。接入器需保持运行。'));if(run)render();}
async function start(){if(busy)return;busy=true;cancelled=false;const label=panel?.querySelector('.fh-metrics');try{world=captureWorld();const w=initialize(world,config,7013);w.history.push(snapshot(w));const started=Date.now();for(let n=0;n<600;n++){if(cancelled)break;step(w);if(n%6===0){if(label)label.textContent=`推演第 ${n+1} / 600 轮 · ${world.settlements.length} 个定居点`;await new Promise(r=>setTimeout(r,0));}}if(cancelled)return;const eligible=w.history.filter(s=>s.round>=10),most=eligible.reduce((a,b)=>b.fragmentation>a.fragmentation?b:a),least=eligible.reduce((a,b)=>b.fragmentation<a.fragmentation?b:a);run={history:w.history,events:w.events,choices:{mostFragmented:most.round,leastFragmented:least.round},elapsedMs:Date.now()-started};index=most.round;render();console.log('[Fenhe] complete '+JSON.stringify({rounds:600,settlements:world.settlements.length,elapsedMs:run.elapsedMs,choices:run.choices}));}catch(e){if(label)label.textContent='推演失败：'+e.message;console.error('[Fenhe] '+e.stack);}finally{busy=false;}}
function select(n){if(!run)return;index=Math.max(0,Math.min(run.history.length-1,n));render();}
function render(){if(!panel||!run)return;const s=run.history[index];panel.querySelector('.fh-metrics').textContent=`第 ${index} 轮 / ${run.history.length-1}　${s.nations} 个势力　最大版图 ${Math.round(s.largestShare*100)}%　分裂度 ${(s.fragmentation*100).toFixed(1)}%`;
 const chart=panel.querySelector('.fh-chart');chart.textContent='';for(let i=0;i<run.history.length;i+=6){const b=el('div','fh-bar'+(Math.abs(i-index)<6?' fh-selected':''));b.style.height=Math.max(2,run.history[i].largestShare*100)+'%';chart.appendChild(b);}
 const detail=panel.querySelector('.fh-details');detail.textContent='';detail.appendChild(el('div','fh-note','图：最大势力占全部定居点比例。模拟种子 7013，统一后仍会积累治理压力。'));
 const choice=interventionOptions(world,run,index);const own=choice.preferred?choice.options:choice.options.length?choice.options:choice.fallback;
 detail.appendChild(el('div',null,choice.preferred?'原领袖与文明组合尚存，可保留控制：':'原组合已消失，可选衍生势力：'));
 for(const key of actions.keys())if(key.startsWith('take-'))actions.delete(key);
 for(const n of own){detail.appendChild(el('div',null,`${n.name} · ${n.leaderName} · ${n.count} 个定居点 · ${Math.floor(n.gold)} 金`));if(n.major)detail.appendChild(nativeButton('接管 '+n.name+' · 进入新时代','take-'+n.id,()=>requestIntervention(n.id)));}
 detail.appendChild(el('div','fh-note','本轮事件'));const events=run.events.filter(e=>e.round===index&&['secede','merge','conquer'].includes(e.type));for(const e of events.slice(0,8)){const name=world.settlements.find(c=>c.id===e.city)?.name??e.city;detail.appendChild(el('div',null,name+'：'+({secede:'宣布独立',merge:'投奔邻国',conquer:'被吞并'}[e.type])));}if(!events.length)detail.appendChild(el('div',null,'休养与积累。'));}
function setStatus(message){const node=panel?.querySelector('.fh-metrics');if(node)node.textContent=message;}
function requestIntervention(faction){
 if(busy||!run||!world)return;
 if(!(globalThis[KEY].bridgeReadyUntil>Date.now())){setStatus('请先运行分合文件夹中的“启动世界接入器.ps1”，再选择介入国家。');return;}
 if(Game.turn!==world.provenance.turn){setStatus('回合已经变化，请重新推演当前世界。');return;}
 const token='R'+index+'_'+Date.now();
 globalThis[KEY].pending={token,world,round:index,state:run.history[index],faction};
 setStatus('已选择介入方案，正在备份并接入新时代……');
}
function mount(){
 const phase=Configuration.getGame().getValue('FenheImportPhase');
 if(phase==='INIT'&&!importing){close();importing=true;panel=el('div','fh-overlay');const card=el('div','fh-card');card.appendChild(el('div','fh-title','分合 · 正在建立新时代'));card.appendChild(el('div','fh-metrics','正在移交城镇、登记城邦首都并核对版图，请稍候。'));card.appendChild(el('div','fh-note','核对完成后会自动保存并重新载入。接入器需要保持运行。'));panel.appendChild(card);document.body.appendChild(panel);}
 if(phase!=='INIT'&&importing){importing=false;close();}
 const bar=document.querySelector('panel-system-bar');if(!bar||button?.isConnected)return;button=el('fxs-activatable','fh-launch','分合');button.setAttribute('data-tooltip-content','分合：推演天下兴亡');button.setAttribute('tabindex','0');button.addEventListener('action-activate',open);bar.appendChild(button);
}
const previousInput=ContextManager.handleInput;
function input(event){if(!panel)return previousInput.call(this,event);const d=event.detail;if(d?.status===InputActionStatuses.FINISH){if(['mousebutton-left','touch-tap','accept','keyboard-enter'].includes(d.name)){const target=d.isTouch?document.elementFromPoint(d.x,d.y):Cursor.target;const btn=target?.closest?.('[data-fh-action]');if(btn&&panel.contains(btn))actions.get(btn.getAttribute('data-fh-action'))?.();}else if(['cancel','keyboard-escape'].includes(d.name))close();}event.preventDefault();return false;}
ContextManager.handleInput=input;mount();mountTimer=setInterval(mount,2500);
function destroy(){importing=false;close();clearInterval(mountTimer);button?.remove();css.remove();if(ContextManager.handleInput===input)ContextManager.handleInput=previousInput;}
globalThis[KEY]={open,close,start,select,captureWorld,destroy,setStatus,requestIntervention,bridgeReadyUntil:0,pending:null,get run(){return run;},get world(){return world;},get busy(){return busy;}};
console.log('[Fenhe] 0.2.0 loaded');

