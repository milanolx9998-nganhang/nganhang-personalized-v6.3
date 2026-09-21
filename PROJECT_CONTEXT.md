# Cập nhật 17/09/2026 — V6.5 trong thư mục V6.3

Root nganhang-personalized-v6.3, DB nganhang_personalized_v63, cổng 3003. Package 0.6.5, health 0.6.5-pilot. Cổng 3001 thuộc bản cũ.
Nguồn yêu cầu: V6_5_FULL_SMART_STAFF_PERMISSION_ARCHITECTURE (2).md. Đã đọc toàn bộ trước thực thi.
Quyền mới: accessResolver + catalog/preset + assignments chuẩn + ALLOW/DENY. Legacy adapter cho tài khoản chưa chuẩn hóa; không tự chuyển đổi quyền tài khoản đang dùng.
Admin UI /admin/staff, chia mục cơ cấu/chương trình/kho/hệ thống/vận hành. Bulk và copy-year có preview; các ghi quyền nguyên tử và có nhật ký.
Tài liệu: docs/access/, docs/V6_5_ACCESS_CURRENT_AUDIT.md, docs/V6_5_ACCEPTANCE.md. Không seed, clone, sửa nguồn GDPT 2018 hoặc chấm lại bài cũ.

---

# Cập nhật 15/09/2026 — V6.4.3 trong V6.3

Không tạo bản sao dự án mới. Root hiện hành: nganhang-personalized-v6.3, DB nganhang_personalized_v63, URL http://127.0.0.1:3003.
Health: 0.6.4.3-pilot; phiên bản package theo SemVer: 0.6.4-3.
Nguồn yêu cầu đầy đủ: DELTA_MEGA_PROMPT_V6_4_3_FULL_SCOPE_STUDENT_FLAG_VERSION_REVIEW.md.
Xem docs/V6_4_3_HANDOFF.md, docs/V6_4_3_ACCEPTANCE.md và hai CURRENT_AUDIT.
Migration là nối tiếp, không sửa migration đã áp dụng; không clone/seed/chấm lại bài cũ.
Thông tin bên dưới là lịch sử, không dùng URL/database/luồng snapshot cũ làm cấu hình hiện hành.

# Cập nhật 14/09/2026 — V6.3

Bản sao làm việc hiện tại: nganhang-personalized-v6.3, cổng 3003, DB nganhang_personalized_v63. Xem docs/V6_3_HANDOFF.md và artifacts/v63-verification.json. Các ghi chú dưới đây là lịch sử kế thừa V5/V1/V4, không dùng tên DB/cổng cũ cho bản này.

# Ngữ cảnh dự án Ngân hàng câu hỏi

**Thời điểm rà soát:** 2026-09-10  
**Thư mục:** `C:\Users\Duong Hieu\Desktop\ngan hang cau hoi\nganhang-v4.3.3\nganhang-v4`

## 1. Kết luận phiên bản

- Phiên bản ứng dụng theo mã chạy và ba package manifest là **0.4.5 (V4.5)**.
- Mã nguồn đã có một phần tính năng **V4.6**: hiển thị công thức bằng KaTeX/Markdown và lịch sử sửa câu hỏi qua bảng `question_revisions`.
- Tên thư mục, README, hướng dẫn, tiêu đề đăng nhập, log khởi động và changelog vẫn chủ yếu ghi **V4.3/V4.3.3**.
- Vì vậy, cách gọi chính xác nhất của trạng thái hiện tại là: **V4.5 có bổ sung V4.6, nhưng metadata và tài liệu chưa đồng bộ**.

Nguồn xác định phiên bản chính: `package.json`, `backend/package.json`, `frontend/package.json`, endpoint `/api/health` và `backend/src/db/migration-v46.sql`.

## 2. Mục tiêu sản phẩm

Ứng dụng quản lý ngân hàng câu hỏi và sinh đề thi chuẩn BGD 2025 cho mạng LAN trường học. Mô hình vận hành là một máy chủ Windows chạy Node.js/PostgreSQL, giáo viên truy cập từ Chrome/Edge trên cùng mạng.

Các nghiệp vụ chính:

1. Quản lý phân loại: tổ/nhóm chuyên môn, môn, phân môn, chủ đề/bài học.
2. Quản lý câu hỏi: tạo, sửa, duyệt, nhập Excel, nhập QTI, ảnh, công thức toán, tag và lịch sử chỉnh sửa.
3. Tạo ma trận BGD 2025 cho KHTN hoặc môn đơn; tự phân bổ và tái phân bổ các ô đã khóa.
4. Sinh nhiều mã đề, tránh lặp, tránh trùng giữa mã, cảnh báo fallback khi thiếu câu.
5. Xuất Word đề/đáp án và xuất QTI để đưa sang Canvas.
6. Báo cáo độ phủ, khoảng trống, trùng lặp, mức sử dụng và audit log.
7. Nhập kết quả làm bài để phân tích độ khó, độ phân biệt, point-biserial và phương án nhiễu.

## 3. Kiến trúc và luồng chính

```text
Trình duyệt
  -> React 18 + Vite 5
  -> API client gắn JWT
  -> Express 4 /api/*
  -> auth + RBAC theo vai trò và môn học
  -> route nghiệp vụ
  -> service sinh đề/ma trận/Word/QTI/phân tích câu hỏi
  -> PostgreSQL 16

Express cũng phục vụ frontend/dist trong chế độ production.
Ảnh câu hỏi được lưu ở backend/uploads và công khai qua /uploads.
```

### Frontend

- Điểm vào: `frontend/src/main.jsx`, `frontend/src/App.jsx`.
- Các màn hình: Dashboard, Questions, Matrix, Exams, Taxonomy, Users, Reports, Tags, Analysis.
- Trạng thái đăng nhập: Zustand; dữ liệu server gọi trực tiếp qua API client.
- KaTeX/Markdown: `frontend/src/components/MathText.jsx`.
- Các file lớn/cần cẩn trọng khi sửa: `Matrix.jsx` khoảng 912 dòng và `Questions.jsx` khoảng 639 dòng.

### Backend

- Điểm vào: `backend/src/server.js`; mặc định nghe `0.0.0.0:3000`.
- 11 nhóm API: auth, users, taxonomy, questions, matrix, matrix-balance, exams, reports, uploads, tags, analysis.
- Các service trọng tâm:
  - `matrixBalancer.js`: phân bổ theo M1-M4; dùng đơn vị điểm nguyên x100 và slot 0,25 để tránh sai số.
  - `examGenerator.js`: anti-repeat, tránh trùng giữa mã, ưu tiên câu ít dùng và fallback bốn tầng.
  - `wordExport.js`: tạo đề Word và đáp án.
  - `qtiImport.js`, `qtiExport.js`: trao đổi QTI/Canvas.
  - `itemAnalysis.js`: phân tích thống kê câu hỏi từ kết quả làm bài.

### Phân quyền

- Năm vai trò: `admin`, `board`, `dept_leader`, `grade_leader`, `teacher`.
- `admin` và `board` xem tất cả môn; tổ trưởng xem các môn thuộc tổ; nhóm trưởng và giáo viên chỉ xem môn được gán.
- Các router nghiệp vụ đều yêu cầu JWT; thao tác quản trị/duyệt/sinh đề được chặn thêm bằng vai trò.
- Giáo viên có thể tạo/nhập câu hỏi nhưng bị chặn sửa câu hỏi hiện có.

## 4. Mô hình dữ liệu

Schema nguồn hiện định nghĩa các nhóm bảng:

- Danh mục: `departments`, `subjects`, `branches`, `topics`.
- Người dùng: `users`.
- Câu hỏi: `questions`, `tags`, `question_tags`, `question_revisions`.
- Ma trận/đề: `matrix_templates`, `matrix_cells`, `exam_runs`, `exam_items`.
- Phân tích: `exam_responses` và các cột thống kê trên `questions`.
- Theo dõi: `audit_logs`.

## 5. Thuật toán nghiệp vụ quan trọng

### Ma trận

- Tỉ trọng nhận thức bắt buộc gồm bốn mức M1-M4 và tổng bằng 100%.
- Trắc nghiệm, đúng-sai, trả lời ngắn có trọng số phân bổ khác nhau theo mức độ.
- Tự luận dùng các block 0,25 điểm; cấu hình không chia hết 0,25 sẽ báo lỗi thay vì làm tròn ngầm.
- Khi tái phân bổ, các ô đã khóa được giữ nguyên và phần còn lại được phân phối lại theo ngân sách từng phân môn.

### Sinh đề

- Chỉ chọn câu có trạng thái đã rà soát/đã duyệt/đã sử dụng.
- Bốn tầng chọn câu: chính xác -> bỏ ràng buộc topic -> bỏ branch/topic -> chỉ giữ lớp, môn và loại câu.
- Có anti-repeat theo số ngày, tránh trùng giữa mã đề, ưu tiên `usage_count` thấp và xáo đáp án MCQ bằng Fisher-Yates.
- `topic_scope` vẫn được giữ ở mọi tầng fallback.
- Có thể lấy thêm số lượng câu theo tag.

## 6. Trạng thái cài đặt được kiểm chứng ngày 2026-09-10

- Node.js: `v22.22.0`; npm: `10.9.4`.
- PostgreSQL `16.13` đang chạy.
- `backend/.env` tồn tại; không ghi giá trị bí mật vào báo cáo này.
- `node_modules` của backend và frontend đã có.
- Frontend production build mới nhất lúc `2026-04-20 14:54:13`, sau file nguồn mới nhất khoảng 14 giây; build hiện có bao gồm thay đổi frontend cuối cùng trong thư mục.
- Trước khi test, không có tiến trình nghe cổng 3000.
- Smoke-test tạm thời thành công: server kết nối DB, `/api/health` trả HTTP 200 với version `0.4.5`; server đã được tắt sau kiểm tra.
- Test tự động hiện có: **8 pass, 0 fail**, nhưng chỉ kiểm thử `matrixBalancer`.
- Thư mục này **không có `.git`**, nên không thể xác định commit/branch hoặc thay đổi chưa commit.

### Dữ liệu hiện có (chỉ số tổng hợp)

- 5 tổ/nhóm, 14 môn, 3 phân môn, 703 chủ đề.
- 9 người dùng, 84 câu hỏi, 15 tag.
- 1 ma trận với 22 ô.
- 2 lượt sinh đề với 56 câu đề.
- 106 bản ghi audit.

## 7. Điểm lệch và rủi ro đã xác nhận

### Ưu tiên cao — database hiện tại thiếu migration V4.5

Database đang dùng có `question_revisions` của V4.6 nhưng:

- Không có bảng `exam_responses`.
- Trong `questions`, chỉ có cột V4.5 `image_url`; thiếu `difficulty_index`, `discrimination_index`, `point_biserial`, `distractor_analysis`, `times_administered`, `quality_flag`.

Hệ quả: màn **Phân tích chất lượng câu hỏi** có giao diện và API nhưng các truy vấn chính sẽ lỗi với database hiện tại. Đây là trạng thái migration không đồng nhất, không phải lỗi khởi động server.

### Ưu tiên cao — luồng migration bị chia đôi

- `migrate.js` và lệnh `npm run db:migrate` chỉ chạy `schema.sql`.
- `install-windows.ps1` cũng chỉ gọi `migrate.js`, nên không tự chạy `migration-v46.sql` để có lịch sử câu hỏi.
- Chỉ `scripts/init-database.bat` gọi riêng cả `migration-v45.sql` và `migration-v46.sql`.
- Hướng dẫn chạy tay trong `HUONG-DAN-NHANH.md` chỉ nêu `migrate.js`, nên có thể bỏ sót V4.6.

### Ưu tiên vừa — nhãn phiên bản không thống nhất

- Package và health endpoint: V4.5.
- Một phần UI: V4.5.
- README, changelog, login, index HTML, log server và nhiều script: V4.3/V4.3.3.
- Migration mới nhất: V4.6.

### Ưu tiên vừa — phạm vi kiểm thử hẹp

Chưa có test tự động cho API, RBAC theo môn, import Excel/QTI, xuất Word/QTI, sinh đề, migration, lịch sử sửa câu hỏi và item analysis. Việc `8/8 pass` chỉ chứng minh thuật toán phân bổ ma trận hiện vượt qua tám kịch bản đã viết.

## 8. Điểm bắt đầu cho lượt phát triển tiếp theo

1. Xem `package.json` và `/api/health` là nguồn phiên bản chạy: `0.4.5`.
2. Xem V4.6 là phần mở rộng đã có trong code, nhưng phải kiểm tra migration trước khi dùng.
3. Trước mọi thay đổi liên quan phân tích câu hỏi, sửa dữ liệu hay lịch sử, cần xác nhận schema database thật.
4. Khi sửa ma trận, đọc cả `frontend/src/pages/Matrix.jsx`, `backend/src/routes/matrix*.js` và `backend/src/services/matrixBalancer.js`.
5. Khi sửa sinh đề, đọc đồng thời `Exams.jsx`, `exams.js`, `examGenerator.js`, `wordExport.js` và `qtiExport.js`.
6. Không coi README/changelog hiện tại là nguồn phiên bản duy nhất vì chúng đã cũ hơn mã chạy.
