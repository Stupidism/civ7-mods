#!/usr/bin/env node
// Explicit activity scope for capture/debug commands; no persistent setting changes.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluate } from '../mods/fenhe/tools/cdp.mjs';
const [kind, separator, command, ...args] = process.argv.slice(2);
if (!['recording', 'debug'].includes(kind) || separator !== '--' || !command) {
  console.error('Usage: node scripts/with-game-activity.mjs recording|debug -- command [args...]');
  process.exit(2);
}
// Hold the shared UI lock for the complete activity, including marker cleanup.
const lockScript = fileURLToPath(new URL('./game-lock.py', import.meta.url));
if (process.env.CIV7_GAME_LOCK_GUARDED !== '1') {
  const guarded = spawnSync('/usr/bin/python3', [lockScript, 'run', '--', process.execPath, ...process.argv.slice(1)], {stdio:'inherit', env:process.env});
  process.exit(guarded.status ?? 1);
}
const checked = spawnSync('/usr/bin/python3', [lockScript, 'assert'], {encoding:'utf8'});
if (checked.status !== 0) { console.error(checked.stderr); process.exit(2); }
const key = 'civ7-rest-guard.activity.v1';
const owner = randomUUID();
async function update(remove = false) {
  const pages = await (await fetch('http://127.0.0.1:9444/json/list', {signal:AbortSignal.timeout(4000)})).json();
  const contexts = [...new Set(pages.map(p => p.url).filter(u => /root-(game|shell)\.html/.test(u)).map(u => u.includes('root-game.html') ? 'root-game.html' : 'root-shell.html'))];
  if (!contexts.length) throw Error('No game UI is available for the activity marker');
  for (const context of contexts) {
    const result = await evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem('modSettings') || '{}');
    const key = ${JSON.stringify(key)}, owner = ${JSON.stringify(owner)}, now = Date.now();
    const leases = data[key] || {};
    for (const id of Object.keys(leases)) if (leases[id].expiresAt <= now) delete leases[id];
    if (${remove}) delete leases[owner];
    else leases[owner] = {kind:${JSON.stringify(kind)}, issuedAt:now, expiresAt:now+90000};
    if (Object.keys(leases).length) data[key] = leases; else delete data[key];
    localStorage.setItem('modSettings', JSON.stringify(data));
    return {recognized:!!globalThis.__civ7RestGuardActivityV1, suspended:globalThis.__civ7RestGuardActivityV1?.isSuspended(), legacyActive:!!document.querySelector('.c7r-root')};
  })()`, context, 5000);
    if (!remove && result.legacyActive && !result.suspended) throw Error('Rest Guard is active but does not support automatic suspension; disable it before recording/testing');
  }
}
let timer, child, stopping = false;
async function finish(code) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  try { await update(true); } catch (e) { console.error('Activity marker will expire within 90 seconds:', e.message); }
  process.exit(code);
}
try {
  await update();
  console.log(`Rest Guard activity: ${kind} (temporary; renewed while command runs)`);
  child = spawn(command, args, {stdio:'inherit'});
  timer = setInterval(() => update().catch(e => console.error('Activity renewal:',e.message)), 20000);
  child.once('error', e => { console.error(e.message); void finish(1); });
  child.once('exit', code => void finish(code ?? 1));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
} catch (e) { console.error(e.message); await finish(1); }
