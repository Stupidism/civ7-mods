import {enhancedMods} from '/civ7-mac-launcher/ui/bms-api.js';
const dispose=enhancedMods.register({apiVersion:1,id:'civ7-play-again',title:'LOC_PA_ENHANCED_NAME',description:'LOC_PA_ENHANCED_DESCRIPTION'});
window.addEventListener('unload',dispose);
export const enhancedRequest=(route,data)=>enhancedMods.request('civ7-play-again',route,data);
