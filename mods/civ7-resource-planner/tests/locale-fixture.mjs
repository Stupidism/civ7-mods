import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const xml=readFileSync(new URL('../text/resource-planner.xml',import.meta.url),'utf8');
const decode=text=>text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const catalogs=Object.fromEntries(['EnglishText','LocalizedText'].map(section=>{
  const body=xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))[1];
  const rows=[...body.matchAll(/<Row Tag="([^"]+)"[^>]*><Text>([\s\S]*?)<\/Text><\/Row>/g)];
  assert.equal(new Set(rows.map(row=>row[1])).size,rows.length,'duplicate localization key');
  return [section==='EnglishText'?'en_US':'zh_Hans_CN',Object.fromEntries(rows.map(row=>[row[1],decode(row[2])]))];
}));
const yields=['FOOD','PRODUCTION','GOLD','SCIENCE','CULTURE','HAPPINESS','DIPLOMACY'];
const yieldNames={en_US:['Food','Production','Gold','Science','Culture','Happiness','Influence'],zh_Hans_CN:['粮食','生产力','金币','科技','文化','幸福度','影响力']};
// Offline model of the native resolver, not a replacement shipped to the game.
export function useGameLanguage(language='zh_Hans_CN') {
  const locale=catalogs[language]?language:'en_US';
  globalThis.Locale={compose(key,...args){
    const yieldIndex=yields.indexOf(key.replace(/^LOC_YIELD_/,'').replace(/_NAME$/,''));
    const text=yieldIndex>=0?(key.endsWith('_NAME')?yieldNames[locale][yieldIndex]:`[icon:YIELD_${yields[yieldIndex]}]${yieldNames[locale][yieldIndex]}`):catalogs[locale][key];
    assert.equal(typeof text,'string',`missing translation ${key}`);
    return text.replace(/\{(\d+)\}/g,(_,n)=>{
      assert.ok(Number(n)>0&&Number(n)<=args.length,`missing argument ${n} for ${key}`);
      return args[Number(n)-1];
    });
  }};
  return globalThis.Locale;
}
