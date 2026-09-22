# V6.6.4 — RUNBOOK AUTO-DEPLOY

## Luồng

```
push main
   ↓
VERIFY   (npm ci · build · npm test · npm run test:security · cổng migration)
   ↓  chỉ khi PASS
DEPLOY   (lock → SHA → cổng migration → build → backup → migrate → restart → health poll)
   ↓  nếu health fail
ROLLBACK ứng dụng về PREVIOUS_SHA
```

`concurrency: deploy-main` với `cancel-in-progress: false` — hai lần push xếp hàng, không deploy chồng.
Lớp thứ hai là `flock` trong `deploy-server.sh`, phòng khi có ai chạy tay trên máy chủ.

## Mã thoát của `deploy-server.sh`

| Mã | Ý nghĩa |
|---|---|
| `DEPLOY_OK` (0) | Health xanh, hoàn tất |
| `DEPLOY_SKIPPED_LOCK_HELD` (0) | Có tiến trình deploy khác đang chạy |
| `DEPLOY_BLOCKED_MANUAL_MIGRATION_REQUIRED` (3) | Migration có lệnh phá hủy dữ liệu — dừng **trước khi** đổi source |
| `DEPLOY_BLOCKED_BACKUP_FAILED` (4) | Sao lưu thất bại — không migrate, source trả về bản cũ |
| `DEPLOY_FAILED_MIGRATION` (5) | Migration lỗi — **không** restart, dịch vụ cũ vẫn chạy |
| `DEPLOY_FAILED_ROLLED_BACK_APP` (6) | Bản mới không lên; đã khôi phục bản cũ và health xanh |
| `DEPLOY_FAILED_NOT_RECOVERED` (7) | Rollback cũng không lên — cần can thiệp tay ngay |

## Cổng migration (§7)

`scripts/migration-safety.mjs` quét các file `backend/src/db/*.sql` **thay đổi giữa
`PREVIOUS_SHA` và `TARGET_SHA`**, chặn: `DROP TABLE/SCHEMA/DATABASE/COLUMN/TYPE`, `TRUNCATE`,
`DELETE FROM`, `ALTER TABLE ... RENAME`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`.

`DROP`/`CREATE OR REPLACE` cho trigger, function và view **không** bị chặn — đó là cách mọi migration
trong repo này tiến hóa hành vi, và chúng không phá dữ liệu.

Gặp migration phá hủy: chạy tay theo cửa sổ bảo trì, có backup đã kiểm chứng trong tay, rồi mới push.

## Sao lưu trước migration

Chỉ chạy khi lô này có migration mới (hoặc đặt `FORCE_BACKUP=1`). Dùng lại `scripts/backup.mjs`:
`pg_dump` trong snapshot REPEATABLE READ, tar `uploads/`, băm sha256 toàn bộ, ghi `manifest.json`.
Backup fail ⇒ dừng, đưa source về `PREVIOUS_SHA`, **không** migrate.

Script không log secret và không đóng gói `.env`.

## Health check

Poll 2 giây một lần, tổng 90 giây (`HEALTH_TIMEOUT`). Không dùng `sleep 2` rồi `curl` một lần.

Khi fail, in vào log Actions:

```bash
systemctl --user status nganhang.service --no-pager
journalctl --user -u nganhang.service -n 200 --no-pager
ss -ltnp | grep :3001
```

Đây chính là thứ còn thiếu trong sự cố run `35674256160` khiến không kết luận được nguyên nhân.

## Rollback

Chỉ rollback **ứng dụng**, không rollback database. An toàn vì cổng migration đã ép mọi migration
tự động phải additive + backward-compatible, nên bản cũ vẫn chạy được trên schema mới.

## Biến môi trường ghi đè

`APP_DIR`, `SERVICE`, `HEALTH_URL`, `HEALTH_PORT`, `HEALTH_TIMEOUT`, `LOCK_FILE`, `FORCE_BACKUP`.

## Nghiệm thu còn thiếu

`SERVER_DEPLOY_UAT_NOT_RUN` — phiên thực hiện không có quyền truy cập máy chủ Ubuntu. Các mệnh đề sau
mới chỉ đúng theo mã, chưa chạy trên máy thật:

- verify fail ⇒ deploy không chạy;
- backup fail ⇒ migrate không chạy;
- migration fail ⇒ restart không chạy;
- health retry dài hơn 2 giây;
- lần fail có diagnostics dịch vụ;
- hai lần deploy không chạy chồng.

Cách nghiệm thu rẻ nhất: push một commit vô hại và đọc log của job. Muốn thử nhánh rollback thì tạm
đặt `HEALTH_URL` sang cổng không có ai nghe trong một lần chạy thủ công (`workflow_dispatch`).
