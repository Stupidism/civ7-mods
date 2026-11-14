import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ui/instruction-hints.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
class Element {
 children=[];style={};attrs={};classList={add(){}};
 set textContent(v){this.children=[];this.text=v;}
 setAttribute(k,v){this.attrs[k]=v;}
 append(n){this.children.push(n);}
}
function fixture(){const ctx=vm.createContext({Locale:{compose:k=>k,stylize:k=>`<span>${k}</span>`},document:{createElement:tag=>Object.assign(new Element(),{tag})}});vm.runInContext(source,ctx);return ctx;}
test('hold and release preserve action glyph and rich action wording without duplicate controls',()=>{
 const ctx=fixture();for(const action of ['shell-action-1','shell-action-2','shell-action-5']){
  const el=new Element();ctx.setInstruction(el,'hold',action);
  assert.equal(el.children[0].tag,'fxs-nav-help');assert.equal(el.children[0].attrs['action-key'],`inline-${action}`);
  assert.equal(el.children[1].innerHTML,'<span>hold</span>');const glyph=el.children[0];
  ctx.setInstruction(el,'hold',action);assert.equal(el.children[0],glyph);assert.equal(el.children.length,2);
  ctx.setInstruction(el,'release',action);assert.equal(el.children.length,2);assert.equal(el.children[1].innerHTML,'<span>release</span>');
  ctx.setInstruction(el,'skipped',null);assert.equal(el.children.length,1);assert.equal(el.children[0].tag,'span');
 }
});
test('active hold instructions never bake controller letters into localized prose',()=>{
 const xml=readFileSync(new URL('../text/map-tools.xml',import.meta.url),'utf8');
 const rows=[...xml.matchAll(/<Row Tag="LOC_MTG_(?:CARD_SKIP|DEFER_PRODUCTION|FORCE_TURN)_(?:HINT|HOLD|RELEASE)"[^>]*>\s*<Text>(.*?)<\/Text>/gs)];
 assert.equal(rows.length,4);for(const row of rows)assert.doesNotMatch(row[1],/\b(?:X|Y|View|Back)\b/);
});
