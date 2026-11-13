import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {posix} from 'node:path';
import {homedir} from 'node:os';
const root=new URL('../',import.meta.url);
const manifest=readFileSync(new URL('resource-planner.modinfo',root),'utf8');
const files=[...manifest.matchAll(/<ImportFiles>([\s\S]*?)<\/ImportFiles>/g)].flatMap(([,body])=>[...body.matchAll(/<Item>([^<]+)<\/Item>/g)].map(m=>m[1]));
const game=process.env.CIV7_MODULES_PATH||`${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules`;
test('standalone manifest needs only base-standard and lists every shipped runtime module',()=>{
  const dependencies=manifest.match(/<Dependencies>(.*?)<\/Dependencies>/s)[1];
  assert.equal([...dependencies.matchAll(/<Mod /g)].length,1);assert.match(dependencies,/id="base-standard"/);
  for(const file of files)assert.ok(existsSync(new URL(file,root)),file);
  assert.ok(files.includes('ui/rp-resource-actions.js'));
  for(const name of ['resources','trade','treasure','empire'])assert.ok(files.includes(`ui-next/screens/commerce/commerce-screen-${name}-tab.js`));
});
test('imports resolve with the packaged files and base game alone', {skip:!existsSync(game)},()=>{
  const virtual=new Map(files.map(f=>['/'+(f.startsWith('ui-next/')?'base-standard/':'civ7-resource-planner/')+f,f]));
  for(const file of files.filter(f=>f.endsWith('.js'))){
    const source=readFileSync(new URL(file,root),'utf8');
    const virtualFile='/'+(file.startsWith('ui-next/')?'base-standard/':'civ7-resource-planner/')+file;
    for(const [,path] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
      const resolved=path.startsWith('/')?path:posix.resolve(posix.dirname(virtualFile),path);
      assert.ok(virtual.has(resolved)||existsSync(game+resolved),`${file}: ${path}`);
      assert.ok(!resolved.includes('/bz-re-sorts/'));
    }
  }
});
