# AI HANDOFF

Cập nhật: 2026-09-22 · Phiên bản mã: **6.6.4** (root/backend/frontend + `/api/health`)

## Trạng thái hiện tại

V6.6.4 đã triển khai trực tiếp trên `nganhang-personalized-v6.3`, **chưa commit, chưa push**.
Nền V6.6.3 (curriculum master, competency portfolio) giữ nguyên, không mở rộng thêm trong vòng này.

Nội dung vòng V6.6.4:

1. **Auto-deploy an toàn** — workflow tách `VERIFY → DEPLOY` + `concurrency`;
   `scripts/deploy-server.sh` viết lại: `set -Eeuo pipefail`, `flock`, `npm ci`, cổng migration,
   backup bắt buộc trước migrate, health poll 90 giây, diagnostics, rollback ứng dụng.
2. **Canonical bulk API** dưới `/api/practice` — preflight và thực thi dùng chung một đường domain
   (`versionWorkflow`/`transition`), atomic, chống phiên bản cũ.
3. **Review Workspace 3 tab** tại `/practice/reviews` (nhãn điều hướng: "Duyệt câu hỏi").
4. **Kho câu hỏi và Nhập câu hỏi** chuyển từ card-wall sang dense grid + preview dính.
5. **Nối liền Import → Duyệt** qua `import_job_id`.

**Không có migration mới.** Toàn bộ dữ liệu cần thiết đã có sẵn từ V6.4.3/V6.6.3.

## Rủi ro cần xử lý

1. **Token GitHub lộ trong `.git/config`** — remote origin nhúng PAT dạng plaintext. Cần thu hồi
   token và chuyển remote sang SSH/credential helper. Chưa tự sửa vì ảnh hưởng quyền push của chủ repo.
2. **Nghiệm thu máy chủ chưa chạy** — `SERVER_DEPLOY_UAT_NOT_RUN`. Không có quyền Ubuntu trong phiên này.
   Nguyên nhân sự cố deploy run `35674256160` vẫn là `ROOT_CAUSE_NOT_CONFIRMED`.
3. **3 test tích hợp fail sẵn từ trước** (đã đo trên HEAD sạch `331be20`, không phải do V6.6.4):
   hai test Playwright timeout và một test V66 competency lỗi 401 phiên đăng nhập. Cần điều tra riêng.

## Kiểm chứng đã chạy

Chạy tuần tự trên máy Windows với PostgreSQL 16 local; integration clone DB sang bản dùng một lần,
không đụng `nganhang_personalized_v63`.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | 74/74 |
| `npm run test:security` | 27/27 |
| `test/integration/pilot.test.js` | 34/34 |
| `test/integration/v63.test.js` | 47/50 (3 lỗi có sẵn, xem trên) |
| `test/integration/v664-bulk.test.js` (mới) | 12/12 |
| `npm run build` (frontend) | PASS |

Lưu ý khi chạy lại: **đừng chạy `npm run test:integration` để lấy kết luận** — ba file tích hợp chạy
song song sẽ tranh `pg_dump`/tài nguyên và gây fail dây chuyền giả. Chạy từng file một.

## Việc tiếp theo

1. Thu hồi và thay GitHub token (ưu tiên cao nhất).
2. Commit + push; lần push đầu nên chỉ gồm phần deploy safety để xác nhận workflow mới chạy (§10 của prompt).
3. Lấy `journalctl`/`systemctl status` trên máy chủ để kết luận sự cố deploy, cập nhật
   `docs/V6_6_4_DEPLOY_INCIDENT.md`.
4. Điều tra 3 test tích hợp fail sẵn.
5. Đóng gói release cho head hiện tại — `releases/` mới dừng ở v6.5.3.

## Tài liệu vòng này

- `docs/V6_6_4_CURRENT_AUDIT.md` — baseline audit
- `docs/V6_6_4_QUESTION_POWER_WORKFLOW.md` — thiết kế bulk/queue/import
- `docs/V6_6_4_DEPLOY_INCIDENT.md` — sự cố deploy
- `docs/V6_6_4_DEPLOY_RUNBOOK.md` — vận hành deploy
- `artifacts/v664-acceptance.json` — bằng chứng nghiệm thu
