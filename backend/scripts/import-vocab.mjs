// Nhập ngân hàng từ vựng từ tệp CSV / JSON / XLSX (dùng chung bộ nhập của trang quản trị).
// node scripts/import-vocab.mjs <tệp> --subject TiengAnh|TiengTrung|<tên môn> [--source bufopia] [--set "Tên bộ"] [--as admin] [--dry-run]
import 'dotenv/config';
import path from 'node:path';
import {pool} from '../src/db/pool.js';
import {parseVocabFile,previewImport,confirmImport} from '../src/services/vocab/bank.js';
const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')&&!args[args.indexOf(a)-1]?.startsWith('--')),opt=k=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:null;};
if(!file||!opt('subject')){console.error('Cách dùng: node scripts/import-vocab.mjs <tệp> --subject TiengAnh [--source bufopia] [--set "Tên bộ"] [--as admin] [--dry-run]');process.exit(1);}
try{
 const subject=(await pool.query('SELECT id,name FROM subjects WHERE code=$1 OR lower(name)=lower($1) ORDER BY code=$1 DESC LIMIT 1',[opt('subject')])).rows[0];if(!subject)throw new Error('Không tìm thấy môn '+opt('subject'));
 const actor=(await pool.query("SELECT id,role FROM users WHERE username=$1 AND role='admin'",[opt('as')||'admin'])).rows[0];if(!actor)throw new Error('Cần tài khoản quản trị (--as)');
 const rows=parseVocabFile({path:path.resolve(file),originalname:path.basename(file)});
 const preview=await previewImport(actor,{subject_id:subject.id,rows,source:opt('source'),set:opt('set')});
 console.log(JSON.stringify({subject:subject.name,rows:rows.length,summary:preview.summary,new_sets:preview.new_sets,errors:preview.rows.filter(r=>r.status==='ERROR').slice(0,10).map(r=>({row:r.row,term:r.term,errors:r.errors}))},null,1));
 if(!args.includes('--dry-run')&&preview.can_confirm)console.log('Đã lưu',JSON.stringify(await confirmImport(actor,preview.token)));
}finally{await pool.end();}
