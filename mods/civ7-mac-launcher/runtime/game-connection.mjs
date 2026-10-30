// The framework owns transport; providers never need their own CDP poller.
export async function evaluatePage(page,expression) {
  const endpoint=new URL(page.devtoolsFrontendUrl,'http://127.0.0.1:9444').searchParams.get('ws');
  if(!endpoint?.startsWith('127.0.0.1:9444/devtools/'))throw Error('invalid-endpoint');
  const ws=new WebSocket('ws://'+endpoint);
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{reject(Error('game-timeout'));ws.close();},3000);
    const finish=(error,value)=>{clearTimeout(timer);error?reject(error):resolve(value);};
    ws.addEventListener('error',()=>finish(Error('game-connection-failed')),{once:true});
    ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}})),{once:true});
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id===1)finish(m.error||m.result?.exceptionDetails?Error('game-evaluation-failed'):null,m.result?.result?.value);});
  });}finally{ws.close();}
}
export function createConnection({host,preferences,token,listPages=async()=>await(await fetch('http://127.0.0.1:9444/json/list',{signal:AbortSignal.timeout(1500)})).json(),evaluate=evaluatePage}) {
  let stopped=false,pending=Promise.resolve(),busy=false;const completed=new Map();
  async function poll(){if(stopped||busy)return pending;busy=true;pending=(async()=>{
    try{
      const pages=(await listPages()).filter(p=>/^fs:\/\/game\/(core\/ui\/shell\/root-shell|root-game)\.html$/.test(p.url));
      const views=[];
      for(const page of pages){const state=await evaluate(page,`globalThis.__betterModSupport?.connect(${JSON.stringify(token)})`);if(state)views.push({page,state});}
      // Shell remains loaded during a game. Only the foreground game context
      // may own requests/preferences, preventing an idle shell undoing changes.
      const view=views.find(v=>v.state.inGame)??views.find(v=>v.state.inShell);
      if(!view){await host.sync([]);return;}
      const saved=await preferences?.exchange(view.state.preferenceUpdate);
      await host.sync(view.state.registrations);
      const responses=[];
      for(const request of (view.state.requests??[]).slice(0,16)){
        const key=view.state.session+':'+request.id;
        let response=completed.get(key);
        if(!response){try{response={id:request.id,result:await host.request(request.extension,request.method,request.payload)};}catch(e){response={id:request.id,error:e.message,...(e.content?{content:e.content}:{})};}completed.set(key,response);if(completed.size>256)completed.delete(completed.keys().next().value);}
        responses.push(response);
      }
      if(!stopped)await evaluate(view.page,`globalThis.__betterModSupport?.receive(${JSON.stringify(token)},${JSON.stringify(await host.status())},${JSON.stringify(responses)},${JSON.stringify(saved??null)})`);
    }catch{/* Changing screens or missing bridge: no requests are invented. */}
    finally{busy=false;}
  })();return pending;}
  return {poll,async close(){stopped=true;await pending;}};
}
