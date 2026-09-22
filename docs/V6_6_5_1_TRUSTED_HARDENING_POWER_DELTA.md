# V6.6.5.1 — TRUSTED SOURCE HARDENING + POWER WORKFLOW DELTA

Nguồn: HEAD `3ab8f7fdfa0050e1ec3c597873870bca0b967c85` · Ngày 2026-09-23.
Không mở rộng phạm vi sản phẩm: đúng dữ liệu trước, nhanh thao tác sau.

---

## A. P1 — TRUSTED SOURCE HARDENING

### A1. Tải tệp mới không còn xóa ánh xạ vừa nhận diện

`readJob()` tự điền sheet, dòng tiêu đề và ánh xạ cột theo hồ sơ nguồn nhận diện được. Nhưng trình xử
lý tải tệp chạy sau đó lại `setSheet(j.sheets[0])` và `setColumns({})`, xóa sạch thứ vừa điền — người
dùng vẫn phải map cột thủ công đúng thứ hệ thống đã biết.

Đã bỏ hai lệnh đó. Trình xử lý tải tệp nay chỉ: upload → `readJob()` → `refresh()`.

### A2. Máy chủ tự kiểm hồ sơ nguồn, không tin client

Trước đây `mapImport()` nhận `source_profile` từ client rồi chạy chuẩn hóa nguồn mà không tự kiểm lại.
Client có thể khai sai hồ sơ, sai khối, sai cột.

Nay khi `source_profile = KHTN_OUTCOME_YCCD_OFFICIAL_V1`, máy chủ:

1. tự `detectTrustedProfile()` lại trên workbook **đã lưu**;
2. bắt buộc sheet được chọn phải thuộc danh sách sheet nhận diện được;
3. bắt buộc `sheet.grade === version.grade`;
4. **dùng header/cột/`topic_as_outcome` do chính mình suy ra**, bỏ qua giá trị client gửi;
5. lệch thì trả `409` kèm mã lỗi.

| Mã lỗi | Khi nào |
|---|---|
| `TRUSTED_SOURCE_NOT_DETECTED` | tệp không phải bộ nguồn chính thức |
| `TRUSTED_SOURCE_SHEET_UNKNOWN` | sheet không thuộc hồ sơ nhận diện được |
| `TRUSTED_SOURCE_GRADE_MISMATCH` | khối của sheet khác khối của phiên bản chương trình |

Bản ghi `mapping` lưu vào `curriculum_import_jobs` là **ánh xạ thực sự đã dùng**, không phải thứ
client gửi lên.

### A3. Giao diện không lấy tạm sheet đầu tiên

Trước đây khi không có sheet đúng khối, giao diện lấy `trusted.sheets[0]`. Nạp nhầm khối là sai chuẩn
chương trình, không phải phiền phức nhỏ. Nay chặn hẳn:

```
⚠ Không tìm thấy sheet Khối 8 trong nguồn này.
Nguồn có: Khối 6, Khối 7. Chọn đúng phiên bản chương trình hoặc đúng tệp nguồn.
```

### A4. Kiểm thử âm

Hai ca mới trong `v665-bootstrap.test.js`:

- phiên bản khối 8 + workbook khối 7 → `409 TRUSTED_SOURCE_GRADE_MISMATCH`, và **không dòng staging
  nào được dàn dựng**;
- client gửi `header_row: 1` và ánh xạ cột sai hoàn toàn → máy chủ vẫn dùng bản đúng do mình suy ra,
  và dữ liệu dàn dựng ra vẫn nhận đúng phân môn và số thứ tự.

Bộ bootstrap: **7/7 PASS** trên chính 4 workbook chính thức.

---

## B. P2 — POWER WORKFLOW

### B1. Kiểm cách đánh số của cả lô, nối vào màn nhập

`inferNumberingMode()` và `checkNumbering()` trước đây chỉ có ở tầng kiểm tra, chưa chạm luồng nhập
thật. Nay `getJob()` tính `job.numbering` từ chính mã câu của lô (tính khi đọc nên không cần cột mới
và luôn phản ánh bản nháp hiện tại), giao diện hiện cảnh báo dạng thu gọn:

```
Bộ 10 câu độc lập · 2 điểm cần xem
  • Bộ 10 câu phải đánh số 1→10 không lặp; hiện là 1, 2, 3, 4, 5, 6, 8, 9, 10
  • Cả bộ: mức VD có 1 câu, chuẩn là 2
```

Chỉ cảnh báo, không chặn nhập, **không tự sửa mã** người soạn đã đặt.
Khi xác nhận nhập, chế độ đánh số của lô được ghi vào `numbering_mode` của từng câu.

### B2. Chọn khoảng bằng Shift

Tick một dòng, rồi Shift+tick dòng khác để chọn cả đoạn giữa. Mốc neo cập nhật theo lần tick gần nhất.

### B3. Lý do trả sửa có mã, bỏ `window.prompt`

Bảy lý do chuẩn có `reason_code` để thống kê được câu hay bị trả vì lỗi gì, cộng ô ghi chú tự do:

```
Sai mức độ nhận thức · Sai hoặc chưa rõ YCCĐ / Bài · Dữ kiện chưa đủ hoặc mơ hồ
Phương án nhiễu chưa tốt · Đáp án hoặc lời giải chưa khớp · Hình, công thức hoặc bảng có vấn đề
Nghi trùng với câu đã có
```

Dùng chung cho cả trả sửa một câu (Kho, Duyệt) lẫn trả sửa hàng loạt.

### B4. Thanh thao tác hàng loạt gọn lại

Trước đây khi có lựa chọn, một thẻ lớn hiện ra với dropdown, kho đích, ô lý do, bốn mục checklist,
preflight và báo cáo — tất cả cùng lúc.

Nay là một thanh dính đáy màn hình:

```
24 câu đã chọn        [Gửi duyệt] [Duyệt] [Trả sửa] [Gán Bài] [Bỏ chọn]
```

Bấm một thao tác mới mở panel chứa đúng thứ thao tác đó cần: checklist chỉ hiện khi duyệt, popover
lý do chỉ hiện khi trả sửa, kho đích chỉ hiện khi có kho để chuyển.

### B5. Phím `E` mở rà soát chi tiết

Bổ sung vào bộ phím sẵn có J/K/Space/A/R. Không chạy khi con trỏ đang ở ô nhập liệu.

---

## C. KIỂM CHỨNG

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | **106/106** |
| `npm run test:security` | **27/27** |
| `pilot.test.js` | **34/34** |
| `v664-bulk.test.js` | **12/12** |
| `v665-resolver.test.js` | **10/10** |
| `v665-bootstrap.test.js` | **7/7** |
| `v63.test.js` | 47/50 — 3 lỗi **có sẵn từ trước** |
| `npm run build` (frontend) | **PASS** |

Ba lỗi có sẵn: hai Playwright timeout và một 401 phiên đăng nhập ở test competency V66. Đã đo baseline
trên HEAD sạch `331be20`.

---

## D. CHƯA LÀM (theo thứ tự ưu tiên còn lại của audit)

- Kéo thả tệp và nhập nhiều tệp một lúc.
- Tabs trạng thái Tất cả / Sẵn sàng / Cảnh báo / Lỗi ở màn nhập (hiện đã có bộ lọc trạng thái và nút
  “Chỉ hiện N câu cần xử lý”).
- Xuất Excel các dòng lỗi.
- Diff theo từ trong so sánh phiên bản.
- Sửa trực tiếp dòng lỗi khi nhập danh sách học sinh.
- Biểu đồ cho màn Vận hành, preset ma trận, gói đề một lần bấm.
- Phóng to ảnh và bàn phím số thập phân trên điện thoại cho học sinh.

## E. CÒN CẦN NGƯỜI QUYẾT

Workbook khối 8, Chủ đề `18.Bảo vệ môi trường` có **hai YCCĐ khác nhau cùng đánh số 1**. Hệ thống chặn
đúng và bắt sửa số trong staging, nhưng người phụ trách chương trình phải quyết số đúng trước khi nạp
vào môi trường thật.
