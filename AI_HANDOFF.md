# AI HANDOFF

Cập nhật: 2026-09-22 · Phiên bản mã: **6.6.5** (root/backend/frontend + `/api/health`)
HEAD khi bắt đầu vòng này: `d01b801d129c179314a385796ae1e2f3751db1ba`

## Trạng thái hiện tại

V6.6.5 đã triển khai trực tiếp trên `nganhang-personalized-v6.3`, **chưa commit, chưa push**.
V6.6.4 (bulk workflow, question queue, review workspace, safe deploy) đã được commit ở `d01b801`.

Nội dung vòng V6.6.5:

1. **Curriculum Auto Resolver** — mã câu `Câu L. 2. 1. NB. 2. ĐS` + ngữ cảnh Môn/Khối → Outcome/YCCĐ
   exact → Bài qua `topic_yccd_map`. Không cần giáo viên chọn lại khi khớp chính xác.
2. **Question Workspace UX** — Kho/Nhập/Duyệt chung một vỏ, lọc mặc định 5 ô, bảng 6 cột,
   nhập 3 bước, bulk và editor chỉ hiện khi cần.
3. **Hồ sơ nhập chương trình tin cậy** `KHTN_OUTCOME_YCCD_OFFICIAL_V1` cho bộ 4 workbook KHTN 6–9.
4. **Gán Bài hàng loạt** theo nhóm YCCĐ, đi qua `persistQuestion`.

**Migration V6.6.5 là additive và đã áp lên DB local.** Máy chủ thật sẽ tự áp khi deploy.

## Hotfix sau audit `2f7ace2` (đã xong)

Audit GitHub phát hiện 3 lỗi P1 + 3 P2 ở Curriculum Auto Resolver. Đã sửa toàn bộ:

1. Số thứ tự Outcome/YCCĐ **luôn lấy từ nguồn**, không tự đếm lại (trước đây `H.2.4` bị biến thành `H.2.1`).
2. Resolver **chốt vào phiên bản chương trình đang hiệu lực**, không chỉ lọc `status='ACTIVE'`.
3. Hồ sơ nhập tin cậy **tự điền mapping cột** trong giao diện, không bắt map lại.
4. Đã **nạp thật bộ 4 workbook KHTN** trong test tích hợp: 5/5 PASS.
5. Mode B kiểm ở **mức cả lô**, không đòi mỗi YCCĐ đủ 10 câu.
6. Tách **"tự nhận diện từ mã"** khỏi "hợp lệ theo metadata" ở màn hình nhập.

Chi tiết: `docs/V6_6_5_ACCEPTANCE.md`.

**Việc cần người quyết:** workbook lớp 8, Chủ đề `18.Bảo vệ môi trường` có **hai YCCĐ khác nhau cùng
đánh số 1** trong chính văn bản nguồn. Hệ thống chặn và bắt sửa số, không tự đánh lại. Cần người phụ
trách chương trình rà hai dòng này trước khi nạp vào môi trường thật.

## Rủi ro cần xử lý

1. **Token GitHub lộ trong `.git/config`** — remote `origin` nhúng PAT plaintext. Cần thu hồi và đổi
   sang SSH/credential helper. Tồn từ vòng V6.6.4, **vẫn chưa xử lý**.
2. **Nghiệm thu máy chủ chưa chạy** — `SERVER_DEPLOY_UAT_NOT_RUN`, `ROOT_CAUSE_NOT_CONFIRMED` cho sự cố
   deploy run `35674256160`. Vòng V6.6.5 chủ động gác hạ tầng: `DEFERRED_INFRA_NOT_BLOCKING_UX_V665`.
3. **3 test tích hợp fail có sẵn từ trước** (đo baseline trên HEAD sạch `331be20`): hai Playwright
   timeout và một 401 phiên đăng nhập ở test competency V66. Chưa điều tra.

## Kiểm chứng đã chạy

Chạy tuần tự trên Windows + PostgreSQL 16 local; tích hợp clone DB dùng một lần.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | 88/88 |
| `npm run test:security` | 27/27 |
| `test/integration/pilot.test.js` | 34/34 |
| `test/integration/v664-bulk.test.js` | 12/12 |
| `test/integration/v665-resolver.test.js` | 10/10 |
| `test/integration/v665-bootstrap.test.js` (4 workbook thật) | 5/5 |
| `test/integration/v63.test.js` | 47/50 (3 lỗi có sẵn) |
| `npm run build` (frontend) | PASS |

**Tổng 188 pass / 3 fail, cả 3 đều có sẵn từ trước.**

Test bootstrap cần bộ 4 workbook tại `G:/tai lieu  oppa/UP SHARE/outcome khtn`; không có thì tự bỏ qua
kèm lý do, không báo đỏ giả.

Lưu ý khi chạy lại: **đừng dùng `npm run test:integration` để lấy kết luận** — chạy song song các file
tích hợp gây fail dây chuyền giả. Chạy từng file một.

## Việc tiếp theo

1. Thu hồi và thay GitHub token (ưu tiên cao nhất, tồn hai vòng).
2. Commit + push V6.6.5.
3. Nạp thật bộ 4 workbook KHTN chính thức qua hồ sơ tin cậy vào một phiên bản chương trình.
4. Nối `inferNumberingMode()` vào đường ghi khi commit lô nhập (hiện chỉ dùng ở tầng kiểm tra).
5. Viết Playwright E2E riêng cho toàn luồng V6.6.5 và chụp bộ ảnh UX.
6. Điều tra 3 test tích hợp lỗi có sẵn.
7. Lấy `journalctl` trên máy chủ để kết luận sự cố deploy; đóng gói release (releases/ còn ở v6.5.3).

## Tài liệu

- `docs/V6_6_5_CHANGES.md` — đã sửa gì, đã đạt gì (vòng này)
- `docs/V6_6_5_QUESTION_WORKSPACE_CURRICULUM_RESOLVER.md` — thiết kế resolver + UX
- `docs/V6_6_4_CHANGES.md`, `docs/V6_6_4_QUESTION_POWER_WORKFLOW.md` — vòng trước
- `docs/V6_6_4_DEPLOY_INCIDENT.md`, `docs/V6_6_4_DEPLOY_RUNBOOK.md` — deploy
- `artifacts/v665-question-resolver-acceptance.json`, `artifacts/v664-acceptance.json` — nghiệm thu
