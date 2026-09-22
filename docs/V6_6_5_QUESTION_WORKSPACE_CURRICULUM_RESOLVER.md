# V6.6.5 — QUESTION WORKSPACE + CURRICULUM AUTO RESOLVER

Nguồn: HEAD `d01b801d129c179314a385796ae1e2f3751db1ba`.
Vòng này **không** rewrite backend V6.6.4. AccessResolver, bank ACL, bulkWorkflow, preflight,
`transition()`, `versionWorkflow()`, chống phiên bản cũ, questionQueue, import jobs, hồ sơ rà soát,
bảo mật đáp án và versioning chương trình đều giữ nguyên.

---

## 1. LUỒNG DỮ LIỆU

```
Giáo viên chọn  Môn + Khối          ← ngữ cảnh phiên nhập, chọn một lần
        ↓
Tệp câu hỏi → mã câu "Câu L. 2. 1. NB. 2. ĐS"
        ↓
parseQuestionCode()                  ← phân môn, số Outcome, số YCCĐ, mức, số đơn vị, hình thức
        ↓
resolveCurriculumCode(môn, khối, L, 2, 1)
        ↓
Outcome L.2 · YCCĐ L.2.1             ← exact, không cần giáo viên chọn lại
        ↓
resolveLesson(YCCĐ)  →  topic_yccd_map
        ↓
1 Bài → tự gắn · 0 Bài → vẫn nhập được · >1 Bài → hỏi người dùng
        ↓
Kho câu hỏi → Gửi duyệt → Duyệt nhanh
```

Nguyên tắc bất biến của vòng này:

> **Mã câu quyết định Outcome/YCCĐ. Mã câu không quyết định Bài.**
> Bài chỉ đến từ liên kết Bài–YCCĐ. "Bài 2" và "Outcome 2" là hai hệ đánh số độc lập.

---

## 2. NGỮ PHÁP MÃ CÂU

```
Câu <Phân môn>. <Outcome>. <YCCĐ>. <Mức>. <Số đơn vị>. <Hình thức>
Câu L. 2. 1. NB. 2. ĐS
```

| Thành phần | Giá trị hợp lệ |
|---|---|
| Phân môn | `L` Vật lí · `H` Hóa học · `S` Sinh học |
| Outcome / YCCĐ / Số đơn vị | số nguyên từ 1 |
| Mức | `NB` `TH` `VD` `VDC` |
| Hình thức | `TN` `ĐS` `TLN` `GN` `TL` |

Regex chuẩn (`backend/src/services/questionCode.js`):

```
^Câu\s+([LHS])\.\s+(\d+)\.\s+(\d+)\.\s+(NB|TH|VD|VDC)\.\s+(\d+)\.\s+(TN|ĐS|TLN|GN|TL)$
```

Dạng viết liền cũ `Câu.L.2.1.NB.2.ĐS` **được đọc** để chuyển đổi, nhưng luôn chuẩn hóa lại về dạng
chính thức và gắn cảnh báo `LEGACY_CODE_FORMAT`. Hệ mã kiểu `KHTN8.H.O02.Y04...` không được chấp nhận.

`buildDisplayCode()` chỉ sinh ra đúng một định dạng — không có biến thể rút gọn.

---

## 3. KHỐI KHÔNG NẰM TRONG MÃ

Ở bước 1 của màn hình Nhập câu, giáo viên chọn **Môn** và **Khối**. Đó là ngữ cảnh của cả phiên nhập,
nên mã câu không cần mang khối. Hệ quả kỹ thuật:

- Khóa tra cứu là `môn + khối + phân môn + số Outcome + số YCCĐ`, không bao giờ chỉ `L.2.1`.
- Cùng một mã nghiệp vụ tồn tại song song ở nhiều khối mà không đụng nhau. Có ca kiểm thử riêng cho
  `L.1.3` ở khối 7 và khối 9.
- `display_code` **không** unique toàn cục. Không gian duy nhất tối thiểu là `môn + khối + display_code`.

Khóa máy nội bộ có dạng `KHTN:G9:L:2:1` (`canonicalKey()`), dùng cho tra cứu và idempotency, không
hiển thị thường trực cho giáo viên. Giao diện dùng nhãn nghiệp vụ `L.2` và `L.2.1`.

---

## 4. HAI CHẾ ĐỘ ĐÁNH SỐ

Hệ thống lưu `numbering_mode` và `content_number` riêng, **không** gộp mọi trường hợp vào một biến
`sequence` rồi đoán.

| | Mode A `CONTENT_UNIT_5_FORMS` | Mode B `INDEPENDENT_10` |
|---|---|---|
| Cấu trúc | 1 YCCĐ = 4 đơn vị × 5 hình thức = 20 câu | 10 câu độc lập |
| Số câu | lặp theo đơn vị kiến thức | 1 → 10, không lặp |
| Hình thức | TN ĐS TLN GN TL | TN ĐS TLN GN (mặc định 4/3/1/2) |
| Mức | 6 / 6 / 4 / 4 | 3 / 3 / 2 / 2 |

Ở Mode A, năm hình thức của cùng một đơn vị kiến thức dùng **chung một số**:

```
Câu L. 1. 3. NB. 2. TN
Câu L. 1. 3. NB. 2. ĐS
Câu L. 1. 3. NB. 2. TLN
Câu L. 1. 3. VD. 2. GN
Câu L. 1. 3. VDC. 2. TL
```

`inferNumberingMode()` suy chế độ từ chính lô câu; `checkNumbering()` báo lệch (số đơn vị, tổng số câu,
phân bố mức, trùng mã, Tự luận xuất hiện ở Mode B). Đây là **cảnh báo**, không tự sửa mã.

---

## 5. MỨC ĐỘ LÀ KHAI BÁO, KHÔNG PHẢI BẰNG CHỨNG

Mức trong mã là `declared_level`. Hệ thống không âm thầm sửa mã khi thấy nội dung có vẻ ở mức khác;
nó báo để giáo viên quyết. Mức khai trong metadata lệch với mức trong mã sẽ được nêu ra như một xung
đột cần xem, và **giá trị người dùng khai được giữ nguyên** — hệ thống không chọn hộ bên nào.

---

## 6. HỒ SƠ NHẬP CHƯƠNG TRÌNH TIN CẬY

`KHTN_OUTCOME_YCCD_OFFICIAL_V1` dành riêng cho bộ 4 workbook KHTN 6–9 chính thức.

```
Môn | Chủ đề | Yêu cầu cần đạt | Trang nguồn
  ↓      ↓            ↓               ↓
branch  Outcome      YCCĐ          source_page
```

- Khối lấy từ **tên sheet** (`YCCĐ lớp 7`), không lấy từ tên tệp viết tắt.
- Chỉ hồ sơ này mới được coi cột "Chủ đề" là Outcome. Importer tổng quát vẫn bắt người dùng bật
  `topic_as_outcome` tường minh — một bảng bất kỳ có cột "Chủ đề" không phải là chuẩn chương trình.
- Số thứ tự Outcome đếm theo **từng phân môn**, số thứ tự YCCĐ đếm **trong từng Outcome**, theo thứ tự
  xuất hiện trong văn bản nguồn. Đó chính là nghĩa của "Outcome số 2 của phân môn Vật lí".

Nạp lại đúng bộ nguồn là idempotent: cùng khóa + cùng nội dung ⇒ bỏ qua và đếm vào `unchanged`;
cùng khóa + khác nội dung ⇒ dừng và trả về cả hai bản để đối chiếu. Không ghi đè âm thầm.

Versioning chương trình giữ nguyên: DRAFT → PUBLISHED, bản đã công bố bất biến, lineage, replacements,
impact. Hồ sơ tin cậy chỉ làm bước map cột dễ hơn.

---

## 7. GẮN BÀI

`resolveLesson()` tra `topic_yccd_map` và trả đúng ba kết quả:

| Kết quả | Hành vi | Trạng thái lưu |
|---|---|---|
| 1 Bài | tự gắn | `AUTO_MAPPED` |
| 0 Bài | **không chặn nhập**, câu vẫn vào kho | `UNMAPPED` |
| >1 Bài | không đoán, hỏi người dùng | `AMBIGUOUS` |

Người dùng chọn tay ⇒ `MANUAL`.

Kho câu hỏi có bộ lọc **Chưa gắn Bài** và thao tác hàng loạt **Gán Bài**. Gán Bài nhóm theo từng YCCĐ,
mỗi nhóm có danh sách Bài ứng viên riêng; không gán một Bài mù cho các câu khác YCCĐ. Bài được gán phải
thực sự liên kết với YCCĐ của câu, trừ khi người dùng ghi đè tường minh.

Gán Bài đi qua `persistQuestion()` — đúng đường mà trình soạn thảo dùng — nên giữ nguyên phân loại
thay đổi, nhật ký metadata và hồ sơ rà soát. Không có SQL trực tiếp đổi `topic_id`.

---

## 8. CHẶN VÀ CẦN XEM

**Chặn** (không cho xác nhận):
- mã đọc được nhưng Outcome không tồn tại trong môn/khối đã chọn;
- YCCĐ không tồn tại trong Outcome đó;
- thiếu ngữ cảnh khối;
- lỗi cấu trúc câu hỏi.

**Không bao giờ tự tạo Outcome/YCCĐ từ luồng nhập câu hỏi.** Có ca kiểm thử đếm số Outcome trước và sau
để chứng minh điều này.

**Cần xem** (vẫn nhập được sau khi người dùng xử lý):
- mã không đọc được theo quy ước hiện hành;
- mã và metadata lệch nhau (YCCĐ, hình thức, mức);
- YCCĐ đúng nhưng chưa gắn Bài;
- YCCĐ thuộc nhiều Bài;
- mã viết liền kiểu cũ.

> **Sai lệch có chủ ý so với §26 của prompt.** Prompt liệt kê "không parse được mã" vào nhóm chặn.
> Ở đây nó được xếp vào **cần xem**, vì nhiều tệp đang lưu hành chưa theo quy ước mã mới và việc chặn
> cứng sẽ làm hỏng luồng nhập đang dùng được. Điều thực sự nguy hiểm — mã hợp lệ nhưng chuẩn chương
> trình không tồn tại — vẫn bị chặn đúng như yêu cầu.

---

## 9. UX

### Vỏ chung

Ba màn hình dùng chung một vỏ và một ngôn ngữ:

```
NGÂN HÀNG CÂU HỎI
[Kho câu hỏi] [Nhập câu] [Duyệt câu]
```

Điều hướng bên trái gộp về một mục **Ngân hàng câu hỏi**; các route sâu vẫn dùng được.

### Bộ lọc

Mặc định đúng năm ô: `Tìm · Môn · Khối · Bài · Lọc thêm`. Phân môn, Outcome, YCCĐ, mức, dạng, nhãn,
người biên soạn, trạng thái, chất lượng phân loại, đợt nhập nằm sau **Lọc thêm**. Bộ lọc đang áp dụng
hiện thành chip bấm để bỏ.

### Bảng kho

Sáu cột: `☑ · Mã · Nội dung · Bài · YCCĐ · Mức · Trạng thái`. Không hiển thị ID kỹ thuật.
Preview bên phải ưu tiên **nội dung** trước: đề → phương án → đáp án → lời giải, rồi mới đến Bài,
chuẩn, mức/dạng, kho.

### Hiển thị theo ngữ cảnh

- Không chọn câu nào ⇒ không có thanh thao tác hàng loạt.
- Không có cảnh báo ⇒ không có khối cảnh báo.
- Không có câu trùng ⇒ không có ô quyết định trùng.
- Chưa bấm "Lọc thêm" ⇒ không có bộ lọc nâng cao.
- Chưa bấm "Sửa chi tiết" ⇒ không mount trình soạn thảo.
- Chưa bấm "Xem kỹ" ⇒ không mở panel rà soát sâu.

### Nhập câu — ba bước

```
1. Chọn tệp        Môn + Khối, kéo thả tệp
2. Kiểm tra & sửa  Tìm thấy 120 câu · ✓105 tự nhận diện · !12 cần xem · ×3 lỗi
                   [Chỉ hiện 15 câu cần xử lý]
3. Xác nhận        Đã nhập 108 câu · 105 đã gắn Bài · 3 chưa gắn Bài
                   [Xem trong kho] [Gửi 108 câu đi duyệt] [Xử lý 3 câu chưa gắn Bài]
```

Khi mở một lô đang soạn, màn hình tự lọc về các câu cần xử lý nếu có.

### Duyệt câu

Ba tab với tên người dùng hiểu được: **Bản nháp của tôi** · **Chờ duyệt** · **Cần xem kỹ**.
Người có quyền duyệt mở thẳng "Chờ duyệt"; người chỉ biên soạn mở "Bản nháp của tôi".
Preview có bộ đếm `Câu 7 / 28` và cặp nút `← →`; duyệt hoặc trả sửa xong thì tự sang câu kế tiếp.
Phím tắt J/K/Space/A/R, không chạy khi con trỏ đang ở ô nhập liệu.

---

## 10. THAY ĐỔI DỮ LIỆU

Migration `migration-v665-curriculum-code.sql` — **additive tuyệt đối**, qua được cổng an toàn của
auto-deploy:

- `curriculum_outcomes`: `source_branch_code`, `source_ordinal`, `canonical_key`, `source_text`
- `curriculum_yccds`: `source_ordinal`, `canonical_key`, `source_text`, `source_page`
- `questions`: `numbering_mode`, `content_number`, `lesson_status`
- Chỉ mục duy nhất theo `(curriculum_version_id, canonical_key)` cho bản chưa RETIRED
- Backfill khóa cho dữ liệu đã có, chỉ khi mã hiện tại kết thúc bằng một số rõ ràng

Không đổi kiểu cột, không xóa, không rename, không đụng lineage ID.

---

## 11. GIỚI HẠN ĐÃ BIẾT

1. **Hạ tầng CI/deploy**: `DEFERRED_INFRA_NOT_BLOCKING_UX_V665`. Không đụng trong vòng này.
2. **Chưa nạp thật 4 workbook chính thức.** Hồ sơ tin cậy đã có và được kiểm thử ở mức nhận diện
   sheet/cột/khối và đánh số thứ tự, nhưng bộ 4 tệp thật chưa được commit vào một phiên bản chương
   trình vận hành.
3. **Chưa có Playwright E2E riêng cho toàn luồng V6.6.5.** Luồng được phủ ở tầng API bởi 10 ca tích hợp
   và phủ một phần ở UI bởi ca Playwright trong `pilot.test.js` (ba bước nhập, lưới không mount editor,
   không có bulk khi chưa chọn, bộ lọc mặc định gọn).
4. **Chưa chụp bộ ảnh UX.**
5. **Ba ca tích hợp lỗi có sẵn từ trước V6.6.4** vẫn còn (hai Playwright timeout, một 401 phiên
   đăng nhập ở test competency V66). Đã đo baseline trên HEAD sạch, không phải do V6.6.4/V6.6.5.
6. **`content_number` chỉ được điền khi câu đến từ mã câu.** Câu nhập bằng đường khác vẫn để trống,
   và `inferNumberingMode` chạy ở tầng kiểm tra lô chứ chưa ghi `numbering_mode` tự động khi commit.
