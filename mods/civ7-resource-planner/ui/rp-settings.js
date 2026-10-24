export const MOD_ID='civ7-resource-planner';
export function readSettings(storage=localStorage) {
  const raw=storage.getItem('modSettings');
  const all=raw ? JSON.parse(raw) : {};
  if(!all || typeof all!=='object' || Array.isArray(all))throw new Error('LOC_RP_INVALID_SETTINGS');
  return all[MOD_ID] || {version:1,preferences:{},games:{}};
}
export function writeSettings(value,storage=localStorage) {
  const raw=storage.getItem('modSettings'),all=raw?JSON.parse(raw):{};
  if(!all || typeof all!=='object' || Array.isArray(all))throw new Error('LOC_RP_INVALID_SETTINGS');
  all[MOD_ID]=value;storage.setItem('modSettings',JSON.stringify(all));
}
