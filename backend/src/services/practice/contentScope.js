// Stable identities keep equal YCCĐ codes in different lessons/Outcomes separate.
export function yccdScope(version){
 if(version.yccd_id&&version.node_type!=='yccd')return {key:JSON.stringify(['master',version.yccd_id]),name:version.content?.yccd_code||'YCCĐ #'+version.yccd_id,context:version.content?.outcome_code||'Chương trình chuẩn'};
 if(version.node_type==='yccd')return {key:JSON.stringify(['node',version.taxonomy_node_id]),name:version.node_name,context:version.version_name};
 const c=version.content||{},code=String(c.yccd??'').trim();
 if(!code)return null;
 const outcome=String(c.outcome??'').trim(),branch=String(c.branch_code??'').trim();
 return {key:JSON.stringify(['code',version.topic_id,branch,outcome,code]),name:'YCCĐ '+code,context:[branch,outcome?'Outcome '+outcome:'',version.topic_name].filter(Boolean).join(' · ')};
}
export function yccdOptions(versions){
 const groups=new Map();
 for(const v of versions)for(const scope of [yccdScope(v),...(v.yccd_id&&v.node_type==='yccd'?[yccdScope({...v,node_type:null})]:[])]){if(!scope)continue;const item=groups.get(scope.key)||{...scope,topic_ids:[],question_count:0};item.question_count++;if(!item.topic_ids.includes(v.topic_id))item.topic_ids.push(v.topic_id);groups.set(scope.key,item);}
 return [...groups.values()].sort((a,b)=>(a.context+' '+a.name).localeCompare(b.context+' '+b.name,'vi',{numeric:true}));
}
