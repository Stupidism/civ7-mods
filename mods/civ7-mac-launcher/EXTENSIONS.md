# Enhanced Mod registration API v1

Better Mod Support owns the **Options → Enhanced Mods** tab, persistent drafts, shared game connection, and the lifecycle of local services. It does not keep a hard-coded list of consuming mods. See [`examples/enhanced-mod`](../../examples/enhanced-mod) for a separately installable consumer that requires no framework modification.

## Installation and declaration

Your mod must depend on `civ7-mac-launcher` in its `.modinfo`. Put this declaration at the root of your installed mod folder (local Mods or a Steam library's Workshop content folder):

```json
{"apiVersion":1,"id":"your-mod-id","entry":"tools/service.mjs"}
```

The filename is `better-mod-support.json`. The ID must match a `.modinfo` in that same folder. Paths are relative, confined to the real mod directory, and must name an `.mjs` module. Duplicate installed declarations with the same ID are rejected. Discovery reads declarations without executing code. Install/update while the game is closed, then restart to discover the new version; Steam's fixed launch option remains unchanged.

## Game UI registration

Load your registration script through `UIScripts` in each scope where your component is needed. Import the singleton API:

```js
import {enhancedMods} from '/civ7-mac-launcher/ui/bms-api.js';
const unregister = enhancedMods.register({
  apiVersion: 1,
  id: 'your-mod-id',
  title: 'LOC_YOUR_MOD_NAME',
  description: 'LOC_YOUR_MOD_DESCRIPTION',
  settings: [
    {id:'verbose', type:'boolean', label:'LOC_YOUR_VERBOSE',
     description:'LOC_YOUR_VERBOSE_DESCRIPTION', default:false},
    {id:'mode', type:'choice', label:'LOC_YOUR_MODE',
     description:'LOC_YOUR_MODE_DESCRIPTION', default:'normal',
     choices:[{value:'normal',label:'LOC_YOUR_NORMAL'},
              {value:'compact',label:'LOC_YOUR_COMPACT'}]},
  ],
});
window.addEventListener('unload', unregister);
```

Use mod-prefixed JavaScript filenames: Cohtml can resolve colliding basenames to the wrong module even across directories. In particular, never name a new integration `options.js`.

Supply English and Simplified Chinese localization for these keys through your own `UpdateText` actions. The framework derives the group header from `title`; no framework localization changes are needed. Registration is synchronous, bounded and rejects duplicates or invalid schemas. New components are **disabled by default**. Native Options Confirm applies changes; Cancel drops drafts. The framework portion of native Reset restores defaults for registered entries; the stock Reset still resets other game options as usual. Unknown/unloaded extension preferences are preserved. Preferences are stored atomically in `~/Library/Application Support/BetterModSupport/preferences.json`; other mods’ game storage is untouched. This avoids Mac native localStorage writes that can silently fail. Corrupt preference files are not overwritten.

```js
const status = enhancedMods.status('your-mod-id');
const result = await enhancedMods.request('your-mod-id', 'echo', {message:'hello'});
```

Requests require an enabled registration and connected, running service. Responses are correlated and deduplicated; a host restart rejects pending requests. UI code must check its own gameplay context before applying asynchronous results. Never treat transport submission as proof of a game operation's success.

## Local service

```js
export async function createExtension({settings, root, sessionDir}) {
  // Called only for a loaded registration that the player enabled in Options.
  return {
    async request(method, payload) {
      if (method !== 'echo') throw new Error('unsupported-method');
      return {message: payload.message, verbose: settings.verbose};
    },
    status() { return { /* small serializable diagnostics */ }; },
    async close() { /* release everything this instance owns */ },
  };
}
```

A local service is trusted Node code, not sandboxed game JavaScript. Enabling it runs installed auxiliary code on the player's Mac. Validate payloads, constrain file operations, and never interpret requests as arbitrary shell commands/module paths. The framework selects module paths only from installed declarations, never from UI requests. Services must bundle dependencies; the player's machine needs no separate Node/Python installation.

Preference changes restart the service with the new settings. Disabling/unregistering or losing the active context closes it; outstanding requests drain before close. Startup errors are isolated to that component. All components stop when the launcher/game exits. Do not hold unbounded work in `request` or `close`.

The shared host currently communicates through the existing localhost Cohtml bridge at `127.0.0.1:9444`. Without it the tab shows disconnected and services do not start. The launcher does not enable a debugger port. This is an explicit current limitation, not a debugger-free API. The host supplies `nativeAvailable` for the optional pinned native-input bridge; ordinary third-party services need not use it.
