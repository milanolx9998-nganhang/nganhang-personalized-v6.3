import path from 'node:path';
import {profile} from '../../config/profile.js';
import {LocalPrivateStorageAdapter,validateKey} from './local.js';
import {SupabaseStorageAdapter} from './supabase.js';
export const storage=profile.storage==='local'?new LocalPrivateStorageAdapter(process.env.UPLOAD_DIR||'uploads'):new SupabaseStorageAdapter({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
export function sourceKey(value){
 if(value.startsWith('private-imports/'))return validateKey(value);
 const root=path.resolve(process.env.UPLOAD_DIR||'uploads'),rel=path.relative(root,path.resolve(value)).replaceAll('\\','/');
 if(!rel.startsWith('private-imports/'))throw Object.assign(Error('Nguồn không thuộc kho riêng tư'),{status:403});return validateKey(rel);
}
export async function imageLoader(value){
 const urls=[...new Set(JSON.stringify(value).match(/\/uploads\/(?:images|media)\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp)/gi)||[])],map=new Map();
 for(const url of urls)map.set(url,await storage.get(url.slice('/uploads/'.length)));
 return url=>{if(!map.has(url))throw Error('Ảnh xuất không thuộc kho nội bộ');return map.get(url);};
}
