export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function evaluate(expression,context='root-game.html',timeout=20000){
 const pages=await (await fetch('http://127.0.0.1:9444/json/list',{signal:AbortSignal.timeout(4000)})).json();
 const page=pages?.find(p=>p.url.includes(context));
 if(!page)throw Error('游戏界面尚未就绪：'+context);
 const endpoint=new URL(page.devtoolsFrontendUrl,'http://127.0.0.1:9444').searchParams.get('ws');
 const ws=new WebSocket('ws://'+endpoint);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('调试连接超时'));},4000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',e=>{clearTimeout(timer);reject(e);},{once:true});});
 try{return await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(Error('游戏调试接口超时')),timeout);
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id!==1)return;clearTimeout(t);if(m.error||m.result?.exceptionDetails)reject(Error(JSON.stringify(m.error??m.result.exceptionDetails)));else resolve(m.result?.result?.value);});
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
 });}finally{ws.close();}
}
export async function waitFor(read,accept,{timeout=120000,interval=1500}={}){
 const deadline=Date.now()+timeout;let last;
 while(Date.now()<deadline){try{last=await read();if(accept(last))return last;}catch(e){last=e.message;}await sleep(interval);}
 throw Error('等待游戏完成操作超时：'+JSON.stringify(last));
}
