# Báo cáo V6.5.2 — phân quyền mặc định và bảo mật pilot

Ngày đối soát: 18/09/2026. Sửa trực tiếp `nganhang-personalized-v6.3`, không nhân bản dự án. URL chạy cục bộ: http://127.0.0.1:3003. Đây là bản pilot, chưa tuyên bố production-ready.

## Cách sử dụng

Quản trị nhà trường → Nhân sự & phân công → chọn nhân sự → Vị trí & phạm vi. Chọn chức vụ, môn và lớp/phạm vi; quyền mặc định tự áp dụng. Giáo viên bộ môn chưa chọn lớp thì chưa có quyền theo vị trí đó. Có hai vị trí BGH riêng: giám sát và chuyên môn.

“Sửa quyền chi tiết” là ngoại lệ tùy chọn. Có nhóm quyền nhanh, tùy chỉnh từng quyền, ALLOW/DENY, xem trước tác động, xác nhận quyền nhạy cảm và lý do. Có cấp theo nhóm nhân sự, sao chép phân công và sao chép quyền từ nhân sự khác; không tự sao chép quyền tạm thời, hết hạn hoặc trạng thái Admin. Tài khoản bị khóa không còn quyền. Kho REVIEW không tự bao gồm WRITE; DENY áp dụng trước quyền chủ kho. `staff.manage` và `system.config` không được ủy quyền.

## H0 — vận hành, secret và dữ liệu

- Khi khảo sát H0, V1/V5 là source lưu trữ; không có listener/service/scheduled task ứng dụng liên quan đang chạy. Không sửa `.env` của source V1/V5.
- Đã backup DB, uploads và cấu hình cũ mã hóa Windows DPAPI tại `backups/v652-h0/2026-09-17T14-31-32-268Z` trước khi đổi secret. Bản DPAPI cần đúng tài khoản Windows để khôi phục; không phải backup off-host.
- DB password và JWT secret được sinh độc lập. Chỉ cấu hình bản hiện tại được cập nhật. Đã kiểm tra DB password cũ bị từ chối và JWT cũ trả 401. Không đưa secret vào báo cáo hoặc log.
- Đã bỏ ba `.env` thật của V1/V5/V6.3 trong RAR phát hành; kiểm tra tính toàn vẹn RAR đạt. Source cũ còn nguyên; cấu hình hiện tại có backup mã hóa. Hai ZIP cũ được quét đường dẫn, nội dung secret và manifest, đạt.
- Đối chiếu count và hash với backup: 84 câu hỏi, 84 phiên bản, 3 bài làm, 30 mục bài làm, 16 mastery events, 8 mastery states và 1 quan hệ lớp không đổi. Có 11 tài khoản; token_version thay đổi có chủ đích để thu hồi phiên. 30 Outcome và 97 YCCĐ được giữ nguyên.

## H1–H8 — thay đổi đã triển khai

| Nhóm | Kết quả |
|---|---|
| H1 | Position Preset, môn × khối/lớp, BGH tách vai trò, ngoại lệ/bundle/bulk/copy có xem trước, khóa phiên bản phân quyền và audit |
| H2 | Cookie HttpOnly, SameSite=Lax, CSRF + kiểm tra Origin, bỏ JWT localStorage, đăng xuất/đổi mật khẩu thu hồi phiên, mật khẩu mới tối thiểu 12 ký tự và không vượt giới hạn byte bcrypt |
| H3 | Answer Release AFTER_SUBMIT / AFTER_DEADLINE / MANUAL_RELEASE / NEVER, kiểm tra tập trung cho bài làm/đáp án/portfolio/retry, DTO học sinh |
| H4 | Kiểm tra chủ bài làm, item thuộc đúng attempt, phạm vi học sinh/môn/kho, chấm phía server, DTO nhân sự bỏ source/metadata nhạy cảm; xuất đáp án có quyền riêng |
| H5 | Bỏ truy cập công khai media; ảnh học sinh gắn attempt + item và được kiểm tra lại, kể cả danh sách cờ; tải file nguồn có quyền, phạm vi và audit |
| H6 | Giới hạn đăng nhập theo tài khoản kèm trần IP, trần NAT rộng hơn; giới hạn API/upload/reset/export/tải nguồn và audit từ chối |
| H7 | React/Markdown không chèn HTML tùy ý, CSP, kiểm tra kiểu ảnh, đường dẫn/ZIP/XML và XLSX lồng trong ZIP, kiểm tra quyền trước ghi tệp import/roster |
| H8 | Build + unit/security + integration là cổng bắt buộc trước đóng gói; release kiểm manifest/hash/secret thực tế, chặn gói không đạt |

## Kiểm chứng tái lập

Từ thư mục dự án: `node scripts/package-release.mjs`. Lệnh tự build frontend, chạy các bộ kiểm thử và chỉ tạo release khi gate đạt. Kết quả chi tiết là nguồn xác nhận cuối cùng:

- `artifacts/v652-build.log`
- `artifacts/v651-security-unit.log` (8 kiểm tra ma trận)
- `artifacts/v651-access-adversarial.log` (unit học tập và security)
- `artifacts/v651-security-integration.log` (78 kiểm tra tích hợp, DB và uploads cô lập)
- `artifacts/v652-security-gate.json` (thời gian và hash nguồn)
- `artifacts/v651-release-secret-scan.json` (gói phát hành, hash và kết quả quét)
- `artifacts/v652-secret-rotation.json`, `artifacts/v652-preservation.json`
- Ảnh giao diện `artifacts/v6_5-staff-detail.png`, `artifacts/v6_5-effective-capabilities.png`, `artifacts/v651-auth-cookie.png`.

`v651-f12-network.png` là ảnh báo cáo đã ẩn bí mật từ kết quả kiểm thử trình duyệt thật, không phải ảnh chụp bảng DevTools Network. Các tên artifact `v651-*` được giữ để tương thích bộ kiểm chứng cũ.

## Giới hạn còn lại — không coi là đã hoàn tất

- Chạy HTTP trên loopback có ngoại lệ cookie không Secure; môi trường thật cần HTTPS. API client cũ không phải trình duyệt còn tương thích Bearer; trình duyệt dùng cookie + CSRF.
- P1: MFA/re-auth thao tác nhạy cảm, template quyền do Admin tự lưu, tách DB role runtime/migration/backup và quyền CREATEDB hiện hữu, backup mã hóa off-host và diễn tập phục hồi, CI/supply-chain đầy đủ chưa hoàn tất trong đợt H0–H8 này.
- P2: chế độ thi bảo mật nâng cao chưa triển khai; không tuyên bố chống chụp màn hình hay chống sao chép tuyệt đối.
- Endpoint tải nguồn có kiểm soát đã có; chưa bổ sung nút tải nguồn mới trên mọi màn hình cũ. Ảnh ngoài hệ thống cần nhập vào kho media nội bộ; CSP không cho nhúng tùy ý từ URL bên ngoài.
- Chưa có kiểm thử xâm nhập độc lập hoặc bảo đảm mọi rủi ro đã được loại bỏ. Không dùng bản pilot cho kỳ thi hệ trọng trước khi hoàn tất vận hành production và đánh giá độc lập.

Các kiểm tra bảo mật chỉ thao tác trên dữ liệu test cô lập; không thay mật khẩu người dùng thật thành mật khẩu demo và không xóa câu hỏi/bài làm hiện có.
