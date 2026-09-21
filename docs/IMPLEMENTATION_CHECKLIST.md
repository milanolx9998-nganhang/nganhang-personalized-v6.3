# Theo dõi triển khai V1

Nguồn yêu cầu: REQUIREMENTS_V1.md. Bản gốc giữ nguyên ở nganhang-v4.3.3/nganhang-v4. Chi tiết bằng chứng: VERIFICATION_REPORT.md.

- [x] Nhân bản mã/media, pg_dump và restore sang database riêng; đối chiếu số lượng.
- [x] Phase 0: khảo sát kiến trúc, baseline/hồi quy các luồng cũ.
- [x] Phase 1: version bất biến, kho, lớp/tài khoản/quyền, taxonomy/version và cấu hình môn.
- [x] Phase 2: chấm TN/ĐS/TLN/GN; TL không tự chấm; unit test.
- [x] Phase 3–4: Word/Excel/QTI/media, preview/sửa/xử lý trùng, checksum nguồn.
- [x] Phase 5–6: chọn câu, attempt/autosave/retry, bài giao fixed/dynamic, Mastery/replay.
- [x] Phase 7–9: giao diện HS/GV/quản trị; scope lớp/môn/kho và E2E.
- [x] Phase 10–11 (mã/cấu hình/local): link Canvas, Docker/Compose, backup/restore DB+media, tài liệu.
- [ ] Phase 10–11 (IT thực tế): Docker Ubuntu + HTTPS + offsite + tenant Canvas/cloud nếu sử dụng.
- [x] Phase 12 local: 8 + 27 + 21 kiểm thử đạt, frontend build, kiểm tra ảnh, báo cáo.
- [ ] Nghiệm thu production với IT và dữ liệu/quyền học sinh thật.

## Quyết định

Giữ khóa INTEGER bất biến V4; UUID cho version/attempt/import/assignment. Mức 1–4 ở version, giữ M1–M4 legacy. PostgreSQL/Express giữ nguyên; DATABASE_URL cho kết nối cloud PostgreSQL. Mỗi sửa nội dung tạo version mới qua trigger, kể cả route cũ.
Database làm việc nganhang_personalized_v1; local 127.0.0.1:3001. A/C/LTI/AI essay/leaderboard OFF. Backup cùng máy không thay thế backup ngoài thiết bị.
