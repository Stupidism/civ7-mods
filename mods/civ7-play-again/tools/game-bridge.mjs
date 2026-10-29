// Host-side bridge to the already enabled, loopback-only Cohtml debugger.
// The only game reads are idle-shell state and this mod's explicit request.
// No request means no file access, configuration load or game action.
async function evaluate(expression) {
  const pages = await (await fetch('http://127.0.0.1:9444/json/list', { signal: AbortSignal.timeout(1500) })).json();
  const page = pages.find(p => p.url === 'fs://game/core/ui/shell/root-shell.html');
  if (!page) return null;
  const endpoint = new URL(page.devtoolsFrontendUrl, 'http://127.0.0.1:9444').searchParams.get('ws');
  if (!endpoint?.startsWith('127.0.0.1:9444/devtools/')) throw new Error('Unexpected local debugger endpoint');
  const socket = new WebSocket('ws://' + endpoint);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Game connection timeout')), 1500);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Game connection error')); }, { once: true });
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Game response timeout')), 3000);
      socket.addEventListener('message', event => {
        const result = JSON.parse(event.data); if (result.id !== 1) return;
        clearTimeout(timer);
        if (result.error || result.result?.exceptionDetails) reject(new Error('Game bridge unavailable'));
        else resolve(result.result?.result?.value);
      });
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
  } finally { socket.close(); }
}

export function createGameBridge(service, token, run = evaluate, { connect = false } = {}) {
  let stopped = false, running = false;
  const completed = new Map();
  async function poll() {
    if (stopped || running) return; running = true;
    try {
      if (connect) await run(`(()=>{const b=globalThis.__civ7PlayAgainBridge;if(b&&UI.isInShell()&&!Configuration.getGame().isGameStarted&&typeof b.connect==='function')b.connect(${JSON.stringify({token})});return true;})()`);
      const request = await run(`(()=>{if(!globalThis.__civ7PlayAgainBridge||!UI.isInShell()||Configuration.getGame().isGameStarted)return null;return globalThis.__civ7PlayAgainBridge.request;})()`);
      if (!request || request.token !== token || typeof request.id !== 'string' || request.id.length > 128) return;
      let response = completed.get(request.id);
      if (!response) {
        try {
          const handlers = { '/convert': service.convert, '/diagnose': service.diagnose, '/ocr/clipboard': service.recognizeClipboard };
          if (!Object.hasOwn(handlers, request.route) || typeof handlers[request.route] !== 'function') throw new Error('Unsupported local operation');
          response = { id: request.id, token, result: await handlers[request.route](request.data) };
        } catch (error) { response = { id: request.id, token, error: error.message, content: error.content }; }
        completed.set(request.id, response);
        if (completed.size > 128) completed.delete(completed.keys().next().value);
      }
      await run(`(()=>{const b=globalThis.__civ7PlayAgainBridge;if(b&&UI.isInShell()&&!Configuration.getGame().isGameStarted)b.complete(${JSON.stringify(response)});return true;})()`);
    } catch { /* Game closed, debugger unavailable, or changing screen: wait. */ }
    finally { running = false; }
  }
  return { poll, stop() { stopped = true; } };
}

export function startGameBridge(service, token, options = {}) {
  const bridge = createGameBridge(service, token, evaluate, options);
  const timer = setInterval(() => bridge.poll(), 1000);
  return () => { bridge.stop(); clearInterval(timer); };
}
