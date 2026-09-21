# Nghiệm thu V6.5 — 17/09/2026

Đã cập nhật trực tiếp `nganhang-personalized-v6.3`. Không nhân bản thư mục, không seed lại dữ liệu. Phương pháp Astra One-Pass: khóa hiện trạng, triển khai, kiểm thử âm và hồi quy, đối chiếu dữ liệu rồi kiểm tra runtime.

## Kết quả thực tế

| Kiểm chứng | Kết quả | Bằng chứng |
|---|---|---|
| Tích hợp API + trình duyệt | 73/73 đạt, không bỏ qua | `artifacts/v65-integration-final.log` |
| Đơn vị | 69/69 đạt | `artifacts/v65-unit-final.log` |
| Bộ cân bằng ma trận | 8/8 đạt | Phần đầu cùng log đơn vị |
| Frontend production build | Đạt | `artifacts/v65-build-final.log` |
| Dữ liệu làm việc | Checksum không đổi | `artifacts/v65-qa-preservation-after.json` |
| Parity toàn bộ nhân sự hiện có | 10 người; 12.248 MATCH, 2 khác biệt chủ đích; 0 BUG | `artifacts/v6_5-access-parity.md` / `.json` |
| Runtime | HTTP 200, DB ok, `0.6.5-pilot` tại cổng 3003 | `/api/health`, `artifacts/local-runtime.json` |
| Đăng nhập và danh sách nhân sự thật | Đăng nhập demo thành công, đọc 10 nhân sự | Smoke test API trên cổng 3003, không lưu token vào báo cáo |

## Đã triển khai

- Catalog/preset; scope có kiểu, hợp vị trí/giao chiều; năm và thời hạn; request cache; metadata cũ chỉ qua adapter cho hồ sơ chưa chuẩn hóa.
- Tách review/approve, sửa HS/reset/chuyển lớp/khóa; DENY ưu tiên; ngoại lệ nhạy cảm xác nhận và có lý do.
- Hồ sơ nhân sự: tạo tài khoản không có role dropdown; vị trí/phạm vi; quyền hiệu lực và giải thích; ACL kho; thông tin/mật khẩu; lịch sử.
- Tick lớp riêng từng môn; nhiều dòng chức danh/thời hạn; diff nguyên tử và kiểm phiên bản chống ghi đè đồng thời.
- Phân công môn/lớp nhiều người trong một transaction. Test lỗi hồ sơ thứ hai xác nhận rollback cả hồ sơ thứ nhất.
- Sao chép năm học có ánh xạ lớp nguồn/đích tường minh; không mang override; không ghi đè năm đích đã có phân công.
- Menu theo capability, tách các mục quản trị, chuyển trang quản trị cũ về các mục mới.
- Quyền nội dung/khối/kho ở danh sách, đọc trực tiếp, báo cáo, nhập, phiên bản, rà soát, ma trận, sinh đề và xuất. Chặn hoặc che đáp án khi bị DENY; API cũ đi qua adapter có kiểm quyền.
- Bảo toàn câu hỏi, phiên bản, snapshot bài làm, đề và nguồn GDPT 2018; không đổi thuật toán chấm hoặc tự tạo liên kết chương trình.

## Kiểm thử phủ định và giao diện

GVCN 7A + Vật lí 8A không đọc Toán 8A; gỡ lớp mất quyền học tập nhưng giữ nội dung môn; BGH THCS không đọc THPT; ALLOW tổ + DENY môn/khối đúng ưu tiên; viewer có ALLOW được ghi; hết hạn và metadata cũ không hồi sinh quyền; tài khoản học sinh không được nhận vị trí/ACL kho; scope rỗng và năm/lớp sai bị từ chối; phân công/override đổi có hiệu lực ở request kế tiếp.

Trình duyệt đã tick lớp, xem tác động, lưu, tải lại và đọc API xác nhận; không lỗi JavaScript, không tràn ngang ở 390px. Đã xem ảnh desktop để kiểm nhãn, checkbox, phạm vi BGH và bố cục:

- `artifacts/v6_5-staff-list.png`
- `artifacts/v6_5-staff-detail.png`
- `artifacts/v6_5-homeroom.png`
- `artifacts/v6_5-subject-teacher-matrix.png`
- `artifacts/v6_5-effective-capabilities.png`
- `artifacts/v6_5-board-scope.png`
- `artifacts/v6_5-admin-navigation.png`

Ảnh dùng dữ liệu kiểm thử trong DB riêng, không phải tài khoản được thêm vào DB làm việc.

## Ranh giới triển khai

Quản lý nhân sự/cơ cấu và cấu hình nhạy cảm vẫn là system-admin-only theo ranh giới P0. API `/users` cũ cũng chỉ dành quản trị, tránh lộ danh sách qua role legacy. Chưa xóa bảng/cột/VIEW legacy, chưa tự chuẩn hóa mọi tài khoản; chỉ chuyển hồ sơ khi quản trị lưu phân công. Chưa triển khai Internet hoặc bổ sung quy trình tái xác thực/hai người duyệt ngoại lệ tùy chọn. Không dùng thông tin sức khỏe của cổng 3001 để kết luận về bản này.

Hai khác biệt parity: chủ kho cá nhân BGH được bank.write/review theo thứ tự ưu tiên chủ kho mới; không có content.write/approve nếu chưa được cấp riêng. Chi tiết chuyển tiếp và vận hành ở `docs/access/`.

## Chạy lại

Trong backend: `npm test`, `npm run test:integration`, `node scripts/access-parity-report.js`, `node scripts/v65-preservation.mjs --compare`.
Trong frontend: `npm run build`.
Tại root dự án: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1` khi cổng 3003 chưa chạy. Không dừng tiến trình cổng khác.
