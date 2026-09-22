# V6.6.5 — NGHIỆM THU (sau audit `2f7ace2`)

Nguồn: HEAD `2f7ace2f5b54bb8e08fdb5eeb192280286d094cc` · Ngày: 2026-09-22 · Phiên bản: **6.6.5**

> **Vì sao bản nghiệm thu nằm trong `docs/` chứ không phải `artifacts/`**
> `.gitignore` bỏ qua `artifacts/` cùng nhóm với `backups/` và `*.dump`, vì thư mục đó chứa bản dump
> cơ sở dữ liệu và bản sao thư mục upload — dữ liệu thật của học sinh. Không ép `git add -f` vào đó.
> Bản JSON máy đọc vẫn được sinh ra tại `artifacts/v665-question-resolver-acceptance.json` cho lần
> chạy cục bộ; bản có hiệu lực để đối chiếu là tài liệu này, đúng như `docs/V6_5_ACCEPTANCE.md`.
> Audit mục 10 là đúng: tuyên bố cũ trong `docs/V6_6_5_CHANGES.md` đã được sửa lại.

---

## 1. KẾT QUẢ THEO DANH MỤC AUDIT

| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| P1.1 — Trusted import đánh lại số YCCĐ sai nguồn | **ĐÃ SỬA** | `normalizeSourceRows()` đọc số từ nguồn; test thật xác nhận `H.2.4` giữ nguyên, H.2 chạy tới 11 |
| P1.2 — Resolver chưa khóa vào curriculum version | **ĐÃ SỬA** | `effectiveCurriculumVersion()`; test công bố bản 2 rồi kiểm resolver không trả bản cũ |
| P1.3 — Trusted profile chỉ phát hiện, chưa auto-apply | **ĐÃ SỬA** | `readJob()` tự điền sheet/header/cột; banner nhận diện; cảnh báo lệch khối |
| P1.4 — Chưa nạp thật 4 workbook | **ĐÃ CHẠY** | `test/integration/v665-bootstrap.test.js` — 5/5 PASS trên chính 4 tệp chính thức |
| P2.1 — Mode B validator sai khi nhiều YCCĐ | **ĐÃ SỬA** | `checkNumbering()` tách `PER_BATCH` / `PER_YCCD`; test 5+5 qua 2 YCCĐ hợp lệ |
| P2.2 — "Tự nhận diện" đồng nhất với VALID | **ĐÃ SỬA** | Đếm tách `autoResolved` / `validManual` trong `ImportCenter` |
| P2.3 — Acceptance artifact không có trong repo | **ĐÃ SỬA** | Tài liệu này; tuyên bố cũ trong CHANGES đã chỉnh |

---

## 2. KHẲNG ĐỊNH THEN CHỐT (§14 của audit)

```
Câu H. 2. 4. NB. 1. TN  +  KHTN khối 8  →  YCCĐ H.2.4
```

**ĐẠT.** Chạy trên chính workbook `Outcome_YCCD_KHTN_8.xlsx`:

- nạp qua hồ sơ tin cậy → DRAFT → PUBLISHED;
- `resolveCurriculumCode(subject, grade 8, 'H', 2, 4)` trả về YCCĐ có nội dung bắt đầu bằng
  *"Nêu được khái niệm sự biến đổi vật lí, biến đổi hoá học"* — đúng dòng số 4 của nguồn;
- `H.2` trong DB có YCCĐ từ 4 đến 11, **không** bị đánh lại thành 1–8.

Khối 9: `L.2` có đúng các YCCĐ 1–7 như nguồn.

---

## 3. PHÁT HIỆN MỚI TRONG CHÍNH NGUỒN CHÍNH THỨC

Khi chạy bootstrap thật, hệ thống phát hiện một lỗi dữ liệu mà audit chưa nêu:

**Workbook lớp 8, Chủ đề `18.Bảo vệ môi trường`** có **hai YCCĐ khác nhau cùng đánh số `1`**
(dòng 194 và 195 của bảng tính):

```
1. Trình bày được tác động của con người đối với môi trường qua các thời kì…
1. Nêu được khái niệm ô nhiễm môi trường. Trình bày được sơ lược về một số nguyên nhân…
```

Đây là lỗi của văn bản nguồn, không phải của phần mềm. Xử lý:

- hệ thống **không** tự đánh lại số — đó là quyết định của người phụ trách chương trình;
- gắn cờ `SOURCE_ORDINAL_DUPLICATE` và đặt dòng thành `BLOCKED`;
- cờ này **không** thể "xác nhận cho qua" bằng `accept_source_warnings`, vì hai YCCĐ sẽ đụng cùng
  một khóa tra cứu;
- người dùng sửa số ngay trong staging; sửa xong cờ tự mất và commit được.

Cần người phụ trách chương trình rà lại hai dòng này trước khi nạp vào môi trường thật.

---

## 4. XỬ LÝ NGUỒN KHÔNG CHUẨN (§3, §4 của audit)

| Hình dạng trong nguồn | Xử lý | Cờ |
|---|---|---|
| `2.Phản ứng hóa học` | đọc số 2 làm `source_ordinal` | — |
| `4. Nêu được…` | đọc số 4, giữ nguyên | — |
| Một ô chứa `1. … \n2. … \n3. …` | tách thành từng YCCĐ | `SOURCE_ROW_SPLIT` |
| `1. … \n+ bullet \n+ bullet` | **không** tách; `+` là dòng nối tiếp | — |
| `. Mô tả được …:\n1. …\n2. …` | tách; câu dẫn gắn vào mục đầu | `SOURCE_LEADIN_TEXT` |
| `. 5Nêu được…` | đọc số 5, tách chữ ra | `SOURCE_NUMBER_MALFORMED` |
| `6 Trình bày được…` (thiếu dấu chấm) | đọc số 6 | `SOURCE_NUMBER_MALFORMED` |
| Không có số nào | đếm tuần tự | `SOURCE_ORDINAL_FALLBACK` |
| Hai YCCĐ cùng số | **chặn hẳn** | `SOURCE_ORDINAL_DUPLICATE` |

Kết quả chuẩn hóa trên 4 tệp thật:

| Khối | Dòng nguồn | YCCĐ sau chuẩn hóa | Dòng gắn cờ |
|---|---|---|---|
| 6 | 135 | 135 | 0 |
| 7 | 97 | 107 | 15 |
| 8 | 194 | 194 | 2 (trùng số) |
| 9 | 191 | 191 | 1 |

---

## 5. KIỂM CHỨNG

Chạy **tuần tự** trên Windows + PostgreSQL 16 local; tích hợp clone DB dùng một lần.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | **100/100** |
| `npm run test:security` | **27/27** |
| `test/integration/pilot.test.js` | **34/34** |
| `test/integration/v664-bulk.test.js` | **12/12** |
| `test/integration/v665-resolver.test.js` | **10/10** |
| `test/integration/v665-bootstrap.test.js` (mới, dùng 4 tệp thật) | **5/5** |
| `test/integration/v63.test.js` | 47/50 — 3 lỗi **có sẵn từ trước** |
| `npm run build` (frontend) | **PASS** |
| Cổng migration additive | **PASS** |

**Tổng: 188 pass / 3 fail — cả 3 đều có sẵn trước V6.6.4, đã đo baseline trên HEAD sạch `331be20`.**

Ba lỗi có sẵn: hai ca Playwright timeout (`V643 UI học sinh`, `V66 giao diện editor/version/diff`)
và một ca 401 phiên đăng nhập (`V66 năng lực có phân quyền`).

Test bootstrap tự bỏ qua kèm lý do rõ ràng nếu máy chạy không có bộ 4 workbook, thay vì báo đỏ giả.

---

## 6. MIGRATION

| File | Nội dung | Cổng additive |
|---|---|---|
| `migration-v665-curriculum-code.sql` | khóa tra cứu, chế độ đánh số, trạng thái gắn Bài | PASS |
| `migration-v665-import-split.sql` | `source_segment` + khóa duy nhất mới cho bảng staging | PASS |

Migration thứ hai nới ràng buộc duy nhất của `curriculum_import_rows` từ
`(job, sheet, dòng nguồn)` thành `(job, sheet, dòng nguồn, thứ tự trong dòng)`, vì một dòng bảng tính
có thể chứa nhiều YCCĐ. Đây là bảng dàn dựng tạm, không phải dữ liệu lịch sử; không bản ghi nào mất.

---

## 7. CÒN LẠI

1. **Rà hai dòng trùng số của workbook lớp 8** (Chủ đề 18) với người phụ trách chương trình trước khi
   nạp vào môi trường thật.
2. **Chưa có Playwright E2E riêng** cho toàn luồng V6.6.5; hiện phủ ở tầng API và một phần UI qua
   ca Playwright trong `pilot.test.js`.
3. **Chưa chụp bộ ảnh UX.**
4. **`numbering_mode` chưa được ghi tự động khi commit lô nhập câu hỏi** — `inferNumberingMode()` và
   `checkNumbering()` đã có và đã sửa đúng, nhưng mới dùng ở tầng kiểm tra.
5. **Ba ca tích hợp lỗi có sẵn** vẫn chưa được điều tra.
6. **Hạ tầng CI/deploy**: `DEFERRED_INFRA_NOT_BLOCKING_UX_V665`.
7. **Token GitHub vẫn nằm plaintext trong `.git/config`** — tồn từ V6.6.4, cần thu hồi.
