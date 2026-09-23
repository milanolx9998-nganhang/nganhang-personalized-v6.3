// Dọn dẹp sau test tích hợp (V6.6.6.1): mỗi tệp test dựng một database tạm bằng pg_dump/pg_restore, một
// thư mục uploads sao chép và một tệp dump. Không dọn thì chạy vài lần là đầy ổ đĩa / đầy danh sách database.
//
// Mặc định xóa hết. Đặt KEEP_ARTIFACTS=1 để giữ lại database + uploads khi cần điều tra một lần chạy lỗi.
// Ảnh chụp giao diện và log máy chủ luôn giữ (tên cố định, lần sau ghi đè — không tích tụ).
import fs from 'node:fs';

export const keepArtifacts = () => process.env.KEEP_ARTIFACTS === '1';

export async function dropTempDatabase(adminPool, name) {
  if (!name || !/^nganhang_[a-z0-9]+(?:_test)?_\d{10,}$/.test(name)) throw new Error('Từ chối xóa database không phải database tạm của test: ' + name);
  // Chỉ dừng kết nối của chính tài khoản DB này; tiến trình nền của PostgreSQL (autovacuum) không có
  // quyền dừng — DROP DATABASE tự báo chúng thoát, nên thử lại vài lần khi DB còn "đang được dùng".
  await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND usename=current_user', [name]);
  for (let attempt = 1; ; attempt++) {
    try { await adminPool.query('DROP DATABASE IF EXISTS ' + name); return; }
    catch (e) {
      if (attempt >= 10 || !/being accessed|đang được/i.test(e.message)) throw e;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

export function removePath(target) {
  if (!target) return;
  try { fs.rmSync(target, {recursive: true, force: true}); } catch { /* đã xóa hoặc đang bị khóa: bỏ qua */ }
}

// Gọi trong test.after: dừng server, đóng pool, rồi xóa database tạm, tệp dump và uploads tạm.
export async function cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}) {
  server?.kill();
  if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 3000); });
  await db?.end().catch(() => {});
  try {
    if (!keepArtifacts()) {
      await dropTempDatabase(adminPool, name);
      removePath(dump);
      removePath(uploadsDir);
    }
  } finally {
    await adminPool.end().catch(() => {});
  }
}
