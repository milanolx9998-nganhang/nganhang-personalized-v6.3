const profiles={'local-lan':['postgres','local'],'supabase-lan':['supabase','supabase'],'home-supabase':['supabase','supabase'],'supabase-cloud-test':['supabase','supabase']};
export function loadProfile(env=process.env){
 const name=env.APP_PROFILE||'local-lan',pair=profiles[name];
 if(!pair)throw Error('APP_PROFILE không hợp lệ');
 const database=env.DATABASE_PROVIDER||pair[0],storage=env.STORAGE_PROVIDER||pair[1];
 if(database!==pair[0]||storage!==pair[1])throw Error('Database/storage provider không khớp profile');
 if(name!=='local-lan'){
  if(!env.DATABASE_URL||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Profile thử nghiệm thiếu DB hoặc Storage configuration');
  const url=new URL(env.SUPABASE_URL);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('SUPABASE_URL không hợp lệ');
  if(name==='supabase-cloud-test'&&url.protocol!=='https:')throw Error('Cloud Storage bắt buộc HTTPS');
  if(new URL(env.DATABASE_URL).pathname==='/nganhang_personalized_v63')throw Error('Môi trường thử nghiệm không được dùng DB chính của trường');
  if(env.SUPABASE_SERVICE_ROLE_KEY===env.JWT_SECRET)throw Error('Storage key và session secret phải độc lập');
 }
 return Object.freeze({name,database,storage,test:name!=='local-lan'});
}
export const profile=loadProfile();
export const publicProfile=()=>({profile:profile.name,database_provider:profile.database,storage_provider:profile.storage,test_environment:profile.test});
