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
| `test/integration/v63.test.js` | 47/50 (3 lỗi có sẵn) |
| `npm run build` (frontend) | PASS |

**Tổng 171 pass / 3 fail, cả 3 đều có sẵn từ trước.**

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
