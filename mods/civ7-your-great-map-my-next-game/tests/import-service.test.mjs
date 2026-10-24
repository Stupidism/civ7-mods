import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, variant } from './fixtures.mjs';
import { createLocalService } from '../tools/local-service.mjs';
import { comparisonFixture } from './comparison-fixture.mjs';
import { compareImportedConfiguration } from '../ui/compare-imported.js';

test('clipboard OCR requires authentication and explicit POST; supplied paths never reach the reader', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'play-again-ocr-')); let server, reads = 0;
  const token = 'c'.repeat(64);
  try {
    await mkdir(join(dir, 'Single'));
    const service = await createLocalService({ savesRoot: dir, token, port: 0, ocr: async (...args) => {
      assert.equal(args.length, 0); reads++; return { lines: [{ text: 'Game Seed 123' }] };
    } }); server = service.server;
    assert.equal(reads, 0);
    assert.equal((await fetch(service.url + '/ocr/clipboard', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(service.url + '/ocr/clipboard', { headers: { 'X-Play-Again-Token': token } })).status, 404);
    assert.equal(reads, 0);
    const response = await fetch(service.url + '/ocr/clipboard', { method: 'POST', headers: { 'X-Play-Again-Token': token }, body: JSON.stringify({ file: '/private/arbitrary.png' }) });
    assert.equal(response.status, 200); assert.equal(reads, 1);
    assert.equal((await response.json()).lines[0].text, 'Game Seed 123');
    assert.deepEqual(await readdir(join(dir, 'Single')), []);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('import equivalence never ignores seed, memento, unknown-empty or assigned-team changes', () => {
  const {expected,actual}=comparisonFixture();
  assert.equal(compareImportedConfiguration(expected,actual).matches,true);
  actual.map[233116467]++;
  assert.equal(compareImportedConfiguration(expected,actual).matches,false);
  actual.map[233116467]--;
  expected.players[0].values[999]={type:2,value:''};actual.players[0].values[999]={$runtimeValue:'undefined'};
  assert.equal(compareImportedConfiguration(expected,actual).matches,false);
  delete expected.players[0].values[999];delete actual.players[0].values[999];
  expected.players[0].values[-1691486498]={type:8,descriptor:1,value:4294967295};actual.players[0].values[-1691486498]=0;
  assert.equal(compareImportedConfiguration(expected,actual).matches,true);
  actual.players[0].values[-1691486498]=1;
  assert.equal(compareImportedConfiguration(expected,actual).matches,false);
  expected.players[0].values[-1691486498].value=0;
  assert.equal(compareImportedConfiguration(expected,actual).matches,false);
});

test('failed conversion returns red/yellow details; diagnosis rescans without creating files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'play-again-content-')); let server;
  const token = 'b'.repeat(64);
  const mod = (id, title, version) => variant(29, [[-449879690, variant(2, id)], [-368367976, variant(2, title)], [1300745868, variant(2, version)]]);
  const custom = [
    [-1083566479, variant(30, [mod('required', '必需规则', '2'), mod('optional', '建议界面', '1')])],
    [-1259988885, variant(30, [mod('required', '必需规则', '2')])],
  ];
  let installed = {}, scans = 0;
  try {
    await mkdir(join(dir, 'Single'));
    await writeFile(join(dir, 'Single/test.Civ7Save'), fixture({ custom }).bytes);
    await writeFile(join(dir, 'Single/setup.Civ7Cfg'), fixture({ custom, configOnly: true }).bytes);
    const service = await createLocalService({ savesRoot: dir, token, port: 0, getModInventory: async () => { scans++; return installed; } }); server = service.server;
    const request = (route, body) => fetch(service.url + route, { method: 'POST', headers: { 'X-Play-Again-Token': token }, body: JSON.stringify(body) });
    const failed = await request('/convert', { id: 'Single/test.Civ7Save' });
    assert.equal(failed.status, 400);
    const details = (await failed.json()).content;
    assert.equal(details.report.required[0].name, '必需规则'); assert.equal(details.report.recommended[0].name, '建议界面');
    assert.equal((await readdir(join(dir, 'Single'))).length, 2);
    installed = { required: { version: 2, affectsSavedGames: true, kind: 'MOD' } };
    const rechecked = await (await request('/diagnose', { id: 'Single/setup.Civ7Cfg', contentType: 1 })).json();
    assert.equal(rechecked.report.required.length, 0); assert.equal(rechecked.report.recommended.length, 1);
    assert.equal(scans, 2); assert.equal((await readdir(join(dir, 'Single'))).length, 2);
    assert.equal((await request('/diagnose', { id: '../../outside.Civ7Cfg' })).status, 400);
    const exported = await (await request('/convert', { id: 'Single/test.Civ7Save' })).json();
    assert.equal(exported.content.report.recommended.length, 1); assert(exported.fileName.endsWith('.Civ7Cfg'));
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('only the two campaign identity fields may change to valid native 64-bit IDs', () => {
  const { expected, actual } = comparisonFixture();
  expected.game[835848809] = { type: 11, descriptor: 1, value: '15' };
  actual.game[835848809] = '-9223372036854775808';
  assert.equal(compareImportedConfiguration(expected, actual).matches, true);
  for (const value of ['9223372036854775808', 'bad', 16, null]) {
    actual.game[835848809] = value;
    assert.equal(compareImportedConfiguration(expected, actual).matches, false);
  }
  actual.game[835848809] = '16';
  expected.game[835848809].type = 2;
  assert.equal(compareImportedConfiguration(expected, actual).matches, false);
});

test('local service requires token/origin, rejects traversal, creates unique files and refuses later-age saves', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'play-again-service-'));const token='a'.repeat(64);let server;
  try{
    await mkdir(join(dir,'Single'));await writeFile(join(dir,'Single/test.Civ7Save'),fixture().bytes);await writeFile(join(dir,'Single/later.Civ7Save'),fixture({laterAge:true}).bytes);
    const service=await createLocalService({savesRoot:dir,token,port:0});server=service.server;
    const request=(route,body,extra={})=>fetch(service.url+route,{method:body?'POST':'GET',headers:{'X-Play-Again-Token':token,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
    assert.equal((await fetch(service.url+'/saves')).status,403);
    assert.equal((await request('/saves',null,{Origin:'https://example.org'})).status,403);
    assert.equal((await request('/convert',{id:'../../private.Civ7Save'})).status,400);
    assert.equal((await request('/convert',{id:'Single/later.Civ7Save'})).status,400);
    const one=await (await request('/convert',{id:'Single/test.Civ7Save'})).json();
    const two=await (await request('/convert',{fileName:'test.Civ7Save',locationCategories:0})).json();
    assert.notEqual(one.fileName,two.fileName);assert.equal(one.expected.scope,'campaign');assert.equal((await readdir(join(dir,'Single'))).length,4);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
