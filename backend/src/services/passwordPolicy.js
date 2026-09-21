import {z} from 'zod';
// bcrypt hashes at most 72 bytes; reject longer input instead of silently truncating it.
export const passwordRule=z.string().min(12,'Mật khẩu cần ít nhất 12 ký tự').max(128).refine(v=>Buffer.byteLength(v,'utf8')<=72,'Mật khẩu tối đa 72 byte UTF-8; hãy rút ngắn mật khẩu có nhiều ký tự Unicode');
