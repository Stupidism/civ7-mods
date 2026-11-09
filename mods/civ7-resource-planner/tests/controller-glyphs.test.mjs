import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function installControllerGlyphs'),source.indexOf('// Native Solid focus')).replace('export ','');
test('Mac bare gesture names use device glyphs and scoped cleanup preserves later hooks',()=>{
 const original=(_action,_device,_context,prefix)=>prefix===false?'icon_button_right':'icon_button_right';
 const ActionIcon={getIconFromActionName:original};
 const install=vm.runInNewContext(body+';installControllerGlyphs',{ActionIcon,Input:{getPrefix:device=>device===4?'xb1_':'ps5_'},InputDeviceType:{Controller:4}});
 const cleanup=install();
 assert.equal(ActionIcon.getIconFromActionName('cancel'), 'blp:xb1_icon_button_right');
 assert.equal(ActionIcon.getIconFromActionName('cancel',8), 'blp:ps5_icon_button_right');
 assert.equal(ActionIcon.getIconFromActionName('cancel',4,undefined,false),'icon_button_right');
 cleanup();assert.equal(ActionIcon.getIconFromActionName,original);
 const cleanup2=install(),later=()=> 'blp:another-mod-glyph';ActionIcon.getIconFromActionName=later;
 cleanup2();assert.equal(ActionIcon.getIconFromActionName,later);
 const cleanup3=install();assert.equal(ActionIcon.getIconFromActionName('cancel'),'blp:another-mod-glyph');cleanup3();
});
