# Bàn giao V6.4.3 — cập nhật trực tiếp trên V6.3

Ngày hoàn tất kiểm chứng: 16/09/2026. Yêu cầu nguồn: DELTA_MEGA_PROMPT_V6_4_3_FULL_SCOPE_STUDENT_FLAG_VERSION_REVIEW.md.

## Mở đúng phiên bản

- URL: **http://127.0.0.1:3003**. Cổng 3001 là bản cũ, 3002 là V5.
- Folder giữ nguyên: nganhang-personalized-v6.3. Database: nganhang_personalized_v63.
- Health báo 0.6.4.3-pilot; package dùng SemVer 0.6.4-3.
- Không nhân bản folder dự án, không seed lại, không sửa V5/V1.
- Quản trị demo local: pilot_admin / admin. Không đưa mật khẩu demo lên Internet.

Khởi động từ folder dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Nếu cổng đang có ứng dụng, script dừng và yêu cầu kiểm tra, không tự giết tiến trình khác. Nếu mở từ terminal công cụ có vòng đời ngắn, dùng terminal riêng chạy `cd backend` rồi `npm start` và giữ terminal hoạt động.

## Học sinh: chọn nội dung và làm bài

1. Vào Tự luyện, chọn môn/khối.
2. Tick bài để chọn **toàn bộ bài**, không cần tick từng YCCĐ.
3. Muốn chọn một phần: mở “Tinh chỉnh mục tiêu học tập”, tick nhóm Outcome hoặc các YCCĐ. Có thể phối hợp nhiều bài, mỗi bài chọn khác nhau.
4. “Mục tiêu học tập · nâng cao” chọn chuẩn xuyên bài. Phạm vi đã chọn luôn có bản tóm tắt và nút bỏ từng phần.
5. Mặc định dùng phân bố cân bằng; mức độ và dạng câu nằm trong mục tùy chỉnh nâng cao. Kiểm tra số câu trước khi tạo. Kho thiếu thì báo thiếu, không tự lấy câu ngoài phạm vi.
6. Trong bài làm, nhấn ☆ để đánh dấu xem lại. Cờ khác hoàn toàn “Em chưa chắc đáp án”; không thay điểm hay Mastery.
7. Cờ lưu theo học sinh và lượt làm, vẫn đổi được sau nộp bài. Khi mất mạng, trạng thái báo chưa đồng bộ; tự thử lại khi có mạng. Menu “Câu cần xem lại” mở đúng lượt/câu.
8. “Báo lỗi câu hỏi” gửi mô tả cho giáo viên, không sửa câu hoặc chấm lại bài.

## Giáo viên: ngân hàng, nhập và giao bài

- Kho chuẩn nằm ở Ngân hàng & Nội dung → Kho câu hỏi – Duyệt câu.
- Lọc môn, khối, phân môn, chương, nhãn, mức, dạng, trạng thái phân loại; bộ chọn bài/Outcome/YCCĐ dùng cùng phạm vi với luyện tập.
- Soạn câu từ bộ lọc được điền sẵn bài/chuẩn tương ứng; khi đổi bài phải chọn lại chuẩn hợp lệ.
- Nhập Word/Excel/QTI vẫn xem trước, sửa và xác nhận. Áp dụng hàng loạt chỉ tác động các dòng đã chọn khi gửi danh sách chọn.
- Nháp có thể thiếu phân loại; không được kích hoạt cho lượt mới nếu thiếu chuẩn bắt buộc. Gợi ý metadata giới hạn theo liên kết bài đã công bố, không tự biến gợi ý thành chuẩn.
- Giao bài fixed và dynamic dùng cùng ContentScopeV2. Fixed giữ phiên bản và nhãn tại thời điểm tạo; lượt đã làm không đổi khi kho sửa sau đó.

## Quản trị chuẩn chương trình

Ngân hàng & Nội dung → Chuẩn đầu ra – Bài/YCCĐ:

1. Mở môn/khối, chọn bài, tick các YCCĐ đúng tài liệu, ghi căn cứ.
2. Tổ trưởng đúng môn được đề xuất; quản trị mới công bố. CANDIDATE không được dùng như liên kết đã duyệt.
3. Sửa nhãn/chính tả có nhật ký; mã cũ được lưu alias để nhận diện dữ liệu nhập cũ.
4. Đổi nghĩa/chuyển YCCĐ sang Outcome khác phải tạo chuẩn thay thế có ID mới; chuẩn cũ nghỉ sử dụng, không sửa đè.
5. Trước nghỉ/thay/chuyển, xem tác động lên câu, phiên bản, liên kết, ma trận, bài giao và lượt làm. Hệ thống kiểm tra lại dấu vết tác động trước xác nhận.
6. Câu bị ảnh hưởng cần rà soát; bài làm và đề cũ vẫn giữ phiên bản/snapshot của mình.
7. Cấu trúc taxonomy cũ chỉ đọc Outcome/YCCĐ kế thừa, không tạo master thứ hai.

**Tình trạng nội dung thực:** có 30 Outcome và 97 YCCĐ KHTN7 từ nguồn đã nhập. Chưa có mapping bài–YCCĐ được công bố và chưa có câu VERIFIED. Không tự suy mapping từ số thứ tự hoặc nhãn gần giống. Cần người phụ trách chuyên môn xác nhận liên kết bằng tài liệu chính thức trên màn hình mới; dữ liệu TEST chỉ có trong database kiểm thử.

## Sửa câu và duyệt phiên bản

| Loại thay đổi | Xử lý |
| --- | --- |
| A: vận hành/định dạng không đổi nghĩa | Không tạo content version mới |
| B: bài/chuẩn/mức và phân loại | Ghi metadata revision; mở rà soát theo policy, giữ lịch sử |
| C: nội dung, đáp án, dữ kiện, quy tắc chấm | Nháp chưa dùng sửa tại chỗ; bản đã duyệt/đã dùng tạo nháp mới |

- Bản đang làm việc và bản đang sử dụng có con trỏ riêng. Sửa nháp không đưa nội dung chưa duyệt vào lượt luyện mới.
- Pending không cho sửa nội dung; trả sửa cần lý do. Bản từ chối không mở lại làm nháp; khôi phục luôn tạo phiên bản mới.
- Chính sách duyệt độc lập xét tác giả và người sửa nháp gần nhất. Ngoại lệ quản trị tự duyệt có cấu hình và nhật ký.
- Hàng đợi rà soát lọc môn/khối/nguyên nhân/ưu tiên/trạng thái; gom thêm bằng chứng vào hồ sơ đang mở cùng nguyên nhân.
- Màn so sánh hiển thị trước/sau, đáp án, giải thích, metadata và bằng chứng theo phiên bản. Người duyệt tick checklist trước phê duyệt.
- Câu nghi sai đáp án được cách ly khỏi lượt mới. Duyệt phiên bản mới chưa tự bỏ cách ly khi hồ sơ P0 chưa có kết luận.
- Không tự chấm lại lịch sử, không cộng kết quả phiên bản lỗi vào chất lượng bản hiện hành.

## Ma trận và lịch sử

Chọn bài → xác nhận phạm vi thành YCCĐ chính xác → thiết lập số câu → phân bổ → lưu/kiểm tra độ phủ. Có hai góc xem độ phủ theo bài×mức và YCCĐ×mức, giữ riêng từng dạng câu để không cộng trùng tập ứng viên.

Mapping đổi sau khi lưu được báo rõ; phải chọn giữ snapshot hoặc làm mới. Ma trận đã duyệt/khóa và đề đã sinh không bị viết lại. Các thuật toán phân bổ điểm/chấm điểm/Mastery cũ được giữ nguyên.

Lượt cũ chưa từng lưu nhãn không được gán ngược nhãn hiện tại như thể đó là nhãn lịch sử; giao diện thông báo thiếu nhãn lịch sử.

## Phần mở rộng chưa bao gồm

Các mục P2 trong prompt: lưu câu dài hạn độc lập lượt làm, lý do cờ, tạo bài tương tự từ câu đánh dấu, quản trị question family nâng cao, hỗ trợ tách/gộp chuẩn. So sánh chỉ số cơ bản theo phiên bản đã có; phân tích thống kê sâu chưa triển khai. Không bật AI chấm tự luận, tự sửa đáp án hoặc tự duyệt chuẩn.

Xem [báo cáo nghiệm thu](V6_4_3_ACCEPTANCE.md) để đối chiếu kiểm thử và ảnh.
