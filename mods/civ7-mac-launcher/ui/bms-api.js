import {createRegistry} from './bms-registry.js';
import {createPreferenceTransport} from './bms-preference-transport.js';
const preferences=createPreferenceTransport();
export const enhancedMods=createRegistry({storage:preferences.storage});
globalThis.__betterModSupport={
  connect:token=>({...enhancedMods.connect(token,{inShell:UI.isInShell(),inGame:!UI.isInShell()}),preferenceUpdate:preferences.outgoing()}),
  receive:(token,status,responses,saved)=>{preferences.receive(saved);enhancedMods.receive(token,status,responses);},
};
window.addEventListener('unload',()=>{enhancedMods.dispose();delete globalThis.__betterModSupport;});
