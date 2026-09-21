# 📚 Ngân hàng câu hỏi V4.3

Hệ thống quản lý ngân hàng câu hỏi và sinh đề thi chuẩn **BGD 2025**, chạy mạng LAN trong trường.

Dành cho **1 máy chủ** trong trường chạy 24/7, các giáo viên dùng trình duyệt (Chrome/Edge) từ máy tính hoặc điện thoại trong cùng WiFi.

## Tính năng chính

- ✅ **Ma trận đề chuẩn BGD 2025**: 3 phần (Trắc nghiệm, Đúng-Sai, Trả lời ngắn) hoặc thêm Tự luận
- ✅ **Hai wizard tạo ma trận**:
  - **KHTN** (lớp 6-9) tích hợp 3 phân môn Vật lí, Hóa, Sinh với điểm riêng
  - **Môn đơn** (Toán, Văn, Anh, Lý, Hóa, Sinh lớp 10-12...)
- ✅ **Phân quyền 5 vai trò**: Quản trị, BGH, Tổ trưởng, Nhóm trưởng, Giáo viên
- ✅ **Nhập/xuất Excel**: template 20 cột, import 100+ câu một lúc
- ✅ **Sinh đề thông minh**:
  - Anti-repeat (tránh câu đã dùng trong N ngày qua)
  - Cross-code protection (các mã đề không trùng câu)
  - Fallback 4-tầng: exact → topic → branch → subject
  - Xáo trộn đáp án MCQ
- ✅ **Xuất Word** đề thi + đáp án riêng biệt, đẹp, chuẩn format trường
- ✅ **Audit log** đầy đủ mọi hành động
- ✅ **Chạy như Service 24/7** hoặc bật/tắt tay bằng icon Desktop

## Bản vá quan trọng so với V2

V2 có bug điểm lẻ: khi khóa ô tự luận với điểm như 0.7đ, tổng điểm bị rớt 0.1đ (ví dụ 6.9đ thay vì 7.0đ).

**V4.3 vá triệt để**:
- Mọi ô phải là bội của 0.25đ (chuẩn BGD)
- Nếu cấu hình lệch → throw lỗi rõ ràng, không silent rounding
- 8/8 test tự động pass với các kịch bản khó nhất

## Cài đặt nhanh

Xem [HUONG-DAN-NHANH.md](HUONG-DAN-NHANH.md) cho hướng dẫn chi tiết.

```powershell
# Mở PowerShell Admin
cd "C:\đường\dẫn\đến\nganhang-v4"
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1

# Sau đó chọn 1 trong 2 cách:
# - Treo luôn: chuột phải scripts\cai-service.bat → Run as admin
# - Bật tay: double-click scripts\tao-shortcut-desktop.bat
```

## Tài liệu

- [HUONG-DAN-NHANH.md](HUONG-DAN-NHANH.md) — Hướng dẫn cài đặt và sử dụng cho giáo viên
- [docs/SETUP.md](docs/SETUP.md) — Cài đặt chi tiết
- [docs/USER-GUIDE.md](docs/USER-GUIDE.md) — Hướng dẫn nghiệp vụ
- [docs/API.md](docs/API.md) — API reference cho developer
- [CHANGELOG.md](CHANGELOG.md) — Lịch sử thay đổi

## Công nghệ

- **Backend**: Node.js 20 + Express 4 + PostgreSQL 16
- **Frontend**: React 18 + Vite 5
- **Auth**: JWT
- **Export**: docx (Word), xlsx (Excel)

## Yêu cầu phần cứng

Máy chủ (chạy 24/7, khoảng 30-50 user đồng thời):
- CPU: Intel i3 trở lên
- RAM: 4GB (khuyến nghị 8GB)
- Ổ cứng: 10GB trống
- OS: Windows 10/11 64-bit

## Giấy phép

Bản quyền thuộc về người dùng. Tự do sửa đổi và phân phối trong nội bộ trường.

## Hỗ trợ

Thấy bug hoặc cần thêm tính năng? Tạo issue hoặc liên hệ người triển khai.
