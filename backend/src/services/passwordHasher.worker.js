// Worker của passwordHasher.js: chạy bcrypt đồng bộ ngay trong luồng riêng (không chặn luồng chính).
import {parentPort} from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', ({id, op, password, hash, rounds}) => {
  try {
    const result = op === 'compare' ? bcrypt.compareSync(password, hash) : bcrypt.hashSync(password, rounds);
    parentPort.postMessage({id, result});
  } catch (e) {
    parentPort.postMessage({id, error: e.message});
  }
});
