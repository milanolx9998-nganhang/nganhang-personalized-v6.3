import fs from 'node:fs/promises';
import path from 'node:path';
export function validateKey(key){
 if(typeof key!=='string'||! /^(images|media|private-imports|exports)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,199}$/.test(key)||key.includes('..'))throw Object.assign(Error('Khóa kho tệp không hợp lệ'),{status:400});
 return key;
}
export class LocalPrivateStorageAdapter{
 constructor(root){this.root=path.resolve(root);}
 async file(key,create=false){
  validateKey(key);if(create)await fs.mkdir(path.join(this.root,key.split('/')[0]),{recursive:true});
  const root=await fs.realpath(this.root),parent=await fs.realpath(path.join(this.root,key.split('/')[0]));
  if(!parent.startsWith(root+path.sep))throw Error('Kho tệp không được đi qua symlink ngoài root');
  const file=path.join(parent,key.split('/')[1]);
  try{const actual=await fs.realpath(file);if(!actual.startsWith(root+path.sep))throw Error('Tệp ngoài kho riêng tư');}catch(e){if(e.code!=='ENOENT')throw e;}
  return file;
 }
 async put(key,bytes){const file=await this.file(key,true);await fs.writeFile(file,bytes,{flag:'wx'});return {key};}
 async get(key){return fs.readFile(await this.file(key));}
 async delete(key){await fs.unlink(await this.file(key));}
 async exists(key){try{await fs.access(await this.file(key));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 async health(){await fs.mkdir(this.root,{recursive:true});await fs.access(this.root,fs.constants.R_OK|fs.constants.W_OK);return true;}
 async getAuthorizedDelivery(key,authorize){if(typeof authorize!=='function'||!await authorize())throw Object.assign(Error('Không có quyền tải tệp'),{status:403});return this.get(key);}
}
