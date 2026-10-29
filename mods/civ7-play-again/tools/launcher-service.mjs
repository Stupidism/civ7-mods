import { randomBytes } from 'node:crypto';
import { createLocalService } from './local-service.mjs';
import { startGameBridge } from './game-bridge.mjs';

// Launched by the shared Mac launcher. No install writes, OCR compilation,
// browser opening, save conversion or configuration changes at startup.
export async function startLauncherService({ create = createLocalService, bridge = startGameBridge } = {}) {
  const token=randomBytes(32).toString('hex');
  const service=await create({ token, port:0 });
  let stopBridge;
  try { stopBridge=bridge(service,token,{ connect:true }); }
  catch (error) { service.server.close(); throw error; }
  console.log('Play Again helper ready; conversion requires an explicit idle-menu request.');
  return async () => {
    stopBridge();
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
  };
}
