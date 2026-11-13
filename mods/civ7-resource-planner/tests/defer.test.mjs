import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readSettings,writeSettings} from '../ui/rp-settings.js';
import {createDeferralState,createHold,wrap} from '../ui/rp-defer-runtime.js';

test('defer intent resets on turn/player/game scope and explicit skip dismisses',()=>{
 let scope='game:player:turn1';const s=createDeferralState(()=>scope);
 assert.equal(s.mode(),null);s.defer();assert.ok(s.pending());s.dismiss();assert.equal(s.mode(),'closed');
 s.defer();scope='game:player:turn2';assert.equal(s.pending(),false);assert.equal(s.mode(),null);
 s.defer();scope='other:player:turn2';assert.equal(s.mode(),null);
});
for(const duration of [0,999,1000,1800])test(`Cancel ${duration}ms fires exactly one short/long action`,()=>{
 let now=0,short=0,long=0;const h=createHold({allowed:()=>true,scope:()=>1,now:()=>now,short:()=>short++,long:()=>long++});
 assert.equal(h.input('finish'),false);assert.equal(h.input('start'),true);h.input('start');now=duration;h.input('hold');h.input('finish');
 assert.equal(short,duration<1000?1:0);assert.equal(long,duration>=1000?1:0);assert.equal(h.input('finish'),false);
});
for(const change of ['cancel','scope','blocked'])test(`Cancel interrupted by ${change} never closes or defers`,()=>{
 let scope=1,allowed=true,now=0;const h=createHold({allowed:()=>allowed,scope:()=>scope,now:()=>now,short:assert.fail,long:assert.fail});
 h.input('start');now=1500;if(change==='cancel')h.cancel();if(change==='scope')scope++;if(change==='blocked')allowed=false;
 assert.equal(h.input('finish'),true);
});
function fixture({storage}={}){
 let turn=1,blockers=0,units=false,completed=false;const microtasks=[],events=new Map(),calls=[];
 class Panel {constructor(){this.Root={isConnected:true,classList:{add(){}}};this.pleaseWaitAnimation={stop(){}};this.notificationIcon={style:{}};this.actionText={innerHTML:''};this.actionButton={setAttribute(){}};}
 refreshActionButton(){calls.push('refresh');if(this.canEndTurn())this.sendEndTurn();}showRemainingMovesState(){return units;}canEndTurn(){return blockers===0&&!units;}sendEndTurn(){calls.push('end');}activateBlockingNotification(){calls.push('native');}updatePlayerFocus(){calls.push('focus');}onEngineInput(event){if(event.detail.name==='force-end-turn')this.sendEndTurn();}onDetach(){} }
 const context={requestAnimationFrame:()=>1,cancelAnimationFrame(){},InputActionStatuses:{FINISH:3},PanelAction:Panel,createDeferralState,createHold,wrap,queueMicrotask:fn=>microtasks.push(fn),Configuration:{getGame:()=>({gameSeed:1,isPaused:false})},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>completed},Game:{age:1,get turn(){return turn;},Notifications:{getEndTurnBlockingType:()=>blockers}},EndTurnBlockingTypes:{NONE:0},UI:{isInGame:()=>true,getIconURL:()=> 'resource'},Players:{get:()=>({isTurnActive:true})},Autoplay:{isActive:false},ContextManager:{push:()=>calls.push('open')},Locale:{stylize:k=>k,compose:k=>k},engine:{on:(e,f)=>events.set(e,f),off:e=>events.delete(e)}};
 if(storage){context.readSettings=()=>readSettings(storage);context.writeSettings=value=>writeSettings(value,storage);context.console={error(){}};}
 const source=readFileSync(new URL('../ui/rp-defer.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const get=vm.runInNewContext(source+';resourceDeferral',context),service=get(),p=new Panel();
 return {p,service,calls,context,get,flush(){while(microtasks.length)microtasks.shift()();},turn(){turn++;},block(v){blockers=v;},units(v){units=v;},completed(v){completed=v;}};
}
test('standalone reminder stays after blockers and units, opens once at tail, never auto-ends',()=>{
 const f=fixture();f.service.defer();f.block(1);f.p.refreshActionButton(0);f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'native');
 f.block(0);f.units(true);f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'native');
 f.units(false);f.p.refreshActionButton(0);assert.equal(f.p.actionText.innerHTML,'LOC_RP_DEFER_PENDING');f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'open');
 assert.equal(f.p.canEndTurn(),false);f.p.sendEndTurn();assert.ok(!f.calls.includes('end'));
 f.service.dismiss();f.flush();assert.equal(f.p.canEndTurn(),true);assert.ok(!f.calls.includes('end'),'display refresh cannot finish the turn');
 f.service.dispose();
});
test('controller reminder consumer owns display; releasing it restores standalone fallback',()=>{
 const f=fixture(),release=f.service.claim({});f.service.defer();f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'native');
 assert.equal(f.p.canEndTurn(),false);release();f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'open');
 f.turn();assert.equal(f.service.pending(),false);f.service.dispose();
});
test('正常关闭统一延后；明确跳过后关闭不重新提醒',()=>{
 const source=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-model.js',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('  const deferredReminder='),source.indexOf('  onMount(() => {',source.indexOf('  const deferredReminder=')));
 for(const defer of [false,true,"skip"]){let cleanup,ack=0;const service=createDeferralState(()=>1);service.scope=()=>1;
 const actions=vm.runInNewContext(block+';({defer(){deferredReminder.defer();}})',{resourceDeferral:()=>service,onCleanup:fn=>cleanup=fn,sendConsideredAssigningResources:()=>ack++});
 if(defer===true)actions.defer();if(defer==="skip")service.dismiss();cleanup();assert.equal(ack,1);assert.equal(service.mode(),defer==='skip'?'closed':'deferred');}
});
test('independent action-order reminder respects ordinary close and queues deferred resources after policies',()=>{
 const source=readFileSync(new URL('./fixtures/legacy-compat/civ7-action-order/ui/card-reminders.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  function active('),source.indexOf('  function open('));let intent=null;
 const api=vm.runInNewContext(code+';({active,tail})',{localTurn:()=>true,state:()=>({resources:true,policies:true}),skips:{has:()=>false},resourceIntent:()=>intent,kind:i=>i.kind});
 assert.equal(api.tail([]).card,'resources');intent='deferred';assert.equal(api.tail([]).card,'policies');intent='closed';assert.deepEqual(Array.from(api.active()),['policies']);
});

test('B/Cancel 保持原生路径；跳过资格跟随页面、输入锁和正在放置资源状态',()=>{
 let eligible=true,selected=-1,busy=false;const sent=[],windows=new Map();
 const root={isConnected:true,querySelector:()=>({getBoundingClientRect:()=>({width:64})})};
 const model={resourceActionBusy:()=>busy,selectedResource:()=>({resourceValue:selected})};
 const handler={onEngineInput:(...a)=>sent.push(a)},original=handler.onEngineInput;
 const code=readFileSync(new URL('../ui/rp-defer.js',import.meta.url),'utf8');
 const body=code.slice(code.indexOf('export function installDeferInput')).replace('export ','');
 const install=vm.runInNewContext(body+';installDeferInput',{
 resourceDeferral:()=>({}),ActionHandler:handler,
 document:{hidden:false,querySelector:()=>null},ContextManager:{getCurrentTarget:()=>eligible?root:{}},ViewManager:{isViewInputAllowed:true},FocusManager:{get:()=>({isFocusLocked:()=>false})},
 Players:{get:()=>({isTurnActive:true})},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},Configuration:{getGame:()=>({isPaused:false})},
 InputFilter:{handleInput:()=>0},InputEngineEvent:function(){},InputHandlerState:{Handled:1},InputActionStatuses:{START:1,FINISH:3},
 window:{addEventListener:(e,f)=>windows.set(e,f),removeEventListener:e=>windows.delete(e)}
 });
 const dispose=install(root,model,()=>false);
 assert.equal(handler.onEngineInput,original);assert.equal(root.__civ7ResourceSkipAllowed(),true);
 handler.onEngineInput('cancel',1);handler.onEngineInput('cancel',3);assert.deepEqual(sent,[['cancel',1],['cancel',3]]);
 selected=9;assert.equal(root.__civ7ResourceSkipAllowed(),false);selected=-1;
 busy=true;assert.equal(root.__civ7ResourceSkipAllowed(),false);busy=false;
 windows.get('blur')();assert.equal(root.__civ7ResourceSkipAllowed(),false);windows.get('focus')();
 eligible=false;assert.equal(root.__civ7ResourceSkipAllowed(),false);eligible=true;
 dispose();assert.equal(windows.size,0);assert.equal(root.__civ7ResourceSkipAllowed,undefined);assert.equal(handler.onEngineInput,original);
});

test('explicit force-end-turn retains its native path, while ordinary end-turn is blocked',()=>{
 const f=fixture();f.service.defer();f.p.sendEndTurn();assert.ok(!f.calls.includes('end'));
 f.p.onEngineInput({detail:{name:'force-end-turn',status:3}});assert.equal(f.calls.filter(x=>x==='end').length,1);f.service.dispose();
});

test('资源页面移除独立延后按钮，原生标签切换继续保留',()=>{
 const source=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('const CommerceScreenComponent ='),source.indexOf('const CommerceScreen ='));
 let tab;const model={data:{},onTabChanged:value=>tab=value};
 const render=vm.runInNewContext(body+';CommerceScreenComponent',{
 createCommerceScreenModel:()=>model,createSignal:v=>[()=>v,n=>v=n],useIsSmallScreen:()=>()=>false,IsControllerActive:()=>false,useAudio:()=>()=>{},useLocalPlayerId:()=>()=>0,createMemo:fn=>fn,onMount(){},
 createComponent:(type,props)=>({type,props}),CommerceScreenContext:{Provider:'Provider'},ScreenFrame:'Frame',Tab:'Tab'
 });
 const page=render({}).props.children.props.children;
 assert.equal(page.length,1);assert.equal(page[0].type,'Tab');
 const trade={name:'Trade'};page[0].props.onTabChanged(trade);assert.equal(tab,trade);
 assert.doesNotMatch(source,/ResourceDefer|deferResources/);
});

test('explicit turn-guard lease yields submission while legacy display leases retain fallback',()=>{
 const f=fixture();f.service.defer();
 const releaseLegacy=f.service.claim({});assert.equal(f.p.canEndTurn(),false);f.p.sendEndTurn();assert.ok(!f.calls.includes('end'));
 const release=f.service.claim({}, {turnGuards:true});assert.equal(f.p.canEndTurn(),true);
 f.p.sendEndTurn();assert.equal(f.calls.at(-1),'end');f.calls.length=0;
 release();release();assert.equal(f.p.canEndTurn(),false);f.p.sendEndTurn();assert.deepEqual(f.calls,[]);
 releaseLegacy();f.p.activateBlockingNotification();assert.equal(f.calls.at(-1),'open');f.service.dispose();
});


test('资源提醒设置跨重载保存，只合并自己字段；损坏配置保持原样',()=>{
 let raw=JSON.stringify({'other-mod':{keep:7},'civ7-resource-planner':{preferences:{happiness:{cityTarget:20}},games:{g:{city:1}}}});
 const storage={getItem:()=>raw,setItem:(_key,value)=>raw=value};
 let f=fixture({storage});f.service.defer();assert.equal(f.service.remindersEnabled(),true);
 assert.equal(f.service.setRemindersEnabled(false),true);assert.equal(f.service.pending(),false);assert.equal(f.p.canEndTurn(),true);
 const saved=JSON.parse(raw);assert.equal(saved['other-mod'].keep,7);assert.equal(saved['civ7-resource-planner'].preferences.happiness.cityTarget,20);assert.equal(saved['civ7-resource-planner'].games.g.city,1);
 f.service.dispose();f=fixture({storage});assert.equal(f.service.remindersEnabled(),false);f.service.defer();assert.equal(f.service.pending(),false);
 assert.equal(f.service.setRemindersEnabled(true),true);assert.equal(f.service.pending(),true);
 raw='invalid-json';assert.equal(f.service.setRemindersEnabled(false),false);assert.equal(raw,'invalid-json');assert.equal(f.service.remindersEnabled(),true);f.service.dispose();
});
