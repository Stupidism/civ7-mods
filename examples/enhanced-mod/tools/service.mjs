// No knowledge of this example exists in the framework or launcher.
export async function createExtension({settings}){
  let calls=0;
  return {status:()=>({verbose:settings.verbose,calls}),request(method,payload){if(method!=='echo')throw Error('unsupported-method');calls++;return {echo:payload,verbose:settings.verbose};},async close(){}};
}
