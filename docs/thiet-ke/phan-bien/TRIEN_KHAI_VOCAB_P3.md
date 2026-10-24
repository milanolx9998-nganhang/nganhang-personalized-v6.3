# Báo cáo triển khai — V6.9.5 Giai đoạn 3 (Phần 1)

Ngày thực hiện: 24/10/2026 · Nhánh: `feat-v69-battle`

## 1. Tệp đã thay đổi

1. `backend/src/services/vocab/generator.js`
   - Bổ sung 3 dạng câu từ vựng mới:
     - **EN3 (Điền từ vào câu ví dụ)**: chỉ sinh khi từ tiếng Anh có `example` chứa đúng từ đích (không phân biệt hoa/thường, khớp theo ranh giới từ `blankExample`), đục từ đích thành `____`, không lộ đáp án trong stem; `multiple_choice` 4 phương án (từ đích + 3 từ nhiễu ưu tiên cùng bộ), gợi ý 12 giây.
     - **EN4 (Gõ chính tả theo nghĩa)**: `short_answer`, đáp án `aliases: [term]`, `case_sensitive: false` (chấm qua `gradeQuestion` không phân biệt hoa/thường và khoảng trắng thừa), stem `"Gõ từ tiếng Anh có nghĩa “…”"`, gợi ý 20 giây; chỉ áp dụng cho từ 3–14 ký tự thuộc chữ cái/khoảng trắng/gạch nối.
     - **ZH5 (Chọn thanh điệu)**: chỉ sinh cho từ **một chữ Hán** có `reading` là pinyin mang dấu thanh 1–4 (`syllableTone`, bỏ qua từ nhiều chữ hoặc khinh thanh/thanh 5); `multiple_choice` 4 lựa chọn `Thanh 1/2/3/4` kèm âm tiết tương ứng, gợi ý 8 giây.
   - Cập nhật `VOCAB_KINDS`, `ALL_VOCAB_KINDS` và `DEFAULT_VOCAB_KINDS`: mặc định (không chọn dạng) chỉ trộn các dạng trắc nghiệm/ghép cũ (`EN1, EN2, EN5` / `ZH1, ZH2, ZH3, ZH4, ZH6`); các dạng mới `EN3, EN4, ZH5` chỉ vào khi giáo viên chọn rõ.
2. `backend/src/routes/battle.js`
   - Mở rộng giới hạn số phần tử `vocab_kinds` trong `scopeSchema` theo `ALL_VOCAB_KINDS.length`.
3. `backend/src/services/vocab/bank.js` & `backend/src/routes/vocab.js`
   - Bổ sung hàm `vocabStats` và endpoint `GET /api/vocab/stats?set_id=&class_id=&limit=`.
   - Kiểm quyền: nhân sự có quyền đọc môn của bộ (`subjectOf(..., false)`); giáo viên bắt buộc truyền `class_id` và kiểm quyền qua `classAccess`; quản trị xem được mọi lớp hoặc toàn trường khi bỏ trống `class_id`; học sinh nhận 403.
   - Truy vấn từ `vocab_student_stats` ghép `class_memberships` đang hiệu lực, lọc `seen >= 3`, sắp xếp theo `wrong_rate` giảm dần (đồng hạng: `seen` giảm dần), giới hạn mặc định 30 (tối đa 100), chỉ đếm số học sinh (`students`), không lộ danh tính học sinh.
4. `frontend/src/pages/battle/battleApi.js`
   - Cập nhật `VOCAB_KIND_LABELS` và `VOCAB_KINDS` thêm `EN3`, `EN4`, `ZH5`.
5. `frontend/src/pages/vocab/VocabBank.jsx` & `frontend/src/styles/vocab.css`
   - Thêm tab **"Từ hay sai"** cạnh **"Danh sách từ"** của bộ từ đang mở.
   - Chọn lớp từ `/api/practice/classes` (quản trị có thêm tuỳ chọn "Toàn trường"), hiển thị trạng thái đang tải, trạng thái trống (`"Chưa đủ dữ liệu: cần ít nhất 3 lượt trả lời mỗi từ"`), bảng từ sai nhiều nhất và nút **"Xem trong bộ"** (nhảy sang danh sách từ và lọc đúng từ đó).
   - Bảo đảm bố cục co giãn và cuộn bảng ngang trên màn hình mobile 375 px không tràn ngang.
6. `docs/API.md`
   - Cập nhật tài liệu `/api/vocab/stats` và danh sách `vocab_kinds` (`EN3`, `EN4`, `ZH5`).
7. `backend/test/battle/vocab-generator.test.js` & `backend/test/integration/v695-vocab.test.js`
   - Bổ sung unit test cho `EN3`, `EN4`, `ZH5` và 1.000 lượt sinh câu không trùng đáp án.
   - Thêm integration test kiểm chứng thống kê từ hay sai sau trận từ vựng của 2 học sinh (GV đúng lớp 200, GV lớp khác 403, HS 403, admin toàn trường 200).

## 2. Kết quả kiểm thử (Đạt / Tổng)

- `npm test` (`backend`):
  - `matrixBalancer.test.js`: **8 / 8** đạt
  - `test/practice/*.test.js` + `test/battle/*.test.js`: **238 / 238** đạt (riêng `vocab-generator.test.js`: **7 / 7** đạt)
- `npm run test:security` (`backend`): **27 / 27** đạt
- `node --test test/integration/v695-vocab.test.js`: **4 / 4** đạt
- `node --test test/integration/v693-battle-modes.test.js`: **8 / 8** đạt
- Build giao diện (`frontend`, Vite 6.4.3): **Đạt** (1.036 modules transformed)

## 3. Việc còn mở (Giai đoạn 3 — phần tiếp theo)

- Tự luyện từ vựng một mình cho học sinh trên trang Tự luyện (ưu tiên bốc các từ em hay sai từ `vocab_student_stats`).
- Dạng câu **EN6** (nghe phát âm bằng Web Speech API → chọn từ).
- Thống kê cá nhân "Từ em hay sai" xuyên suốt nhiều trận cho học sinh và bảng độ phủ từ vựng theo Unit/HSK.