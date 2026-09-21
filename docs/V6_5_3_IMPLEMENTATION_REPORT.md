# V6.5.3 — báo cáo triển khai trực tiếp

## Phạm vi và trạng thái

Đã sửa trực tiếp nganhang-personalized-v6.3; không nhân bản dự án, không reseed, không thay đổi mapping GDPT 2018. Thực hiện theo astra-one-pass: sửa có giới hạn, kiểm thử quyền ở server, kiểm tra dữ liệu và release. **Chưa nghiệm thu toàn bộ Master Prompt:** thiếu môi trường Ubuntu/Supabase thực tế và các bằng chứng hạ tầng bên dưới.

## Đã triển khai

- Giữ Position Preset làm quyền mặc định; Admin chỉ chỉnh ngoại lệ. Có bundle, preview, xác nhận, sao chép, bulk, thời hạn và mẫu quyền có thể lưu/dùng lại. Lưu mẫu không tự cấp quyền.
- BGH chuyên môn được xem đáp án đúng phạm vi; BGH giám sát không có quyền này mặc định.
- staff.manage và system.config là quyền nghiệp vụ có thể ủy quyền bởi Admin; không phải quyền quản trị secret/DB/deploy/root. SUPER_HIGH_RISK được gắn rõ trong catalog và yêu cầu xác nhận khi cấp. DENY vẫn thắng.
- Người quản lý hồ sơ được ủy quyền không được cấp quyền, tự sửa mình, chiếm Admin/người quản trị quyền, hoặc đổi mật khẩu tài khoản có quyền đặc biệt nhạy cảm cao hơn. Đổi tổ của tài khoản legacy phải qua Admin.
- Migration mới vô hiệu hóa các override staff/system cũ từng bị bỏ qua để tránh tự kích hoạt quyền; giữ checksum migration cũ. Tạo permission_templates.
- Bốn profile local-lan, supabase-lan, home-supabase, supabase-cloud-test. Fail-closed khi thiếu/mâu thuẫn cấu hình; profile test từ chối tên DB chính. Badge môi trường qua health.
- Storage interface local/Supabase private cho ảnh, import nguồn và export. Backend kiểm tra quyền trước delivery; không gửi service-role key ra frontend. Supabase adapter yêu cầu bucket private và giới hạn kích thước tải.
- Cấu hình Home/Caddy, private Supabase override, script start/stop/status/backup/restore-test/update, các tiện ích PowerShell, schema parity và năm runbook.
- Release bắt buộc security gate, kiểm tra nguồn không đổi trong lúc test, manifest và quét secret. Home update kiểm tra release trước backup/migration; không cập nhật School tự động.

## Backup và bảo toàn

Backup trước migration: backups/v653-baseline/2026-09-20T18-03-14-407Z. Checksum ở manifest của backup; không chứa .env.

artifacts/v653-preservation.json xác minh toàn bộ tám nhóm: 11 users, 84 questions, 84 question_versions, 4 attempts, 40 attempt_items, 16 mastery_events, 8 mastery_states, 1 class_membership không đổi so với đầu phiên.

Script v652-preservation so với backup cũ 17/09 báo khác 1 attempt và 10 items: các bản ghi này đã tồn tại trong backup V6.5.3 trước khi sửa. Không xóa/rollback dữ liệu mới để làm khớp baseline cũ.

DB/JWT không rotate lại trong lượt này. Bằng chứng rotate độc lập ở artifacts/v652-secret-rotation.json thuộc lượt trước; không coi đó là một lần kiểm tra runtime mới.

## Kiểm chứng

Lệnh release chạy lại build + 8 matrix + bộ security/practice + 80 integration (bao gồm UI/browser và export). Kết quả cuối xem artifacts/v652-security-gate.json, v651-security-unit.log, v651-access-adversarial.log, v651-security-integration.log. Tên artifact giữ tương thích pipeline cũ, không chỉ ra phiên bản source.

Kiểm tra PowerShell bằng parser, Bash bằng bash -n, Node bằng node --check. Runtime local dùng scripts/start-local.ps1, health ở http://127.0.0.1:3003/api/health. Đây là loopback development, không phải HTTPS LAN đã nghiệm thu.

Supabase contract test dùng stub được ghi rõ trong tên test; **không được tính là UAT Supabase thật**.

## Chưa đạt / không được tự đánh dấu hoàn tất

1. Chưa có Docker/Caddy trên máy thao tác, chưa có đích Ubuntu/SSH hoặc cấu hình Supabase riêng. Chưa chạy compose, migrations Supabase thật, bootstrap bucket thật, parity hai provider, UAT/negative test qua Supabase.
2. Chưa kiểm tra HTTPS/certificate/firewall/VPN, ngắt Internet LAN, load Home, off-host backup hay full-stack restore Storage + DB. Restore-test hiện kiểm DB riêng và archive, chưa khôi phục ứng dụng hoàn chỉnh.
3. Chưa hoàn thành toàn bộ P1 trong master: re-auth/MFA cho thao tác nhạy cảm, hạ tầng least-privilege runtime/migrator, CI runner thực tế và backup automation/off-host. Không gọi bản này production-ready.
4. Không có tag Git riêng vì Git root bao trùm thư mục người dùng. Dùng manifest/SHA256 release; không commit dữ liệu ngoài phạm vi.

Ưu tiên tiếp theo: provision Home riêng theo runbook; kiểm chứng quyền DB runtime/migrator và bucket; schema parity; đầy đủ UAT/security/load/restore/TLS; sau đó mới duyệt release sang School. Cloud là tùy chọn, chưa bật.
