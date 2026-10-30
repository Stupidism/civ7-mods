import {ScreenOptionsCategory} from '/core/ui/options/screen-options-category.js';
import '/core/ui/options/screen-options.js';
import {Options,OptionType} from '/core/ui/options/model-options.js';
import {CategoryData} from '/core/ui/options/options-helpers.js';
import {enhancedMods} from './bms-api.js';
import {installEnhancedOptions} from './bms-options.js';
const names={connected:'LOC_BMS_CONNECTED',running:'LOC_BMS_RUNNING',disabled:'LOC_BMS_DISABLED',disconnected:'LOC_BMS_DISCONNECTED',error:'LOC_BMS_ERROR','not-installed':'LOC_BMS_NOT_INSTALLED'};
const integration=installEnhancedOptions({options:Options,types:OptionType,categories:CategoryData,registry:enhancedMods,
  statusLabel:id=>names[enhancedMods.status(id).state]??'LOC_BMS_ERROR'});
window.addEventListener('unload',()=>integration.dispose());

const previousAppend=ScreenOptionsCategory.prototype.appendOption;
function appendEnhancedOption(option,...args){
  const result=previousAppend.call(this,option,...args);
  if(option.category==='enhanced-mods'){
    const title=option.group==='bms-status'?'LOC_BMS_TAB':enhancedMods.list().find(s=>s.id===option.group)?.title;
    if(title)this.groupHeaders[option.group]?.setAttribute('title',title);
  }
  return result;
}
ScreenOptionsCategory.prototype.appendOption=appendEnhancedOption;
window.addEventListener('unload',()=>{if(ScreenOptionsCategory.prototype.appendOption===appendEnhancedOption)ScreenOptionsCategory.prototype.appendOption=previousAppend;});
