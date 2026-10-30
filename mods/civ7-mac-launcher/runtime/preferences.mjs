import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function openPreferences(file) {
  let value={};try{value=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('invalid-preferences-file');}
  const validate=v=>v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(v).length<256000;
  if(!validate(value))throw Error('invalid-preferences-file');
  return {async exchange(update){
    if(update){if(!Number.isSafeInteger(update.revision)||update.revision<1||!validate(update.value))throw Error('invalid-preferences-update');
      const text=JSON.stringify(update.value);if(text!==JSON.stringify(value)){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,text,{mode:0o600,flag:'wx'});await rename(temp,file);value=structuredClone(update.value);}
    }
    return {value:structuredClone(value),revision:update?.revision??null};
  }};
}
