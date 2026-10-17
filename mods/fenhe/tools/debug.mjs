import fs from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:9444/json/list')).json();
const page = pages.find(p=>p.url.includes(process.argv[3] || 'root-game.html'));
if(!page) throw Error('UI context unavailable: '+JSON.stringify(pages.map(p=>p.url)));
const endpoint = new URL(page.devtoolsFrontendUrl,'http://127.0.0.1:9444').searchParams.get('ws');
const ws = new WebSocket('ws://'+endpoint);
await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
try {
 const result = await new Promise((res,rej)=>{
  const t=setTimeout(()=>rej(Error('debugger timeout')),20000);
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id===1){clearTimeout(t);res(m);}});
  fs.readFile(process.argv[2],'utf8').then(expression=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}})));
 });
 if(result.error || result.result.exceptionDetails) throw Error(JSON.stringify(result));
 console.log(JSON.stringify(result.result.result.value ?? result.result.result));
} finally {ws.close();}
