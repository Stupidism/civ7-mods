// The Mac game's native localStorage may silently ignore writes. Keep this
// framework's preferences in the launcher, without touching other mods' data.
export function createPreferenceTransport() {
  let value='{}', revision=0, pending=null;
  return {
    storage:{getItem(){return value;},setItem(_key,next){value=next;pending={revision:++revision,value:JSON.parse(next)};}},
    outgoing(){return pending;},
    receive(reply){if(!reply)return;if(pending&&reply.revision!==pending.revision)return;value=JSON.stringify(reply.value);pending=null;},
  };
}
