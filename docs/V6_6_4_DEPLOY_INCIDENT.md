# V6.6.4 — SỰ CỐ AUTO-DEPLOY

## Trạng thái kết luận

`ROOT_CAUSE_NOT_CONFIRMED`

Phiên làm việc này chạy trên máy Windows của tác giả, không có quyền truy cập máy chủ Ubuntu
đang chạy `nganhang.service`. Các lệnh chẩn đoán bắt buộc theo §4 chưa chạy được:

```bash
systemctl --user status nganhang.service --no-pager
journalctl --user -u nganhang.service -n 200 --no-pager
ss -ltnp | grep 3001 || true
curl -v http://127.0.0.1:3001/api/health || true
```

Không suy luận nguyên nhân từ log không có, không tạo bằng chứng thay thế.

## Dữ kiện đã có

GitHub Actions run `35674256160`, commit `331be205`:

1. `git fetch` + `git reset --hard origin/main` — PASS
2. Frontend `npm install` + Vite build — PASS
3. Backend `npm install` + `npm run migrate` (`upgrade.js`) — PASS
4. `systemctl --user restart nganhang.service` — lệnh trả về, không có lỗi trong log
5. `sleep 2`
6. `curl -s -f http://127.0.0.1:3001/api/health` — FAIL, `Connection refused`
7. `set -e` làm script thoát non-zero ⇒ job `failure`

## Hai giả thuyết chưa phân biệt được

**H1 — App khởi động chậm hơn 2 giây.** `server.js` kiểm tra kết nối DB trước khi `listen()`
(`backend/src/server.js:101-119`). Với Supabase qua mạng, handshake TLS + truy vấn kiểm tra có thể
vượt 2 giây dễ dàng. Nếu đúng H1 thì `Connection refused` chỉ là ảnh chụp quá sớm, app lên bình thường
vài giây sau — và job vẫn báo failure sai.

**H2 — Service crash khi khởi động.** `server.js` gọi `process.exit(1)` khi không kết nối được DB;
`middleware/auth.js:8-12` cũng `process.exit(1)` nếu thiếu `JWT_SECRET` ở production;
`config/profile.js` throw ngay khi import nếu cấu hình môi trường không hợp lệ. Bất kỳ nhánh nào trong
số đó đều cho đúng triệu chứng `Connection refused`.

Không có `journalctl` thì H1 và H2 cho cùng một dấu vết quan sát được. Đây chính là lý do §8 yêu cầu
in diagnostics khi health fail.

## Đã sửa gì trong vòng này

Không "đoán là start chậm rồi tăng sleep". Thay vào đó sửa để lần sau **tự phân biệt được** H1/H2:

- `scripts/deploy-server.sh` chuyển từ `sleep 2` + một lần `curl` sang vòng poll 2 giây một lần,
  tổng 90 giây (`wait_healthy()`). Nếu là H1, deploy sẽ PASS thay vì báo lỗi giả.
- Khi health fail, `diagnostics()` in `systemctl status`, `journalctl -n 200` và `ss -ltnp` vào log
  Actions. Nếu là H2, lần chạy tới sẽ có đúng bằng chứng để kết luận.
- Thêm `set -Eeuo pipefail`, deploy lock `flock`, `npm ci` khi có lockfile, backup bắt buộc trước
  migration, và rollback ứng dụng về `PREVIOUS_SHA` khi health fail.

## Việc còn lại trên máy chủ

Người có quyền Ubuntu cần chạy khối lệnh ở đầu tài liệu này và dán kết quả vào đây, hoặc đơn giản là
push một commit để workflow mới tự in diagnostics. Sau đó mới cập nhật kết luận từ
`ROOT_CAUSE_NOT_CONFIRMED` sang nguyên nhân thật.
