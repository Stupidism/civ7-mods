import test from 'node:test';
import assert from 'node:assert/strict';
import { activityActive, ACTIVITY_KEY } from '../ui/rest-activity.js';
import { RestSession } from '../ui/rest-session.js';
import { normalizeConfig } from '../ui/rest-model.js';
const storage = leases => ({getItem: () => JSON.stringify({[ACTIVITY_KEY]:leases, other:{enabled:true}})});

test('only fresh explicit recording/debug leases suspend; malformed or expired markers fail closed', () => {
  const valid = {kind:'recording',issuedAt:1000,expiresAt:91000};
  assert.equal(activityActive(storage({a:valid}),2000),true);
  assert.equal(activityActive(storage({a:{...valid,kind:'debug'}}),2000),true);
  for (const lease of [null,{}, {...valid,kind:'port-open'}, {...valid,issuedAt:3000}, {...valid,expiresAt:99999999}]) {
    assert.equal(activityActive(storage({a:lease}),2000),false);
  }
  assert.equal(activityActive(storage({a:valid}),91000),false);
  assert.equal(activityActive({getItem:()=>'{bad'},2000),false);
  assert.equal(activityActive(storage({a:{...valid,expiresAt:1500},b:valid}),2000),true);
});

test('capture excludes elapsed time and preserves an existing break across a load', () => {
  const config = normalizeConfig({nightEnabled:false});
  const s = new RestSession();
  for(let turn=1;turn<=5;turn++) s.requestTurn({turn,token:`t${turn}`},config,1000);
  const deadline=s.pending.deadline;
  s.setSuspended(true,2000);
  s.beginLoading(3000);
  const loaded=new RestSession(s.export());
  loaded.finishLoading(50000);
  loaded.setSuspended(false,62000);
  assert.equal(loaded.startedAt,61000);
  assert.equal(loaded.pending.deadline,deadline+60000);
  assert.equal(loaded.turnCount,5);
  assert.equal(loaded.loading,false);
  assert.equal(loaded.suspendedAt,null);
});
