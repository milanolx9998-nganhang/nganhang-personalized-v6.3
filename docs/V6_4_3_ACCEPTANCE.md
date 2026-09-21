# Nghiệm thu kỹ thuật V6.4.3

Ngày: 16/09/2026. Thực hiện trực tiếp trong nganhang-personalized-v6.3; không tạo bản sao dự án mới.
Phạm vi: các chức năng nền tảng P0/P1 của prompt V6.4.3, bổ sung so sánh chỉ số cơ bản theo phiên bản.

## Bằng chứng kiểm thử

- Mốc V6.3 trước thay đổi: 8 kiểm thử ma trận, 48 unit, 48 integration đều đạt.
- Unit cuối: 8 kiểm thử ma trận và 59 unit đạt, không có lỗi. Log: artifacts/v643-unit-final.log.
- Bộ tích hợp nền sau nâng cấp: 63/63 đạt. Log: artifacts/v643-integration-all-progress.log.
- Lần chạy tập trung với giao diện cuối: 29/29 đạt. Log: artifacts/v643-integration-focused-final.log.
- Bộ mở rộng thêm bài giao mixed scope, gợi ý trong bài và kho riêng: xem kết quả cuối tại artifacts/v643-integration-final.log.
- Build production: đạt. Log: artifacts/v643-build-final.log.
- Migration kiểm tra checksum và chạy lại không thay dữ liệu; không sửa file migration đã áp dụng.
- Login demo pilot_admin/admin trên 3003 trả admin; catalog trả 14 môn/703 bài; hàng đợi thật trả 0 hồ sơ. Không đưa token/mật khẩu vào artifact.

Các số unit/integration không bao gồm kiểm tra thủ công UI hay cộng lại các lần chạy lặp.

## Đối chiếu chức năng

| Yêu cầu | Triển khai và bằng chứng |
| --- | --- |
| Topic–YCCĐ nhiều–nhiều | topic_yccd_map, trạng thái/hiệu lực/căn cứ, kiểm tra môn–khối–phân môn; test C1 |
| Chọn cả bài, Outcome, YCCĐ, phạm vi hỗn hợp | ContentScopeV2, resolver/SQL tham số hóa OR giữa phần chọn và AND trong từng bài; unit và T5/T6 |
| Ngân hàng canonical | Bộ lọc phân cấp và bộ lọc metadata, trang soạn giữ context; ảnh bank lesson/drilldown |
| Nhập và gợi ý | Master duy nhất, gợi ý theo bài, xác thực khi duyệt, bulk theo ID chọn; hồi quy Word/Excel/QTI |
| Luyện/giao bài | Ghi scope V2, đọc cấu hình cũ, fixed giữ version/snapshot; hồi quy pilot và ca mixed scope |
| Ma trận lesson-first | Resolve mapping thành YCCĐ cố định, kiểm tra drift, độ phủ bài/YCCĐ, strict allocation; C8 và ảnh matrix |
| Curriculum lifecycle | Tạo nháp, sửa nhãn/alias, nghỉ/thay/chuyển bằng ID mới, impact fingerprint; C10 và ca replacement |
| Lịch sử | Version/attempt/exam/fixed assignment giữ bản đã dùng; học bạ và learning-map đọc snapshot |
| Cờ học sinh | Chỉ chủ lượt, idempotent, độc lập uncertain/điểm, vẫn đổi sau nộp; F1–F7 và offline UI |
| Phân loại A/B/C | Deterministic classifier, metadata audit, nháp sửa tại chỗ, content mới tạo bản nháp khi đã duyệt/dùng |
| Duyệt và khôi phục | Pending khóa nội dung; trả sửa có lý do; self-review policy; active pointer độc lập; restore tạo bản mới |
| Rà soát | Dedup hồ sơ, bằng chứng, phân công reviewer đúng môn/khối, kết luận và P0 quarantine |
| UX thực tế | Mobile không tràn, menu đóng không che nội dung; đúng 4 radio MCQ sau rerender; diff hai cột trên desktop |
| Giữ các luồng cũ | 5 dạng câu, điểm/Mastery, roster, phân quyền lớp, xuất Word/PDF/QTI, ma trận và bài cũ đều có hồi quy |

## Ảnh đã kiểm tra

- artifacts/v6_4-bank-lesson-scope.png
- artifacts/v6_4-bank-outcome-drilldown.png
- artifacts/v6_4-practice-scope.png
- artifacts/v6_4-matrix-lesson-scope.png
- artifacts/v6_4-curriculum-impact.png
- artifacts/v6_4-student-flag-mobile.png
- artifacts/v6_4-question-version-review.png

Ảnh dùng fixture có nhãn TEST trong database tách biệt, không phải nội dung chương trình thật.

## Bảo toàn dữ liệu

Kiểm tra hiện tại: 84 câu, 84 phiên bản, 2 lượt luyện, 20 attempt items, 56 exam items.
Mốc hash QA được lập sau migration; so sánh lại để phát hiện thay đổi nội dung/lịch sử do kiểm thử:

- artifacts/v643-qa-preservation-before.json
- artifacts/v643-qa-preservation-after.json
- Lệnh chạy lại: từ backend, node scripts/v643-preservation.mjs --compare.

Mốc này chứng minh dữ liệu không đổi trong giai đoạn QA, không giả định là hash trước toàn bộ quá trình nâng cấp. Không chạy seed; không ghi fixture vào DB đang dùng.
Các database nganhang_v63_test_* và nganhang_pilot_test_* là dữ liệu kỹ thuật riêng. Không dùng chúng làm nguồn thật hoặc thay database hiện hành.

## Migration nối tiếp

1. migration-v643-scope.sql: quan hệ bài–chuẩn và snapshots mới.
2. migration-v643-flags.sql: cờ trên attempt item.
3. migration-v643-review.sql: version workflow, classifier integration, metadata revisions và review case.
4. migration-v643-usage-guards.sql: bảo vệ bài hoàn thành và active pointer.
5. migration-v643-active-metadata.sql: tách phân loại active khỏi nháp.
6. migration-v643-review-state.sql: giữ trạng thái cần rà soát khi chuẩn nghỉ.
7. migration-v643-draft-editor.sql: ghi người sửa nháp cuối để kiểm tra duyệt độc lập.

## Giới hạn công bố

- 30 Outcome/97 YCCĐ KHTN7 đã có; 0 mapping ACTIVE và 0 câu VERIFIED trong kho thật. Phần mềm đã có luồng đề xuất/công bố; chưa thể thay người phụ trách chuyên môn xác nhận nội dung không có căn cứ.
- Không thể phục dựng nhãn lịch sử chưa từng được lưu; hiển thị thiếu nhãn thay vì lấy nhãn hiện tại giả làm lịch sử.
- Các mục P2 dài hạn được liệt kê rõ trong V6_4_3_HANDOFF.md, không báo đã triển khai.
- Chỉ xác nhận chạy local Windows/PostgreSQL. Không công bố production Internet, HTTPS, tải lớn hay nghiệm thu hạ tầng chưa được thực hiện.
- Thư mục vẫn là V6.3 theo yêu cầu; không có gói zip/bản sao dự án mới.

Quy trình thực hiện theo Astra One-Pass: đọc toàn bộ prompt, kiểm toán hiện trạng, thay đổi nối tiếp, giữ thuật toán cốt lõi, kiểm thử hồi quy và xem ảnh thực tế. Repo-map/workflows dùng để chọn phạm vi kỹ thuật, không mở rộng yêu cầu.
