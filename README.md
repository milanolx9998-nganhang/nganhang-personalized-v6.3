# V6.5 — nhân sự và phân quyền, cập nhật trực tiếp trên V6.3

URL: **http://127.0.0.1:3003** · DB: `nganhang_personalized_v63` · Không tạo bản sao mới.

Mở **Quản trị nhà trường → Nhân sự & phân công**. Quyền theo vị trí + phạm vi + ngoại lệ; có xem tác động, giải thích quyền, ACL kho, phân công hàng loạt và sao chép năm học.

Đọc [hướng dẫn quản trị](docs/access/ADMIN_PERMISSION_GUIDE.md), [chuyển tiếp và parity](docs/access/V6_5_MIGRATION.md), [nghiệm thu](docs/V6_5_ACCEPTANCE.md).

Các ghi chú V6.4.3 trở về trước bên dưới được giữ làm lịch sử.

---

# V6.4.3 — cập nhật trực tiếp trên thư mục V6.3

Đang chạy tại **http://127.0.0.1:3003**. Không phải cổng 3001 của bản cũ.
Thư mục và database giữ nguyên: `nganhang-personalized-v6.3` / `nganhang_personalized_v63`.
Đọc [hướng dẫn V6.4.3](docs/V6_4_3_HANDOFF.md) và [báo cáo kiểm chứng](docs/V6_4_3_ACCEPTANCE.md).
Phạm vi mới: chọn bài → tinh chỉnh Outcome/YCCĐ, quản trị chuẩn có tác động, cờ học sinh, sửa/duyệt phiên bản an toàn.
Không tự gán liên kết bài–YCCĐ nếu chưa có căn cứ từ chương trình nguồn.

---

# Bản V6.3 — ma trận Outcome/YCCĐ và nhập liệu

Bản đang dùng: `nganhang-personalized-v6.3`, URL **http://127.0.0.1:3003**, database riêng `nganhang_personalized_v63`. Bản V5 (3002) và V1 (3001) được giữ nguyên.

Đọc **docs/V6_3_HANDOFF.md** để sử dụng và xem bằng chứng kiểm thử. Khởi động bằng `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1`. Không chạy seed, clone lại hoặc script cài V4 trên dữ liệu đang dùng.

Nguồn chuẩn hiện có: workbook V1.1, KHTN7 gồm 30 Outcome / 97 YCCĐ. Môn/khối chưa có nguồn không tự tạo master. Chưa triển khai Internet; mật khẩu demo chỉ dành cho môi trường local.

---

## Tài liệu các phiên bản trước (lưu tham khảo, không phải cấu hình chạy V6.3)

# Bản V5 — UX học sinh và chuẩn bị Pilot

Bản làm việc: nganhang-personalized-v5. Bản V4 và bản gốc được giữ riêng. Local: http://127.0.0.1:3002. Khởi động bằng scripts/start-local.ps1 từ PowerShell. Không chạy seed hoặc hướng dẫn cài V4 cũ bên dưới vào dữ liệu đang sử dụng.

Hướng dẫn hiện hành: docs/USER-GUIDE.md; docs/V5_PILOT_READINESS.md. Build: npm run build; test: npm test và npm run test:integration trong backend; đóng gói: npm run package:release. Gói không có database, media người dùng hoặc secrets; sao lưu riêng theo docs/BACKUP_RESTORE.md.

Trạng thái: mã đã kiểm chứng local; nghiệm thu Ubuntu/Docker/HTTPS và backup khác thiết bị còn chờ hạ tầng thật. Không mở demo với mật khẩu đơn giản ra Internet.

---

# Ngân hàng câu hỏi · Tự luyện và Mastery V1

Bản nâng cấp độc lập từ V4.3.3, phục vụ học sinh tự chọn nội dung, luyện tập và theo dõi mức thành thạo; giáo viên quản lý câu hỏi, giao bài và theo dõi lớp. Nội dung môn học, Outcome/YCCĐ phải dựa trên nguồn GDPT 2018 đã được nhà trường duyệt, không tự suy diễn từ mẫu kỹ thuật.

Bản gốc: ../nganhang-v4.3.3/nganhang-v4 — không sửa.
Database riêng: nganhang_personalized_v1. Bản sao lưu trước nâng cấp: backups/v4-before-upgrade.dump.
Không chạy các script cài dịch vụ/seed V4 cũ cho bản này.

## Chạy ngay trên máy hiện tại

Mở terminal trong backend rồi chạy:

```powershell
npm run migrate
npm start
```

Mở http://127.0.0.1:3001. Frontend đã build trong frontend/dist.
Tài khoản mới: pilot_admin. Mật khẩu demo hiện tại: admin (theo yêu cầu 11/09/2026), không bắt đổi khi vào demo local. Xem docs/DEMO_LOCAL.md; phải đổi mật khẩu trước production. Không gửi tệp đó cho người khác hoặc đưa lên Git/cloud. Các tài khoản V4 được giữ nguyên.

DEV: terminal backend chạy npm run dev; terminal frontend chạy npm run dev (proxy API về 3001). Node 22, PostgreSQL 16; mỗi thư mục chạy npm ci khi cài lại. Xuất PDF/Word có công thức cần chạy npx playwright install chromium trong backend.

## Các luồng sử dụng

Học sinh demo: **hs_demo / Demo12345**, lớp **9-DEMO**. Đăng nhập → **Bài được giao** để làm bài KHTN 9 đã chuẩn bị. Quản trị vào **Quản lý học sinh** để thêm/sửa, cấp lại mật khẩu, chuyển lớp, khóa/mở và xem lịch sử. Hướng dẫn: [docs/QUAN_LY_HOC_SINH.md](docs/QUAN_LY_HOC_SINH.md).

- Học sinh: đăng nhập mã HS → tự chọn môn/khối/chuyên đề → 10–40 câu → luyện từng câu hoặc thử sức → kết quả/Mastery → lịch sử/làm tiếp.
- Giáo viên: nhập Word/Excel/QTI → xem trước, sửa lỗi/chọn xử lý trùng → kho cá nhân → gửi duyệt/đưa vào luyện → giao lớp hoặc cá nhân → xuất Word/PDF và theo dõi lớp.
- Quản trị: nhập roster, tạo năm học/lớp, phân quyền môn–lớp/kho, cấu hình chương trình có phiên bản, xem chỉ số Pilot và nhật ký.
- Tự luận chỉ tự đối chiếu, không được chấm tự động hoặc tính vào Mastery.

Tải mẫu tại giao diện Nhập Word · Excel · QTI hoặc thư mục templates. Tệp mẫu là dữ liệu kỹ thuật, không thay thế SGK/YCCĐ chính thức.

## Kiểm chứng

```powershell
# Trong backend
npm test
npm run test:integration
# Trong frontend
npm run build
```

Integration tạo DB nganhang_pilot_test_<timestamp> riêng, không ghi học sinh/lượt thử vào database làm việc. Các DB thử được giữ để đối chiếu; không tự xóa dữ liệu trên máy.
Bằng chứng: docs/VERIFICATION_REPORT.md và artifacts/.
Bản local đã kiểm thử; chưa tuyên bố đủ điều kiện mở production cho học sinh thật trước khi IT xác nhận Docker, HTTPS, backup khác thiết bị và tài khoản.

## Tài liệu

- docs/ARCHITECTURE.md, docs/DATABASE.md, docs/MIGRATION_V1.md
- docs/IMPORT.md, docs/SELF_PRACTICE.md, docs/MASTERY.md
- docs/ROLES_PERMISSIONS.md, docs/PILOT_METRICS.md, docs/CANVAS.md
- docs/DEPLOYMENT_SELF_HOST.md, docs/BACKUP_RESTORE.md
- docs/VERIFICATION_REPORT.md, docs/IMPLEMENTATION_CHECKLIST.md
- docs/REQUIREMENTS_V1.md: đặc tả được giao; docs/README_V4.md: hướng dẫn V4 lưu tham khảo.

Gợi ý cá nhân hóa A/C, LTI/SSO, AI chấm tự luận và leaderboard giữ OFF theo phạm vi V1.
