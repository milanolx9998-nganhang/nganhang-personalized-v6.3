# Tiến độ V6.6.3 — chưa nghiệm thu toàn bộ Master Prompt

Ngày 21/09/2026. Sửa trực tiếp nganhang-personalized-v6.3, không nhân bản source, không reseed.

## Phần đã triển khai

- Migration bổ sung phiên bản chương trình, staging import, lineage, lịch sử; giữ ID và dữ liệu cũ.
- Editor Outcome/YCCĐ nháp, copy/diff, publish với xác nhận, chặn sửa chuẩn đã công bố.
- Nhập XLSX/XLS/CSV qua worker giới hạn tài nguyên; map cột, sửa hàng loạt, đánh dấu bỏ qua, kiểm tra xung đột, commit một lần vào DRAFT.
- Khung năng lực theo môn, mẫu KHTN 3 trục/Toán 5 trục/tùy chỉnh, loại minh chứng cho từng trục, công bố/sao chép khung.
- API mapping phiên bản câu hỏi > YCCĐ > Outcome; snapshot mapping ở attempt_items, không cập nhật ngược lịch sử.
- Tính điểm có trọng số, độ tin cậy riêng; không lấy hoạt động học làm điểm năng lực. API rubric có phạm vi học sinh/môn/khối.
- Hồ sơ học sinh có ba tab mới: Năng lực, Bản đồ kiến thức, Thói quen học tập. Radar chỉ hiện khi đủ minh chứng trên toàn bộ trục; có bảng và chi tiết minh chứng.
- Gợi ý chỉ lấy phạm vi có câu phù hợp quyền học sinh; chuyển sang bước chọn/kiểm tra bài, không tự tạo bài không đủ câu.
- Thói quen bỏ qua idle/login, không ghi nhận chủ động từ lượt tự luyện bỏ dở. Số lần sửa sai chỉ hiện khi cả lượt trước và lượt luyện lại đã được phép công bố đáp án.

## Nguồn hiện tại

`G:/tai lieu  oppa/UP SHARE/outcome khtn`: 4 workbook KHTN 6–9, đã kiểm tra đọc nguyên văn và checksum, chưa nhập/công bố vào DB vận hành. Xem V6_6_SOURCE_REGISTER.md và artifacts/v66-source-acceptance.json. Không suy Chủ đề thành Outcome. Chênh lệch tổng đầu file và số dòng thực tế được giữ lại để rà soát.

## Còn thiếu — không coi là đã hoàn thành

- Giao diện quản trị mapping năng lực theo khối/YCCĐ (trọng số, xác nhận, lịch sử) và nhập rubric giáo viên trong hồ sơ học sinh đã có; API kiểm tra BOLA sai học sinh và giáo viên không có quyền quản lý đều đạt.
- Quản lý indicator, nhập khung năng lực, copy indicator, báo cáo so sánh phiên bản khung.
- Dashboard lớp, xuất báo cáo có phạm vi, so sánh thời gian và quy trình rebuild minh chứng.
- Hoàn thiện quyền ngoại lệ ở menu quản trị: backend đã kiểm quyền, menu hiện vẫn theo curriculum.manage cũ.
- Khôi phục job staging sau reload; impact đã bổ sung số tham chiếu competency mapping; đã chặn commit khi form staging còn sửa chưa lưu.
- Kiểm thử chuyên sâu mapping/snapshot, rubric, release policy cho số sửa sai và phạm vi môn/lớp đã có ca V66; cần mở rộng với nhiều giáo viên/lớp thật.
- Nghiệm thu Ubuntu/Supabase/Cloudflare/Tailscale trên máy thật; chưa có đích máy chủ được cấu hình trong phiên này. Không công bố production, không đổi credential hoặc tạo release chính thức.

## Kiểm chứng

- 5/5 unit test mới (năng lực, thói quen, import) đạt.
- Hồi quy cuối: 80/80 tích hợp hiện hữu, 4/4 tích hợp V66 (gồm hồ sơ năng lực/thói quen mobile, mapping giao diện, rubric và khôi phục import), 101/101 logic và bảo mật đạt. artifacts/v652-security-gate.json ghi passed=true và hash source.
- Tách máy chủ fixture V66 khỏi các ca thu hồi session/hạn mức cũ, không tắt bảo vệ ứng dụng. Sửa middleware tránh đếm hạn mức hai lần cho API hồ sơ mới.
- artifacts/v663-preservation.json: cả 8 bảng dữ liệu cũ khớp số lượng và hash với backup nền; chỉ bỏ cột mới competency_snapshot khỏi phép so sánh cột lịch sử.
- Frontend production build đạt. Không dùng build thành công thay cho nghiệm thu người dùng.
- Backup nền: backups/v663-baseline/2026-09-21T03-50-33-508Z.
