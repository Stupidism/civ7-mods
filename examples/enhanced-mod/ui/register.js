import {enhancedMods} from '/civ7-mac-launcher/ui/bms-api.js';
const dispose=enhancedMods.register({apiVersion:1,id:'civ7-bms-example',title:'LOC_BMS_EXAMPLE',description:'LOC_BMS_EXAMPLE_DESCRIPTION',settings:[{id:'verbose',type:'boolean',label:'LOC_BMS_EXAMPLE_VERBOSE',description:'LOC_BMS_EXAMPLE_VERBOSE_DESCRIPTION',default:false}]});
window.addEventListener('unload',dispose);
