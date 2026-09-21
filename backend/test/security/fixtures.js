import {buildAccess} from '../../src/services/access/policy.js';
export const org={subjects:[{id:5,department_id:3},{id:6,department_id:3},{id:7,department_id:4}],classes:[{id:101,grade:7,school_year_id:1},{id:102,grade:7,school_year_id:1},{id:103,grade:8,school_year_id:1},{id:104,grade:9,school_year_id:1}],years:[{id:1,start_date:'2026-08-01',end_date:'2027-07-31'}],banks:[{id:10,kind:'department',department_id:3},{id:11,kind:'personal',owner_id:2},{id:12,kind:'school'}]};
export const position=(type,payload,extra={})=>({id:1,type,scope_type:'CUSTOM',scope_payload:payload,...extra});
export const access=(positions=[],overrides=[],extra={})=>buildAccess({user:{id:2,role:'teacher',is_active:true,access_managed:true},positions,overrides,org,now:'2026-09-17',...extra});
