import { settingsStore } from './rest-settings.js';
import { session, checkpoint, installLoadingHooks } from './rest-runtime.js';

installLoadingHooks();
const activity = () => {
  if (session.startedAt === null) return;
  session.activity(null, settingsStore.data.config, Date.now());
};
for (const name of ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart', 'engine-input', 'navigate-input']) {
  window.addEventListener(name, activity, true);
}
const timer = setInterval(() => {
  if (session.startedAt !== null) { session.tick(null, settingsStore.data.config, Date.now()); checkpoint(); }
}, 1000);
window.addEventListener('unload', () => { clearInterval(timer); checkpoint(); });
