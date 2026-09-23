// Kiểm / băm mật khẩu bằng bcrypt trong worker thread (PERF V6.6.7).
//
// bcryptjs là JavaScript thuần: mỗi lần kiểm tốn ~100 ms CPU trên luồng chính. Cả lớp đăng nhập cùng lúc làm
// server "đứng" vài giây với mọi người (đo local: 120 lượt đăng nhập dồn, p50 4,2 s). Worker thread chạy song
// song trên các nhân khác và luồng chính vẫn phục vụ request khác. Worker lỗi → tự làm trên luồng chính.
import {Worker} from 'node:worker_threads';
import os from 'node:os';
import bcrypt from 'bcryptjs';

const size = () => {
  const n = Number(process.env.PASSWORD_WORKERS);
  if (Number.isInteger(n) && n >= 0) return n;
  return Math.max(1, Math.min(4, os.cpus().length - 1));
};

const workers = [];
const queue = [];
let nextId = 1;
let disabled = false;

function spawnWorker() {
  const worker = new Worker(new URL('./passwordHasher.worker.js', import.meta.url));
  const slot = {worker, busy: null};
  worker.on('message', ({id, result, error}) => {
    const task = slot.busy;
    slot.busy = null;
    worker.unref();
    if (task && task.id === id) error ? task.reject(new Error(error)) : task.resolve(result);
    pump();
  });
  worker.on('error', e => {
    slot.busy?.reject(e); slot.busy = null;
    workers.splice(workers.indexOf(slot), 1);
    pump();
  });
  worker.unref();
  workers.push(slot);
  return slot;
}

function pump() {
  while (queue.length) {
    let slot = workers.find(w => !w.busy);
    if (!slot && workers.length < size()) {
      try { slot = spawnWorker(); } catch { disabled = true; break; }
    }
    if (!slot) return;
    const task = queue.shift();
    slot.busy = task;
    // Worker rảnh không giữ tiến trình sống; đang làm việc thì giữ đến khi trả kết quả.
    slot.worker.ref();
    slot.worker.postMessage({id: task.id, op: task.op, password: task.password, hash: task.hash, rounds: task.rounds});
  }
  // Không tạo được worker: làm nốt trên luồng chính.
  while (disabled && queue.length) {
    const task = queue.shift();
    (task.op === 'compare' ? bcrypt.compare(task.password, task.hash) : bcrypt.hash(task.password, task.rounds)).then(task.resolve, task.reject);
  }
}

function run(op, fields) {
  if (!size()) return op === 'compare' ? bcrypt.compare(fields.password, fields.hash) : bcrypt.hash(fields.password, fields.rounds);
  return new Promise((resolve, reject) => { queue.push({id: nextId++, op, ...fields, resolve, reject}); pump(); });
}

export const verifyPassword = (password, hash) => run('compare', {password: String(password ?? ''), hash: String(hash ?? '')});
export const hashPassword = (password, rounds = 12) => run('hash', {password: String(password ?? ''), rounds});
export const passwordWorkerStats = () => ({workers: workers.length, busy: workers.filter(w => w.busy).length, queued: queue.length, max: size()});
