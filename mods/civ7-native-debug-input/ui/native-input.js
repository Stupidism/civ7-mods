import {enhancedMods} from '/civ7-mac-launcher/ui/bms-api.js';
import {DialogBoxManager} from '/core/ui/dialog-box/manager-dialog-box.js';
import {FocusManager} from '/core/ui-next/services/focus-manager.js';
import {bindDialogNavigation} from '/civ7-mac-launcher/ui/bms-dialog-navigation.js';
const ID='civ7-native-debug-input',BODY='bms-native-command-body';
const unregister=enhancedMods.register({apiVersion:1,id:ID,title:'LOC_NDI_NAME',description:'LOC_NDI_DESCRIPTION'});
let dialog,closedWhileActive=false,busy=false,field,status,serial=0;
const text=key=>Locale.compose(key);
function close(){serial++;if(dialog!=null)DialogBoxManager.closeDialogBox(dialog);dialog=undefined;field=status=undefined;busy=false;}
async function submit(){
  if(busy||!field)return;
  const command=String(field.getAttribute('value')??'').trim();
  if(!/^[\x20-\x7e]{1,254}$/.test(command)){status.textContent=text('LOC_NDI_INVALID');return;}
  const version=serial;busy=true;status.textContent=text('LOC_NDI_PENDING');
  try{await enhancedMods.request(ID,'submit',{command});if(version===serial&&field){field.setAttribute('value','');status.textContent=text('LOC_NDI_SUBMITTED');}}
  catch{if(version===serial&&status)status.textContent=text('LOC_NDI_FAILED');}
  finally{if(version===serial)busy=false;}
}
function open(){
  if(dialog!=null)return;
  dialog=DialogBoxManager.createDialog_MultiOption({title:'LOC_NDI_TITLE',body:BODY,canClose:true,shouldDarken:false,options:[{label:'LOC_GENERIC_CLOSE',actions:['cancel','keyboard-escape'],callback:()=>{closedWhileActive=true;dialog=undefined;serial++;field=status=undefined;busy=false;}}]});
}
Controls.decorate('screen-dialog-box',control=>({beforeAttach(){},afterAttach(){
  if(control.Root.getAttribute('body')!==BODY)return;
  const body=control.Root.querySelector('[role="paragraph"]')??control.Root.querySelector('.font-body.text-base');if(!body)return;
  body.textContent=text('LOC_NDI_HINT');body.style.cssText='width:36rem;max-width:80vw;white-space:pre-wrap;';
  field=document.createElement('fxs-textbox');field.setAttribute('enabled','true');field.setAttribute('max-length','254');field.setAttribute('consume-keyboard-input','true');field.setAttribute('aria-label',text('LOC_NDI_TITLE'));field.style.cssText='width:100%;margin-top:1rem;';
  field.addEventListener('component-value-changed',e=>field?.setAttribute('value',String(e.detail?.value??'')));
  field.addEventListener('text-edit-stop',e=>{if(e.detail?.confirmed){e.preventDefault();e.stopPropagation();void submit();}});
  const run=document.createElement('fxs-button');run.setAttribute('caption','LOC_NDI_RUN');run.setAttribute('action-key','inline-accept');run.addEventListener('action-activate',e=>{e.stopPropagation();void submit();});
  status=document.createElement('div');status.className='font-body';status.style.cssText='margin-top:0.5rem;';body.append(field,run,status);
  control.bmsNavigation=bindDialogNavigation(control.Root,{focus:FocusManager.get(),statuses:InputActionStatuses,directions:InputNavigationAction,activate:target=>target.dispatchEvent(new CustomEvent('action-activate',{bubbles:true,cancelable:true}))});
  FocusManager.get().setFocus(field);
},beforeDetach(){},afterDetach(){if(control.Root.getAttribute('body')===BODY){control.bmsNavigation?.();closedWhileActive=true;dialog=undefined;serial++;field=status=undefined;busy=false;}}}));
const timer=setInterval(()=>{
  const state=enhancedMods.status(ID);const active=state.state==='running'&&state.detail?.active;
  if(!active){closedWhileActive=false;close();return;}
  // A higher-priority native modal, options draft or Rest Guard must never
  // lose focus to a console poll. Open only after those surfaces are gone.
  if(dialog==null&&!closedWhileActive&&!document.querySelector('screen-dialog-box,screen-options')&&![...document.querySelectorAll('.c7r-root')].some(root=>root.style.display!=='none'))open();
},250);
window.addEventListener('unload',()=>{clearInterval(timer);close();unregister();});
