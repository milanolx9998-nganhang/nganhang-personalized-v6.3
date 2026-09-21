# V5 — hoàn thiện sản phẩm và mức sẵn sàng Pilot

Ngày nghiệm thu local: 13/09/2026. Version gói: 0.5.0.
**Mã sẵn sàng cho bước nghiệm thu Pilot; xác minh hạ tầng production còn chờ.**
Chỉ chỉnh nganhang-personalized-v5 / DB nganhang_personalized_v5 / cổng 3002.

## 1. Nền trước nâng cấp

Bản V4 được nhân riêng, 40 bảng đối chiếu lúc clone; giữ nganhang-personalized-v1 và bản gốc nganhang-v4.3.3/nganhang-v4. Nền 73 kiểm thử (8 ma trận, 33 đơn vị, 32 tích hợp) đạt; JS ban đầu 839,92 kB, gzip 246,81 kB. Audit trước thay đổi: V5_PRODUCT_POLISH_AUDIT.md. Log: artifacts/v5-baseline-*. Không sửa migration cũ, không reset DB, không thêm engine song song.

## 2. Thay đổi UX

Trang nhân sự dùng dữ liệu cần chú ý: chưa luyện 7 ngày, xu hướng giảm có bằng chứng, bài đến hạn, câu chờ duyệt; tác vụ nhanh theo vai trò và lượt học gần đây. Dashboard lớp bốn tín hiệu, chọn tên để vào hồ sơ, bộ lọc thu gọn và thẻ mobile.

Trang học sinh ưu tiên một bài đang làm, các bài dở khác thu gọn; bài giao có số lượng và hạn; tối đa hai nội dung cần củng cố; một hành động chính; tiến bộ là phần phụ, có đường tới hồ sơ. Không lặp lại toàn bộ menu. Skill UI/UX định hướng thứ tự hành động, phân cấp đọc và mục tiêu chạm; Astra One-Pass giữ phạm vi bản sao và kiểm chứng sau thay đổi.

## 3. Ngữ nghĩa hồ sơ

LOW luôn “Chưa đủ dữ liệu”, hiển thị câu khác nhau/lượt hoàn thành; không suy ra mạnh/yếu/tiến bộ. MEDIUM/HIGH dùng bốn nhãn <50, 50–69, 70–84, ≥85. Không thay công thức Mastery.

Phân biệt câu trong các lượt luyện, câu đã trả lời, câu khác nhau. Bốn KPI chính thay sáu KPI đồng hạng; chỉ số thêm và thành thạo tổng hợp thu gọn. Sai/partial/bỏ qua/chưa chắc tự mở trong review; đúng thu gọn; Xem tất cả; metadata kỹ thuật chỉ staff và thu gọn. Giữ bất biến phiên bản, không lộ đáp án challenge chưa nộp.

## 4. Mobile và khả năng thao tác

Đã kiểm tra 390×844, 430×932, 768×1024, 1366×768, 1440×900: không tràn ngang trang. Nội dung câu 18px, line-height 1,65; ảnh/co giãn, bảng và công thức cuộn riêng; mục tiêu chạm chính ≥44px, focus rõ. Login có nhãn mã học sinh, autocomplete, hiện/ẩn mật khẩu và lỗi có role alert. Menu đóng bằng Escape; xác nhận nộp bài và focus trap giữ nguyên.

Lịch sử 10/trang ≤680px, 20/trang còn lại; offset chuẩn hóa khi đổi độ rộng. <480px dùng ô Phần hồ sơ. Đã xem bằng mắt tám ảnh bắt buộc, gồm sửa lại ảnh menu bị chụp giữa chuyển động; script chờ animation hoàn tất. PDF tổng quan đã render và kiểm tra trang đầu.

## 5. Phân quyền

Teacher đúng lớp+môn; board/viewer chỉ đọc lớp+môn được cấp tường minh bằng teacher_class_assignments. Không mặc định toàn trường. Workspace giữ đúng cặp lớp/học sinh–môn, không trộn quyền giữa các lớp. Học sinh chỉ xem mình. Operations/metrics admin-only. Bộ kiểm thử có đúng/sai lớp, đúng/sai môn, board trước/sau cấp, viewer không cấp và cấm sửa.

Chưa xây quyền tổ/khối tự động vì chưa có nghiệp vụ tổ chức được xác nhận. Đây là giới hạn tường minh, không phải cho quyền toàn trường để lấp chỗ trống.

## 6. Hiệu năng tải giao diện

React.lazy/Suspense cho các route; tách Rich Markdown/KaTeX và ConfigFields khỏi shared nhẹ. Student Home không tải Teacher/Admin/Questions/Matrix/Exams/Analysis/Reports hay Rich/KaTeX.

Đo network thật: 219.971 byte JS ban đầu (~220 kB), gzip ~74,53 kB; giảm ~74% JS và ~70% gzip so nền. Tệp entry riêng ~207,77 kB; tổng mã chia chunk không đồng nghĩa tất cả tải ban đầu. Không tăng ngưỡng cảnh báo Vite để che bundle. artifacts/v5-bundle-report.json, v5-build.log.

## 7. Production thực sự đã xác minh tới đâu

Đã chạy Node/PostgreSQL Windows và health local 3002, cùng trình duyệt headless. Chưa có Docker/Podman trong PATH; CHƯA chạy Ubuntu/Compose/Caddy TLS/domain, restart container/persistence hoặc máy dự phòng thật. Compose có namespace riêng và log rotation cả bốn dịch vụ, nhưng đó là cấu hình đã chuẩn bị, không phải bằng chứng triển khai.

Monitor đã đọc health 200, uptime/RSS/CPU, kết nối DB, trạng thái backup. Cảnh báo thật: ổ máy làm việc còn khoảng 40,5 GB / 511,5 GB (~7,9%), dưới ngưỡng 10%. Không tự xóa dữ liệu. artifacts/v5-monitor.json.

## 8. Backup và restore

Dump dùng snapshot thống nhất với fingerprint. Restore vào DB mới nganhang_restore_v5_final_20260913, không ghi đè. 8 bảng quan trọng khớp số dòng/hash: 11 users, 84 questions, 84 versions, 2 attempts, 20 items, 6 mastery events, 6 mastery states, 1 membership. 81 tệp uploads khớp SHA256 sau giải nén.

6 bảng lịch sử không đổi so bản backup; lịch sử bản V4 nguồn vẫn khớp. Auth last_login có thể đổi do kiểm tra đăng nhập. Integration đã tách DB và uploads riêng; giữ các tệp thử cũ trong bản sao, không xóa dữ liệu không được yêu cầu. Bằng chứng v5-restore.log và v5-integrity-report.json. Backup cùng máy, chưa phải off-device/disaster recovery thực tế.

## 9. Kiểm thử tải

DB nganhang_load_test_* độc lập, 180 tài khoản chỉ trong test. Mỗi phiên login/tạo20/mở/lưu20/nộp/hồ sơ; 4.500 request đo, không lỗi HTTP, 180/180 phiên hoàn tất.

| Phiên đồng thời | p50 gộp | p95 gộp | p95 login | p95 lưu | p95 nộp |
|---|---:|---:|---:|---:|---:|
| 30 | 74 ms | 1.623 ms | 3.915 ms | 100 ms | 196 ms |
| 50 | 100 ms | 407 ms | 5.096 ms | 165 ms | 250 ms |
| 100 | 207 ms | 860 ms | 9.964 ms | 246 ms | 509 ms |

RSS app cực đại ~158/180/179 MiB; DB kết nối lấy mẫu tối đa 21/21/20 (bao gồm quan sát/test). CPU app lấy mẫu trung bình khoảng 1,1 lõi; không tính toàn bộ PostgreSQL. Xem v5-load-test.json và v5-integrity-report.json. Không so sánh ba mẫu như benchmark tuyệt đối; không có think time và máy local có tải nền.

Login đồng loạt 100 phiên còn chậm. Giới hạn login chỉ bỏ trên server test loopback để đo burst; production không thay đổi bảo vệ. Chưa xác nhận tải máy trường; cần đo lại đúng hạ tầng và cân nhắc phân đợt đăng nhập.

## 10. Kiểm thử cuối và bảo mật dependency

npm test: 8 ma trận + 33 đơn vị đạt. npm run test:integration: 34 đạt. Tổng 75; frontend build đạt. Cài mới 8 migration và chạy lần hai đều exit 0. Browser riêng 17 ảnh, 5 viewport, không nộp/sửa bài demo. Rerun sau chỉnh sửa cuối; không chạy build đồng thời E2E vì dist bị tái tạo gây 404 tạm thời.

Backend adm-zip nâng 0.6.0 → 0.6.1; bản phát hành upstream ghi sửa ghi xuyên symlink và xử lý ZIP lỗi: https://github.com/cthackers/adm-zip/releases/tag/v0.6.1 . npm audit backend/frontend hiện 0 cảnh báo. Đây không phải cam kết phần mềm không có lỗ hổng. Giữ kiểm tra đường dẫn, định dạng và kích thước nhập riêng.

## 11. Tệp bàn giao

- Báo cáo này; USER-GUIDE.md, STUDENT_PORTFOLIO.md, ROLES_PERMISSIONS.md, DEPLOYMENT_SELF_HOST.md, BACKUP_RESTORE.md, PILOT_METRICS.md và VERIFICATION_REPORT.md đã cập nhật.
- artifacts/v5-unit.log, v5-integration.log, v5-build.log, v5-*-audit.json.
- artifacts/v5-workspace-home-desktop.png, v5-student-home-mobile.png, v5-portfolio-low-confidence.png, v5-portfolio-overview-mobile.png, v5-history-mobile.png, v5-player-mobile.png, v5-teacher-class.png, v5-sidebar-mobile.png.
- artifacts/v5-local-browser.json, v5-portfolio-print.pdf, v5-bundle-report.json, v5-load-test.json, v5-monitor.json, v5-integrity-report.json.
- npm run package:release → releases/*.zip + manifest version/ngày/git/migration/build/từng file. npm run package:release không kèm secrets/.env thật/node_modules/uploads/backups/artifacts/testDB. scripts/verify-release-package.mjs kiểm tra nội dung và checksum ZIP; kết quả artifacts/v5-release-package.json.

## 12. Giới hạn và điều kiện mở Pilot

Chờ IT cung cấp/kiểm chứng Ubuntu/Docker/HTTPS, secrets mới, quyền lớp+môn thực tế, off-device backup, restore máy dự phòng và monitoring có nơi nhận cảnh báo. Giải quyết dung lượng ổ trước vận hành dài hạn. Duyệt nội dung GDPT 2018/YCCĐ theo nguồn trường; kho local chưa ánh xạ YCCĐ thì vẫn báo thiếu, không tự sinh.

Không bật AI/chấm tự luận tự động/leaderboard/LTI/native app/parent portal; không bỏ lượt đang dở (tùy chọn thấp); roster preview vẫn bộ nhớ một tiến trình. Retention 7 ngày chưa có cohort triển khai, trả null. Không đưa mật khẩu demo ra Internet.

**Kết luận: phần mã và dữ liệu bản sao đã kiểm chứng local; hạ tầng production chưa nghiệm thu.**

