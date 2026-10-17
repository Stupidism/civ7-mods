import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=await fs.readFile(path.join(root,'viewer/template.html'),'utf8');
const script=html.split('<script>')[1].split('</script>')[0].replace('/*__DATA__*/','{}').replace('/*__ENGINE__*/','');new Function(script);
for(const id of ['civ7-fenhe','civ7-fenhe-ui']){
 const manifest=await fs.readFile(path.join(root,'mod',id,id==='civ7-fenhe'?'fenhe.modinfo':'fenhe-ui.modinfo'),'utf8');
 for(const [,f]of manifest.matchAll(/<Item>([^<]+)<\/Item>/g))await fs.access(path.join(root,'mod',id,f));
}
console.log('Viewer JavaScript parses; both manifests have every referenced runtime asset.');
