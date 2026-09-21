import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {CAPABILITIES,BUNDLES,SCOPE_TYPES} from './catalog.js';
import {requirePermissionAdmin} from './delegation.js';
import {getEffectiveAccess} from '../accessResolver.js';
import {validateScope} from './staff.js';
import {log} from '../practice/config.js';
export async function listTemplates(actor){requirePermissionAdmin(actor);return (await pool.query('SELECT id,name,definition,created_at FROM permission_templates ORDER BY name')).rows;}
export async function saveTemplate(actor,raw){
 requirePermissionAdmin(actor);
 const d=z.object({name:z.string().trim().min(3).max(120),definition:z.object({bundle:z.enum(Object.keys(BUNDLES)),capabilities:z.array(z.enum(CAPABILITIES)).min(1).max(100),scope_type:z.enum(SCOPE_TYPES),scope_payload:z.record(z.unknown()),effect:z.enum(['ALLOW','DENY']),valid_to:z.string().date().nullable().default(null)}).strict(),reason:z.string().trim().min(3).max(1000)}).strict().parse(raw);
 const access=await getEffectiveAccess(actor);d.definition.scope_payload=validateScope(d.definition.scope_type,d.definition.scope_payload,access.org);
 return tx(async c=>{const row=(await c.query('INSERT INTO permission_templates(name,definition,created_by) VALUES($1,$2,$3) RETURNING id,name,definition',[d.name,d.definition,actor.id])).rows[0];await log(c,actor,'STAFF_TEMPLATE_CREATED',row.id,{before:null,after:row,reason:d.reason});return row;});
}
