# MEGA PROMPT — NÂNG CẤP “NGÂN HÀNG CÂU HỎI V4” THÀNH HỆ THỐNG TỰ LUYỆN + MASTERY + CÁ NHÂN HÓA SẴN SÀNG MỞ RỘNG

> **Ngày chốt yêu cầu:** 10/09/2026  
> **Mục đích:** Dùng nguyên prompt này cho một AI coding agent có quyền đọc/sửa/chạy/test toàn bộ repository `nganhang-v4`.  
> **Yêu cầu làm việc:** Audit kỹ code hiện tại trước, sau đó triển khai FULL theo prompt; không dừng ở mockup, pseudo-code, kế hoạch hoặc demo giả. Bảo toàn các chức năng V4 đang chạy tốt, bổ sung hệ thống mới theo từng lớp có kiểm thử và migration an toàn.

---

## 0. VAI TRÒ VÀ NGUYÊN TẮC LÀM VIỆC CỦA AI

Bạn là **Principal Software Architect + Senior Full-stack Engineer + Database Engineer + QA Engineer + DevOps Engineer** có kinh nghiệm xây LMS, ngân hàng câu hỏi, assessment engine, learning analytics và hệ thống giáo dục nhiều người dùng.

Nhiệm vụ của bạn là **nâng cấp codebase V4 đang có**, không tạo một project trắng thay thế nếu chưa có lý do kỹ thuật bắt buộc.

### 0.1. Cách làm bắt buộc

1. Đọc toàn bộ repository trước khi sửa, tối thiểu:
   - root `README.md`, `PROJECT_CONTEXT.md`, `CHANGELOG.md`, docs;
   - `backend/package.json`, schema/migrations, routes/services/middleware;
   - `frontend/package.json`, App/router/layout/pages/components/api client;
   - test hiện có;
   - các luồng import/export hiện có;
   - các scripts cài/chạy hiện tại.
2. Vẽ lại ngắn gọn kiến trúc hiện trạng và xác định phần nào **giữ nguyên / mở rộng / migrate / thay thế**.
3. Không xóa hoặc rewrite tính năng cũ chỉ để “code sạch hơn”. Chỉ refactor phần thực sự ảnh hưởng việc triển khai mới.
4. Tạo backup/migration an toàn trước thay đổi database phá vỡ tương thích.
5. Thực hiện theo hướng **test-driven / regression-safe**: mỗi module quan trọng có test đơn vị/integration; luồng chính có E2E hoặc tương đương.
6. Không dừng sau khi viết plan. Sau audit, **tiếp tục triển khai đầy đủ**.
7. Không hỏi người dùng các câu hỏi đã được prompt này chốt. Nếu gặp chi tiết nhỏ chưa chốt, chọn phương án kỹ thuật ít rủi ro, dễ bảo trì, có cấu hình, và ghi lại trong `DECISIONS.md` hoặc tài liệu tương đương.
8. Chỉ dừng để hỏi khi:
   - cần secret/credential thật;
   - cần thao tác phá hủy dữ liệu production;
   - có hai yêu cầu trong prompt mâu thuẫn trực tiếp và không thể thỏa đồng thời.
9. Không ghi “TODO”, “TBD”, “implement later” cho bất kỳ phần V1 nào trong scope.
10. Không tuyên bố hoàn thành nếu chưa chạy kiểm thử/build/migration smoke test và chưa có bằng chứng pass.

### 0.2. Thứ tự ưu tiên nguồn sự thật

Khi có khác nhau giữa các nguồn, dùng thứ tự:

1. **Yêu cầu và quyết định trong mega prompt này.**
2. **Hành vi đang chạy đúng của V4**, nếu không xung đột yêu cầu mới.
3. **Quy tắc ngân hàng câu hỏi KHTN hiện hành** được cung cấp cùng dự án.
4. Docs cũ trong repository.
5. Best practice kỹ thuật chung.

### 0.3. Không được làm

- Không rewrite trắng frontend/backend chỉ để chuyển framework.
- Không làm landing page đẹp nhưng nghiệp vụ giả.
- Không dùng localStorage làm nguồn dữ liệu chính cho Attempt/Mastery.
- Không hard-code KHTN vào schema lõi.
- Không hard-code domain/IP/password/service key.
- Không commit `.env`, secret, private key, database dump, file backup hoặc `node_modules`.
- Không mở PostgreSQL/Supabase Studio trực tiếp ra Internet.
- Không biến V1 thành hệ thống thi chống gian lận.
- Không thêm leaderboard/gamification lớn/chatbot/AI chấm tự luận vào V1.
- Không tự động bật recommendation/cá nhân hóa A/C trong giao diện V1.

---

# 1. BỐI CẢNH SẢN PHẨM

Mục tiêu dự án là chuyển **Ngân hàng câu hỏi V4** từ công cụ chủ yếu phục vụ giáo viên thành một nền tảng gồm:

1. **Ngân hàng câu hỏi dùng cá nhân/tổ/trường**.
2. **Công cụ tự luyện chủ động cho học sinh**.
3. **Chấm và phản hồi tức thời**.
4. **Theo dõi tiến độ và mức độ thành thạo (Mastery)** theo từng HS.
5. **Dashboard học sinh + dashboard giáo viên**.
6. **Cơ chế giao bài bằng link**.
7. **Dữ liệu sạch để sau này mở cá nhân hóa A/C**.
8. **Có thể nhúng/dẫn link từ Canvas LMS**.
9. **Production ưu tiên self-host tại server nhà trường, không phụ thuộc dịch vụ trả phí trên Internet**.

Triết lý cốt lõi:

> **Kho tốt → tìm đúng câu → luyện nhanh → chấm đúng → dữ liệu tốt → nhìn thấy tiến bộ → sau đó mới bật cá nhân hóa.**

V1 không bắt đầu bằng AI. AI/cá nhân hóa tự động chỉ được bật khi đã có dữ liệu đủ đáng tin cậy.

---

# 2. HIỆN TRẠNG V4 CẦN BẢO TOÀN VÀ AUDIT

Repository hiện có dấu hiệu đã gồm frontend + backend hoàn chỉnh. Các file/module đã quan sát được gồm:

## Backend

- `backend/src/db/schema.sql`
- `backend/src/db/migrate.js`
- `backend/src/db/migration-v45.sql`
- `backend/src/db/migration-v46.sql`
- `backend/src/db/pool.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/middleware/rateLimiter.js`
- `backend/src/middleware/sanitize.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/users.js`
- `backend/src/routes/questions.js`
- `backend/src/routes/taxonomy.js`
- `backend/src/routes/tags.js`
- `backend/src/routes/exams.js`
- `backend/src/routes/matrix.js`
- `backend/src/routes/matrix-balance.js`
- `backend/src/routes/reports.js`
- `backend/src/routes/analysis.js`
- `backend/src/routes/uploads.js`
- `backend/src/services/examGenerator.js`
- `backend/src/services/itemAnalysis.js`
- `backend/src/services/matrixBalancer.js`
- `backend/src/services/qtiImport.js`
- `backend/src/services/qtiExport.js`
- `backend/src/services/wordExport.js`
- `backend/src/utils/audit.js`
- test hiện có như `backend/test/matrixBalancer.test.js`

## Frontend

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/components/Layout.jsx`
- `frontend/src/components/ImportPreviewModal.jsx`
- `frontend/src/components/QtiImportModal.jsx`
- `frontend/src/components/HistoryModal.jsx`
- `frontend/src/components/MathText.jsx`
- `frontend/src/components/MatrixTable.jsx`
- `frontend/src/components/TopicPicker.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Questions.jsx`
- `frontend/src/pages/Taxonomy.jsx`
- `frontend/src/pages/Tags.jsx`
- `frontend/src/pages/Exams.jsx`
- `frontend/src/pages/Matrix.jsx`
- `frontend/src/pages/Reports.jsx`
- `frontend/src/pages/Analysis.jsx`
- `frontend/src/pages/Users.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/styles/global.css`

V4 đã có ít nhất các hướng chức năng: auth/users, taxonomy, tags, question bank, matrix, exam generation, reports, analysis, upload, QTI import/export, Word export và import preview.

### Yêu cầu audit

Trước khi code:

- xác nhận stack/version thực tế từ `package.json`;
- xác nhận database hiện tại;
- xác nhận schema table hiện tại;
- xác nhận auth/RBAC hiện tại;
- xác nhận Excel import đang nằm ở đâu và format nào;
- xác nhận QTI ZIP import Canvas/Moodle hỗ trợ loại câu nào;
- xác nhận Word hiện chỉ export hay đã có import;
- xác nhận image upload/storage hiện tại;
- xác nhận cách formula/KaTeX đang render;
- xác nhận reporting/analysis hiện lấy dữ liệu nào;
- xác nhận migration convention;
- xác nhận API naming convention;
- xác nhận frontend routing/UI pattern.

Sau audit, **bám pattern đang có** thay vì tạo parallel architecture không cần thiết.

---

# 3. PHẠM VI PHIÊN BẢN

## 3.1. V1 — PHẢI LÀM ĐẦY ĐỦ

V1 là bản Pilot dùng thật:

- HS tự chọn môn/chuyên đề/mức độ/số câu.
- Có chế độ một mức hoặc tổng hợp nhiều mức.
- Tự chấm các dạng phù hợp.
- Tự luận chỉ là tùy chọn thêm, không nằm trong tự luyện nhanh mặc định.
- Lưu Attempt và kết quả từng câu/từng ý.
- Mastery + Confidence + Trend.
- Dashboard HS.
- Dashboard GV/lớp.
- GV tạo bài/phiếu và giao link fixed/dynamic.
- Kho cá nhân → kho tổ → kho trường.
- Versioning, status workflow, audit log.
- Import Excel hiện có phải được bảo toàn/nâng cấp.
- QTI ZIP Canvas/Moodle hiện có phải được bảo toàn/nâng cấp.
- Bổ sung Word Import chuẩn hóa, có hình/bảng/công thức.
- Bổ sung Excel + ZIP ảnh thuận tiện.
- Auth HS bằng mã học sinh + mật khẩu.
- Import danh sách HS/lớp/năm học từ Excel.
- Canvas V1: link/module/iframe thử nghiệm; không phụ thuộc LTI.
- Demo có thể chạy Supabase Cloud.
- Production target: self-host trên server trường.

## 3.2. V1.5 — THIẾT KẾ SẴN NHƯNG FEATURE FLAG OFF

**Recommendation A**:

- hệ thống dùng dữ liệu Mastery để gợi ý chuyên đề/mức nên luyện;
- HS vẫn được tự chọn;
- UI V1 phải không hiển thị tính năng này;
- database/API phải đủ dữ liệu để bật sau mà không migration lớn.

Feature flag mặc định:

```text
personalized_recommendations = false
```

## 3.3. V2 — THIẾT KẾ SẴN NHƯNG FEATURE FLAG OFF

**Automatic personalization C kết hợp A**:

- tạo “Bài luyện dành cho em” theo lỗ hổng và tiến độ;
- vẫn giữ “Tự chọn bài luyện”;
- không được bật trong Pilot V1.

Feature flags mặc định:

```text
auto_personalized_practice = false
essay_ai_grading = false
leaderboard = false
canvas_lti = false
```

---

# 4. TAXONOMY / CẤU TRÚC KIẾN THỨC

Không hard-code riêng KHTN.

Schema phải hỗ trợ tối thiểu:

```text
Môn → Khối → Chủ đề/Bài → Chuyên đề → Mức độ
```

Với môn cần sâu hơn có thể thêm:

```text
Outcome → YCCĐ → phân môn → tag
```

## 4.1. Mức độ nhận thức chuẩn nội bộ

Dùng canonical level:

```text
1 = M1 = NB  = Nhận biết
2 = M2 = TH  = Thông hiểu
3 = M3 = VD  = Vận dụng
4 = M4 = VDC = Vận dụng cao
```

Cho phép Subject Profile cấu hình label/code hiển thị, nhưng database phải có `cognitive_level` chuẩn 1–4 để analytics thống nhất.

## 4.2. Subject Profile

Tạo cơ chế cấu hình theo môn, ví dụ:

- KHTN THCS: có phân môn L/H/S, Outcome, YCCĐ bắt buộc theo cấu hình.
- Vật lí/Hóa/Sinh THPT: có thể dùng chủ đề/chuyên đề/outcome riêng.
- Toán: có thể không dùng Outcome/YCCĐ theo mô hình KHTN.
- Tiếng Anh: có thể dùng Skill/Unit/Topic.

Subject Profile phải cho phép xác định:

- taxonomy fields nào bắt buộc;
- cách tạo `display_code`;
- loại câu được dùng;
- label mức độ;
- import mapping mặc định.

---

# 5. CHUẨN KHTN DÙNG LÀM REFERENCE CHO WORD IMPORT

Quy tắc KHTN hiện hành là reference implementation, **không phải schema hard-code cho mọi môn**.

## 5.1. Cấu trúc tài liệu KHTN cần hỗ trợ

Mẫu KHTN hiện hành có thể có **trang đầu/tóm tắt** gồm tên khối và bài, số câu, phân bố hình thức, phân bố mức độ và bảng `Bài đang làm | Outcome | YCCĐ tương ứng`. Word Import nên đọc được các metadata này khi chúng xuất hiện và dùng để hỗ trợ Preview/bulk mapping. Tuy nhiên:

- không bắt buộc mọi file Word phải có trang đầu;
- không ép mọi môn dùng Outcome/YCCĐ;
- không ép mọi file đúng 10 câu;
- không ép tỷ lệ mặc định KHTN `NB:TH:VD:VDC = 3:3:2:2`;
- không ép phân bố `TN/ĐS/TLN/GN` của bộ 10 câu lên self-practice hoặc các môn khác;
- các tỷ lệ/số lượng trong tài liệu KHTN chỉ là **profile/template rule của quy trình tạo bộ KHTN**, không phải constraint toàn hệ thống.

Cấu trúc mã câu KHTN:

```text
Câu <Môn>. <Outcome>. <YCCĐ>. <Mức độ>. <Câu số>. <Hình thức>
```

Ví dụ:

```text
Câu L. 2. 1. NB. 2. ĐS
```

Yêu cầu:

- có dấu cách sau `Câu` và sau mỗi dấu chấm phân cách;
- mức độ chỉ dùng `NB`, `TH`, `VD`, `VDC`;
- mã hiển thị **không phải primary key database**;
- `question_id` nội bộ phải bất biến, ưu tiên UUID;
- `display_code` có thể thay đổi theo taxonomy/version.

## 5.2. Quy tắc câu KHTN cần parser hiểu

**Business rule chung:** đáp án chuẩn là **bắt buộc** với mọi câu cần chấm/tự đối chiếu; lời giải/hướng dẫn giải là **khuyến nghị nhưng không bắt buộc**. Nếu thiếu đáp án ở loại câu đáng ra phải có đáp án, Preview phải báo ERROR và không cho Active trước khi sửa. Nếu thiếu lời giải, câu vẫn có thể hợp lệ nếu các field bắt buộc khác đầy đủ.

### TN — Trắc nghiệm nhiều lựa chọn

- 4 phương án A–D;
- 1 đáp án đúng;
- dòng `Đáp án: A/B/C/D`.

### ĐS — Đúng/Sai

- 1 đề dẫn;
- 4 nhận định a–d;
- lưu/chấm độc lập từng ý;
- mẫu đáp án kiểu `Đáp án: a Đ; b S; c Đ; d S`.

### TLN — Trả lời ngắn

- số/đại lượng/đơn vị/công thức/cụm từ ngắn;
- có đáp án xác định;
- có thể có rounding/tolerance.

### GN — Ghép nối

- bảng hai cột `Cột A` và `Cột B`;
- thường A–D ghép 1–4;
- đáp án kiểu `A–1; B–2; C–3; D–4`;
- phải tự chấm được từng cặp.

### TL — Tự luận

- lưu nội dung + đáp án/hướng dẫn/rubric nếu có;
- V1 không auto-grade;
- không đóng góp Mastery tự động.

## 5.3. Hình ảnh

- ảnh phải gắn đúng block câu hỏi;
- một câu có thể có nhiều ảnh;
- ảnh có thể nằm ở stem, lựa chọn, statement, matching table hoặc explanation;
- không giới hạn “mỗi câu một ảnh”;
- giữ đúng ảnh nguồn, không tự vẽ lại;
- parser phải giữ thứ tự tương đối giữa paragraph/table/image.

## 5.4. Công thức

Word Import phải hỗ trợ **Word Equation/OMML** ở mức thực tế dùng được cho Toán/Lý/Hóa.

Ưu tiên pipeline:

```text
OMML → MathML hoặc LaTeX/KaTeX-compatible representation → render bằng component toán hiện có
```

Nếu một equation không thể chuyển đổi an toàn:

- đánh dấu `warning` trong Preview;
- không được âm thầm làm mất công thức;
- có fallback bảo toàn nội dung có thể xem được.

## 5.5. Bảng

- Word table phải được giữ thành structured table/HTML, không tự chuyển thành ảnh;
- GN phụ thuộc bảng nên parser phải giữ cell mapping;
- table trong stem/solution cũng phải render được.

---

# 6. 5 LOẠI CÂU HỎI CHÍNH THỨC

Canonical type đề xuất:

```text
multiple_choice   = TN
true_false        = ĐS
short_answer      = TLN
matching          = GN
essay             = TL
```

Mỗi câu cần thêm thuộc tính:

```text
auto_gradable: boolean
```

Mặc định:

| Loại | Auto-grade V1 | Mặc định trong tự luyện nhanh |
|---|---:|---:|
| TN | true | yes |
| ĐS | true | yes |
| TLN | true | yes |
| GN | true | yes |
| TL | false | no |

Không suy luận khả năng chấm chỉ từ `question_type`; giữ `auto_gradable` để tương lai có thể thay đổi.

---

# 7. DATA MODEL MỤC TIÊU

**Không bắt buộc dùng đúng tên table nếu schema V4 có tên tương đương.** Sau audit, map vào schema hiện có với migration tối thiểu. Tuy nhiên mọi capability dưới đây bắt buộc phải tồn tại.

## 7.1. Identity / School structure

### `users`

Tối thiểu:

- `id` UUID/bất biến;
- username/login identity;
- password/auth identity hoặc Supabase auth link;
- role;
- status;
- created/updated timestamps.

### `student_profiles`

- `user_id`;
- `student_code` UNIQUE, không đổi theo năm học;
- full name;
- optional metadata cần thiết, tránh thu thập dư thừa.

### `school_years`

- id;
- name, ví dụ `2026-2027`;
- start/end dates;
- active.

### `classes`

- id;
- grade;
- class code/name;
- school_year_id.

### `class_memberships`

- class_id;
- student_id;
- valid_from/to hoặc school_year;
- không xóa lịch sử khi HS lên lớp.

### `teacher_class_assignments`

- teacher_id;
- class_id;
- subject_id nếu cần;
- permission scope.

## 7.2. Curriculum / Taxonomy

Tối thiểu:

- `subjects`
- `taxonomy_versions`
- `taxonomy_nodes` hoặc cấu trúc tương đương
- parent-child hierarchy
- node type: grade/topic/lesson/specialty/outcome/yccd/etc.
- subject profile/config JSON hợp lý nếu cần

Mỗi question version phải biết taxonomy version/node mà nó thuộc về ở thời điểm được sử dụng.

## 7.3. Question Bank

Tối thiểu:

### `questions`

Danh tính ổn định:

- immutable `id`;
- owner/creator;
- current_version_id;
- lifecycle status;
- created/updated/archive timestamps.

### `question_versions`

Mỗi thay đổi có ý nghĩa phải tạo version:

- `question_id`;
- version number;
- display_code;
- type;
- stem/content structured representation;
- cognitive_level 1–4;
- primary taxonomy node;
- subject/grade context;
- answer specification bắt buộc với loại auto-grade;
- explanation/solution nullable (khuyến nghị có nhưng không bắt buộc);
- với TL/tự đối chiếu, lưu reference answer/HDC/rubric nếu có theo policy môn;
- auto_gradable;
- created_by;
- created_at;
- change reason nếu có.

Lịch sử Attempt phải trỏ vào **question_version_id**, không chỉ `question_id`.

### Type-specific data

Thiết kế structured JSON hoặc tables riêng sao cho:

- TN lưu 4 options + option đúng;
- ĐS lưu statements + đáp án từng statement;
- TLN lưu exact aliases + numeric rule + tolerance + unit/normalization;
- GN lưu left items/right items/correct pairs;
- TL lưu expected answer/rubric/reference answer.

Không nhét mọi loại câu vào một chuỗi text khó phân tích.

### Tags

- một câu có nhiều tag;
- có một taxonomy/chuyên đề chính để tính Mastery;
- tag dùng tìm kiếm/phân tích, không thay thế primary mastery target.

### Media

`media_assets` hoặc tương đương:

- id;
- storage path/object key;
- original filename;
- MIME;
- dimensions nếu ảnh;
- size;
- checksum/hash;
- created_by;
- metadata.

`question_media_links`:

- question_version_id;
- media_id;
- semantic location: stem/option/statement/table/solution/etc.;
- order/anchor metadata.

Database **không lưu binary image trực tiếp** nếu không có lý do đặc biệt.

### Source traceability

`question_sources` hoặc tương đương:

- question_id/version_id;
- source path/relative path;
- source locator;
- source type;
- optional original external id;
- checksum nếu cần.

Source chỉ hiển thị cho GV/Admin có quyền, **không hiển thị cho HS**.

## 7.4. Banks / Workflow

Cần hỗ trợ:

- **Kho cá nhân GV**;
- **Kho tổ/bộ môn**;
- **Kho toàn trường**.

Entity tối thiểu:

- banks;
- bank membership/permissions;
- question-to-bank link;
- approval state/review event.

Workflow chuẩn:

```text
Draft → Pending Review → Approved → Active → Archived
```

Chỉ câu hợp lệ/được duyệt theo policy mới được bốc cho HS.

Người khác không sửa trực tiếp bản của tác giả nếu không có quyền. Có thể **copy về kho cá nhân** để tạo biến thể.

## 7.5. Import subsystem

Tối thiểu:

- `import_jobs`;
- `import_items`;
- raw source reference;
- parser type;
- status;
- normalized preview;
- warnings/errors;
- duplicate candidates;
- confirm result;
- created_by/time.

Import là **two-phase commit** ở tầng nghiệp vụ:

```text
Parse/Preview → User confirm → Persist into question bank
```

Không ghi nửa chừng vào bank chính rồi mới báo lỗi.

## 7.6. Practice / Attempts

### `attempts`

Tối thiểu:

- id;
- student_id;
- source: `self_practice | teacher_assigned | retry`;
- practice mode: `practice | challenge`;
- assignment_id nullable;
- config snapshot;
- status: draft/in_progress/submitted/completed/abandoned;
- start/end timestamps;
- total items;
- auto-gradable items;
- raw score numerator/denominator;
- percentage;
- duration;
- created_at.

### `attempt_items`

Quan trọng: phải snapshot câu/version được bốc tại thời điểm tạo Attempt.

- attempt_id;
- question_version_id;
- sequence;
- mastery target node;
- cognitive_level;
- question type;
- selection reason (unseen/old/repeat/assigned/etc.);
- first-view timestamp;
- answer state.

### `responses`

- attempt_item_id;
- raw response;
- normalized response;
- first final response used for mastery;
- correctness/partial score 0–1;
- skipped/uncertain state;
- response timestamps;
- grading details.

ĐS/GN phải lưu sub-item/sub-pair correctness, không chỉ một boolean toàn câu.

## 7.7. Mastery

Cần hai lớp:

### Raw events

`mastery_events` hoặc dữ liệu có thể tái dựng từ attempts/responses:

- student;
- taxonomy target;
- cognitive level;
- attempt;
- score contribution;
- timestamp;
- question uniqueness/repetition data.

### Aggregate state

`mastery_states`:

- student_id;
- taxonomy_target_id;
- cognitive_level 1–4 hoặc null cho aggregate;
- mastery_score 0–100;
- confidence_level;
- effective_question_count;
- unique_question_count;
- completed_attempt_count;
- trend;
- algorithm/version;
- last_updated.

**Không chỉ lưu aggregate. Raw events phải còn để recalculation.**

## 7.8. Assignments

Tối thiểu:

- assignment;
- creator;
- title/instruction;
- config snapshot;
- fixed/dynamic mode;
- open/close time nullable;
- max attempts nullable (`null = unlimited`);
- allow retry after deadline;
- targets: class/student/group;
- public/share token an toàn;
- status.

## 7.9. Audit / Feature flags / Settings

- `audit_logs`;
- `feature_flags`;
- mastery configuration;
- import settings;
- app settings.

---

# 8. TỰ LUYỆN — UX VÀ BUSINESS RULES

## 8.1. Luồng chính

```text
Đăng nhập
→ Tự luyện
→ Chọn môn/khối nếu cần
→ Chọn chủ đề/chuyên đề
→ Chọn một mức hoặc Tổng hợp
→ Chọn % M1–M4 nếu Tổng hợp
→ Chọn dạng câu
→ Chọn số câu
→ Tạo bài
→ Làm bài
→ Chấm/phản hồi
→ Kết quả
→ Mastery/Confidence/Trend cập nhật
→ Luyện tiếp / Luyện câu sai / Dashboard
```

## 8.2. Số câu

Quick options:

```text
10 | 15 | 20 | 30 | 40
```

- mặc định 20;
- min 10;
- max 40.

## 8.3. Một mức / Tổng hợp

### Một mức

Chọn 1 trong M1–M4.

### Tổng hợp

Cho chọn % từng mức.

Có preset tối thiểu:

- Cơ bản;
- Cân bằng;
- Nâng cao;
- Tùy chỉnh.

Giá trị preset phải configurable. Với Tùy chỉnh:

- tổng luôn bằng 100%;
- UI có validation realtime;
- số câu thực tế sau làm tròn phải tổng đúng requested count.

Nếu phân bổ `count × percent` ra số lẻ, dùng deterministic allocation, ví dụ largest remainder method, để tổng cuối đúng N.

Nếu kho thiếu câu ở một mức:

- **không âm thầm thay mức khác**;
- trả shortage summary rõ ràng;
- cho người dùng chọn giảm số câu hoặc phân phối lại;
- GV có thể chủ động xác nhận redistribution nếu muốn.

## 8.4. Dạng câu mặc định

```text
☑ TN
☑ ĐS
☑ TLN
☑ GN
☐ Tự luận
```

Có toggle rõ:

```text
□ Thêm câu tự luận
```

Mục tiêu mặc định là **tự luyện nhanh và tự chấm được**.

## 8.5. Chế độ làm

### `practice` — Luyện tập

- submit từng câu;
- báo đúng/sai ngay;
- đáp án đúng hiện sau khi chốt đáp án;
- lời giải đặt sau nút `Xem lời giải`, không tự bung;
- không cho sửa câu trả lời đầu rồi biến dữ liệu mastery thành đúng;
- có thể xem/hiểu và sau Attempt dùng “Luyện lại câu sai”.

### `challenge` — Thử sức

- làm toàn bộ;
- không reveal đúng/sai trước khi submit;
- nộp cuối lượt;
- sau đó xem review.

## 8.6. Skip / Chưa chắc

Cho phép:

- `Bỏ qua/Chưa chắc`;
- quay lại trước khi nộp;
- khi submit nếu vẫn unanswered thì lưu trạng thái riêng, không đồng nhất với answered-wrong;
- điểm tự chấm có thể coi unanswered = 0 cho score, nhưng analytics phải phân biệt.

## 8.7. Autosave

Mỗi response phải autosave server-side.

Nếu rời trang/browser:

```text
Bạn có một bài luyện đang dở 12/20 câu. Tiếp tục?
```

Attempt dở:

- giữ lịch sử;
- không cập nhật mastery cho đến khi submitted/completed;
- có policy hết hạn cleanup nhưng không xóa dữ liệu tùy tiện.

## 8.8. Retry

Sau kết quả có tối thiểu:

- `Luyện tiếp chuyên đề`;
- `Luyện lại câu sai/chưa chắc`;
- `Về Dashboard`.

Retry tạo Attempt mới, `source=retry`, không sửa Attempt cũ.

---

# 9. THUẬT TOÁN BỐC CÂU

Không random hoàn toàn.

Priority mặc định:

1. câu phù hợp filter và **chưa từng làm**;
2. câu đã làm nhưng lâu chưa gặp;
3. câu đã gặp gần đây chỉ khi kho không đủ.

Điều kiện bắt buộc:

- chỉ lấy question version đang Active/được phép;
- không duplicate cùng question trong một Attempt;
- đúng taxonomy/chuyên đề;
- đúng cognitive level distribution;
- đúng question type selection;
- đúng bank/scope mà user được phép dùng;
- nếu fixed assignment thì dùng đúng set đã khóa;
- nếu dynamic assignment thì mỗi HS random riêng theo config nhưng vẫn reproducible/auditable từ snapshot.

Cần service riêng, testable, deterministic khi truyền seed cho test.

Selection metadata phải lưu đủ để debug tại sao một câu được chọn.

---

# 10. CHẤM ĐIỂM THEO LOẠI CÂU

Tạo grading engine tách khỏi route/UI.

API concept:

```text
grade(questionVersion, response) → {
  score: 0..1,
  isCorrect,
  details,
  normalizedResponse
}
```

## 10.1. TN

- exact single correct option;
- score 1 hoặc 0.

## 10.2. ĐS

- mỗi statement chấm độc lập;
- ví dụ đúng 3/4 → score 0.75;
- lưu details từng ý;
- **không áp quy tắc điểm kỳ thi quốc gia** vào self-practice V1 trừ khi sau này có grading profile riêng.

## 10.3. TLN

Hỗ trợ:

1. exact normalized string;
2. multiple accepted aliases;
3. normalize whitespace/case có cấu hình;
4. normalize decimal comma/dot khi là numeric;
5. numeric tolerance absolute hoặc relative nếu GV cấu hình;
6. optional unit rule;
7. không dùng fuzzy matching quá rộng dẫn tới chấm sai.

Ví dụ:

```text
expected = 9.8
accepted textual forms = ["9,8", "9.8"]
tolerance = ±0.1
```

## 10.4. GN

- chấm từng pair;
- score = đúng pairs / tổng pairs;
- lưu pair details.

## 10.5. TL

V1:

- `auto_gradable=false`;
- không auto score;
- không đưa vào denominator của điểm tự chấm;
- không đóng góp Mastery;
- sau nộp cho HS xem reference answer/rubric/solution nếu có.

Ví dụ bài 18 auto-grade + 2 essay:

```text
Kết quả tự chấm: 15/18 = 83%
Tự luận: 2 câu — tự đối chiếu
```

**Không hiển thị 15/20 = 75%.**

---

# 11. ATTEMPT SCORE, MASTERY, CONFIDENCE, TREND

## 11.1. Attempt Score

Điểm mỗi lượt:

```text
attempt_percentage = tổng điểm phần auto-grade / tổng trọng số phần auto-grade × 100
```

V1 các auto-grade item có trọng số bằng nhau ở cấp câu, trừ sub-items dùng partial score trong câu. Nếu hệ thống V4 đã có weighting chuẩn, audit và bảo toàn nơi phù hợp, nhưng self-practice default phải dễ hiểu.

## 11.2. Đơn vị Mastery nhỏ nhất

```text
Student × Primary Topic/Specialty × Cognitive Level (M1/M2/M3/M4)
```

Đồng thời có aggregate cấp chuyên đề.

Ví dụ:

```text
Điện xoay chiều: 74% — Khá thành thạo (aggregate)
M1: 92%
M2: 84%
M3: 63%
M4: 41%
```

V1 dùng level mastery làm dữ liệu quan trọng nhất cho phân tích; topic aggregate là summary.

## 11.3. Mastery update — Decaying Average

Mặc định theo hướng Canvas-style decaying average:

```text
new_mastery = 0.65 × new_evidence_score + 0.35 × previous_mastery
```

Yêu cầu:

- rate 0.65 phải là config `mastery_decay_rate`, không hard-code ở nhiều nơi;
- raw Attempt/Response không xóa;
- lưu algorithm/version để có thể recalculate sau;
- chỉ update khi Attempt hoàn tất hợp lệ;
- essay V1 không tham gia;
- retry vẫn là evidence mới nhưng confidence phải xét repetition;
- first mastery có thể khởi tạo bằng evidence đầu tiên hoặc policy được document rõ ràng.

## 11.4. Evidence score

Với một Attempt có câu thuộc nhiều level/topic:

- group responses theo `(topic, level)`;
- score của group = tổng partial scores / số auto-grade questions trong group;
- update mastery riêng từng group;
- **không lấy điểm chung của toàn Attempt áp vào mọi mức**.

## 11.5. Aggregate topic mastery

V1 đề xuất:

- tính từ các level mastery có evidence;
- dùng evidence/confidence weighted aggregation để level ít dữ liệu không lấn át level có dữ liệu mạnh;
- nếu thiếu dữ liệu nhiều level, đánh dấu aggregate là `provisional`;
- UI luôn cho xem chi tiết M1–M4 cạnh aggregate;
- future recommendation phải ưu tiên level mastery, không chỉ aggregate.

Công thức aggregate phải nằm trong một service/config duy nhất và có test.

## 11.6. Mức đánh giá

```text
< 50%      → Cần củng cố
50–69%     → Đang hình thành
70–84%     → Khá thành thạo
>= 85%     → Thành thạo
```

Không dùng từ “Yếu/Kém” trên dashboard HS.

## 11.7. Confidence

Tách biệt Mastery Score và Confidence.

Default:

```text
LOW:
  effective_question_count < 20
  OR completed_attempt_count < 2

MEDIUM:
  effective_question_count >= 20
  AND completed_attempt_count >= 2
  nhưng chưa đạt HIGH

HIGH:
  effective_question_count >= 40
  AND completed_attempt_count >= 3
```

### Repeated-question discount

Câu lặp lại không được tính full vào Confidence.

Default V1 có thể dùng:

```text
effective_question_count
= unique_question_count
+ 0.25 × eligible_repeat_exposures
```

Và cap repeat credit để một question không thể bị luyện vô hạn nhằm đẩy Confidence. Đặt các hệ số trong config, lưu raw counts, viết test và document.

Nếu audit cho thấy cách tốt hơn nhưng vẫn đúng nguyên tắc **“repeat không được full credit”**, có thể điều chỉnh duy nhất tại mastery service/config.

### Xác nhận Thành thạo

Nếu Mastery >= 85 nhưng Confidence LOW:

Không hiển thị đơn giản “Thành thạo”. Hiển thị dạng:

```text
Kết quả rất tốt — chưa đủ dữ liệu để xác nhận thành thạo.
```

Có thể xác nhận trạng thái “Thành thạo” khi Mastery >=85 và confidence đạt mức tối thiểu được cấu hình; mặc định nên dùng MEDIUM trở lên, và UI thể hiện Confidence rõ.

## 11.8. Trend

Tính từ các evidence/mastery points gần đây, tối thiểu:

```text
UP      = Đang tiến bộ
STABLE  = Ổn định
DOWN    = Cần chú ý
```

Không suy trend từ một điểm duy nhất. Thuật toán phải deterministic, configurable và testable.

---

# 12. DASHBOARD HỌC SINH

Thiết kế responsive desktop/mobile/tablet.

Không cần phô trương, ưu tiên rõ và dễ đọc.

## 12.1. Tổng quan

Hiển thị:

- số lượt đã hoàn thành;
- số câu đã làm;
- số câu unique;
- tổng/ước lượng thời gian luyện;
- tỷ lệ đúng gần đây;
- số chuyên đề đã luyện.

## 12.2. Mastery

Cho phép:

- xem theo môn;
- xem theo chủ đề/chuyên đề;
- xem aggregate;
- xem M1–M4;
- hiển thị Mastery Score + Confidence + Trend.

Ví dụ:

```text
Điện xoay chiều — 82% — Khá thành thạo
Độ tin cậy: Cao
M1 93 | M2 86 | M3 74 | M4 52
↑ Đang tiến bộ
73 câu · 6 lượt
```

## 12.3. Biểu đồ

Tối thiểu:

- line chart tiến độ theo Attempt/time;
- visualization M1–M4 theo chuyên đề;
- không dùng leaderboard;
- không so với bạn cùng lớp trong V1.

## 12.4. Nội dung cần củng cố

Rule-based, không cần AI:

- topic/level mastery thấp;
- confidence đủ để kết luận hoặc ghi “cần thêm dữ liệu”;
- có CTA `Luyện ngay` mở builder đã prefill topic/level nhưng HS vẫn chỉnh được.

**Đây chưa phải Recommendation A tự động.** V1 chỉ hiển thị analytics rule-based từ dữ liệu HS và shortcut thuận tiện; feature recommendation nâng cao vẫn OFF.

## 12.5. Lịch sử

Mỗi Attempt:

- date/time;
- source;
- mode;
- topics;
- level distribution;
- question types;
- score;
- duration;
- review result nếu được phép.

Cho mở review câu đã làm, đáp án, lời giải.

---

# 13. DASHBOARD GIÁO VIÊN

Hai cấp chính.

## 13.1. Tổng quan lớp

Filter:

- năm học;
- khối/lớp;
- môn;
- topic/chuyên đề;
- level;
- khoảng thời gian.

Tối thiểu có:

- HS chưa từng luyện;
- HS lâu chưa luyện;
- HS luyện ít;
- HS Mastery thấp;
- HS có Trend DOWN;
- chuyên đề nhiều HS cần củng cố;
- phân bố M1–M4;
- completion/retention summary.

Không dùng cảnh báo gây áp lực; đây là công cụ hỗ trợ GV ra quyết định.

## 13.2. Hồ sơ từng HS

GV có quyền click vào HS thuộc scope của mình và xem:

- history;
- Mastery/Confidence/Trend;
- M1–M4;
- topic breakdown;
- câu/question types thường sai;
- số câu/lượt/thời gian;
- self-practice vs assigned;
- retry patterns.

## 13.3. Quyền xem

GV chỉ xem HS/lớp/phạm vi được phân quyền.

Tổ trưởng/BGH xem theo scope của họ, không mặc định đọc toàn bộ dữ liệu nếu chưa được cấp.

---

# 14. GIÁO VIÊN TẠO PHIẾU / GIAO BÀI

GV dùng builder gần giống self-practice:

```text
Môn
→ Khối
→ Một/nhiều chuyên đề (mặc định UX khuyến khích 1 chuyên đề/lượt để Mastery dễ diễn giải; vẫn cho multi-select)
→ một mức / tổng hợp
→ % M1–M4
→ dạng câu
→ số câu
```

Output phải có:

1. **Làm online**.
2. **Xuất Word**.
3. **Xuất PDF** nếu pipeline hiện tại hỗ trợ hợp lý hoặc bổ sung ổn định.
4. **Tạo link giao HS**.

## 14.1. Fixed assignment

- khóa một danh sách question_version cụ thể;
- tất cả HS nhận cùng bộ;
- lưu snapshot.

## 14.2. Dynamic assignment

- lưu filter/config;
- mỗi HS nhận bộ khác nhau;
- vẫn audit được mỗi HS đã nhận câu nào/version nào.

## 14.3. Cấu hình assignment

Tối thiểu:

- title/instructions;
- open time nullable;
- deadline nullable;
- no-deadline mặc định cho self-learning style;
- `1 lần | N lần | không giới hạn`;
- mặc định unlimited nếu GV không khóa;
- allow review/retry after deadline;
- practice/challenge mode;
- fixed/dynamic;
- assigned classes/students.

## 14.4. Mastery

Teacher-assigned Attempt vẫn cập nhật Mastery nhưng source phải là:

```text
teacher_assigned
```

để analytics phân biệt với:

```text
self_practice
```

---

# 15. QUESTION BANK — QUYỀN VÀ VERSIONING

## 15.1. Ba tầng kho

```text
Kho cá nhân GV
→ gửi duyệt
Kho tổ/bộ môn
→ chia sẻ/duyệt theo quyền
Kho toàn trường
```

## 15.2. Quyền sửa

- tác giả sửa draft/current working version của mình;
- tổ trưởng/reviewer có quyền duyệt/sửa/trả lại theo policy;
- GV khác không tự sửa bản gốc;
- GV khác có thể copy câu về kho cá nhân để tạo biến thể.

## 15.3. Versioning

Một câu đã từng xuất hiện trong Attempt thì thay đổi nội dung/đáp án quan trọng phải tạo version mới.

Ví dụ:

```text
Q123 v1 → đã được 1200 Attempt sử dụng
Q123 v2 → sửa đáp án
```

History cũ vẫn trỏ `Q123 v1`.

## 15.4. Archive/Delete

- không hard-delete câu có lịch sử;
- dùng Archive/Inactive;
- admin chỉ hard-delete nếu an toàn, không có dependency và có audit.

---

# 16. IMPORT — KIẾN TRÚC CHUNG

V4 hiện có Excel/QTI import ở mức nào đó. **Bảo toàn và nâng cấp, không tạo 2 hệ thống import song song.**

Tất cả nguồn phải hội tụ vào normalized model chung:

```text
WORD DOCX
EXCEL XLSX
EXCEL + IMAGE ZIP
QTI ZIP CANVAS/MOODLE
MANUAL ENTRY
      ↓
Parser Adapter
      ↓
Normalized Question Draft
      ↓
Validation
      ↓
Duplicate Detection
      ↓
Preview/Edit
      ↓
Confirm
      ↓
Question Bank + Media + Source trace
```

Mỗi parser chỉ chịu trách nhiệm đưa dữ liệu vào **cùng một normalized schema**, không tự ghi trực tiếp vào bank theo logic riêng.

---

# 17. WORD IMPORT — PHẢI LÀM TRONG V1

## 17.1. Mục tiêu UX

GV có thể dùng Word gần giống tài liệu đang làm hằng ngày:

```text
Câu L. 2. 1. TH. 5. TN
Cho mạch điện như hình sau...
[ảnh chèn trực tiếp trong Word]
A. ...
B. ...
C. ...
D. ...
Đáp án: B
Lời giải: ...
```

GV **không phải upload ảnh riêng rồi copy URL**.

## 17.2. Parser DOCX

Phải đọc ít nhất:

- paragraph text;
- styles cần thiết;
- tables;
- embedded images/relationships;
- image order/anchor;
- OMML equations;
- section/header metadata nếu có ích;
- câu + đáp án + lời giải.

## 17.3. File gần chuẩn

Không yêu cầu parser chỉ nhận file 100% đúng template.

Có hai cấp:

1. **Strict template**: parse tự động tốt nhất.
2. **Best-effort template**: parse được phần chắc chắn, phần thiếu đưa warning/error lên Preview để GV sửa.

## 17.4. Metadata thiếu

Nếu file không có topic/outcome/YCCĐ/level:

- không reject toàn file ngay;
- Import wizard cho GV chọn metadata chung cho file/nhóm câu;
- có bulk edit;
- trước Confirm, mọi field bắt buộc theo Subject Profile phải hợp lệ.

## 17.5. Nhiều môn

Parser không hard-code regex duy nhất của KHTN.

Dùng:

- base parser;
- Subject Profile/mapping;
- KHTN display-code parser là một adapter/profile.

Sau này có thể thêm Toán/Anh/Sinh... mà không rewrite DOCX extraction layer.

---

# 18. EXCEL + ẢNH

## 18.1. Giữ Excel import hiện có

Audit format hiện tại, tránh phá compatibility.

Nếu cần migration format:

- giữ importer legacy;
- thêm importer chuẩn mới;
- document version/template rõ.

## 18.2. Chuẩn khuyến nghị mới: Excel + ZIP ảnh

Ví dụ package:

```text
questions.xlsx
images/
  cau_001.png
  cau_007.png
  cau_007_B.png
  cau_015_do_thi.jpg
```

Excel tham chiếu filename/object path, ví dụ:

| display_code | stem | stem_image | option_a | option_a_image | ... |
|---|---|---|---|---|---|

User upload **một ZIP duy nhất**, hệ thống:

- validate path;
- chống zip-slip;
- kiểm MIME thực;
- map ảnh;
- checksum/dedupe;
- Preview.

## 18.3. Ảnh nhúng trực tiếp trong Excel

Có thể hỗ trợ như **phương án phụ**, best effort.

Không coi embedded spreadsheet image là canonical workflow vì mapping ảnh↔cell có thể phức tạp.

Nếu hỗ trợ:

- Preview phải chỉ ra ảnh map vào câu nào;
- nếu ambiguous → warning, yêu cầu người dùng sửa.

---

# 19. QTI ZIP CANVAS/MOODLE

Bảo toàn import/export hiện có.

Audit parser hiện tại để xác định mapping type.

Yêu cầu nâng cấp:

- map đủ type có thể hỗ trợ;
- matching nếu QTI source có dạng tương thích;
- media assets;
- answer/feedback;
- metadata;
- không âm thầm gán M2 cho câu thiếu cognitive level.

Nếu import không xác định được level:

```text
Câu chưa có mức độ → warning/block theo Subject Profile → GV gán M1/M2/M3/M4 tại Preview
```

Không được âm thầm biến mọi câu chưa rõ thành M2.

---

# 20. IMPORT PREVIEW / VALIDATION

Mỗi import item có status:

```text
VALID   = Hợp lệ
WARNING = Cảnh báo
ERROR   = Lỗi
```

Preview cần:

- tổng số câu;
- valid/warning/error counts;
- filter theo status;
- hiển thị ảnh/công thức/bảng thật;
- sửa metadata;
- sửa đáp án nếu role cho phép;
- bulk edit topic/level/tags;
- duplicate candidate;
- import selected/valid items;
- không ghi item ERROR vào bank nếu chưa sửa.

Ví dụ message rõ:

```text
Câu 17: chưa có mức độ
Câu 28: thiếu đáp án
Câu 41: ảnh không xác định được vị trí
Câu 66: có khả năng trùng Q1932 v3
```

Không chỉ báo “Import failed”.

---

# 21. DUPLICATE DETECTION

So sánh nhiều tín hiệu:

- normalized stem;
- options/statements;
- answer;
- image checksum;
- taxonomy/metadata;
- source id nếu có.

Không tự merge câu chỉ vì fuzzy similarity.

UI cho:

```text
Bỏ qua
Vẫn nhập
Tạo version
Thay thế (chỉ khi hợp lệ và có quyền)
```

Mọi quyết định duplicate phải audit được.

---

# 22. EXPORT WORD/PDF

Giữ Word export hiện có và nâng cấp để hỗ trợ 5 types + image/table/math.

Yêu cầu:

- câu/ảnh không tách sai khó đọc;
- GN table giữ nguyên block;
- Vietnamese text/font stable;
- answer/solution tùy chọn show/hide;
- teacher worksheet có thể xuất không đáp án;
- answer key có thể xuất riêng hoặc kèm;
- Word/PDF không hiển thị source trace internal trừ khi GV chọn chế độ quản trị.

Nếu font Lexend đang là chuẩn tài liệu KHTN, dùng ở template xuất KHTN nhưng không chia sẻ/copy font binaries trái phép; deployment dùng font hợp lệ từ nguồn dự án/web hoặc fallback được cấu hình.

---

# 23. ROLES / RBAC

Canonical roles:

```text
ADMIN
MANAGER_OR_SUBJECT_LEAD
TEACHER
STUDENT
VIEWER_BGH
```

Không chỉ hide button ở frontend; backend/API phải enforce permission.

## 23.1. Admin

- user/class/school year;
- global taxonomy/settings;
- bank permissions;
- audit;
- system import/config;
- reset account.

## 23.2. Manager / Tổ trưởng

Trong scope được cấp:

- review/approve questions;
- bank tổ;
- dashboard môn/lớp;
- không mặc định global admin.

## 23.3. Teacher

- kho cá nhân;
- question CRUD theo quyền;
- import;
- assignment;
- dashboard lớp/phạm vi;
- export worksheet;
- reset student password nếu policy cho phép.

## 23.4. Student

- self-practice;
- assigned practice;
- own dashboard/history;
- không nhìn dữ liệu HS khác;
- không edit question bank.

## 23.5. Viewer/BGH

- read-only analytics trong scope;
- không sửa question/result;
- drill-down lớp/HS nếu quyền cho phép.

---

# 24. TÀI KHOẢN HỌC SINH

Pilot V1:

```text
Mã học sinh + mật khẩu
```

- không cho HS tự đăng ký;
- Admin/GV import Excel student roster;
- generate temporary password;
- bắt đổi password lần đầu nếu phù hợp flow hiện tại;
- không dùng ngày sinh/số điện thoại làm password mặc định;
- quên password V1: GV/Admin có quyền reset temporary password;
- future SSO/LTI để sau.

`student_code` là business identifier, không lấy email làm bắt buộc.

---

# 25. NĂM HỌC VÀ LỊCH SỬ

Dữ liệu HS phải bền qua năm học.

Ví dụ:

```text
2026-2027: 7A01
2027-2028: 8A01
```

Vẫn là cùng một `student_id`.

Dashboard mặc định dùng năm hiện tại nhưng có thể chọn năm trước nếu quyền cho phép.

Taxonomy/curriculum có version; không xóa version cũ khiến Attempt cũ mất nghĩa.

---

# 26. CANVAS LMS

## V1

App phải **chạy độc lập tốt**.

Canvas chỉ làm cửa vào:

- module/link/button `Tự luyện theo chuyên đề`;
- mở app ở tab mới là acceptable;
- thử iframe nếu CSP/X-Frame/Canvas config cho phép;
- không để iframe là blocker.

## Future

Chuẩn bị để có thể tích hợp:

- LTI 1.3;
- SSO;
- mapping user/course/class.

Nhưng feature flag OFF trong V1.

---

# 27. HẠ TẦNG: DEMO CLOUD, PRODUCTION SELF-HOST

## 27.1. Mục tiêu

Production ưu tiên **không tốn phí dịch vụ cloud thường kỳ** nếu server trường đáp ứng.

### DEV

Local developer machine.

### DEMO

Có thể dùng **Supabase Cloud** để demo nhanh.

### PRODUCTION

Target:

```text
Ubuntu Server của trường
+ Docker / Docker Compose
+ Web frontend
+ Node/API backend hiện có (nếu audit xác nhận phù hợp)
+ PostgreSQL
+ Supabase self-hosted services ở mức cần thiết (Auth/Storage/API/Realtime nếu dùng)
+ Reverse proxy
+ HTTPS
```

**Không rewrite Node backend thành Supabase-only nếu không cần.** Supabase self-host có thể là hạ tầng Postgres/Auth/Storage phía dưới; business logic phức tạp vẫn có thể nằm ở backend hiện tại.

## 27.2. Database decision

Target database: **PostgreSQL**, nhưng phải audit V4 trước.

Nếu V4 đã PostgreSQL:

- giữ;
- migrate schema an toàn;
- tích hợp self-host Supabase nếu mang lợi ích thực tế.

Nếu V4 không phải PostgreSQL:

- lập migration có test/data verification;
- không đổi DB một cách mù quáng.

## 27.3. Cùng schema giữa môi trường

Migration/schema phải dùng chung cho:

```text
DEV
DEMO Supabase Cloud
PROD Supabase Self-host/Postgres
```

Không có schema riêng “demo” và “production” làm lệch tính năng.

## 27.4. Network exposure

Public Internet chỉ cần:

```text
80  → redirect HTTPS
443 → HTTPS app/API
```

Không public:

- PostgreSQL 5432;
- Supabase Studio;
- admin DB dashboard;
- internal storage admin;
- Redis/other internal services nếu có.

Admin infra qua LAN/VPN/Tailscale hoặc policy IT của trường.

## 27.5. Domain

Ưu tiên subdomain trường, ví dụ concept:

```text
luyentap.<domain-truong>
```

Không hard-code tên này vào source.

## 27.6. HTTPS

Dùng reverse proxy phù hợp (Nginx/Caddy/Traefik theo stack audit) + Let's Encrypt hoặc certificate trường.

## 27.7. Nếu mạng trường không có public IP

Document 3 tình huống:

1. public static IP + NAT/port forward — ưu tiên;
2. public dynamic IP — DDNS nếu IT cho phép;
3. CGNAT/no inbound — cần tunnel/VPS/reverse tunnel, nhưng không tự mua dịch vụ; báo IT lựa chọn.

---

# 28. STORAGE

Không lưu image/file binary tùy tiện trong DB.

Production:

- Supabase Storage self-host hoặc object/file storage local ổn định;
- DB lưu metadata/object key;
- access policy;
- content type validation;
- immutable-ish object names / UUID/hash;
- checksum để dedupe;
- resize ảnh quá lớn nhưng giữ bản đủ chất lượng nếu cần;
- không làm hỏng biểu đồ/sơ đồ/ảnh chứa chữ.

Deletion phải reference-aware: không xóa media nếu version/question khác còn dùng.

---

# 29. SECURITY

Bắt buộc audit và tăng cứng các điểm:

## Auth

- secure password hash/auth provider;
- session/token expiration;
- role validation backend;
- password reset audit.

## API

- input schema validation;
- rate limiting;
- sanitization;
- proper authorization per resource;
- no IDOR: student không truy cập attempt của student khác bằng đổi URL/id.

## Upload

- size limit;
- MIME sniff/validation;
- extension whitelist;
- malware-aware handling nếu infra có;
- ZIP Slip protection;
- decompression bomb limits;
- filename sanitize;
- no executable uploads served inline.

## Web

- CORS allowlist;
- CSP phù hợp;
- secure headers;
- CSRF protection nếu auth dùng cookie;
- XSS protection cho imported rich content;
- sanitize HTML nhưng vẫn giữ math/table/media an toàn.

## Secrets

- `.env.example` chỉ có placeholder;
- `.env` trong archive/repo phải được `.gitignore`;
- nếu secret từng commit thì document rotate;
- không commit service role key.

---

# 30. AUDIT LOG

Lưu tối thiểu:

- actor user id;
- action;
- entity type/id;
- before/after summary hoặc diff an toàn;
- timestamp;
- request/session metadata hợp lý;
- reason nếu workflow yêu cầu.

Các action bắt buộc log:

- question create/edit/version/archive;
- review approve/reject;
- import confirm;
- duplicate resolution;
- user role change;
- password reset;
- assignment create/update;
- destructive/admin actions.

Audit log không được chứa password/token/secret/raw sensitive credential.

---

# 31. BACKUP / RESTORE

Self-host production bắt buộc có:

- DB backup tự động hằng ngày;
- media/storage backup;
- backup nằm **khác thiết bị/vùng lưu trữ** server chính;
- retention policy configurable;
- log backup success/failure;
- restore runbook;
- định kỳ test restore.

Default nếu chưa có policy trường:

- daily giữ 14 ngày;
- weekly giữ 8 tuần;
- monthly giữ 6 tháng;

Nhưng để config và document để IT thay.

Không coi “copy file backup trên cùng ổ” là backup đủ.

---

# 32. OBSERVABILITY / HEALTH

Bổ sung tối thiểu:

- `/health` hoặc tương đương;
- DB connectivity health;
- structured server logs;
- import job errors;
- backup logs;
- no secret in logs;
- useful request correlation id nếu hợp stack.

Không cần mua monitoring SaaS cho V1. Có thể dùng log/local monitoring self-host nhẹ.

---

# 33. UI/UX NGUYÊN TẮC

1. Tiếng Việt là ngôn ngữ chính.
2. Responsive: desktop, mobile, tablet, màn hình tương tác.
3. Giữ visual language hiện có nếu ổn; không redesign gây mất thời gian.
4. HS phải tạo được bài luyện trong vài thao tác rõ ràng.
5. Tránh thuật ngữ kỹ thuật trong UI HS.
6. Không dùng “Yếu/Kém”; dùng:
   - Cần củng cố;
   - Đang hình thành;
   - Khá thành thạo;
   - Thành thạo.
7. Error phải actionable.
8. Loading/empty/error state đầy đủ.
9. Accessibility cơ bản: keyboard, label, contrast, focus.
10. Math/table/image hiển thị tốt trên mobile.

---

# 34. KPI / PILOT ANALYTICS

Không dùng page view làm KPI chính.

Dashboard dự án/admin cần có khả năng tính:

- HS đã kích hoạt;
- HS có ít nhất 1 Attempt;
- completed attempts;
- questions answered;
- unique questions;
- avg attempts/student;
- completion rate;
- return/retention rate;
- active days;
- self-practice vs assigned;
- Mastery change;
- Confidence distribution;
- topic usage;
- topic nhiều HS cần củng cố.

Hai KPI trọng tâm:

1. **Retention:** HS có quay lại tự luyện không?
2. **Learning Gain:** Mastery có cải thiện theo thời gian không?

Không khẳng định causal learning gain chỉ từ correlation; dashboard dùng ngôn ngữ phù hợp.

---

# 35. PHẠM VI PILOT

Hệ thống phải đa môn về kiến trúc, nhưng rollout không cần bật mọi môn cùng ngày.

Ưu tiên:

- KHTN THCS;
- Lý/Hóa/Sinh THPT;
- khối 12 và nhóm cần bổ trợ là đối tượng ưu tiên ban đầu.

Launch trước môn/khối có kho câu hỏi sạch nhất rồi mở rộng bằng config/data, không fork code theo môn.

---

# 36. API / SERVICE BOUNDARIES

Sau audit, giữ style của V4 nhưng business logic mới phải tách service rõ.

Tối thiểu cần các domain/service tương đương:

```text
QuestionService
QuestionVersionService
QuestionBankService
ImportService
WordImportAdapter
ExcelImportAdapter
QtiImportAdapter
MediaService
QuestionSelectionService
GradingService
AttemptService
MasteryService
AssignmentService
StudentAnalyticsService
TeacherAnalyticsService
RBAC/AuthorizationService
AuditService
```

Route/controller không được chứa toàn bộ thuật toán grading/mastery/import.

### API capabilities tối thiểu

Không bắt buộc endpoint exact names, nhưng phải có:

- auth/login/logout/me/password change/reset;
- student roster import;
- subjects/taxonomy browse/admin;
- question list/filter/detail/version/create/update/archive;
- bank/review workflow;
- import upload/parse/preview/edit/confirm;
- practice availability/count preview;
- create Attempt;
- get/resume Attempt;
- save response;
- submit Attempt;
- result/review;
- retry creation;
- student dashboard/mastery/history;
- teacher class dashboard/student detail;
- assignment create/update/list/share/target;
- Word/PDF export;
- audit list for authorized roles;
- system feature/settings.

API response/error convention phải nhất quán với V4.

---

# 37. TRANSACTION / CONSISTENCY RULES

Các operation phải transaction-safe:

- confirm import nhiều câu;
- tạo question + version + media links;
- create fixed assignment snapshot;
- submit Attempt + grade + mastery events/update;
- question version switch;
- archive with dependency checks.

Mastery update phải idempotent: submit retry/request lặp không được cộng evidence hai lần.

Dùng unique constraints/idempotency markers phù hợp.

---

# 38. PERFORMANCE

Pilot phải nhanh với lớp học thực tế.

Tối thiểu:

- pagination/filter server-side cho bank lớn;
- index DB cho student/attempt/topic/level/status/time;
- tránh N+1 dashboard;
- import job không block event loop với file lớn nếu stack Node;
- stream/file size controls;
- cache chỉ nơi cần, không làm source-of-truth mơ hồ.

Target UX reasonable trên LAN/Internet phổ thông:

- login/dashboard initial load nhanh;
- next question/save response không lag rõ;
- 40-question Attempt không tải media vô hạn;
- class dashboard có aggregation query/index phù hợp.

Không tối ưu vi mô trước khi profile.

---

# 39. TEST PLAN BẮT BUỘC

Phải bổ sung test trước khi kết luận hoàn thành.

## 39.1. Grading unit tests

- TN đúng/sai;
- ĐS 0/4, 1/4, 3/4, 4/4;
- TLN comma/dot;
- TLN alias;
- TLN tolerance inside/outside;
- GN full/partial;
- essay no-auto-grade.

## 39.2. Selection tests

- ưu tiên unseen;
- old repeat trước recent repeat;
- không duplicate trong Attempt;
- đúng % M1–M4;
- rounding tổng bằng requested N;
- shortage không silent redistribute;
- selected question type filter;
- essay excluded by default;
- essay included only when explicitly selected.

## 39.3. Mastery tests

- first evidence;
- 65/35 update;
- group by topic+level;
- incomplete Attempt không update;
- retry update once;
- essay excluded;
- confidence low/medium/high;
- repeat discount;
- trend;
- recalculation produces same state from raw data.

## 39.4. Import tests

DOCX fixtures:

- TN text only;
- ĐS;
- TLN;
- GN table;
- TL;
- embedded image;
- multiple images;
- image in option;
- Word table;
- OMML equation;
- missing level;
- malformed answer;
- multiple questions;
- KHTN display code.

Excel fixtures:

- legacy V4;
- new template;
- image ZIP valid;
- missing image;
- ambiguous image;
- zip-slip attempt rejected.

QTI fixtures:

- existing supported Canvas/Moodle types;
- media;
- missing cognitive level results in preview warning, not M2 silently.

## 39.5. RBAC tests

- student cannot open other student attempt;
- teacher only own scope;
- viewer read-only;
- reviewer bank permissions;
- archive/version permissions.

## 39.6. Assignment tests

- fixed same questions;
- dynamic different/same config;
- attempt limits;
- open/close time;
- teacher_assigned source;
- mastery update.

## 39.7. E2E smoke tests

Tối thiểu:

1. Admin import HS → HS login.
2. GV import Word có ảnh → Preview → Confirm.
3. HS tự tạo 20 câu → trả lời → autosave → submit → result → mastery dashboard.
4. HS thoát giữa chừng → login lại → resume.
5. GV tạo dynamic assignment → HS mở link → hoàn thành → GV thấy dashboard.
6. GV sửa câu đã sử dụng → new version → history cũ giữ version cũ.
7. Production-like Docker boot → migration → health pass.

---

# 40. MIGRATION / BACKWARD COMPATIBILITY

Không làm mất dữ liệu V4.

Quy trình:

1. backup DB hiện tại;
2. snapshot schema;
3. migration forward;
4. data backfill deterministic;
5. validation counts/checksums/samples;
6. app build/test;
7. rollback procedure/document.

Nếu type V4 chỉ có 4 loại và chưa có GN:

- thêm `matching` theo migration;
- map các type cũ không đổi meaning;
- không rename gây mất dữ liệu nếu không cần.

Nếu V4 đang gắn cognitive level theo format khác:

- map sang 1–4;
- giữ legacy code/display metadata nếu cần.

---

# 41. CURRENT FUNCTIONS REGRESSION GATE

Sau nâng cấp, tối thiểu phải xác nhận không phá:

- login/auth hiện có;
- user management;
- question bank CRUD/filter;
- taxonomy;
- tags;
- matrix;
- matrix balancing;
- exam generation;
- reports;
- item analysis;
- uploads;
- QTI import/export;
- Word export.

Nếu thay đổi UX/API của chức năng cũ là cần thiết, migration/compatibility phải document.

---

# 42. DEVOPS / DOCKER DELIVERABLES

Tạo/chuẩn hóa:

- Dockerfile backend;
- Dockerfile frontend hoặc production build strategy;
- `docker-compose.yml` / compose production phù hợp;
- healthchecks;
- env example;
- persistent volumes;
- reverse proxy config;
- database migration startup strategy an toàn;
- self-host Supabase integration documentation nếu dùng;
- backup scripts;
- restore scripts/runbook;
- deployment guide Ubuntu.

Không đưa real secrets vào compose.

Nếu full Supabase self-host official compose quá lớn để nhúng trực tiếp repo, document cách pin một version chính thức và overlay config của app; không dùng `latest` vô điều kiện cho production.

---

# 43. DOCUMENTATION DELIVERABLES

Cập nhật/tạo tối thiểu:

1. `README.md` — overview và quick start.
2. `docs/ARCHITECTURE.md` — module/data flow.
3. `docs/DATABASE.md` — schema + migration strategy.
4. `docs/SELF_PRACTICE.md` — rules/selection/grading.
5. `docs/MASTERY.md` — formula/confidence/trend/recalculation.
6. `docs/IMPORT.md` — Word/Excel/QTI templates + warnings.
7. `docs/ROLES_PERMISSIONS.md`.
8. `docs/DEPLOYMENT_SELF_HOST.md`.
9. `docs/BACKUP_RESTORE.md`.
10. `docs/CANVAS.md` — V1 link/iframe + future LTI.
11. `docs/PILOT_METRICS.md`.
12. changelog/migration notes.

Tạo file mẫu cho GV:

- `templates/question-import-khtn.docx` hoặc script tạo template nếu binary không nên commit;
- `templates/question-import.xlsx`;
- hướng dẫn ZIP ảnh;
- sample QTI không cần nếu V4 đã có.

Nếu tạo `.docx/.xlsx` binary, giữ source/template generator có thể tái tạo để dễ bảo trì.

---

# 44. FEATURE FLAGS VÀ CONFIG

Tạo config tập trung, tối thiểu:

```text
personalized_recommendations=false
auto_personalized_practice=false
essay_ai_grading=false
leaderboard=false
canvas_lti=false

mastery_decay_rate=0.65
mastery_threshold=85
confidence_medium_min_effective_questions=20
confidence_medium_min_attempts=2
confidence_high_min_effective_questions=40
confidence_high_min_attempts=3
repeat_confidence_weight=0.25
practice_min_questions=10
practice_default_questions=20
practice_max_questions=40
```

Không cần env cho mọi business setting; có thể dùng DB/system settings tùy kiến trúc, nhưng phải tập trung, audit được và không rải magic numbers.

---

# 45. MÀN HÌNH TỐI THIỂU V1

Bám router/layout hiện có, thêm hoặc nâng cấp màn hình tương đương:

## Student

- Dashboard cá nhân.
- Tạo bài tự luyện.
- Màn hình làm bài.
- Kết quả/review.
- Lịch sử.
- Assigned practices.

## Teacher

- Dashboard lớp.
- Student detail.
- Question bank cá nhân/tổ/trường.
- Import center + preview.
- Assignment builder/list/detail.
- Export worksheet.

## Manager/Admin

- Review queue.
- Users/student roster/classes/year.
- Taxonomy/subject profiles.
- Audit logs.
- System/mastery settings.

Không tạo menu cho feature A/C đang OFF.

---

# 46. TRẢI NGHIỆM SAU MỖI LƯỢT LUYỆN

Result page tối thiểu:

```text
Điện xoay chiều · M2 · 20 câu
16/20 — 80%
Thời gian: 18 phút

Mức thành thạo hiện tại: 78%
Khá thành thạo
Độ tin cậy: Trung bình
Xu hướng: ↑ Đang tiến bộ

Lượt gần đây: 65% → 75% → 80%
```

Nếu dữ liệu ít:

```text
Kết quả rất tốt — cần thêm lượt luyện để xác nhận mức độ thành thạo.
```

CTA:

```text
Luyện tiếp chuyên đề
Luyện lại câu sai/chưa chắc
Xem chi tiết đáp án
Về Dashboard
```

Không dùng lời khen quá đà hoặc làm HS hiểu đây là điểm kiểm tra chính thức.

---

# 47. PILOT SUCCESS / ACCEPTANCE CRITERIA

V1 chỉ được coi là “ready for Pilot” khi tất cả nhóm sau đạt:

## Functional

- 5 question types lưu/render được;
- 4 auto-grade types chấm đúng;
- essay opt-in và không ảnh hưởng auto score/mastery;
- practice builder hoạt động;
- % M1–M4 hoạt động;
- random priority hoạt động;
- Attempt autosave/resume;
- mastery/confidence/trend;
- student dashboard;
- teacher dashboard;
- assignments fixed/dynamic;
- Word import;
- Excel legacy/new + image ZIP;
- QTI import không silent M2;
- bank workflow/versioning;
- roster/auth/RBAC;
- audit.

## Data integrity

- historical V4 data preserved;
- Attempt trỏ question version;
- no duplicate mastery update;
- school year/class history preserved;
- import confirm transaction safe.

## Security

- no exposed DB;
- no secrets committed;
- RBAC tests pass;
- upload protections pass;
- student isolation pass.

## Deployment

- local dev starts;
- demo config works;
- production-like Docker Compose boots;
- migration pass;
- health pass;
- backup script runs;
- restore instructions tested at least on staging/local copy.

## Quality

- frontend production build pass;
- backend test pass;
- lint/typecheck if project uses them;
- key E2E smoke flows pass;
- no console/server fatal errors in main flow.

---

# 48. THỨ TỰ THỰC THI BẮT BUỘC

AI phải tự triển khai theo dependency order, không làm UI trước khi data model rõ.

## Phase 0 — Audit + Safety

- inventory current architecture;
- run current tests/build;
- record baseline;
- identify secrets/node_modules packaging issue;
- create migration/backup safety plan.

## Phase 1 — Domain/Data foundation

- canonical question types including GN;
- immutable IDs + versions;
- taxonomy/version/subject profile;
- banks/workflow;
- school year/class/student structure;
- feature flags/settings;
- audit schema.

## Phase 2 — Grading engine

- TN/ĐS/TLN/GN/TL behavior;
- unit tests.

## Phase 3 — Import normalization

- unified normalized model;
- adapt existing Excel/QTI into it;
- Preview/validation/duplicate framework.

## Phase 4 — Word + Media + Excel ZIP

- DOCX extraction;
- images;
- table;
- OMML;
- KHTN profile;
- Excel image ZIP.

## Phase 5 — Practice engine

- availability preview;
- selection;
- level %;
- attempt snapshot;
- response autosave;
- practice/challenge;
- retry.

## Phase 6 — Mastery

- events;
- decaying average;
- confidence;
- trend;
- recalculation command/job;
- tests.

## Phase 7 — Student UX

- builder;
- player;
- result;
- history;
- dashboard/charts.

## Phase 8 — Assignment + Teacher UX

- fixed/dynamic;
- links/targets;
- teacher dashboard;
- student detail;
- export.

## Phase 9 — RBAC/Admin/Workflow

- role scopes;
- roster;
- review queue;
- audit UI;
- system settings.

## Phase 10 — Canvas entry

- link/module instructions;
- iframe compatibility check;
- no LTI blocker.

## Phase 11 — Self-host production

- Docker;
- Postgres/Supabase self-host integration;
- reverse proxy;
- HTTPS config docs;
- storage;
- backup/restore;
- security hardening.

## Phase 12 — Regression + E2E + Docs

- full suite;
- fix all failures;
- production build;
- pilot checklist;
- final handoff.

---

# 49. COMMIT / CHANGE DISCIPLINE

Nếu repo là Git:

- làm trên branch riêng;
- commit theo logical change;
- không commit `node_modules`;
- không commit `.env`;
- không commit generated backup/dump;
- giữ migration immutable sau khi được áp dụng;
- commit message rõ `feat/fix/refactor/test/docs/chore`.

Trước mỗi phase lớn, đảm bảo tests trước đó vẫn pass.

---

# 50. DEFINITION OF DONE — AI PHẢI TỰ KIỂM TRA TRƯỚC KHI TRẢ KẾT QUẢ

Trước final response, AI phải cung cấp và xác minh:

1. **Audit summary**: kiến trúc cũ + thay đổi chính.
2. **Files changed/created** theo module.
3. **Database migrations** và status chạy.
4. **Tests run**: command + pass/fail count.
5. **Frontend build** result.
6. **Backend start/health** result.
7. **E2E/smoke flows** đã test.
8. **Security checks** chính.
9. **Docker/self-host** smoke status.
10. **Known limitations** chỉ được là ngoài V1 scope hoặc phụ thuộc secret/IT thật; không được dùng “known limitations” để né phần V1.
11. **How to run DEV**.
12. **How to run DEMO**.
13. **How to deploy PROD**.
14. **Sample account/import template** nếu có seed dev.
15. **Pilot readiness checklist**.

Không nói “đã hoàn thành” khi chưa kiểm chứng thực tế.

---

# 51. KẾT QUẢ CUỐI CÙNG MONG MUỐN

Sau khi AI hoàn tất, repository phải trở thành **một sản phẩm có thể chạy thật**, không chỉ là prototype:

### Với học sinh

Có thể:

```text
Đăng nhập bằng mã HS
→ tự chọn nội dung
→ tạo 10–40 câu
→ luyện
→ nhận chấm/feedback
→ xem tiến độ
→ xem Mastery M1–M4
→ xem lịch sử
→ quay lại luyện tiếp
```

### Với giáo viên

Có thể:

```text
quản lý/import kho câu
→ Word/Excel/QTI
→ Preview
→ duyệt
→ lọc/tạo phiếu
→ xuất Word/PDF
→ giao link fixed/dynamic
→ theo dõi lớp
→ xem hồ sơ từng HS
```

### Với tổ/BGH

Có thể:

```text
quản trị/duyệt theo scope
→ xem analytics
→ xác định chuyên đề HS cần củng cố
→ theo dõi hiệu quả Pilot
```

### Với IT

Có thể:

```text
chạy demo cloud khi cần
→ self-host production trên Ubuntu
→ chỉ public HTTPS
→ backup/restore được
→ không phụ thuộc gói cloud trả phí
```

### Với tương lai

Không cần đập đi xây lại để bật:

```text
V1.5: gợi ý cá nhân hóa A
V2: automatic personalization C + A
LTI/SSO Canvas
AI hỗ trợ tự luận nếu sau này được phê duyệt
```

---

# 52. LỆNH BẮT ĐẦU CHO AI CODING AGENT

**Bắt đầu ngay.**

1. Audit repository V4 theo mục 2.
2. Chạy baseline tests/build và ghi kết quả.
3. Viết một implementation checklist ngắn dựa đúng các Phase 0–12 ở trên.
4. Không chờ người dùng duyệt lại các yêu cầu đã chốt trong mega prompt này.
5. Tiếp tục triển khai lần lượt cho đến khi toàn bộ **V1** đạt Definition of Done.
6. Giữ feature A/C/LTI/AI essay/leaderboard ở trạng thái OFF nhưng thiết kế schema/interface đủ để phát triển sau.
7. Khi phát hiện code hiện tại khác giả định của prompt, **ưu tiên bảo toàn behavior cũ + đạt capability mới**, ghi quyết định kỹ thuật rõ ràng thay vì rewrite vô cớ.
8. Cuối cùng chạy full verification và chỉ báo hoàn thành khi có bằng chứng.

> **Nguyên tắc cuối:** Đừng biến dự án này thành “một website random câu hỏi”. Hãy xây nó thành **Learning Practice & Mastery Platform** dựa trên một ngân hàng câu hỏi chuẩn hóa, có dữ liệu học tập đủ sạch để mở cá nhân hóa trong giai đoạn tiếp theo.

