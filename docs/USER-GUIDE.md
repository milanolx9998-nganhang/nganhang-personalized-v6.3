## Bản V5 — sử dụng tại cổng 3002

Đây là bản nganhang-personalized-v5, không phải bản V4 ở cổng 3001. Mở http://127.0.0.1:3002. Mã đăng nhập/mật khẩu demo giữ nguyên bản sao; chỉ dùng local.

Học sinh: ưu tiên Tiếp tục bài đang làm → xem số bài giao còn thiếu/hạn sắp tới → chọn nội dung cần củng cố → Bắt đầu tự luyện. Chọn bài/YCCĐ bằng checkbox giữ nguyên. Hồ sơ dùng ô “Phần hồ sơ” trên điện thoại hẹp; Lịch sử 10 lượt/trang trên màn hình ≤680px, 20 trên màn hình lớn. Trang xem lại tự mở câu sai, đúng một phần, bỏ qua hoặc chưa chắc; “Xem tất cả” mở toàn bộ.

Nhân sự: Tổng quan hiển thị việc cần chú ý theo quyền; Tiến độ lớp có bốn tín hiệu và liên kết hồ sơ. Thêm/sửa/mật khẩu/chuyển lớp giữ quy trình cũ. Quản trị có chỉ số Pilot và trạng thái vận hành; BGH/người xem không được sửa.

LOW phải đọc là “Chưa đủ dữ liệu”, không phải học sinh yếu. Các hướng dẫn cũ bên dưới vẫn dùng cho tính năng được giữ lại. Chi tiết: STUDENT_PORTFOLIO.md và V5_PILOT_READINESS.md.

---

# Hướng dẫn sử dụng — Dành cho giáo viên

## Quy trình chuẩn cho một kỳ kiểm tra

```
┌────────────────────────┐
│ 1. Nhập câu hỏi        │  Giáo viên soạn + Nhập Excel
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ 2. Duyệt câu hỏi       │  Nhóm trưởng + Tổ trưởng
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ 3. Tạo ma trận         │  Nhóm trưởng
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ 4. Sinh đề (nhiều mã)  │  Nhóm trưởng / Tổ trưởng
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ 5. Tải Word + in đề    │  In và tổ chức kiểm tra
└────────────────────────┘
```

## 1. Nhập câu hỏi

### Cách 1: Nhập qua Excel (khuyến cáo khi nhập nhiều)

1. Vào **Câu hỏi** → bấm **⬇️ Template Excel** → mở file tải về
2. Điền thông tin theo hướng dẫn trong sheet "Huong_dan"
3. Lưu file, quay lại web → bấm **📥 Nhập Excel** → chọn file
4. Hệ thống báo: "Đã nhập N câu, bỏ qua M câu, lỗi K câu"

**Lưu ý cột Excel:**
- Cột A (STT) và B (Mã câu hỏi): để trống, hệ thống tự sinh
- Cột C (Môn): ghi mã môn như `Toan`, `VatLi`, `HoaHoc`, `SinhHoc`, `KHTN`...
  - Với KHTN lớp 6-9: ghi `VatLi`/`HoaHoc`/`SinhHoc` đều được, hệ thống tự gom về KHTN + phân môn
- Cột I (Nội dung): chỉ phần dẫn, **KHÔNG** viết "A. B. C. D." vào đây
- Cột J-M (Phương án A-D): chỉ dùng khi dạng là Trắc nghiệm 4 lựa chọn
- Cột N (Đáp án):
  - Trắc nghiệm: `A` / `B` / `C` / `D`
  - Đúng-Sai: `a-Đ; b-S; c-Đ; d-S`
  - Trả lời ngắn: ghi thẳng đáp án

### Cách 2: Nhập từng câu trên web

Vào **Câu hỏi** → **+ Thêm câu hỏi** → điền form → **💾 Lưu**.

## 2. Duyệt câu hỏi

**Nhóm trưởng** hoặc **Tổ trưởng** vào **Câu hỏi**:

- Lọc theo trạng thái `Mới tạo` để xem câu chưa duyệt
- Xem nội dung → nếu OK bấm **✓ Duyệt**
- Nếu cần sửa: bấm **Sửa** → chỉnh → Lưu

**Chỉ câu đã duyệt (hoặc đã rà soát) mới được dùng để sinh đề.**

## 3. Tạo ma trận đề

Vào **Ma trận đề** → chọn 1 trong 2 wizard:

### Wizard KHTN (lớp 6-9)

Dành cho KHTN tích hợp 3 phân môn (Vật lí + Hóa + Sinh).

**Bước 1: Thông tin chung**
- Tên ma trận: VD "Giữa kỳ I KHTN 9"
- Mục đích: Giữa kỳ / Cuối kỳ / KTTX / HSG / Thi thử
- Lớp, tổng điểm (VD 10đ), thời gian (VD 60 phút)

**Bước 2: Tỉ trọng mức độ**

Phân bổ 100% cho 4 mức Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao.

Mặc định 30/30/20/20 — có thể điều chỉnh theo đặc thù môn.

**Bước 3: Phân môn**

Với mỗi phân môn (Vật lí, Hóa, Sinh), điền:
- **Điểm phân môn**: phải cộng lại = tổng điểm. VD VL 4đ + HH 3đ + SH 3đ = 10đ
- **Số câu TN** (mỗi câu 0.25đ)
- **Số câu ĐS** (mỗi câu 0.5đ)
- **Số câu TLN** (trả lời ngắn, mỗi câu 0.5đ)
- **Số ô TL** (tự luận, điểm tính tự động)

Hệ thống realtime hiển thị:
- "Đ.TL còn" = điểm phân môn - (điểm TN+ĐS+TLN)
- Cân đối → hiện màu xanh, không cân đối → màu đỏ

**Bước 4: Phạm vi kiểm tra (tùy chọn)**

Mặc định: lấy toàn bộ chương trình.

Nếu muốn giới hạn: tick các bài cụ thể. Có filter theo phân môn (VL / HH / SH).

**Bước 5: Auto phân bổ**

Bấm **✨ Tự động phân bổ**. Hệ thống tạo bảng ma trận chéo (phân môn × mức độ), mỗi ô có 1-3 sub-cells (TN/ĐS/TLN/TL).

**Bước 6: Tinh chỉnh (tùy chọn)**

- Bấm **🔒** trên từng ô để khóa. Ô khóa không thay đổi khi tái phân bổ.
- Sửa số câu hoặc điểm trong ô khóa.
- Bấm **🔄 Tái phân bổ (giữ 🔒)** — hệ thống phân bổ lại các ô còn lại sao cho tổng điểm vẫn khớp.
- Bấm **🔓 Mở khóa hết** nếu muốn làm lại từ đầu.

**Bước 7: Lưu**

Bấm **💾 Lưu ma trận**. Ma trận lưu ở trạng thái "Bản nháp" để có thể sửa.

### Wizard Môn đơn

Tương tự KHTN nhưng không có bước "Phân môn". Chỉ cần điền số câu TN/ĐS/TLN/TL + tỉ trọng mức độ.

Dùng cho Toán, Ngữ văn, Tiếng Anh, hoặc Vật lí/Hóa/Sinh lớp 10-12.

## 4. Sinh đề thi

Vào **Đề thi** → **+ Sinh đề mới**:

1. **Chọn ma trận**: chọn từ danh sách ma trận đã tạo
2. **Tên đề**: VD "Giữa kỳ I năm học 2025-2026"
3. **Số mã đề**: 1-10 mã (mặc định 2)
4. **Anti-repeat**: số ngày tránh lặp câu (mặc định 180 ngày)
5. **☑ Tránh trùng câu giữa các mã đề**: nên bật
6. **Xem preview coverage**: hệ thống báo có bao nhiêu ô đủ câu, bao nhiêu ô thiếu

Bấm **Sinh đề**.

### Khi nào có cảnh báo?

- Ô không đủ câu chính xác → fallback sang mức relax
- Dùng lại câu trong N ngày qua (nếu pool quá nhỏ)
- Câu cross-code (nếu pool chỉ đủ cho 1 mã)

Cảnh báo không phải lỗi — đề vẫn sinh được. Chỉ cần thêm câu nếu muốn pool rộng hơn.

## 5. Tải đề Word

Trong **Đề thi**:
- Bấm **Xem** trên đề muốn tải
- Chọn mã đề (101, 102, 103...)
- Bấm **📥 Tải đề Word** → file `.docx` định dạng chuẩn
- Bấm **📥 Tải đáp án** → file đáp án riêng

## Quản lý môn học / chương / bài

Chỉ **Admin, BGH, Tổ trưởng, Nhóm trưởng** thấy menu **Môn học · Chương · Bài**.

- Chọn môn → chọn lớp → xem danh sách bài
- Bấm **+ Bài mới** để thêm
- Bài có các trường: Chương, Tên bài, Phân môn (nếu là KHTN), Mục tiêu học, Thứ tự

## Báo cáo

Vào **Báo cáo**:
- **Thống kê câu hỏi** — phân loại theo môn, lớp, mức độ, dạng
- **Top dùng nhiều** — câu nào bị dùng lặp nhiều lần (cần thêm câu mới để đa dạng)
- **Nhật ký hệ thống** — audit log (chỉ Admin/BGH)

## Quản lý người dùng

Chỉ **Admin** và **BGH** thấy menu này.

- Thêm tài khoản cho giáo viên mới
- Đặt lại mật khẩu khi giáo viên quên
- Khóa/mở tài khoản khi GV chuyển trường

## Mẹo thực tế

1. **Đặt tên ma trận có quy tắc**: VD `GK1_2526_KHTN9` (giữa kỳ 1 năm 2025-2026 môn KHTN lớp 9) để dễ tra cứu sau này.

2. **Clone ma trận từ năm trước**: nếu cấu hình gần giống năm trước, vào ma trận cũ, bấm **Clone** rồi chỉnh lại tên + phạm vi. Tiết kiệm 15 phút.

3. **Duyệt câu theo nhóm**: nhóm trưởng lọc theo `subject_id = môn mình phụ trách` + `status = Mới tạo` → duyệt một lượt.

4. **Anti-repeat 180 ngày** phù hợp cho 1 học kỳ. Nếu muốn triệt để: 365 ngày. Muốn dễ dãi: 60 ngày.

5. **Lưu Word vào Google Drive** để có bản sao trên cloud. Đề + đáp án để chung thư mục theo tên đề.

6. **Xuất Excel định kỳ** làm backup phụ: vào ma trận → trong tương lai có thể có tính năng "Xuất toàn bộ câu hỏi".

## Giao diện V4 mới: năm mảng việc và hồ sơ học tập

Menu nhân sự được gom theo Học sinh & Học tập; Ngân hàng & Nội dung; Tạo & Giao bài; Báo cáo & Phân tích; Quản trị hệ thống. Mục không có quyền sẽ ẩn. Thống kê ngân hàng cũ chuyển đến /dashboard; ma trận, đề, kho, nhập và xuất vẫn giữ.

Theo dõi một em: Tiến độ lớp → chọn lớp → bấm tên → chọn Tổng quan/Lịch sử làm bài/Thành thạo/Bài được giao/Lớp học. Lịch sử có phân trang và liên kết xem lại từng lượt, không còn bảng hồ sơ dài nhúng dưới lớp. Có In / Lưu PDF.

Trên điện thoại bấm menu ở góc trên; chọn mục, bấm nền ngoài hoặc Escape để đóng. Xem hướng dẫn đầy đủ trong STUDENT_PORTFOLIO.md và ảnh artifacts/v4-student-portfolio-overview.png.
