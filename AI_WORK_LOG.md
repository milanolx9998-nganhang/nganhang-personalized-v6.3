# AI Work Log

> Ghi chú trạng thái: các mục bên dưới là nhật ký theo thời điểm. Trạng thái hiện tại phải đọc ở `AI_HANDOFF.md` và kiểm tra lại bằng `git status`, `git rev-parse HEAD` cùng CI/runtime; không dùng câu “chưa commit” trong mục lịch sử làm trạng thái hiện tại.

## 2026-10-03 — Giai đoạn 3: kịch bản thử với người thật + bảng bấm giờ

**Giao:** `docs/thu-nghiem/Kich_ban_thu_giai_doan_3.xlsx` (chưa commit). 7 sheet: Hướng dẫn · Chuẩn bị (11 việc) · KB Học sinh (HS1–HS4) · KB Giáo viên (GV1–GV4) · KB Tổ trưởng (TT1–TT3) · Bảng bấm giờ (100 dòng, ô vàng để điền, có dòng ví dụ) · Tổng hợp (tự tính).
- Ba chỉ tiêu chốt 25/09: HS1 tự luyện ≤ 30 giây, GV1 giao bài ≤ 120 giây, TT1 duyệt ≤ 15 giây mỗi câu (đo 10 câu).
- ĐẠT = trung vị không vượt chỉ tiêu VÀ tỉ lệ tự làm được ≥ 80% (ngưỡng là giả định của người soạn, sửa ở ô D3 sheet Tổng hợp). Nhiệm vụ không có chỉ tiêu: Ổn / Cần sửa theo tỉ lệ tự làm được.
- Sheet Tổng hợp nối kết luận với việc làm trước (HS1 chưa đạt → bản đồ bài học + Luyện ngay; GV1 → giao bài từng bước; TT1 → cải tiến màn duyệt…).
- Nhãn nút trong kịch bản đã đối chiếu với giao diện hiện tại; lời đọc không nêu tên nút. Không ghi tên thật học sinh (mã HS01…), không ghi mật khẩu.

**Kiểm:** dựng bằng openpyxl; Excel 16 trên máy tính lại toàn bộ — 554 công thức, 0 lỗi; bản thử với 12 dòng dữ liệu giả cho đúng số tính tay (HS1: 5 lượt, 60% tự làm, trung vị 26,5 → CHƯA ĐẠT vì tỉ lệ; TT1: 14,5 giây/câu → ĐẠT); trang in: mỗi kịch bản 1 trang A4 ngang, bảng ghi 3 trang, tổng hợp 2 trang.

**Việc tiếp:** anh Hiếu chuẩn bị theo sheet "Chuẩn bị" và tổ chức thử; gửi lại file đã điền → AI đọc sheet Tổng hợp + cột "Chỗ vướng" để chốt việc làm trước.

## 2026-10-03 — V6.8: bản đồ bài học (đầy đủ, trừ phụ huynh) + CI trên máy GitHub

**Yêu cầu:** anh Hiếu đổi ý, "làm full": làm luôn bản đồ bài học (không chờ buổi thử) và CI trên máy GitHub; bỏ qua 3 việc còn lại của giai đoạn 0 (khoá Supabase, thu hồi PAT, bảo vệ `main`). Làm trên nhánh, chưa đẩy main.

**Bản đồ bài học:**
- `services/practice/lessonMap.js` (mới): `lessonCoverage` (giáo viên), `lessonMap` + `startLessons` (học sinh); hàm thuần `lessonProgress`, `streakOf`, `badgesOf`. Routes `GET /api/practice/lesson-coverage`, `GET /lesson-map`, `POST /lessons/start`.
- `attempts.js`: tách điều kiện "câu học sinh dùng được" thành `USABLE_FROM / USABLE_WHERE / USABLE_LESSON / studentBanks` (SQL của `candidates()` không đổi) để bản đồ đếm đúng như lúc bốc câu; `createAttempt` nhận `minQuestions`.
- `selection.js`: `fitPercent` — giữ số câu, dồn mức thiếu sang mức gần nhất, tỉ lệ luôn cộng đủ 100.
- Quy tắc: lượt luyện nhanh theo Bài có sàn riêng 5 câu (tự chọn bài luyện vẫn giữ `practice_min_questions` = 10), mỗi lượt tối đa 10 câu hoặc hết số câu của Bài; không lấy tự luận. Sao: 1 đã luyện · 2 điểm thành thạo từ 70 · 3 từ ngưỡng thành thạo qua ít nhất 2 lượt. "Đang vướng": từ 2 lượt mà điểm nền tảng (NB + TH) dưới 70, tối đa 3 Bài, có nút "Luyện phần nền tảng". Chuỗi ngày theo giờ Việt Nam. 8 huy hiệu, tính lại mỗi lần đọc (không có bảng mới, không migration).
- Giao diện: `pages/practice/LessonMap.jsx` trong trang chủ học sinh (sau bài đang dở và bài được giao): chuỗi ngày, sao, "Em đang ở đây", "Em đang vướng gì", Chương → Bài với nút Luyện ngay / Luyện tiếp, "Tự tạo đề từ nhiều bài" (tick Bài, chọn cả chương, chọn các bài đã luyện, 10/15/20 câu), huy hiệu. Mục "Nội dung nên củng cố" cũ chỉ còn hiện khi chưa có bản đồ.
- Giáo viên: `pages/curriculum/LessonCoverage.jsx` ở trang Chương trình môn học — bảng câu đã duyệt theo Bài × mức, Bài còn thiếu bao nhiêu câu, câu ở kho khác / chờ duyệt / chưa gắn Bài.
- Không làm nút "Giữa kỳ / Cuối kỳ": hệ thống chưa có mốc học kỳ của Bài; thay bằng chọn theo chương và "Chọn các bài đã luyện".
- Dữ liệu local KHTN 9: 72 câu tự chấm đã duyệt trên 11/51 Bài; với sàn 10 chỉ 1 Bài luyện được — lý do hạ sàn riêng xuống 5.

**CI trên máy GitHub:** `.github/workflows/ci.yml` (mọi nhánh trừ main + pull request; `permissions: contents: read`, không dùng secret): job `verify` (build + unit + security + cổng migration so với main) và job `smoke` (Postgres 16 dịch vụ riêng → `npm run migrate` từ database trắng → `npm run seed` → `npm run test:smoke`). `backend/test/smoke/journeys.test.js`: 5 hành trình (khởi động; soạn → duyệt; chương trình / mẫu Word / lệnh AI; giao bài → làm → hồ sơ; bản đồ bài học). Chỉ chạy khi tên database kết thúc `_ci` / `_smoke`. `deploy.yml` giữ nguyên.

**Kiểm:**
- unit `lesson-map-v68` 4/4; integration `v68-lesson-map` 5/5 (gồm trình duyệt: trang chủ học sinh, không tràn ngang ở 390 px, bấm "Luyện tiếp" vào thẳng bài làm; giáo viên mở bảng độ phủ);
- smoke 5/5 trên database trắng tạo tại local (PostgreSQL 16.13, migrate từ số 0), đã xoá database tạm đó;
- toàn bộ: unit 137/137, security 27/27, integration 168/168 (test tải V6661 lần này qua), build frontend đạt.

- CI trên GitHub: lần đầu (`79147f6`) job smoke xanh, job verify đỏ vì test xuất phiếu Word/PDF cần Chromium của Playwright (máy Home cài sẵn, máy GitHub chưa) → thêm bước `npx playwright install --with-deps chromium`; lần hai (`596bc42`, run 37133809197) cả hai job xanh: verify 46 giây, smoke 27 giây. Log job đọc bằng thông tin đăng nhập git của repo (API log không công khai), không in ra.

**Việc tiếp:** chờ anh Hiếu "up main". Bảo vệ `main` bằng "bắt buộc CI xanh" chỉ dùng được khi đổi sang luồng pull request (đẩy thẳng main thì CI này không chạy trên commit đó).

## 2026-10-03 — Đánh giá (CHƯA chốt): đưa dự án dự thi "Giáo viên sáng tạo – Tài năng" 2026–2027

**Yêu cầu:** anh Hiếu nhờ đọc bộ tài liệu cuộc thi của trường (kế hoạch, kickoff, key visual — nằm ở OneDrive của anh, ngoài repo) và đánh giá phương án cho dự án dự thi, đề xuất 4–5 tính năng bám chủ đề. Chỉ đọc và đánh giá, không sửa code.

**Điều rút ra từ tài liệu:**
- Chủ đề "Học cách dạy – Dạy cách học": giáo viên là chủ thể phát triển, học sinh là người thụ hưởng; không thi sản phẩm của học sinh, không chấm theo công nghệ. Ba nhịp dạy cách học: trước nhiệm vụ (biết bắt đầu) – khi thực hiện (biết cách làm, hỗ trợ không làm thay) – sau nhiệm vụ (biết tự sửa).
- Sản phẩm được phép là phần mềm / website, nhưng phải có cơ sở lí luận, thực nghiệm trên lớp, minh chứng trước–sau; hồ sơ gồm đề cương DOCX, PPTX, video dưới 5 phút, thư mục minh chứng.
- 7 trục chấm chung (lí luận – giải pháp – hiệu quả – số liệu – bài học – logic – hoàn thiện) và 7 hạng mục giải: dạy cách học, cá nhân hoá, đánh giá và phản hồi, hợp tác, công nghệ hỗ trợ tự học, động lực tự học, tự học nghề nghiệp. Mỗi đội 1 hạng mục chính + 1 phụ, tối đa 6 giáo viên.
- Mốc: đăng ký ý tưởng (tối đa 200 chữ) tới 20/10/2026, chọn đội 31/10; coaching 11/2026–3/2027 (dạy thử trên lớp 02–03/2027); chung kết 4–5/2027.
- Quy tắc chính trực: giáo viên làm chủ sản phẩm, không nhờ người khác hoặc AI làm thay; không dùng AI tạo minh chứng.

**Nhận định đã nêu với anh Hiếu:** dự án hiện là nền tảng (ngân hàng câu hỏi + luyện tập), chưa phải "dự án" theo nghĩa cuộc thi; cần thu hẹp thành một vấn đề nghề nghiệp cụ thể. Khuyên hạng mục chính "Đánh giá và phản hồi" (học sinh hiểu phản hồi, biết làm gì tiếp), phụ "Công nghệ hỗ trợ tự học"; thí điểm một môn + khối. Rủi ro phải hỏi BTC sớm: phần mềm được lập trình với AI.

**5 tính năng đề xuất (chưa làm):** (1) đặt mục tiêu trước khi luyện từ YCCĐ của Bài; (2) nhật ký sửa lỗi sau khi nộp + luyện lại; (3) báo cáo "chắc / chưa chắc" so với đúng / sai; (4) gợi ý theo bậc, tách đúng độc lập và đúng sau gợi ý; (5) xuất hồ sơ minh chứng trước–sau cho giáo viên (ẩn danh). Chờ anh Hiếu chọn hạng mục và tính năng.

**Kế hoạch 5 tính năng "dạy cách học" (anh Hiếu bảo lập kế hoạch cả 5; CHƯA làm, chờ duyệt):**
- Đã kiểm schema: `attempt_items` có sẵn `uncertain`, `first_response`, `grade_result`; `attempts` có `retry_of`; nội dung câu hỏi (`question_versions.content`) chưa có gợi ý; dữ liệu local 40 câu đã làm, 0 câu tick "chưa chắc" (nút có nhưng không ai dùng).
- B0 nền chung: một migration chỉ thêm cột (`attempts.goal`, `attempt_items.error_cause / error_note / hints_used`), công tắc bật công cụ theo lớp (để có giai đoạn "trước" làm mốc và lớp đối chứng), định nghĩa chỉ báo. Không đổi công thức chấm và điểm thành thạo.
- B1 (TN3, nhỏ): hỏi nhanh "chắc / chưa chắc" khi chốt câu; sau nộp hiện bảng chắc–đúng / chắc–sai / chưa chắc–đúng / chưa chắc–sai.
- B2 (TN2, vừa): sau nộp, mỗi câu sai chọn nguyên nhân + ghi một dòng, rồi luyện lại; đo tỉ lệ lỗi được sửa qua `retry_of`; giáo viên xem phân bố nguyên nhân theo Bài.
- B3 (TN1, nhỏ–vừa): trước khi luyện hiện YCCĐ của Bài + chọn mục tiêu; sau nộp đối chiếu.
- B4 (TN5, vừa): xuất Excel minh chứng theo lớp và hai khoảng thời gian, mã học sinh ẩn danh, có sheet "chưa tiến bộ" và "nguồn, cách tính".
- B5 (TN4, lớn): gợi ý tối đa 3 bậc trong nội dung câu (soạn tay + nhập Word "Gợi ý 1:"), endpoint riêng để mở từng bậc (không gửi trước xuống máy học sinh), chỉ ở chế độ luyện; báo cáo đúng độc lập / đúng sau gợi ý. Nút thắt là công soạn gợi ý, bắt đầu từ một chương.
- Lịch gợi ý theo cuộc thi: B0–B2 trong 10–11/2026 (đồng thời thu mốc "trước"), B3–B5 trong 12/2026–01/2027, dạy thử 02–03/2027.

**5 ý tưởng dạy học KHTN khác đã đề xuất:** Dự đoán – Quan sát – Giải thích cho thí nghiệm biểu diễn; báo cáo thí nghiệm theo Nhận định – Bằng chứng – Lập luận kèm tự chấm / chấm chéo; vai trò xoay vòng trong nhóm thực hành; bài mẫu giảm dần gợi ý cho bài toán tính; "hai phút nhớ lại" + lịch tự ôn ngắt quãng.

## 2026-10-04 — Làm lại phần nhìn trang chủ học sinh (V6.8, bản đồ bài học)

**Yêu cầu:** anh Hiếu xem web (main đã ở b6a3d7a, deploy trưa 04/10 — không phải do phiên này đẩy) và nói giao diện học sinh "chưa đổi, trông hơi xấu". Bản đồ V6.8 đầu tiên dùng lại thẻ trắng + dòng chữ, chương bị gập lại.

**Thay đổi (chỉ trang chủ học sinh; giữ bảng màu và phông của app):**
- `LessonMap.jsx` viết lại phần hiển thị: mỗi chương là một "tuyến" (màu theo phân môn KHTN: L xanh mực, H nâu cam, S xanh lá), mỗi Bài là một "trạm" có vòng tiến độ quanh số bài; khối "Em đang ở đây" nền đậm với nút vàng là điểm nhấn duy nhất; "Em đang vướng gì" có thanh điểm và vạch mốc 70; huy hiệu thành hàng huy chương; chương luôn mở.
- `StudentHome.jsx`: dải "nhịp học" 7 ngày gần nhất ở đầu trang; cột "Bài được giao" (bài đang dở, bài sắp hết hạn, bài khác) nằm cạnh khối "Em đang ở đây", trên điện thoại xếp lên trước.
- Máy chủ: `lessonMap.js` thêm `weekOf` và `motivation.week` (7 ngày gần nhất, ngày nào có lượt hoàn thành). Không có migration.
- CSS trong `styles/learning.css` (khối V6.8 thay mới), có `prefers-reduced-motion`.

**Kiểm:** chụp ảnh bằng Playwright trên database sao chép tạm với một học sinh giả (đã xoá database và script tạm sau khi xong): máy tính 1366 px và điện thoại 390 px, không tràn ngang, không lỗi console; chế độ chọn nhiều bài hiển thị đúng. Test: unit 137/137, security 27/27, integration 168/168 (test trình duyệt V68 kiểm thêm dải 7 ngày và số huy hiệu đạt), build đạt.

**Việc tiếp:** chờ anh Hiếu xem ảnh, góp ý phần nhìn, rồi "up main". Màn làm bài (Player), hồ sơ học tập và thanh bên chưa đổi.

## 2026-10-04 — Biểu đồ năng lực ("lục giác") trên trang chủ học sinh

**Yêu cầu:** anh Hiếu: phần nhìn trang chủ ổn, nhưng thiếu biểu đồ năng lực kiểu bóng đá — một biểu đồ chung các môn, và vào mỗi môn có một biểu đồ theo các năng lực của môn trong CT GDPT 2018 (ví dụ năng lực tìm hiểu tự nhiên).

**Hiện trạng trước khi làm:** hệ thống năng lực V6.6.3 đã có (khung, trục, ánh xạ YCCĐ / Chủ đề / câu → trục, minh chứng rubric giáo viên, `competency-profile`), radar cũ nằm ở Hồ sơ học tập → Năng lực và chỉ hiện khi mọi trục đủ minh chứng. Database máy này: chưa có khung nào công bố, chưa có ánh xạ nào, chưa câu trả lời nào mang minh chứng năng lực.

**Thay đổi:**
- `frontend/src/components/SkillRadar.jsx` (mới): biểu đồ mạng nhện SVG một chuỗi. Trục chưa có dữ liệu để trống (nan nét đứt, nhãn "chưa có dữ liệu"), không coi là 0; chỉ tô vùng khi mọi trục có số, còn thiếu thì vẽ từng "tia" từ tâm; trục ít dữ liệu dùng chấm rỗng; nhãn mỗi trục ghi số và căn cứ (mấy bài / mấy minh chứng); dưới 3 trục thì đổi sang thanh ngang.
- `LessonMap.jsx`: khối `.ability` giữa bản đồ và huy hiệu, hai thẻ: "Các môn khối N" (mỗi trục một môn có Bài ở khối) và "Năng lực môn X" (đọc `GET /practice/students/:id/competency-profile`; chưa có khung công bố thì ghi rõ, không vẽ). `StudentHome.jsx` truyền `studentId`.
- `lessonMap.js`: mỗi môn trong `subjects[]` thêm `score` (trung bình thành thạo các Bài đã luyện, theo số câu; chưa luyện = null) và `practiced` (số Bài đã luyện). Một truy vấn `mastery_states` cho cả khối thay cho truy vấn theo môn. Không có migration.
- CSS trong `learning.css`. Lưu ý: `practice.css` có `.practice-page figure svg{max-height:250px}` cho biểu đồ cũ nên radar phải ghi đè bằng `.practice-page .skill-radar svg`.

**Kiểm:** integration `v68-lesson-map` thêm khung năng lực mẫu KHTN + ánh xạ YCCĐ trong fixture; kiểm `subjects[].score/practiced` (môn chưa luyện = null), `competency-profile` (trục chỉ nhận minh chứng thầy cô để trống), và trên trình duyệt: thiếu một trục thì không tô vùng, sau khi ghi một minh chứng thực hành thì tô vùng và trục đó là chấm rỗng. Ảnh: `artifacts/v68-ability.png`, `v68-ability-full.png`, `v68-ability-mobile.png` (đã xem cả hai cỡ màn). Toàn bộ: unit 137/137, security 27/27, integration 168/168, build đạt.

**Điều cần anh Hiếu quyết (chưa làm):** trên web thật biểu đồ năng lực theo môn sẽ trống cho tới khi (1) nhà trường công bố khung năng lực của môn (mẫu KHTN 3 thành phần, Toán 5 thành phần đã có sẵn), (2) YCCĐ / câu hỏi được gắn vào thành phần năng lực, (3) học sinh làm bài sau thời điểm gắn (bài cũ không suy ngược). "Tìm hiểu tự nhiên" không tính từ câu tự chấm, cần thầy cô ghi minh chứng thực hành. Ba cách gắn đã nêu: tự động theo mức nhận thức của câu; tổ trưởng gắn theo YCCĐ / Chủ đề (cần công cụ gắn hàng loạt); thêm cột năng lực vào mẫu Excel chương trình.

## 2026-10-04 22:07 — Đẩy main `7014202` (anh Hiếu "up main"); deploy CHƯA chạy

- Trước đó main đã ở `b6a3d7a` (V6.8 bản đồ bài học + CI, deploy trưa 04/10, run xanh). Lần này fast-forward thêm 2 commit: `64c513d` (trang chủ học sinh làm lại phần nhìn) và `7014202` (biểu đồ năng lực). Không có migration.
- Run "Verify & Deploy" 37211882838 nằm ở trạng thái `queued`, chưa có runner nhận sau 13 phút (22:08 → 22:21): runner self-hosted trên máy Home không trực tuyến hoặc đang bận. Web thật vẫn chạy bản `b6a3d7a`.
- Việc tiếp: anh Hiếu / AI Ubuntu kiểm máy Home và dịch vụ GitHub runner; runner lên lại thì run đang xếp hàng tự chạy (GitHub giữ hàng đợi tối đa 24 giờ, quá hạn thì bấm "Re-run"). Lỗi tỉ lệ 99% ở `availability.jsx` vẫn chưa sửa (phiên riêng không tạo commit nào).

## 2026-10-05 — V6.8.1: khung năng lực CT GDPT 2018 có sẵn + quy tắc theo mức nhận thức

**Yêu cầu:** anh Hiếu không hiểu vì sao phía học sinh chưa có khung năng lực; muốn AI tự nạp khung CT GDPT 2018 và dùng một quy tắc % theo thang Bloom thay cho việc gắn tay.

**Thay đổi:**
- Migration `migration-v681-competency-defaults.sql` (chỉ thêm): cột `competency_frameworks.level_rule`; nạp và công bố khung năng lực đặc thù cho 13 môn (KHTN 3, Vật lí / Hoá / Sinh 3, Địa 3, Sử 3, Toán 5, Ngữ văn 3, Tiếng Anh 5, Tin 5, Công nghệ 5, GDCD 3, GDKT&PL 3); bỏ qua môn đã có khung nháp / đã công bố; khung KHTN / Toán tạo từ mẫu cũ được điền `level_rule` nếu còn trống. IELTS không có khung.
- Quy tắc mặc định (`level_rule`, là ƯỚC TÍNH): KHTN / Lí / Hoá / Sinh / Địa — NB → C1; TH → C1 0,7 + C2 0,3; VD → C2 0,4 + C3 0,6; VDC → C2 0,2 + C3 0,8. Sử — NB → C1; TH → C1 0,3 + C2 0,7; VD → C2 0,5 + C3 0,5; VDC → C2 0,2 + C3 0,8. Toán — NB → C1 0,6 + C4 0,4; TH → C1 0,7 + C4 0,3; VD → C2 0,4 + C3 0,6; VDC → C1 0,2 + C2 0,3 + C3 0,5 (C5 "công cụ" không có câu tự chấm). Văn, Anh, Tin, Công nghệ, GDCD, GDKT&PL không có quy tắc theo mức (năng lực theo kĩ năng / loại hoạt động): cần gắn theo YCCĐ / Chủ đề hoặc minh chứng thầy cô.
- `competency/rules.js`: `levelEntries`. `competency/service.js` `profile()`: câu có mapping riêng (snapshot) vẫn ưu tiên; câu chưa gắn thì áp `level_rule` lúc đọc — nên bài đã làm trước đó cũng có số. Trả thêm `estimated_items`, `level_rule`; `unmapped_items` chỉ còn câu không gắn được vào đâu.
- `LessonMap.jsx`: thẻ "Năng lực môn" ghi rõ phần ước tính theo mức của câu; môn theo kĩ năng ghi cần thầy cô gắn / ghi minh chứng.

**Kiểm:** migration qua cổng an toàn, chạy trên DB local (13 khung PUBLISHED); học sinh demo local có 3 trục KHTN từ 30 câu đã làm (35,5 / 18 / 0). Unit 138/138 (thêm `levelEntries`), security 27/27, integration mới `v681-competency-defaults` 2/2, toàn bộ integration 169/170 — lỗi duy nhất vẫn là test tải V6661 (1589 ms > 1500 ms, dao động do máy). Build frontend đạt.

**Việc tiếp:** chờ anh Hiếu "up main" (có migration v681). Deploy `7014202` đã chạy xong, thành công lúc 22:30 ngày 04/10 (runner máy Home nhận việc trễ khoảng 20 phút); web thật đang ở `7014202`.

**Deploy `8d0d9d4`** (anh Hiếu "up main", thứ Hai 00:10): fast-forward từ `7014202`, CI run 37219559269 SUCCESS — Verify 63 giây, Deploy 35 giây; migration v681 chạy trong deploy. Chưa kiểm giao diện web thật.

## 2026-10-05 — V6.8.2: cột "Năng lực" trong file mẫu chương trình

**Yêu cầu:** anh Hiếu: gắn năng lực bằng tay ở trang nâng cao quá khó hiểu; các môn còn lại (không có quy tắc tự động) phải nạp bằng mẫu, có hướng dẫn đọc hiểu.

**Thay đổi (không có migration):**
- File mẫu Excel: sheet Chương trình thêm cột "Năng lực" (chỉ khi môn + khối có khung đã công bố), ghi mã (`C1; C3`) hoặc tên thành phần; sheet Hướng dẫn thêm mục "CỘT NĂNG LỰC" liệt kê thành phần của môn và nói rõ môn nào để trống được; sheet Ví dụ và Lệnh 1 của "Dùng AI" có cột này. Tải về có sẵn mã đang dùng.
- Nạp: mã lạ báo lỗi kèm danh sách dùng được; môn không có quy tắc tự động được nhắc số YCCĐ còn trống. Lưu ở `curriculum_versions.lesson_plan.competencies` (nhãn YCCĐ → mã); `saveLessonPlan` giữ nguyên phần này.
- Công bố: `applyCompetencyPlan` (lessonPlan.js) ghi `competency_mapping_versions` cho YCCĐ của bản vừa công bố, chia đều trọng số; trả `abilities: {mapped, skipped}`.
- `competency/service.js` `profile()`: thứ tự snapshot lượt làm → năng lực đang gắn cho YCCĐ (đọc lúc xem, nên bài làm trước đó cũng tính) → quy tắc theo mức.
- Giao diện trang Chương trình môn học: dòng thành phần năng lực của môn, số YCCĐ đã ghi ở bước kiểm tra và ở bản nháp, khác biệt "YCCĐ đổi năng lực". Sửa cột này chỉ qua file (chưa có ô sửa trên web).

**Kiểm:** unit 141/141 (3 test mới cho cột Năng lực), security 27/27, integration 171/171 (v6674: Toán nạp `C1; c4` và tên thành phần có dấu phẩy → công bố tạo đúng 2 bản gắn, tải lại giữ mã; v681: YCCĐ đã gắn thắng quy tắc theo mức), build đạt. File xem thử: `artifacts/Mau_chuong_trinh_NguVan_khoi10.xlsx` (không commit).

**Việc tiếp:** chờ anh Hiếu "up main".

## 2026-10-18 — Tab "Đấu" (thi đấu): đánh giá Mầm Tri Thức và demo giao diện (CHƯA code app)

**Yêu cầu:** anh Hiếu bảo đọc hồ sơ bàn giao Mầm Tri Thức (`D:\AI\clone\blu\docs\ban-giao-2026-10-17`, dự án tự học tiếng Anh/KHTN của anh, JS thuần + SQLite) và cân nhắc đưa phần thi đấu (solo bạn bè, cả lớp, khác lớp, đôi / đội / nhiều người) thành một tab cạnh "Tự ôn" trong app này; chú ý UX/UI mới vì Mầm Tri Thức "trông chán".

**Đã làm:** đọc hồ sơ 01–08, báo cáo đánh giá UX và nửa đầu `backend/rooms.mjs`. Kết luận: không ghép mã (khác stack, khác mô hình quyền), lấy luật chơi và ý tưởng phòng theo mã; làm lại trong app mình. Anh Hiếu chốt: điểm thành thạo của ván đấu chỉ tính trong ván (gộp sau); bật tìm đối thủ tự do, không công tắc theo lớp; không chat tự do; làm xong ý tưởng và kế hoạch chi tiết trước khi triển khai. Đề xuất giữ tối thiểu an toàn: chỉ ghép cùng trường và cùng khối, tên kèm lớp, nút báo cáo/chặn.

**Demo giao diện:** `agy` (Antigravity CLI 1.3.5) chạy không tương tác bị chặn quyền chạy lệnh / ghi tệp (tài khoản không có `--mode auto`, không bật `--dangerously-skip-permissions`) nên không sinh được tệp. Dùng Gemini web (model "4 Argon", tài khoản của anh, anh đã cho phép) sinh `docs/thiet-ke/dau-truong-demo/index.html` (một tệp, 7 màn, dữ liệu giả); lấy mã bằng sao chép từ khung xem mã; ảnh chụp 7 màn × 2 cỡ ở `anh/`. Chưa commit (thư mục chưa theo dõi).

**Kiểm:** mở bằng Playwright, 14 ảnh, không lỗi console, không tràn ngang. Nội dung 4 câu KHTN trong demo đã đối chiếu đúng. Lỗi thấy: màn Sảnh trên điện thoại bị cắt mép phải (ô nhập mã, hàng "Phòng đang chờ"); nhãn tab "Tự ôn" xuống dòng; thanh điều hướng demo chiếm khoảng 1/5 màn điện thoại.

**Việc tiếp:** anh duyệt giao diện; sửa lỗi bố cục (nhờ Gemini sửa hoặc tự sửa); viết kế hoạch chi tiết (luật điểm, phòng và SSE, mô hình dữ liệu, quyền, an toàn học sinh, kiểm tải) trước khi code.

## 2026-10-18 — Kế hoạch chi tiết tab "Đấu" (V6.9) + kế hoạch sửa demo Gemini

**Yêu cầu:** anh Hiếu thấy demo tạm ổn; bảo lên kế hoạch tích hợp đầy đủ: sảnh hiện phòng học sinh tạo, đấu theo chủ đề, tìm bạn cùng môn / cùng chủ đề, phòng chưa chọn nội dung thì vào phòng rồi cả phòng cùng chọn môn và (tuỳ) chủ đề; kèm kế hoạch sửa lỗi demo Gemini.

**Thay đổi:** tạo `task_plan.md` (gốc dự án): trải nghiệm sảnh / tạo phòng / tìm đối thủ (gợi ý từ bản đồ bài học, nới dần Bài → Chương → môn) / cùng chọn nội dung (luật bỏ phiếu), luật điểm, kiến trúc (engine thuần, deck chỉ kho trường, phòng trong bộ nhớ + ghi Postgres, SSE), API, migration v69 chỉ thêm bảng, giai đoạn 0–5 kèm nghiệm thu, 10 lỗi demo và cách sửa, kiểm thử, rủi ro, câu hỏi Q1–Q5. Soát thêm 3 ảnh demo (phòng chờ, trạng thái, sảnh máy tính) để lập đủ danh sách lỗi.

**Kiểm:** không có thay đổi code. **Việc tiếp:** chờ anh duyệt kế hoạch và trả lời Q1–Q5, rồi làm giai đoạn 0 (demo v2 qua Gemini, kiểm từng phần tử 360/390/1366).

## 2026-10-18 — Bản kế hoạch đầy đủ tab "Đấu" để gửi AI góp ý

**Yêu cầu:** anh Hiếu trả lời Q1–Q5 (không tính khi chưa Chốt; tên gọi + lớp; dùng cả 4 loại TN/ĐS/TLN/GN; làm đủ các chế độ một đợt, phòng chờ mọi người Sẵn sàng thì chủ phòng bấm chạy; có công tắc tắt). Em bắt đầu code thì anh dừng lại, bảo viết kế hoạch đầy đủ (tổng quan, vấn đề, ý tưởng triển khai…) để gửi các AI khác góp ý.

**Thay đổi:** `docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md` (21 mục, có bối cảnh hệ thống để người đọc không cần mã nguồn, 20 câu hỏi mở cần góp ý); `task_plan.md` ghi quyết định và trỏ sang tài liệu mới. Nháp đã viết trước khi dừng, CHƯA nối vào app, chưa test: `backend/src/services/battle/engine.js`, `backend/src/db/migration-v69-battle.sql` (chưa thêm vào `upgrade.js`).

**Kiểm:** chưa chạy gì (tài liệu + nháp). **Việc tiếp:** chờ góp ý của các AI, gộp góp ý vào tài liệu rồi mới triển khai.

## 2026-10-18 — V6.9 "Đấu": phản biện 3 vòng xong, giao Codex làm backend (đang dở)

**Đã làm:** phản biện Claude ↔ Codex (gpt-6-astra, cao) 3 vòng → kế hoạch 1.3 (`docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md`, §23 phụ lục triển khai), commit `449aa8c` trên `perf-v6671-followup`. Tạo nhánh `feat-v69-battle`, giao Codex làm backend (prompt: scratchpad `codex-impl-prompt.md`). Codex **hết hạn mức** giữa chừng (mở lại 13:03 18/10) sau khi viết: `backend/src/db/migration-v69-battle.sql` (qua migration-safety), `backend/src/services/battle/{engine,dto,deck,stream}.js` — chưa đăng ký migration, chưa có rooms/routes/test. Anh Hiếu chọn chờ Codex làm tiếp. Claude đã soát phần dở, ghi chú 7 điểm (cache deck, badge ≥80%, dọn dữ liệu theo hạn, test stream…).

**Việc tiếp:** 13:07 (hẹn giờ trong phiên) resume phiên Codex `01a14cc2-dc75-7031-b267-8765495f3548` kèm ghi chú review; Codex xong thì Claude review + chạy unit/security/integration/smoke; sau đó giao Gemini 4 Argon web làm giao diện React theo hợp đồng DTO thật.

## 2026-10-18 — V6.9 backend hoàn thiện, sửa review Claude V4

**Yêu cầu:** tiếp tục phần dở, giữ migration/engine/DTO/deck/stream; hoàn tất backend theo kế hoạch 1.3 §23, sửa B0–B3 và Q1–Q8 của `V4_CLAUDE_REVIEW_BACKEND.md`, bổ sung tài liệu/test. Không frontend, không commit/push/đổi nhánh, không sửa `.env`, không mạng ngoài, không migrate database thật.

**Thay đổi:** migration đăng ký trong upgrade; dịch vụ battle (engine, DTO, deck, rooms, storage, availability, matchmaking, stream, safety); router/server/cấu hình; battle_retry và Câu cần xem lại trong attempts/lessonMap/portfolio cùng DTO/validation liên quan; Caddy bỏ encode SSE; unit/integration/smoke; `docs/API.md`, `docs/thiet-ke/phan-bien/TRIEN_KHAI_BACKEND_CODEX.md`, handoff. B0 cô lập mọi lỗi khởi tạo, Đấu trả 503 nhưng app vẫn chạy trên schema cũ; tự luyện/hồ sơ tránh phụ thuộc cột battle chưa cài. B1/B2 dùng truy vấn chặn theo lô, không publish sảnh khi trả lời; B3 cache theo khối. Sửa trạng thái restart, badge ≥80%, gợi ý riêng 30 ngày, thông báo không có câu sai, tên trùng ổn định, lớp độc lập lobby, comment Việt. Chi tiết từng mục review và §23 nằm trong báo cáo.

**Kiểm:** `npm test` 186/186 (matrixBalancer cũng đạt); security 27/27; integration toàn bộ 177/177 (171 cũ + 6 V6.9, bao gồm kiểm B0 trước khi migrate clone); trước đó V6.9 + V6.8 riêng 10/10; smoke 6/6 trên DB trắng dùng một lần; migration-safety additive=true; diff --check đạt. PostgreSQL chỉ ghi clone/DB smoke và dọn sau test. Đã rebuild chỉ mục CodeGraph local và repo-map. Không đổi frontend; không cần build.

**Việc tiếp:** Claude review mã và hợp đồng DTO, giao frontend; kiểm Caddy adapt/validate trên máy có binary và đo tải §23.9 (300 học sinh/phòng 50/reconnect); sau khi được chủ dự án cho phép commit/push, phải có CI đúng commit xanh trước up main. Chưa deploy/bật cờ thật, chưa đo tải và chưa chạy Caddy thực tế. Không có commit/push trong phiên này.

## 2026-10-18 tối — V6.9 "Đấu": backend v69 xong, UI lượt 1–3, ghép trận linh hoạt + rank đã chốt; chờ hạn mức AI

**Đã làm:** backend v69 (Codex viết, Claude review 2 vòng, sửa B0–B3 + Q1–Q8) — unit 186, security 27, integration 177 xanh; commit `936b9a6`, đẩy nhánh `feat-v69-battle`. Giao diện React do Gemini 4 Argon viết theo hợp đồng API thật, lượt 1–3 (20 tệp, mới kiểm cú pháp, chưa nối route) — commit WIP `0b16e3b`. Ghép trận linh hoạt: đề xuất → phản biện Codex + Gemini → chốt (`docs/thiet-ke/GHEP_TRAN_CHOT_V69.md` §1–§11): ghép hai chiều rộng↔hẹp, nới có trần "đã học tới", đối thủ máy, giờ vàng, rank kiểu ĐTCL/LMHT đã sửa theo phản biện Gemini (§10.4), 3 kiểu phòng tự tạo (§11).

**Đang chờ:** Codex hết hạn mức tới 23:13, Gemini Argon tới 21:21 (anh Hiếu: "chờ hồi rồi bắt chúng nó làm tiếp"). Hẹn giờ trong phiên: 21:26 Gemini lượt UI 4a (màn chiếu giáo viên); 23:16 Codex làm backend ghép trận linh hoạt + máy + giờ vàng + rank + kiểu phòng (prompt `scratchpad/codex-mm-impl-prompt.md` + §10–§11). Sau đó: Claude review + test, Gemini lượt UI 4b (sảnh, tạo phòng, tìm đối thủ, quản trị), nối route, chạy thử trình duyệt, báo anh.

## 2026-10-18 23:40 — Codex hết hạn mức giữa chừng (lần 3), chờ 4:17

Codex viết dở backend ghép trận linh hoạt + máy + giờ vàng + rank + kiểu phòng (chưa commit, trong working tree nhánh `feat-v69-battle`): `services/battle/{bots,flex,goldenHours,ratings,settings}.js`, migration v691/v692 (qua migration-safety, additive), sửa engine/dto/deck/rooms/matchmaking/routes/config, test `battle/flex-rank.test.js`, integration `v691-battle-flex.test.js` (chưa chạy). `npm test` 200/200. Màn chiếu giáo viên (Gemini lượt 4a) đã commit `067d4c3`. Anh Hiếu chọn chờ Codex: hẹn giờ 4:21 ngày 19/10 resume phiên `01a14f07-2e52-7ed3-ab71-0fa9e4dc8b8e`.

## 2026-10-19 — V6.9 "Đấu": UI 4c (AdminBattle), nối route, chạy thử trình duyệt trên server thử, sửa lỗi tích hợp; luật rank khi bỏ trận

**Yêu cầu:** nhận lượt UI 4c từ Gemini, nối route, chạy thử toàn bộ luồng bằng trình duyệt; anh Hiếu chốt thêm: đối thủ bỏ trận thì người ở lại không bị trừ, còn ≥2 người thì tính như thường.

**Thay đổi:** `2899bc8` route `/practice/battle`, `/practice/battle/rooms/:id`, màn chiếu, `/admin/battle` + menu; AdminBattle (Gemini). `7ee43ea` `ratings.js` (người chủ động rời vẫn thua; người ở lại một mình không có sự kiện hạng; ≥2 người xếp hạng với nhau, bỏ phạt abnormal do có người rời), làm tròn điểm trong DTO, RevealPanel/Projector đọc `choices`/`blank`; test V692 thêm 2 ca; `GHEP_TRAN_CHOT_V69.md` §10.4 mục 4. `8754b72` màn chiếu ra ngoài Layout + chờ snapshot đầu, DTO thêm `host_id` (mọi pha) và `class_id` (giáo viên chủ phòng lớp), RevealPanel đọc đáp án `{correct}/{values}/{pairs}/{numeric}` + `hideMine` cho màn chiếu, `/options` cho nhân sự chỉ có `class_id` trả các môn được phân công, CSS 4b bị cắt cụt được đóng và bổ sung ~80 class, lớp phủ trên nút menu app.

**Kiểm:** unit 203/203; security 27/27; integration 189/190 (chỉ V6661 tải hỏng khi chạy song song, đã biết); V692 riêng 3/3; build frontend OK. Trình duyệt (Playwright, server thử 3196, DB clone `nganhang_battle_ui_tmp`): sảnh desktop/mobile (tràn ngang 0), tạo phòng mã → vào bằng mã → sẵn sàng → bắt đầu → chơi đủ 4 loại câu → kết quả; ghép trận 2 học sinh; đấu với máy; phòng lớp + màn chiếu + 2 học sinh (1 trên 390px); trang quản trị. Ảnh trong `artifacts/battle-ui/` (không commit).

**Còn mở:** ô "Mã môn" của Giờ vàng trong AdminBattle là số thô (nên đổi thành chọn môn); chưa có test trình duyệt cố định; thứ tự trang kết quả (ôn câu sai trước bục vinh danh) giữ theo kế hoạch "Đúng là chính".

**Việc tiếp:** anh Hiếu duyệt ảnh; viết test trình duyệt cố định từ `backend/scripts/_tmp-battle-ui.mjs`; dọn server/DB thử khi xong; merge `main` chỉ khi anh Hiếu bảo "up".

## 2026-10-20 — V6.9.2 lên web thật; sửa lớp học sinh; V6.9.3 "Quiz lớp" (Tự chơi, Thi theo phút, Nhanh tay)

**Yêu cầu:** "up main" và thử trên studylab.io.vn; sau đó: chế độ giống Quizizz (tự chơi / giáo viên điều khiển), điểm nhanh tay, thi theo phút; tách "Đấu trường" (giống Bufopia) và "Quiz lớp" (giống Quizizz); giao Codex + Gemini (Argon).

**Thay đổi:** `main` = `68a64ff` rồi `8da8b84` (deploy CI thành công). `8da8b84` sửa nhận diện lớp học sinh khi năm học nhập từ danh sách không có ngày (web thật chặn `hs_demo1`). Plan `docs/thiet-ke/CHE_DO_CHOI_V693.md` 1.0 → phản biện Codex (`phan-bien/V693_CODEX_PHAN_BIEN.md`, B1–B8) → Phụ lục 1.1 → Phụ lục 1.2 (tách Đấu trường/Quiz lớp, anh Hiếu chốt). `08195b8` UI Gemini lượt 5 (PlayModePicker, SelfPacedPlay, ProjectorSelfPaced, SpeedPoints) + nối: menu giáo viên "Quiz lớp" `/practice/quiz` (giáo viên vào `/practice/battle` tự chuyển). `4b8e461` backend Codex (migration v693, modes/selfPaced/modeStorage, chặn rank 4 nơi, trục mới chỉ cho `kind:class`, cờ `self_paced`/`speed_scoring` mặc định tắt) + sửa UI (điểm từng câu, nhãn chế độ, Quiz lớp không ghi "tính hạng").

**Kiểm:** unit 214/214; security 27/27; integration v693 7/7; integration toàn bộ 194/198 — 3 bài trình duyệt hỏng do build lại frontend giữa lúc chạy (chạy lại pilot+v63: 84/84) + V6661 tải (cũ). Trình duyệt (server thử 3196, DB clone đã nâng v693): giáo viên mở Thi theo phút 5 phút + Nhanh tay, 2 học sinh (1 mobile 390 px, tràn 0) tự chơi 7 câu, màn chiếu bảng trực tiếp, kết thúc, kết quả 6842 điểm = 4200 + 2642. Trên web thật: Đấu đã bật (class, duel_code, lobby, matchmaking, bot) để anh Hiếu thử, màn chiếu và luồng SSE qua Cloudflare chạy.

**Còn mở:** Đấu trên web thật **vẫn đang bật** — chờ anh Hiếu bảo tắt. Codex hết hạn mức 2 lần; 18:55 hẹn Codex tự rà phần còn thiếu (S1 ghi tiến độ theo hàng, S2, đo tải 40×15). Chưa deploy V6.9.3. Câu hỏi chờ anh Hiếu: thang Nhanh tay 600+400/+100, mốc phút 3/5/10/15/20.

**Việc tiếp:** Codex rà (18:55) → Claude review/commit → anh Hiếu duyệt → "up main" ngoài giờ học (migration v693 cần ngừng nhận ván mới và chờ ván đang chơi kết thúc trước khi deploy).

## 2026-10-20 chiều — Tắt Đấu trên web thật; Thi theo phút nhận số phút tùy chọn

**Yêu cầu:** anh Hiếu: "tắt" Đấu trên web thật; thang Nhanh tay ok; "phút tùy chọn được không".
**Thay đổi:** web thật `battle_enabled=false` (qua trang quản trị, máy chủ xác nhận). `66ebbf7`: `total_minutes` số nguyên 1–90 (modes.js, CHECK trong migration v693 — chưa deploy nên sửa tại chỗ), PlayModePicker thêm ô nhập phút cạnh nút nhanh, API.md, unit test.
**Kiểm:** unit 214/214; integration v693 7/7; Playwright: nhập 7 phút → phòng "Thi theo phút · 7 phút". DB thử đã đổi ràng buộc tương ứng.
**Việc tiếp:** 18:55 Codex tự rà V6.9.3; sau đó anh Hiếu duyệt → "up main" ngoài giờ học.

## 2026-10-21 — V6.9.3: Codex tự rà, đo tải 40×15

**Yêu cầu:** hẹn giờ cho Codex rà V6.9.3 so với Phụ lục 1.1/1.2 và phản biện; Claude review, test, commit.
**Thay đổi:** `0051f12` bảng trực tiếp ≤ 1 Hz, thứ tự bảng ở chế độ Thi đua không lộ hạng, lưu tạm dừng của giáo viên. `7c571bd` báo cáo rà `docs/thiet-ke/phan-bien/V693_CODEX_RA_SOAT_2026-10-21.md`, dựng lại bảng cuối khi phòng đã rời RAM, test tải 40 HS × 15 câu chấm thật (`artifacts/v693-load-40x15.json`, không commit).
**Kiểm:** unit 217/217; integration v69 + v691/v692 + v693 28/28. Tải cục bộ: 600/600 đáp án, 0 trùng; ACK p50 409 ms, p95 592 ms, p99 660 ms — **chưa đạt cổng §23.9 (p95 ≤ 300 ms)** khi 40 em chốt cùng một lúc.
**Còn mở (theo báo cáo Codex):** tối ưu hàng lệnh phòng/ghi metadata để đạt cổng tải; lỗi giữa hai giao dịch mở câu chưa có cơ chế hội tụ; timer gặp lỗi DB đóng SSE thay vì thử lại; bot chưa hỗ trợ Thi theo phút; một số ca S6 chưa kiểm đầu cuối; chưa đo 300 HS qua Caddy. Codex hết hạn mức 3 lần trong 2 ngày.
**Việc tiếp:** anh Hiếu quyết: deploy V6.9.3 (cờ mới tắt, thử 1 lớp) hay tối ưu tải trước.

## 2026-10-21 chiều — Tối ưu tải V6.9.3 và deploy

**Yêu cầu:** anh Hiếu chọn "B": tối ưu tốc độ trước, "tối ưu xong push"; hỏi Supabase tự host có nhanh hơn bản free không.
**Thay đổi:** `d734a67` — `accessResolver.listEffectiveCapabilities` trả thẳng mọi quyền false cho học sinh/tài khoản khóa (trước đó duyệt mọi quyền × mọi ngữ cảnh mỗi request; test `access-v65` kiểm giả định); Đấu Tự chơi lưu gọn, `BEGIN; SET LOCAL` một lượt, bỏ tra biên nhận DB thừa (chỉ khi 23505), tra tạm khóa song song, sao chép nông thay structuredClone. Ghi chú vào `phan-bien/V693_CODEX_RA_SOAT_2026-10-21.md`.
**Kiểm:** unit 218/218, security 27/27, integration 198/199 (V6661 cũ); tải 40×15: ACK p95 592 → ~230 ms (đạt ≤ 300), next p95 ~252 ms. Deploy `main` = `d734a67`, run 39563273633 Verify + Deploy thành công, health ok.
**Còn mở:** chưa đọc lại cấu hình Đấu trên web thật sau deploy (phiên admin trong trình duyệt hết hạn); cờ `self_paced`/`speed_scoring` mặc định tắt; Đấu đã tắt từ 20/10. Chưa đo 300 HS qua Caddy; cân nhắc `DB_POOL_IDLE_MS`.
**Việc tiếp:** anh Hiếu đăng nhập admin → bật Đấu + cờ Quiz lớp khi muốn thử với một lớp.

## 2026-10-24 — Hoàn tất backend Sảnh V6.9.4 và phản biện Argon

**Yêu cầu:** tiếp tục kế hoạch SANH_DAU_V694 + Phụ lục 1.2 CHE_DO_CHOI_V693; phản biện tối đa 15 ý và trả lời 3 câu hỏi; thực thi backend, hợp đồng API, unit/integration; xử lý đủ 5 lỗi Argon. Không commit/push, frontend/.env, mạng ngoài hay migration database nguồn.

**Tệp:** thêm backend/src/services/battle/lobby.js, lobbyCache.js; sửa rooms.js, dto.js, matchmaking.js, deck.js, safety.js, stream.js và backend/src/routes/battle.js. Thêm backend/test/battle/v694-lobby.test.js (13 ca), backend/test/integration/v694-battle-lobby.test.js (6 ca); hoàn thiện docs/API.md và docs/thiet-ke/phan-bien/V694_CODEX_PHAN_BIEN.md; cập nhật snapshot bàn giao. CodeGraph đã sync và repo-map sinh lại; không cần build frontend/migration.

**Quyết định:** giữ trường cũ; thêm scope_label/live/seeking/subjects + seeking_any, bộ lọc HTTP/SSE chung. DTO live whitelist ẩn danh, chặn hai chiều, phòng mã riêng/lớp khác không lộ. Phòng class ghim riêng khỏi quota/tổng môn; phòng chưa chọn môn chỉ nhóm id=null. Giữ ngữ nghĩa chọn cả chương qua normalize/DTO/rematch. Cache LRU tách pending, explicit invalidation cả hai phía khi chặn; dựng chung mỗi nhịp/khối rồi chiếu riêng từng người, không truy vấn mỗi snapshot nóng. Live tiến độ 5 giây; countdown có mốc bắt đầu. Chấp nhận Argon: seeking_any, môn vào được trước, ẩn số 1, hạ phòng mất kết nối/chờ >3 phút. Live thu gọn/gợi ý mở màn là việc frontend tiếp theo. Không thêm khán giả, tự vào phòng, tự bật máy sau 20 giây, ghost replay/đặt gạch/thống kê 24h vì ngoài phạm vi và không có bảo đảm thời gian ghép.

**Kiểm thật:** npm test trong backend 231/231 + matrixBalancer đạt; npm run test:security trong backend 27/27. Không chạy script security ở root vì script đó build và ghi frontend. node --test --test-concurrency=1 với v69-battle/v691-battle-flex/v693-battle-modes/v694-battle-lobby: 33/33 ở lượt chung; sau bổ sung ca Argon và chặn live, chạy riêng V694 cuối 6/6. Tổng trạng thái cuối V69/V691/V693 28/28 + V694 6/6 = 34/34. Test chỉ clone PostgreSQL loopback, migration vào clone; harness dọn clone mới sau chạy. Logs: artifacts/v694-unit.log, v694-security.log, v694-all-integration.log, v694-integration-final.log.

**Tải thật:** 50 phòng, 300 SSE loopback, 300 HTTP sảnh: p50 58,44 ms, p95 78,57 ms, p99 86,14 ms; 300/300 luồng nhận sự kiện đổi phòng (artifacts/v694-load-50x300.json). Unit kiểm 300 snapshot cùng nhịp chỉ dựng phần chung 1 lần/khối, 0 DB read khi cache nóng. Hồi quy V693 40×15: ACK p95 147,81 ms, next p95 159,87 ms; 600/600 đúng, không trùng; progress 1720 hàng/1720 giao dịch, player 40 hàng/1 giao dịch, bảng ≤1 Hz; đạt cổng ACK ≤300 ms (artifacts/v693-load-40x15.json). Giữ tối ưu d734a67, không sửa auth/accessResolver/storage/selfPaced.

**Kết quả/việc tiếp:** backend hoàn tất chưa commit/deploy; git diff --check đạt. Làm UI theo hợp đồng, review mobile và thử qua Caddy sau; số đo hiện là local, không suy thành production. Giữ tệp/DB thử có trước, không dọn ngoài phạm vi.

## 2026-10-24 — V6.9.4 Sảnh Đấu trường (Codex backend, Argon qua agy CLI: phản biện + giao diện)

**Yêu cầu:** sảnh hiện mọi phòng và lượt đấu theo môn, lọc theo môn/bài; cho Argon cùng suy nghĩ; dùng Argon qua agy CLI (không qua web), Gemini web chỉ cho ảnh/đồ hoạ, tra cứu giao subagent Sonnet.
**Thay đổi:** kế hoạch `docs/thiet-ke/SANH_DAU_V694.md`; phản biện `phan-bien/V694_CODEX_PHAN_BIEN.md` + `phan-bien/V694_ARGON_PHAN_BIEN.md` (Argon tìm 5 lỗi trong bản nháp Codex). `99f992e` backend (lobby.js, lobbyCache.js, scope_label, live, seeking, seeking_any, subjects, lọc query, SSE, cache chặn/nhãn). `f468566` giao diện Argon (`ArenaHall.jsx`, ArenaLobby, ScopeLabel, battleApi, useBattleStream, CSS) + Claude sửa nhãn hạng dùng `participant_count`.
**Kiểm:** unit 231/231, security 27/27, integration Đấu 34/34; tải cục bộ: sảnh 50 phòng + 300 SSE p95 79 ms, Quiz lớp 40×15 ACK p95 152 ms; build OK; Playwright: phòng chờ + bạn đang tìm hiển thị đúng, mobile 375 px tràn 0, nhãn hạng đúng.
**Ghi chú:** agy chạy với `--dangerously-skip-permissions` bị chặn; dùng `--mode accept-edits` (Argon sửa file, Claude build). Chưa đẩy `main`.
**Việc tiếp:** anh Hiếu duyệt → "up main"; Đấu trên web thật đang tắt, cần đăng nhập admin để bật.

## 2026-10-24 — Up main (Sảnh V6.9.4) + nhập tài khoản học sinh bằng mã HS

**Yêu cầu:** "up main kèm tk học sinh, lấy mã hs làm tk và mk" (file danh sách 350 HS khối 9 năm 2026–2027, không lưu trong repo).
**Thay đổi:** `main` = `67a19b1` (Sảnh) rồi `3d50487`: nhập danh sách có tùy chọn quản trị "mật khẩu ban đầu = mã học sinh" (vẫn bắt đổi lần đầu, chỉ tài khoản mới, ghi audit); băm mật khẩu qua worker pool trước giao dịch (2 việc cùng lúc, 10 vòng cho mật khẩu tạm), chỉ cho HS chưa có tài khoản. File nhập theo mẫu app tạo ở thư mục Downloads của anh Hiếu (ngoài repo).
**Kiểm:** unit 231/231; pilot 34/34 (ca mới mã HS); server thử: 350 HS 108 s → 16 s, /api/health p95 81 ms lúc nhập; đăng nhập bằng mã → must_change_password; deploy CI thành công cả 2 lần. Dữ liệu HS thật đã xoá khỏi DB thử sau khi đo.
**Còn mở:** 350 tài khoản CHƯA tạo trên web thật — cần admin bấm nhập ở /admin/school (Claude không tự đăng nhập). Đấu trên web thật đang tắt.
**Việc tiếp:** anh Hiếu đăng nhập admin → nhập file + tick "mật khẩu = mã học sinh" → xác nhận; cho từng lớp đổi mật khẩu cùng lúc.

## 2026-10-24 chiều — Nhập 350 tài khoản học sinh trên web thật

**Yêu cầu:** "làm luôn" + thêm chế độ bắt / không bắt đổi mật khẩu lần đầu để anh Hiếu test.
**Thay đổi:** `a16f622` — `require_password_change` (mặc định true; chỉ quản trị tắt được; audit), ô tick ở trang nhập danh sách. Đã nhập trên web thật bằng phiên admin của anh Hiếu (khung trình duyệt tích hợp, file nạp bằng JS): xem trước 350 "Thêm mới", 0 lỗi/xung đột; chọn "mật khẩu = mã học sinh" + TẮT bắt đổi mật khẩu (chế độ chạy thử); lưu 350 HS trong 28 s. Lớp trên web: 9A0 33, 9A01 31, 9A02 30, 9A03 30, 9A04 32, 9B0 35, 9B01 34, 9B02 29, 9B03 32, 9B04 27, 9I0 37 (+9A cũ 1). Tên lớp lấy nguyên từ file danh sách (có "9A0/9B0/9I0" — nên kiểm tra có phải sai chính tả "9A00…").
**Không làm:** em không tự đăng nhập thử tài khoản học sinh trên web thật (quy tắc không nhập mật khẩu).
**Còn mở:** 350 HS đang KHÔNG bị bắt đổi mật khẩu — phải bật lại (nút hàng loạt chưa có) trước khi phát cho học sinh; Đấu trên web thật vẫn tắt.
