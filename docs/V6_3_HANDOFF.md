# Bàn giao V6.3 — ma trận Outcome/YCCĐ và nhập liệu

Ngày: 14/09/2026. Bản sao: nganhang-personalized-v6.3. URL: http://127.0.0.1:3003. Database: nganhang_personalized_v63.

## Bảo toàn bản trước

V5 và V1 không được sửa. 40 bảng nguồn V5 được so sánh count/hash với manifest lúc sao chép; kết quả nằm ở artifacts/v63-verification.json. Bản sao dữ liệu trước nâng cấp: backups/v5-baseline/database.dump + manifest.json. Không chạy lại clone/seed trên DB hiện tại.

Dữ liệu nền của bản sao trước sử dụng: 11 tài khoản, 84 câu, 84 phiên bản, 2 lượt luyện. Toàn bộ dữ liệu TEST V63 và tài khoản kiểm thử chỉ ở các database nganhang_v63_test_* / nganhang_pilot_test_*; không nhập câu giả vào kho đang dùng.

## Dùng ngay

1. Mở http://127.0.0.1:3003. Cổng 3001 là bản cũ; 3002 là V5.
2. Quản trị → Quản trị tự luyện → phân công vị trí GVCN/giáo viên môn/tổ trưởng/khối/BGH theo phạm vi. Có thể kiêm nhiệm, đặt thời hạn và thu hồi.
3. Ma trận đề → tạo → tick Outcome hoặc YCCĐ → thiết lập phân môn/số câu → tự động phân bổ → kiểm tra mục tiêu/thực tế. Sửa ô, khóa ô, tái phân bổ khi cần.
4. Lưu và kiểm tra độ phủ. Ô thiếu có liên kết mở kho đã lọc đúng môn/khối/YCCĐ/mức/dạng. Bổ sung và duyệt câu, quay lại kiểm tra. Không tự lấy câu thấp mức hoặc ngoài YCCĐ.
5. Đủ câu mới bật Sinh đề. Word, đáp án, QTI và màn hình xem đề dùng cùng phiên bản và điểm từng ô.
6. Nhập liệu: tải workbook V1.1. Xóa dòng minh họa trước khi nhập; nếu SIMPLE và ADV cùng có nội dung, chọn rõ sheet. Thiếu metadata được lưu nháp, không tự kích hoạt.
7. Xuất Excel nâng cao từ kho theo bộ lọc. Giữ question_id + question_version_id khi record_action=UPDATE; hệ thống từ chối bản cũ sau khi người khác sửa. Dùng NEW để tạo câu mới.
8. Học sinh → chọn theo bài hoặc theo YCCĐ → tick nội dung → luyện. Hồ sơ học sinh có bản đồ bằng chứng Outcome/YCCĐ và liên kết luyện lại/giao bài.

Khởi động sau khi tắt máy: chạy PowerShell tại folder bản sao:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```
Script không tự dừng chương trình đang giữ cổng 3003. Tài khoản/mật khẩu kế thừa bản V5; không mở mật khẩu demo ra Internet.

## Phần đã sửa

- Phân quyền tách học tập / tài khoản / nội dung. GVCN xem các môn của lớp chủ nhiệm, thêm/sửa/đổi mật khẩu đúng lớp; không chuyển lớp/khóa. GV môn không mặc định có quyền tài khoản. BGH mặc định chỉ xem, quyền duyệt phải phân công rõ. Quyền xem môn bổ sung không tự cấp quyền sửa.
- Master 30 Outcome, 97 YCCĐ KHTN7 nguyên văn từ 02_KHTN7_REFERENCE; stable ID, phiên bản chương trình, nguồn và source_row. Không dùng hai dòng minh họa trong MASTER làm chương trình thật.
- Nhập Word/Excel/QTI giữ preview và xác nhận; nháp chưa phân loại, gợi ý cấu trúc dạng câu, xếp hạng YCCĐ giới hạn đúng môn/khối/phân môn. Ngưỡng auto-tick trong settings: metadata_auto_threshold (mặc định 90, cho phép 70–100). Gợi ý không phải xác nhận chuyên môn.
- ĐS có mức từng nhận định; hỗn hợp lưu cognitive_classification=HỖN_HỢP cùng subitem_levels. Mức dùng trong ma trận vẫn do giáo viên xác nhận.
- Ma trận: tổng điểm là ràng buộc bắt buộc; tỷ lệ xét theo điểm. Giữ số câu/ngân sách phân môn và ô khóa. GN đi xuyên suốt lưu, phân bổ, sinh, xem và xuất.
- Trước: tỷ lệ nhân trọng số dạng câu, báo cân bằng chỉ theo tổng. Sau: tối ưu sai lệch tuyệt đối bốn mức bằng đơn vị điểm nguyên; mở cả miền điểm tự luận bước 0.25. Nghiệm không đúng tuyệt đối cần tick xác nhận sai lệch và ghi lý do.
- Coverage hiển thị YCCĐ × NB/TH/VD/VDC và cần/khớp theo dạng; kiểm tra ghép đồng thời tránh lấy hết câu của ô hẹp. Không cộng trùng các tập câu giao nhau như thể kho có thêm câu.
- Sinh đề không có topic_relaxed/branch_relaxed/cognitive fallback. Chỉ nới tránh lặp trong tập khớp chính xác, có cảnh báo. Nhãn chỉ ưu tiên, không thêm câu/điểm ngoài ma trận.
- Snapshot question_version_id, matrix_cell_id, assigned_score, cell_snapshot, matrix_snapshot và thứ tự phương án. Sửa câu sau khi sinh không làm đổi đề cũ. Đề lịch sử chưa có snapshot được báo rõ; không xuất nội dung hiện tại giả làm lịch sử.
- Có gửi duyệt/duyệt/khóa ma trận; sửa nội dung đưa về draft. Chất lượng câu dùng số liệu thực; thời gian làm câu và báo lỗi chưa thu thập thì trả null, không giả 0.
- Bản đồ YCCĐ dùng bằng chứng phiên bản đã làm; thiếu dữ liệu báo LOW, không tự kết luận mạnh/yếu và không đổi công thức Mastery cũ.

## Migrations và kiểm chứng

Hai migration nối tiếp đã áp dụng: backend/src/db/migration-v63.sql và migration-v63-learning-scope.sql. Không sửa checksum migration lịch sử.

Lệnh kiểm chứng:
```powershell
npm test
cd backend
npm run test:integration
npm run migrate
cd ../frontend
npm run build
npm audit --omit=dev
cd ..
node scripts/verify-v63.mjs
```

Kết quả cuối: 8 kiểm tra ma trận kế thừa + 48 kiểm thử đơn vị + 48 kiểm thử tích hợp = **104 ca đạt**, 0 ca lỗi/bỏ qua. Build thành công; migration chạy lại không thay đổi checksum; audit thư viện production frontend/backend đều 0 lỗ hổng đã biết. Báo cáo so sánh ghi 50 tệp sửa và 25 tệp thêm (không tính artifacts, dist, node_modules, uploads, secrets).

Bằng chứng: artifacts/v63-unit-final.log, v63-integration-final.log, v63-build.log, v63-backend-audit.json, v63-frontend-audit.json, v63-verification.json. Danh sách tệp sửa/thêm được xuất theo so sánh trực tiếp với V5, không dùng repository Git của thư mục người dùng.

Ảnh: artifacts/v6_3-matrix-builder.png, v6_3-matrix-coverage.png, v6_3-matrix-shortage.png, v6_3-exam-preview.png, v6_3-matrix-mobile.png, v6_3-exam-mobile.png. Ảnh nghiệm thu dùng dữ liệu kỹ thuật trong DB test.

## Giới hạn cần biết

- Nguồn hiện chỉ đủ master KHTN7. 12 YCCĐ thiếu locator được giữ cảnh báo; không tự bịa trang nguồn, các môn/khối khác, hay chuyển câu cũ sang YCCĐ bằng suy đoán.
- 84 câu kế thừa chưa tự động được công nhận ánh xạ chính thức; phải rà và gán đúng trước khi tham gia ma trận mới. Chọn YCCĐ mà kho chưa có câu sẽ báo thiếu thật.
- Bài/chuyên đề cũ vẫn cần cho luồng Mastery đang dùng; chọn bài đúng môn/khối khi hoàn thiện câu. Không tự tạo bài chỉ để vượt kiểm tra.
- Gợi ý hiện là luật cấu trúc/từ khóa trong master, chưa phải mô hình semantic hoặc bộ phân loại chuyên môn đã hiệu chuẩn. Chưa có đủ tài liệu chuyên môn để tự gán mức cho mọi câu; giáo viên phải xác nhận.
- Phân bổ mặc định đều theo số câu giữa YCCĐ trong từng phân môn, không theo độ dày kho. Nếu số câu ít hơn số YCCĐ, giao diện cảnh báo YCCĐ chưa có ô; giáo viên điều chỉnh.
- Bộ tìm nghiệm giới hạn 200 câu, 100 điểm và số trạng thái/chuyển trạng thái để bảo vệ máy chủ. Cấu hình quá lớn trả lỗi rõ, không tuyên bố tối ưu khi chưa tìm hết.
- Xuất Excel tối đa 5000 câu/lần; thu hẹp bộ lọc khi vượt. Ảnh dùng đường dẫn media của bản hiện tại; chưa phải gói chuyển media sang máy khác.
- Chưa có số liệu thời gian hoạt động từng câu/báo lỗi câu; không dùng số 0 thay dữ liệu thiếu. Quan sát điểm không chứng minh nhân quả.
- Đây là bản pilot local. Ubuntu/Docker/HTTPS, tải đồng thời thực tế, backup khác thiết bị, lịch backup tự động và vận hành công khai chưa được nghiệm thu trong lần này. Không tự cài dịch vụ hay mở cổng Internet.
- Dữ liệu test và dump test giữ trong artifacts/database test để truy vết; không xóa tự động dữ liệu của anh.

Skill astra-one-pass được dùng để giữ một luồng sửa–kiểm thử–kiểm chứng; antigravity repo-map/workflows dùng để định tuyến vào các phần hiện có, giữ bản cũ và tránh viết lại ứng dụng.
