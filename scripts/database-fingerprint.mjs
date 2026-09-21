// Store counts + hashes only; never export rows or credentials in reports.
export async function fingerprint(client){
 const tables=['users','questions','question_versions','attempts','attempt_items','mastery_events','mastery_states','class_memberships'],result={};
 for(const table of tables)result[table]=(await client.query('SELECT count(*)::int count,md5(COALESCE(string_agg(row_text,chr(10) ORDER BY row_text),\'\')) hash FROM (SELECT row_to_json(t)::text row_text FROM '+table+' t) rows')).rows[0];
 return result;
}
