// One host owns all explicitly bundled providers. No Workshop code scanning.
export async function supervise({ start, ready, alive, interval = 1000, onStop = () => {} }) {
  const stop = await start();
  let timer, stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    await stop(); onStop();
  };
  try {
    if (!alive()) { await close(); throw new Error('Launcher exited during helper startup'); }
    await ready();
    timer = setInterval(() => { if (!alive()) void close(); }, interval);
    return close;
  } catch (error) { await close(); throw error; }
}
