## V5 đã được triển khai — 13/09/2026

Phần bên dưới ghi lại thời điểm nhân bản ban đầu. Bản hiện tại đã có nâng cấp UX/portfolio/performance/ops V5, version phát hành 0.5.0; vẫn dùng DB riêng và cổng 3002. Xem docs/V5_PILOT_READINESS.md. Bản V4 nguồn và bản gốc vẫn giữ riêng.

---

# Bản sao riêng để triển khai V5

Tạo ngày 13/09/2026 từ phiên bản V4 UX hiện tại.

- Nguồn giữ nguyên: ../nganhang-personalized-v1.
- Thư mục làm V5: nganhang-personalized-v5.
- Database riêng: nganhang_personalized_v5; đã sao chép và so khớp toàn bộ 40 bảng với nguồn.
- Local riêng: http://127.0.0.1:3002. Bản V4 tiếp tục dùng cổng 3001.
- Khởi động: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1.
- Docker Compose dùng tên project/volume riêng ngan-hang-personalized-v5; cổng nội bộ app vẫn 3001. Chưa triển khai Docker/HTTPS.
- Mã nguồn, thư viện và uploads được sao chép. Không nhân bản thư mục backups/artifacts cũ hoặc tệp mật khẩu khởi tạo bootstrap-admin.secret.json.
- Backup database tại backups/v4-baseline/database.dump; hash và kiểm chứng tại manifest.json cùng thư mục. Uploads hiện nằm trong backend/uploads.
- Các tài liệu/báo cáo V4 bên trong là lịch sử baseline; chưa phải báo cáo hoàn thành V5.
- Cấu hình .env và tài khoản demo được giữ riêng trong bản local; không phát hành thư mục này công khai vì chứa dữ liệu và thông tin cấu hình riêng.

Chưa thực hiện các thay đổi Product Polish/Pilot trong prompt V5 ở bước nhân bản này.

## Kiểm chứng bản sao

- 177 tệp mã nguồn/học liệu kiểm tra SHA-256 khớp bản nguồn; pool.js chỉ đổi database mặc định.
- Frontend build thành công.
- 8 kiểm thử ma trận + 33 đơn vị + 32 tích hợp/trình duyệt đạt (73 tổng).
- Health ứng dụng và database tại cổng 3002 đều OK.
- Log trong artifacts/clone-build.log, clone-unit.log, clone-integration.log.
- Các ảnh V4 mới trong artifacts là kiểm tra baseline trên bản sao V5, không phải chứng cứ đã triển khai prompt V5.
