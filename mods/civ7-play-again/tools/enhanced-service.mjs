import {randomBytes} from 'node:crypto';
import {createLocalService} from './local-service.mjs';
export async function createExtension(){
  const service=await createLocalService({token:randomBytes(32).toString('hex'),port:0});
  const methods={'/convert':service.convert,'/diagnose':service.diagnose,'/ocr/clipboard':service.recognizeClipboard};
  return {
    request(method,payload){if(!Object.hasOwn(methods,method))throw Error('unsupported-method');return methods[method](payload);},
    async close(){await new Promise(resolve=>{service.server.close(resolve);service.server.closeAllConnections();});},
  };
}
