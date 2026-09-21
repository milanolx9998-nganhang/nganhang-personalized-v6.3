## Kết quả V5 mới nhất — 13/09/2026

Mốc thay thế các số lịch sử bên dưới: 8 ma trận + 33 đơn vị + 34 tích hợp = 75 đạt; build đạt; audit backend/frontend 0 sau cập nhật adm-zip 0.6.1. 17 ảnh/5 viewport, network học sinh ~220 kB JS; restore 8 bảng + 81 tệp hash khớp; tải local 30/50/100 phiên hoàn tất. Xem V5_PILOT_READINESS.md để đọc đủ 12 mục và giới hạn; không tuyên bố production-ready. Cổng bản V5: 3002. Monitor cảnh báo đĩa còn dưới 10%; Docker/HTTPS/off-device chưa kiểm chứng.

---

# Báo cáo kiểm chứng V1 — 11/09/2026

## Bổ sung nghiệm thu ngày 12/09/2026 — quản lý học sinh và giao diện

Đã bổ sung danh sách/tìm/lọc, thêm học sinh, sửa mã–họ tên–email, cấp lại mật khẩu, chuyển lớp có lịch sử, khóa/mở và kiểm soát quyền lớp. Giao diện làm bài đổi sang thẻ đáp án, thanh tiến độ và bảng hành trình thu gọn trên mobile theo hướng UI/UX ưu tiên đọc và thao tác.

- Kết quả mới nhất: **61 kiểm thử đạt** = 8 ma trận cũ + 27 đơn vị + 26 tích hợp/trình duyệt; không lỗi. Log: `artifacts/student-ui-unit-tests.log`, `artifacts/student-management-tests.log`.
- Build frontend đạt; vẫn có cảnh báo bundle lớn hơn 500 kB, chưa tối ưu chia bundle trong phạm vi này. Log: `artifacts/student-ui-build.log`.
- Cài mới đủ **8 migration**, chạy lại lần hai không áp dụng lặp; bằng chứng `artifacts/release-verification.json` ngày 12/09.
- DB gốc vẫn 84 câu, 703 chuyên đề, 14 môn, 9 tài khoản, 1 ma trận, 2 đợt đề. DB bản sao có 11 tài khoản, gồm quản trị pilot và học sinh demo; các số nội dung trên không đổi.
- Ngoài dữ liệu thử trong DB kiểm thử riêng, bản sao nay chủ ý có `hs_demo`, lớp 9-DEMO, bài KHTN 9 gồm 10 câu và lượt demo đang dở. Không phải dữ liệu học sinh thật.
- Hướng dẫn mới: `docs/QUAN_LY_HOC_SINH.md`. Sao lưu trước thay đổi schema: `backups/2026-09-11T12-12-33-691Z`.

Các mục bên dưới ghi nhận đợt nghiệm thu 11/09 trước bổ sung này; số migration/tài khoản/kiểm thử cũ được thay thế bởi các số mới ở trên. Điều kiện triển khai production vẫn giữ nguyên.

Kết luận: bản sao chạy và đã kiểm chứng các luồng V1 tại Windows local. Chưa nghiệm thu production/cloud: cần hạ tầng Docker, tên miền/HTTPS và đích backup khác thiết bị của trường. Không thay đổi thư mục V4 gốc.

## 1. Khảo sát kiến trúc và thay đổi

Giữ React 18, Express 4, PostgreSQL 16 và các ID/FK V4. Thêm phân hệ học sinh, kho ba tầng, version câu bất biến, nhập preview, giao bài, tự luyện/Mastery, cấu hình môn/chương trình và vận hành. Không viết lại toàn bộ ứng dụng.
V4 vẫn có 84 câu, 703 chuyên đề, 14 môn, 9 tài khoản, 1 ma trận, 2 đợt đề. Bản sao giữ dữ liệu này và thêm một quản trị pilot_admin. Học sinh/lượt làm kiểm thử nằm ở DB riêng.

## 2. Tệp thay đổi theo module

Danh sách đầy đủ và SHA-256 từng tệp: artifacts/changed-files.json; tổng hợp theo module: artifacts/release-verification.json.

- backend/src/db: migration và bộ chạy checksum/lock.
- backend/src/services/practice: chuẩn hóa/chấm, chọn câu, lượt luyện, Mastery, import, kho, phân quyền, roster, analytics, xuất phiếu.
- backend/src/routes và middleware: API mới, thu hồi token, scope môn/lớp/kho, giới hạn request/upload, sửa đường nhập/xuất legacy.
- frontend/src/pages/practice: HS/GV/quản trị; giữ màn hình V4 và nối luồng nhập mới.
- scripts, Dockerfile, compose.yaml, deploy: backup/restore, tài khoản khởi tạo, mẫu nhập, kiểm chứng và chạy local.
- docs, templates: đặc tả, hướng dẫn Việt hóa, mẫu Word/Excel/ZIP.

Không đưa .env, mật khẩu bootstrap, uploads, backup hoặc artifact vào Git/Docker image.

## 3. Migration

7 migration đã chạy trên bản sao và kiểm tra trên DB trống:
schema.sql; migration-v45.sql; migration-v46.sql; migration-practice-enums.sql; migration-practice-v1.sql; migration-practice-integrity.sql; migration-practice-taxonomy.sql.
Chạy lại lần hai không thay đổi dữ liệu/migration. Version câu cũ không sửa đè. Nội dung mới gắn node chương trình đúng môn, không đổi lịch sử attempt.
Bằng chứng: artifacts/release-verification.json.

## 4. Test

| Lệnh / vị trí | Kết quả |
| --- | --- |
| npm test trong backend | 8 kiểm thử ma trận cũ + 27 kiểm thử đơn vị/nhập/xuất: đều đạt |
| npm run test:integration trong backend | 21/21 đạt, 0 bỏ qua |
| node --check cho backend/src/*.js đệ quy | đạt ở lượt rà cú pháp; các module thay đổi tiếp được nạp bởi integration |
| node scripts/verify-release.mjs | migration mới + chạy lại, đối chiếu DB, danh sách thay đổi |
| backup.mjs + restore.mjs | khôi phục thật DB mới + 15 tệp media/nguồn |

Tổng 56 ca trong hai lệnh npm test/integration. Dự án không khai báo lint/type-check riêng; không ghi nhận hai mục này là đã chạy.
Log: artifacts/unit-test.log, integration-test.log, release-verification.json, restore-verification.log.
Các lỗi xuất hiện trong quá trình làm đã được sửa và chạy lại; kết quả trên là lượt cuối, không lấy riêng các ca xanh từ nhiều lượt lỗi.

## 5. Build frontend

npm run build đạt (Vite 6.4.3). Có cảnh báo bundle JS lớn hơn 500 kB; đây không phải lỗi build, cần theo dõi tốc độ mạng thực tế khi Pilot.
Bằng chứng: artifacts/frontend-build.log. Không tắt cảnh báo để lấy kết quả xanh.

## 6. Backend / health

scripts/start-local.ps1 khởi động Node ở chế độ ẩn, thư mục làm việc là backend của bản sao, không chiếm/dừng tiến trình cổng khác.
Đã đọc health thành công ở http://127.0.0.1:3001/api/health, database=ok.
PID/đường dẫn và thời điểm: artifacts/local-runtime.json. Log: local-server.log / local-server-error.log.
Chỉ bind 127.0.0.1, không public LAN/Internet.

## 7. Luồng E2E/smoke

Đã kiểm tra:

- Nhập Word có ảnh → preview lỗi thiếu mức → sửa → xác nhận giao dịch; checksum nguồn được lưu.
- Excel 20 cột cũ/JSON mới, ảnh phương án, ĐS bốn ý, thiếu mức không tự mặc định M2.
- QTI xuất–nhập đủ TN/ĐS/TLN/GN/TL, giữ ảnh, mức, đáp án; ĐS xuất 4 ý, roundtrip ghép đúng.
- Chấm TN; ĐS từng ý; TLN số/alias/sai số/đơn vị; GN từng cặp; tự luận không tự chấm.
- Tự luyện 10/20 câu, phân bố đúng mức, thiếu kho báo rõ, không đổi mức ngầm.
- Lưu đáp án → đăng nhập lại/reload → làm tiếp → nộp idempotent; không ghi Mastery trước nộp.
- Sửa câu tạo version mới; bài đang làm giữ nội dung/đáp án cũ.
- Bài fixed giữ cùng bộ version; dynamic bốc theo cấu hình; đích lớp/cá nhân, ngày mở/hạn đóng, giới hạn lượt.
- Học sinh không đọc/lưu/nộp lượt của bạn; GV không xem HS ngoài lớp/môn; kho riêng không lộ qua API cũ.
- Trình duyệt thật HS: đổi viewport 390×844, mở/đóng menu, đáp án không mất khi quay lại/reload, nộp/xem kết quả.
- Trình duyệt thật GV: nhập mẫu Word, mở kho, form giao bài, theo dõi lớp.
- Mật khẩu tạm bắt buộc đổi, token cũ bị thu hồi; đăng nhập lại được.
- Trình duyệt quản trị: chỉ số Pilot, cấu hình, danh sách Users không lỗi runtime.
- Hồi quy V4: tạo ma trận → sinh đề → xuất Word/QTI.

Ảnh kiểm chứng: artifacts/student-mobile.png, student-result.png, teacher-dashboard.png.
Phiếu xuất thật: worksheet-verified.docx/.pdf và assignment.docx/.pdf trong artifacts. Mẫu kỹ thuật, không phát làm đề học sinh.

## 8. Kiểm tra bảo mật

Scope được kiểm tra tại server; mật khẩu bcrypt, JWT kiểm tra active/role/token_version hiện thời; reset/logout thu hồi token; nguồn nhập không public; tên media hash/UUID; giới hạn ZIP, từ chối traversal/DOCTYPE/ENTITY; chỉ nhận PNG/JPEG/GIF/WebP; render PDF không ra mạng; raw HTML không bật.
CORS whitelist, CSP/Helmet, giới hạn đăng nhập và API; log có request ID, không ghi body mật khẩu.

npm audit frontend: 0 cảnh báo.
npm audit backend: 1 moderate ở adm-zip 0.6.0 (GHSA-vwc7-r8mq-g2x9: extraction đi theo symlink thư mục đích). Luồng nhập hiện dùng getData và tự ghi tên hash, không gọi API extraction của thư viện. Không downgrade về 0.5.8 chỉ để tắt cảnh báo. Cần theo dõi bản vá upstream; đây không phải kết luận “không còn lỗ hổng”.
Bằng chứng: artifacts/frontend-audit.json, backend-audit.json.
Git/Docker loại secrets; mật khẩu bootstrap ở tệp riêng, không nằm trong tài liệu này.

## 9. Docker / self-host

Đã chuẩn bị image Node 22, PostgreSQL client 16, Chromium; Compose PostgreSQL 16 + app + Caddy + backup; persistent volumes; health check; chỉ proxy publish 80/443.
CHƯA chạy Docker build/boot vì máy hiện tại không có docker/podman. Không giả lập kết quả bằng local Node.
IT chạy checklist docs/DEPLOYMENT_SELF_HOST.md trên máy Ubuntu đích; xác nhận domain/TLS, restart, persistence, PDF Chromium, backup hằng ngày và restore.

## 10. Giới hạn / điều kiện còn lại

- Docker/HTTPS/cloud Supabase/Canvas thật phụ thuộc hạ tầng, domain và credential trường; chưa xác nhận.
- Chưa có đích offsite: bản backup hiện cùng máy. Không được coi là chống mất máy/ổ.
- Trường duyệt nội dung, cấu trúc Outcome/YCCĐ, danh sách thật, phạm vi phân quyền và quy trình bảo vệ dữ liệu trước Pilot.
- QTI liên thông mỗi LMS cần import thử tại tenant thực tế; metadata mở rộng bảo toàn roundtrip nội bộ, không hứa mọi LMS đọc đầy đủ quy tắc sai số/đơn vị.
- Công thức OMML phức tạp được cảnh báo cần người duyệt; không âm thầm bỏ. Tự luận không chấm AI. A/C, LTI/SSO, leaderboard ngoài V1 giữ OFF.
- Bundle lớn và cảnh báo adm-zip được nêu ở trên, không che giấu trong kết quả.

## 11. Chạy DEV

Trong backend: npm ci; npx playwright install chromium; npm run migrate; npm run dev.
Trong frontend: npm ci; npm run dev.
.env chỉ dùng database bản sao; frontend proxy /api và /uploads về 3001.
Node 22 / PostgreSQL 16. Không chạy seed/install-service V4 cũ trên database thật.

## 12. Chạy DEMO local

Frontend đã build. Từ root chạy powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1.
Mở http://127.0.0.1:3001. Script từ chối nếu cổng đang có ứng dụng, không dừng tiến trình của người dùng.
Có thể chạy thủ công npm start trong backend.
DEMO cloud dùng DATABASE_URL server-side và volume media; cần project/credential thật và kiểm tra lại, không nhúng secret frontend.

## 13. Deploy PROD

Xem docs/DEPLOYMENT_SELF_HOST.md. Tạo .env.production từ .env.production.example bằng secret mới, không tái sử dụng token/password mẫu.
docker compose --env-file .env.production up -d --build
Kiểm tra HTTPS health, chạy import + luyện + xuất + restart và restore trên hạ tầng thật.
Cấu hình backup remote, monitoring, quyền file/secrets, rà tài khoản cũ. Chưa mở cho HS thật khi các bước này chưa được IT xác nhận.

## 14. Tài khoản / mẫu nhập

Bản sao có pilot_admin, mật khẩu tạm ngẫu nhiên ở backend/bootstrap-admin.secret.json. Bắt buộc đổi khi dùng; không chia sẻ tệp. Không có mật khẩu mặc định cố định trong README.
Mẫu tải ở templates hoặc giao diện nhập: question-import-khtn.docx, question-import.xlsx, question-import-images.zip, student-roster.xlsx.
Integration tạo account ngẫu nhiên trong DB riêng; không dùng account test làm tài khoản production.

## 15. Checklist sẵn sàng Pilot

- [x] Bản gốc được giữ riêng, backup trước nâng cấp, DB clone.
- [x] Migration trên clone và DB trống, chạy lại an toàn.
- [x] 56 ca kiểm thử đạt, production build đạt.
- [x] Health local; E2E HS/GV/quản trị; hồi quy ma trận V4.
- [x] Khôi phục DB và media vào nơi mới.
- [x] Mẫu nhập, tài khoản khởi tạo riêng, tài liệu vận hành.
- [ ] IT smoke Docker/Ubuntu và domain HTTPS thực tế.
- [ ] Backup khác thiết bị + diễn tập restore trên máy dự phòng, lưu secrets độc lập.
- [ ] Tenant Canvas/cloud thật nếu trường sử dụng.
- [ ] Duyệt dữ liệu giáo dục, tài khoản/quyền và tổ chức Pilot với học sinh thật.

Trạng thái bàn giao: kỹ thuật local đã kiểm chứng; nghiệm thu production chờ các điều kiện IT/nội dung nêu trên.

## 16. Kiểm chứng V4 UX & Hồ sơ học tập — 13/09/2026

Mốc mới nhất: build thành công; 8 ma trận + 33 đơn vị + 32 tích hợp/trình duyệt = 73 kiểm thử đạt. Đây là mốc thay thế các số tổng ở các phần lịch sử phía trên cho đợt nâng cấp này.

Kiểm tra hồ sơ với bốn viewport (390×844, 768×1024, 1366×768, 1440×900), phân trang >20 lượt, quyền lớp và môn, học sinh tự xem/không xem chéo, phiên bản câu cũ, năm dạng câu, partial/bỏ qua/tự luận, preview Excel không ghi/confirm một lần và chống dữ liệu đổi đồng thời. Demo local chụp 13 màn; PDF hai trang được render và xem. Sáu bảng lịch sử có số dòng và hash không thay đổi. Không có migration mới.

Log và ảnh mang tiền tố artifacts/v4-. Xem báo cáo 11 phần: V4_UX_PORTFOLIO_HANDOFF.md; hướng dẫn: STUDENT_PORTFOLIO.md. Giới hạn: thao tác bỏ lượt tùy chọn chưa triển khai; preview roster chỉ lưu tạm một tiến trình; chưa có ánh xạ YCCĐ trong kho local; bundle 839.92 kB vẫn cảnh báo; production chưa nằm trong nghiệm thu này.
