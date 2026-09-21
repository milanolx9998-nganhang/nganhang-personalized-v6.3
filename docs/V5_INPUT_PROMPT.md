# ĐÁNH GIÁ HIỆN TRẠNG & MEGA PROMPT VÒNG TIẾP
## Dự án: NGÂN HÀNG CÂU HỎI CÁ NHÂN HÓA / SELF-PRACTICE PLATFORM
### Baseline được audit: `nganhang-personalized-v1` — phiên bản hiện tại ngày 13/09/2026

---

# PHẦN I — NHẬN XÉT TOÀN DIỆN PHIÊN BẢN HIỆN TẠI

## 1. Kết luận ngắn

Phiên bản hiện tại **đã vượt khỏi mức prototype/demo chức năng**.

Các subsystem cốt lõi đã hình thành tương đối đầy đủ:

- ngân hàng câu hỏi;
- version câu hỏi;
- nhập Word / Excel / QTI;
- ma trận / đề thi;
- Student Management;
- Student Login;
- tự luyện;
- bài được giao;
- autosave / resume;
- grading 5 dạng câu;
- Mastery / Confidence / Trend;
- Student Portfolio;
- lịch sử làm bài;
- Attempt Review;
- sidebar phân nhóm;
- roster preview/confirm;
- self-host documentation;
- backup / restore;
- Docker / Caddy / HTTPS skeleton.

Điểm yếu chính hiện nay **không còn là thiếu tính năng**.

Điểm yếu chuyển sang:

> **Sản phẩm có nhiều khả năng nhưng trải nghiệm vẫn mang cảm giác “hệ thống quản trị kỹ thuật”, chưa đạt độ đơn giản – trực quan – thân thiện của một sản phẩm giáo dục dùng hằng ngày.**

Do đó vòng phát triển tiếp theo **không nên tiếp tục thêm nhiều feature**.

Ưu tiên nên là:

> **Product Polish + Pilot Readiness**

tức:

1. làm UX dễ hiểu hơn;
2. giảm tải nhận thức;
3. chuẩn hóa ngữ nghĩa dữ liệu học tập;
4. tăng chất lượng mobile;
5. hoàn thiện quyền BGH/viewer;
6. tối ưu hiệu năng frontend;
7. kiểm chứng self-host thật;
8. harden backup/restore;
9. chuẩn hóa source package/release;
10. chuẩn bị pilot với học sinh thật.

---

# 2. Đánh giá theo từng mảng

| Mảng | Đánh giá hiện tại | Nhận xét |
|---|---:|---|
| Kiến trúc tổng thể | **8.8/10** | Giữ được V4 cũ, mở rộng theo module thay vì rewrite |
| Dữ liệu câu hỏi | **8.7/10** | Versioning, taxonomy, import tốt |
| Practice Engine | **8.8/10** | Đầy đủ cho V1 |
| Mastery Engine | **8.7/10** | Đủ tốt để Pilot |
| Student Management | **8.5/10** | CRUD + account lifecycle khá đầy đủ |
| Portfolio | **8.2/10** | Kiến trúc tốt, UX còn nặng dữ liệu |
| Lịch sử làm bài | **8.6/10** | Đã có pagination/filter/drill-down |
| Attempt Review | **8.7/10** | Đi đúng historical version |
| IA/sidebar | **7.8/10** | Đã gom nhóm, nhưng vẫn cần polish workflow |
| Student Home | **7.3/10** | Đúng cấu trúc, còn hơi dashboard |
| Teacher workflow | **7.8/10** | Đã đi được lớp → portfolio |
| Mobile | **7.0/10** | Dùng được, nhưng còn dài và dày |
| Accessibility | **7.5/10** | Có nền, cần audit sâu hơn |
| Performance frontend | **6.8/10** | Bundle còn lớn |
| Production readiness | **7.0/10** | Docs/hạ tầng có, nhưng chưa nghiệm thu trên server thật |
| Pilot readiness | **8.2/10** | Có thể pilot nhỏ sau khi xử lý P0/P1 |

---

# 3. Kiến trúc hiện tại: đánh giá tốt

Project hiện dùng:

```text
Frontend
React 18
React Router
Vite
React Markdown
KaTeX
TanStack Query
Zustand

Backend
Node.js
Express
PostgreSQL
Zod
JWT
bcryptjs
Playwright
```

Phiên bản package hiện tại:

```text
0.4.5
```

Không có lý do để đổi stack trong vòng tiếp theo.

### Khuyến nghị

**GIỮ NGUYÊN STACK.**

Không:

- chuyển framework;
- viết lại SPA;
- chuyển database;
- thay Auth;
- thay Mastery Engine;
- đưa microservice vào;
- đổi sang mobile app native.

---

# 4. IA / Sidebar — đã sửa đúng hướng

Project hiện đã có:

```text
frontend/src/config/navigation.js
```

Staff navigation được gom thành:

```text
Học sinh & Học tập
Ngân hàng & Nội dung
Tạo & Giao bài
Báo cáo & Phân tích
Quản trị hệ thống
```

Student navigation:

```text
Trang học tập
Tự luyện
Bài được giao
Hồ sơ học tập
Tài khoản
```

Đây là cải tiến đúng.

## Tuy nhiên

Sidebar vẫn thiên về:

> “các module hệ thống”

hơn là:

> “các việc giáo viên cần làm”.

Ví dụ:

```text
Báo cáo
Phân tích
Thống kê ngân hàng
```

vẫn có thể khó hiểu với GV mới.

### Hướng vòng sau

Không thay group lớn nữa.

Thay vào đó:

- chuẩn hóa wording;
- đưa các workflow phổ biến lên quick actions;
- giảm entry trùng nghĩa;
- làm landing page theo nhiệm vụ;
- ẩn chức năng nâng cao khỏi người không cần.

---

# 5. Workspace Home — còn mang tính menu thứ hai

Nếu màn Staff Home chỉ có các card:

```text
Học sinh & Học tập
Ngân hàng & Nội dung
Tạo & Giao bài
...
```

thì thực chất:

> sidebar được lặp lại ở content area.

## Staff Home nên chuyển thành:

### Việc cần chú ý

Ví dụ:

```text
5 học sinh chưa luyện trong 7 ngày
3 học sinh có xu hướng giảm
2 bài giao sắp hết hạn
18 câu đang chờ duyệt
```

### Quick actions

```text
+ Giao bài
+ Thêm học sinh
+ Nhập câu hỏi
Xem lớp cần chú ý
```

### Recent work

```text
Bài vừa giao
Import gần đây
Kho câu vừa cập nhật
```

Như vậy Home trở thành:

> **trang ra quyết định**

không phải:

> **một menu khác**.

---

# 6. Student Portfolio — về kiến trúc đã khá đầy đủ

Project đã có subsystem Portfolio riêng:

```text
backend/src/services/practice/portfolio.js
backend/src/services/practice/portfolioRules.js

frontend/src/pages/practice/portfolio/
```

Các phần:

```text
StudentPortfolio
PortfolioOverview
AttemptHistory
AttemptReview
MasteryPortfolio
AssignmentPortfolio
ClassTimeline
```

Đây là thiết kế tốt.

Portfolio có:

```text
Tổng quan
Lịch sử làm bài
Thành thạo
Bài được giao
Lớp học
```

Không cần tạo Portfolio V2/V3 mới.

---

# 7. Điểm cần cải thiện lớn của Portfolio: “dữ liệu” nhiều hơn “ý nghĩa”

Hiện Portfolio đã trả lời tốt câu hỏi:

> Có bao nhiêu dữ liệu?

nhưng chưa luôn trả lời tốt:

> Dữ liệu này nói gì với học sinh / giáo viên?

Ví dụ:

```text
M3 — 0%
Confidence LOW
```

về kỹ thuật là đúng.

Nhưng về sư phạm:

> HS có thể hiểu “em không biết gì”.

Trong khi ý nghĩa thực tế có thể là:

> “chưa có đủ dữ liệu”.

## Quy tắc UX nên đổi

### Khi Confidence LOW

Không lấy % làm headline.

Thay:

```text
0%
Độ tin cậy thấp
```

bằng:

```text
Chưa đủ dữ liệu
8 câu · 1 lượt
```

Percentage có thể nhỏ hơn:

```text
Kết quả hiện tại: 0%
```

và tooltip:

> Chưa đủ dữ liệu để kết luận mức thành thạo.

---

# 8. Quy tắc trình bày Mastery nên được chuẩn hóa

## Confidence LOW

Headline:

```text
Chưa đủ dữ liệu
```

Không kết luận:

```text
Cần củng cố
Thành thạo
```

quá mạnh.

## Confidence MEDIUM/HIGH

Mới dùng:

```text
Cần củng cố
Đang hình thành
Khá thành thạo
Thành thạo
```

### Ví dụ

```text
Điện xoay chiều · M3

58%
Đang hình thành
Độ tin cậy: Cao
32 câu · 4 lượt
```

so với:

```text
Dao động cơ · M4

Chưa đủ dữ liệu
8 câu · 1 lượt
Kết quả hiện tại: 88%
```

---

# 9. Student Home — nên chuyển mạnh từ analytics sang action

Student Home hiện đã được tách khỏi full Portfolio.

Đây là đúng.

Nhưng Home vẫn nên giảm analytics.

## Student Home mục tiêu

Trong 5 giây, HS biết:

1. Có bài nào phải làm?
2. Có bài đang làm dở không?
3. Nên luyện gì?
4. Bấm đâu để luyện?

### Thứ tự đề xuất

```text
Chào Minh 👋

[Tiếp tục bài đang làm]
12/20 câu · Điện xoay chiều

[Bài được giao]
2 bài cần hoàn thành

[Nội dung nên luyện]
Điện xoay chiều · M3

[Bắt đầu tự luyện]

Tiến bộ gần đây
mini chart

Xem hồ sơ học tập đầy đủ →
```

Không đặt 6 KPI ở đầu mobile.

---

# 10. Mobile Portfolio — vẫn là điểm cần polish mạnh

Hiện mobile đã không vỡ layout.

Nhưng vấn đề là:

> trang quá dài.

History hiện 20 lượt/page trên mobile có thể tạo một scroll rất dài.

## Đề xuất

Mobile:

```text
10 lượt / page
```

hoặc:

```text
Xem thêm 10 lượt
```

Desktop giữ:

```text
20 lượt / page
```

---

# 11. Mobile Overview — cần progressive disclosure

Không show tất cả cùng lúc.

### Mặc định

```text
4 KPI chính
1 progress signal
2 focus topics
3 recent activities
```

Các chỉ số phụ nằm trong:

```text
Xem thêm
```

---

# 12. Portfolio tabs mobile

Tabs:

```text
Tổng quan
Lịch sử
Thành thạo
Bài giao
Lớp học
```

có thể overflow ngang.

Cần:

- fade indicator;
- scroll snapping;
- hoặc dropdown khi viewport hẹp.

Người dùng phải nhận ra còn tab bên phải.

---

# 13. Attempt History — đã rất tốt về backend

Backend hiện đã có:

- server pagination;
- filter;
- subject;
- topic;
- source;
- status;
- mode;
- assignment;
- date;
- min/max score.

Đây đã đủ V1.

Không cần thêm Elasticsearch.

Không cần analytics warehouse.

---

# 14. Attempt Review — đúng hướng dữ liệu

Một điểm kỹ thuật quan trọng:

Review lịch sử dùng:

```text
attempt_items.question_version_id
```

không dùng:

```text
questions.current_version_id
```

Đây là thiết kế đúng.

Có nghĩa:

> câu hỏi sau này được sửa vẫn không thay đổi bài HS đã từng làm.

Phải giữ nguyên nguyên tắc này.

---

# 15. Teacher Dashboard — đã tốt hơn trước

Flow hiện tại đã chuyển từ:

```text
Teacher page
→ embed StudentDashboard ngay dưới
```

sang:

```text
Teacher page
→ click HS
→ Student Portfolio
```

Đây là thay đổi tốt.

Không quay lại kiểu inline dashboard.

---

# 16. Teacher Dashboard vẫn cần “decision-first”

Top nên ưu tiên:

```text
3 HS cần chú ý
4 HS chưa luyện
2 bài sắp hết hạn
```

hơn:

```text
số lượt
số câu
average
...
```

GV cần:

> biết phải làm gì tiếp.

---

# 17. Quản lý học sinh — lõi đủ tốt

Hiện đã có:

- search;
- filter;
- thêm;
- sửa;
- chuyển lớp;
- reset password;
- khóa/mở;
- class history;
- Portfolio.

Đây đã đủ cho Pilot.

Không biến app thành SIS.

Không thêm các trường không cần thiết như:

- CCCD;
- địa chỉ nhà;
- hồ sơ cha mẹ;
- sức khỏe;
- dữ liệu nhạy cảm.

---

# 18. Row actions — hướng hiện tại đúng

Ưu tiên:

```text
Xem hồ sơ
⋯
```

Menu:

```text
Sửa
Reset mật khẩu
Chuyển lớp
Khóa/Mở
Lịch sử lớp
```

Đây là thiết kế tốt.

Giữ.

---

# 19. Roster Preview — đã triển khai

Project hiện có:

```text
Upload
→ Preview
→ Confirm
```

State:

```text
NEW
UPDATE
UNCHANGED
CONFLICT
ERROR
```

Đây là đúng.

### Hạn chế hiện tại

Preview token/state nằm trong memory process.

Nếu:

```text
1 server
1 Node process
```

thì ổn.

Nếu scale:

```text
multiple workers
multiple app instances
```

thì preview có thể mất / lệch.

### V1 Pilot

Có thể chấp nhận single-process.

### Production scale

Chuyển preview job vào:

```text
PostgreSQL
```

hoặc:

```text
Redis
```

sau.

Không ưu tiên trước Pilot nhỏ.

---

# 20. Mastery Engine — không nên tiếp tục chỉnh

Mastery hiện có:

- level;
- confidence;
- trend;
- unique questions;
- attempts;
- raw history.

Đủ tốt cho Pilot.

## Không nên

- dùng AI tính mastery;
- đổi formula ngay;
- thêm mô hình psychometric;
- thêm IRT;
- thêm adaptive engine phức tạp.

Cần dữ liệu thật trước.

---

# 21. Dữ liệu “Câu đã luyện” — cần sửa semantics

Một metric kiểu:

```text
Câu đã luyện
```

nếu đếm tất cả attempt_items, kể cả skipped, có thể gây hiểu sai.

Nên phân biệt:

```text
Câu trong các lượt luyện
Câu đã trả lời
Câu khác nhau
```

Ví dụ:

```text
612 câu trong các lượt luyện
578 câu đã trả lời
421 câu khác nhau
```

---

# 22. Board / Viewer — cần chuẩn hóa business rule

Hiện permission phần Portfolio phụ thuộc class/subject scope.

Điều này hợp với Teacher.

Nhưng cần định nghĩa rõ:

## board

Có thể là:

```text
read-only theo cấp / khối / phạm vi được giao
```

## viewer

```text
read-only theo explicit scope
```

Không mặc định:

```text
toàn trường
```

trừ khi Admin cấp.

---

# 23. BGH không nên phải được “giả làm giáo viên”

Nếu BGH cần xem toàn khối:

không nên bắt gán:

```text
teacher_class_assignment
```

cho từng lớp/môn.

Cần abstraction scope riêng:

```text
user_scope
```

hoặc tái sử dụng permission system hiện có nếu đủ.

Nhưng không refactor lớn nếu Pilot chưa cần.

---

# 24. UI wording — cần giảm thuật ngữ kỹ thuật

Không show cho HS:

```text
confidence
mastery state
attempt
retry
```

nếu không cần.

Map:

```text
Confidence → Độ tin cậy
Attempt → Lượt luyện
Retry → Luyện lại
Source → Nguồn bài
```

---

# 25. Tooltip sư phạm

### Mastery

> Mức thành thạo được cập nhật từ các lượt luyện gần đây.

### Confidence

> Độ tin cậy phản ánh lượng dữ liệu luyện tập, không phải điểm số.

### Trend

> Xu hướng được tính từ các kết quả gần đây.

---

# 26. Bundle frontend — vấn đề kỹ thuật đáng chú ý

Build hiện tại khoảng:

```text
~812–840 kB JavaScript minified
~239–247 kB gzip
```

Vite cảnh báo:

```text
chunk > 500 kB
```

Không phải lỗi.

Nhưng với:

- mobile;
- wifi trường;
- nhiều HS cùng truy cập;

nên tối ưu.

---

# 27. Bundle optimization — vòng sau nên làm

Ưu tiên route-level lazy loading:

```text
Questions
Matrix
Exams
Analysis
Portfolio
Import
Admin
```

Dùng:

```js
React.lazy()
Suspense
```

Không cần micro-bundle quá mức.

---

# 28. Vendor split

Có thể split:

```text
react
react-router
katex
markdown
```

qua Vite manualChunks nếu cần.

Nhưng đo trước/sau.

Không chỉ tắt warning.

---

# 29. Student initial bundle phải nhẹ

Student login không cần tải:

- Question Bank editor;
- Matrix;
- QTI importer;
- Admin;
- Reports.

Đây là mục tiêu quan trọng nhất của code splitting.

---

# 30. Source package hiện tại đã sạch hơn bản trước

Trong bản extracted hiện tại, chỉ thấy:

```text
.env.production.example
backend/.env.example
```

không thấy:

```text
.env thật
bootstrap-admin.secret.json
node_modules
```

trong project extracted đang audit.

Đây là điểm tốt.

Giữ nguyên policy:

- không đóng secrets;
- không đóng node_modules;
- không đóng uploads;
- không đóng backup production.

---

# 31. Release artifact nên chuẩn hóa

Tạo script:

```text
npm run package:release
```

hoặc:

```text
scripts/package-release.mjs
```

Output:

```text
nganhang-personalized-v1-YYYYMMDD.zip
```

chỉ chứa:

- source;
- migrations;
- docs;
- templates;
- lock files;
- compose;
- Dockerfile.

---

# 32. Production readiness — hiện còn thiếu nghiệm thu thật

Docs self-host đã có.

Nhưng production chưa được chứng minh bằng:

- Ubuntu server thật;
- domain thật;
- HTTPS thật;
- restart thật;
- concurrent users;
- backup remote;
- disaster restore;
- log rotation;
- storage capacity.

---

# 33. Pilot production gate

Không mở cho HS thật trước khi đạt:

```text
P0.1 HTTPS
P0.2 production secrets
P0.3 automated backup
P0.4 restore test
P0.5 database persistence
P0.6 upload persistence
P0.7 account/password policy
P0.8 board/viewer scope
P0.9 monitoring
P0.10 rollback plan
```

---

# 34. Backup

Không chỉ:

```text
backup thành công
```

mà phải:

```text
restore thành công sang nơi khác
```

Test:

```text
backup
destroy test DB
restore
compare row counts/checksum
```

---

# 35. Backup destination

Không để backup duy nhất:

```text
cùng ổ cứng server
```

Cần:

```text
server → external NAS/disk/another machine
```

hoặc object storage nếu sau này trường chấp nhận.

---

# 36. Monitoring tối thiểu

Không cần Prometheus/Grafana ngay.

V1 có thể:

- `/api/health`;
- disk usage script;
- DB connectivity;
- backup last success;
- app restart count;
- error log size.

---

# 37. Concurrent Pilot test

Trước Pilot nên test:

```text
30
50
100
```

student sessions.

Flow:

```text
login
create attempt
save 20 answers
submit
dashboard
```

Đo:

- latency;
- DB pool;
- CPU;
- RAM;
- disk;
- error rate.

---

# 38. Student login UX

Login cần:

- rõ mã HS;
- rõ mật khẩu;
- show/hide password;
- lỗi thân thiện;
- Caps Lock warning optional;
- mobile keyboard appropriate.

Không cần captcha V1 nếu rate limit tốt.

---

# 39. Password reset workflow

Current admin reset đủ Pilot.

Sau này có thể school SSO.

Không cần email/OTP ngay.

---

# 40. Practice Player — giữ engine

Player hiện đã đủ.

Vòng sau chỉ polish:

- typography;
- focus;
- question spacing;
- answer cards;
- submit warning;
- mobile sticky action.

Không rewrite.

---

# 41. Font size cho học sinh

Nội dung câu hỏi nên ưu tiên:

```text
16–18px mobile
17–19px desktop
```

metadata nhỏ hơn.

Không để câu hỏi nhìn như form admin.

---

# 42. Question max-width

Đọc dài dễ hơn khi:

```text
max-width ~800–900px
```

không kéo toàn chiều rộng màn lớn.

---

# 43. Math/image UX

Giữ:

- KaTeX;
- Rich renderer.

Cần kiểm:

- công thức dài;
- table rộng;
- ảnh lớn;
- zoom ảnh.

Có thể thêm:

```text
click image → lightbox
```

nếu đơn giản.

---

# 44. Accessibility — nên audit hệ thống

Chạy:

- keyboard-only;
- focus;
- aria;
- contrast;
- label;
- dialog focus trap.

Không cần đạt WCAG AAA.

Mục tiêu:

> WCAG 2.1 AA cơ bản cho flow chính.

---

# 45. Pilot content readiness

Kỹ thuật có thể tốt nhưng Pilot vẫn thất bại nếu kho câu không đủ.

Trước Pilot mỗi topic nên có:

```text
M1 >= N
M2 >= N
M3 >= N
M4 >= N
```

N phụ thuộc số HS/lượt.

---

# 46. Dữ liệu YCCĐ

Current local còn thiếu mapping YCCĐ.

Không tự gán.

Đây là vấn đề nội dung cần xử lý tách biệt khỏi software.

---

# 47. Pilot nên chọn scope nhỏ

Ví dụ:

```text
1 môn
1 khối
2–4 lớp
3–5 chuyên đề
2–3 tuần
```

Không toàn trường ngay.

---

# 48. KPI Pilot

### Adoption

```text
% HS kích hoạt
% HS có ít nhất 1 lượt
```

### Retention

```text
% HS quay lại tuần 2
```

### Usage

```text
attempt/HS
questions/HS
active days
```

### Learning

```text
Mastery delta
topic mastery improvement
confidence growth
```

### UX

```text
attempt completion rate
resume rate
abandon rate
support incidents
```

---

# 49. Không dùng KPI sai

Không xem:

```text
page views
```

là KPI chính.

Không lấy:

```text
average score lớp
```

làm KPI thành công duy nhất.

---

# 50. Trạng thái hiện tại — chốt

## Đã đủ tốt để giữ

```text
Question schema
Import architecture
Practice Engine
Grading
Mastery
Student CRUD
Class history
Assignments
Portfolio architecture
Attempt History
Attempt Review
Sidebar groups
Roster Preview
```

## Cần polish

```text
Workspace Home
Student Home
Portfolio semantics
Mobile density
Teacher decision UI
Wording
Mastery LOW confidence presentation
```

## Cần harden

```text
Board/viewer permission
Bundle
Production deploy
Backup remote
Restore drill
Load test
Monitoring
Release package
```

---

# PHẦN II — MEGA PROMPT VÒNG TIẾP

# MEGA PROMPT V5 — PRODUCT POLISH + PILOT READINESS

## 0. Mệnh lệnh nền

Bạn đang làm việc trên repo hiện tại:

```text
nganhang-personalized-v1
```

Đây là project đã triển khai gần đầy đủ V1.

**KHÔNG xây lại hệ thống.**

**KHÔNG tạo Portfolio mới.**

**KHÔNG tạo Practice Engine mới.**

**KHÔNG thay Mastery Engine.**

**KHÔNG reset DB.**

**KHÔNG thay framework.**

Vòng này tập trung vào:

```text
PRODUCT POLISH
+
PILOT READINESS
```

---

# 1. Đọc các tài liệu hiện tại trước

Bắt buộc đọc:

```text
docs/MEGA_V4_CURRENT_AUDIT.md
docs/V4_UX_PORTFOLIO_HANDOFF.md
docs/STUDENT_PORTFOLIO.md
docs/VERIFICATION_REPORT.md
docs/ARCHITECTURE.md
docs/SELF_PRACTICE.md
docs/QUAN_LY_HOC_SINH.md
docs/DEPLOYMENT_SELF_HOST.md
docs/BACKUP_RESTORE.md
docs/ROLES_PERMISSIONS.md
```

Sau đó mở code:

```text
frontend/src/config/navigation.js
frontend/src/components/Layout.jsx
frontend/src/pages/practice/WorkspaceHome.jsx
frontend/src/pages/practice/StudentHome.jsx
frontend/src/pages/practice/Teacher.jsx
frontend/src/pages/practice/Students.jsx
frontend/src/pages/practice/Player.jsx
frontend/src/pages/practice/portfolio/*

backend/src/services/practice/portfolio.js
backend/src/services/practice/portfolioRules.js
backend/src/services/practice/authorization.js
backend/src/services/practice/attempts.js
backend/src/services/practice/mastery.js
backend/src/services/practice/roster.js
backend/src/routes/practice.js
```

---

# 2. Baseline first

Trước mọi thay đổi:

```bash
cd backend
npm test
npm run test:integration

cd ../frontend
npm run build
```

Nếu release script có sẵn:

```bash
node scripts/verify-release.mjs
```

Tạo:

```text
docs/V5_PRODUCT_POLISH_AUDIT.md
```

Table:

```text
Requirement
Current behavior
Keep
Polish
Fix
Risk
```

Không dừng ở audit.

---

# 3. Scope của V5

V5 gồm 7 workstreams:

```text
A. Staff Workspace UX
B. Student UX
C. Portfolio semantic polish
D. Mobile & Accessibility
E. Permission hardening
F. Performance
G. Production/Pilot hardening
```

Không mở scope sang AI recommendation, LTI hay gamification.

---

# 4. WORKSTREAM A — STAFF WORKSPACE UX

## A1. Staff Home phải trở thành decision dashboard

Hiện nếu Staff Home chủ yếu là workspace cards/navigation shortcuts:

refactor.

Top section:

```text
Việc cần chú ý
```

Ví dụ:

```text
5 học sinh chưa luyện trong 7 ngày
3 học sinh có xu hướng giảm
2 bài giao sắp đến hạn
18 câu chờ duyệt
```

Chỉ dùng dữ liệu có thật.

Nếu chưa có API cho một metric:
không fake.

---

# 5. Quick actions

Top actions:

```text
+ Giao bài
+ Thêm học sinh
+ Nhập câu hỏi
Xem tiến độ lớp
```

Theo role.

---

# 6. Không lặp sidebar

Không render lại toàn bộ 5 navigation groups thành 5 card lớn nếu không tạo thêm giá trị.

Workspace cards nếu giữ:
chỉ dùng secondary section.

---

# 7. Teacher Dashboard decision-first

Top 4 signals:

```text
Chưa luyện
Cần củng cố
Xu hướng giảm
Bài chưa hoàn thành
```

Không quá 4–5 KPI.

---

# 8. Teacher class list

Tên HS là primary navigation.

Click:

```text
Portfolio
```

Giữ.

Row không quá dày.

---

# 9. Filter Teacher

Desktop:

```text
Môn
Lớp
Chủ đề
Mức
```

Mobile:

```text
[Bộ lọc]
```

Drawer/accordion.

---

# 10. WORKSTREAM B — STUDENT UX

Student Home phải action-first.

Thứ tự:

```text
Greeting
Resume attempt
Assignments due
Focus topic
Start practice
Recent progress
Portfolio link
```

---

# 11. Student Home KPI

Không đặt >4 KPI ở đầu.

Nếu có:

```text
Lượt luyện
Câu đã trả lời
Ngày hoạt động
Mastery summary
```

secondary.

---

# 12. Resume card

Nếu có in-progress:

đây là card ưu tiên 1.

```text
Tiếp tục bài đang làm
12/20 câu
Điện xoay chiều
```

---

# 13. Assignment card

Nếu có:

```text
2 bài cần hoàn thành
```

show.

Không dump list toàn bộ.

---

# 14. Focus card

Rule-based.

Không AI.

Ví dụ:

```text
Nội dung nên luyện
Điện xoay chiều · M3
```

Nếu confidence LOW:

```text
Cần thêm dữ liệu
```

không “cần củng cố”.

---

# 15. Practice CTA

Một primary CTA:

```text
Bắt đầu tự luyện
```

Không 3 nút cùng priority.

---

# 16. Student wording

Không dùng thuật ngữ raw:

```text
attempt
retry
confidence
source
```

UI map:

```text
Lượt luyện
Luyện lại
Độ tin cậy
Nguồn bài
```

---

# 17. WORKSTREAM C — PORTFOLIO SEMANTIC POLISH

Không thay API architecture nếu không cần.

Mục tiêu:

> từ dashboard dữ liệu → hồ sơ học tập dễ hiểu.

---

# 18. Confidence LOW rule

Đây là requirement bắt buộc.

Nếu:

```text
confidence == LOW
```

không dùng percentage làm headline.

Headline:

```text
Chưa đủ dữ liệu
```

Sub:

```text
8 câu khác nhau · 1 lượt
```

Optional small text:

```text
Kết quả hiện tại: 88%
```

---

# 19. Confidence MEDIUM/HIGH

Mới dùng classification mạnh.

```text
<50
Cần củng cố

50–69
Đang hình thành

70–84
Khá thành thạo

>=85
Thành thạo
```

---

# 20. Tooltip Mastery

Add help:

> Mức thành thạo ưu tiên kết quả gần đây và được cập nhật sau mỗi lượt luyện hoàn thành.

---

# 21. Tooltip Confidence

> Độ tin cậy phản ánh lượng dữ liệu luyện tập, không phải điểm số.

---

# 22. Metrics semantics

Audit:

```text
Câu đã luyện
```

Nếu backend includes skipped:

rename.

Target:

```text
Câu trong các lượt luyện
Câu đã trả lời
Câu khác nhau
```

Do not change historical raw data.

---

# 23. Portfolio Overview desktop

Target layout:

```text
Student header

4 key metrics

Recent progress chart

Focus areas
Strong areas

Recent activity

View full history
```

Không show 6–10 cards ngang nhau.

---

# 24. Portfolio Overview mobile

Default:

```text
4 metrics
1 progress signal
2 focus topics
3 activities
```

Secondary:

```text
Xem thêm
```

---

# 25. History mobile page size

Use:

```text
10
```

default on narrow screens if API/client can choose.

Desktop:

```text
20
```

---

# 26. Mobile tabs

Implement affordance:

- fade edge;
- arrow hint;
- scroll snap;
- or select on <480px.

User must know tabs are scrollable.

---

# 27. Attempt Review visual hierarchy

Question metadata should be secondary.

Primary:

```text
Câu hỏi
Câu trả lời của em
Kết quả
```

Secondary:

```text
M2
TN
version
selection reason
```

Staff-only technical info can collapse.

---

# 28. Review default expansion

For long attempts:

default expand:

```text
wrong
partial
uncertain
skipped
```

and collapse correct items if UI currently too long.

Student can:

```text
Xem tất cả
```

---

# 29. Print Portfolio

Keep current print.

Polish:

- no excessive card borders;
- meaningful headings;
- confidence wording.

---

# 30. WORKSTREAM D — MOBILE + ACCESSIBILITY

Test widths:

```text
390 × 844
430 × 932
768 × 1024
1366 × 768
1440 × 900
```

---

# 31. Typography

Student question:

```text
>=16px mobile
```

Prefer:

```text
17–18px
```

Line height:

```text
1.5+
```

---

# 32. Touch

All actionable:

```text
>=44px
```

---

# 33. Focus

Keyboard:

- nav;
- modal;
- answers;
- filters;
- Portfolio tabs.

---

# 34. Dialog focus

Confirm submit/reset etc:
focus trapped if custom modal.

Escape closes where safe.

---

# 35. ARIA

Audit:

```text
aria-current
aria-expanded
aria-live
labels
buttons
```

---

# 36. Contrast

Check primary/muted/status.

Do not rely only on color.

---

# 37. Player question width

Desktop:

```text
max-width 850–900px
```

for readability.

---

# 38. Player image

Images:

```text
max-width: 100%
height: auto
```

Optional lightbox only if low-risk.

---

# 39. Player table/math overflow

Wrap with horizontal scroll only where necessary.

No viewport overflow.

---

# 40. Submit confirm

If unanswered / uncertain:

show:

```text
3 câu chưa trả lời
2 câu đánh dấu chưa chắc
```

Buttons:

```text
Quay lại xem
Vẫn nộp bài
```

---

# 41. WORKSTREAM E — PERMISSION HARDENING

Audit roles:

```text
admin
teacher
dept_leader
grade_leader
board
viewer
student
```

---

# 42. Teacher

Keep:

```text
class AND subject
```

scope for learning data.

---

# 43. Board/viewer

Define explicit behavior.

Recommended:

## board

Read-only based on assigned organization scope.

## viewer

Read-only explicit scope.

Do not implicitly grant all-school.

---

# 44. Do not force board to fake teacher assignments

If current architecture forces this:

design a minimal read-scope abstraction.

Example conceptual:

```text
user_data_scopes
```

Fields:

```text
user_id
scope_type
scope_id
permission
```

But ONLY implement migration if business need is confirmed by existing product requirements.

If not required for Pilot:
document limitation.

---

# 45. Portfolio access tests

Add:

```text
teacher same class same subject → allow
teacher same class wrong subject → deny
teacher other class → deny
board authorized scope → allow
viewer unauthorized → deny
student own → allow
student other → deny
```

---

# 46. No frontend-only permission

Server always authority.

---

# 47. WORKSTREAM F — PERFORMANCE

Current bundle is >500 kB minified warning.

Do not silence warning.

---

# 48. Route-level lazy loading

High-priority pages:

```text
Questions
Matrix
Exams
Analysis
Reports
Import
Admin
Portfolio
```

Use:

```js
React.lazy()
Suspense
```

---

# 49. Student bundle goal

Student initial load must not include staff-only editor modules.

Measure before/after.

---

# 50. manualChunks

Optional after route split.

Potential vendor chunks:

```text
react
router
markdown
katex
```

Only if build output improves.

---

# 51. Performance acceptance

Record:

```text
before JS size
after JS size
initial student route chunks
```

Do not claim faster without evidence.

---

# 52. Network test

Use DevTools/Playwright optional:

```text
Fast 3G
Slow 4G
```

Check Student Home / Practice start.

---

# 53. WORKSTREAM G — PILOT HARDENING

No production claims until run on actual target.

---

# 54. Self-host target

Target:

```text
Ubuntu Server
Docker Compose
PostgreSQL
App
Caddy
HTTPS
Storage volume
Backup
```

---

# 55. Production environment

Use:

```text
.env.production
```

created manually.

Never commit.

---

# 56. Required production smoke

On actual server:

```text
GET /api/health
login
student practice
autosave
submit
portfolio
teacher view
import sample
restart
re-login
```

---

# 57. HTTPS

Must verify:

```text
valid certificate
HTTP → HTTPS
secure cookies/settings as applicable
```

---

# 58. Ports

Public:

```text
80
443
```

Do not expose:

```text
5432
internal admin
```

---

# 59. DB persistence

Test:

```text
create demo record
docker compose restart
record persists
```

---

# 60. Media persistence

Upload sample image/question.

Restart.

Verify available.

---

# 61. Backup

Automated daily.

Record:

```text
last_success
file size
checksum
```

---

# 62. Off-device backup

Required before real Pilot.

Example:

```text
NAS
another server
external disk
```

---

# 63. Restore drill

Restore into separate environment.

Verify:

```text
users
questions
attempts
mastery
media
```

---

# 64. Disaster procedure

Document:

```text
server disk dies
```

Steps:

1. install Ubuntu;
2. clone release;
3. restore env;
4. start Compose;
5. restore DB;
6. restore media;
7. verify;
8. DNS.

---

# 65. Monitoring

Minimal script/dashboard:

```text
health
DB
disk
backup
errors
uptime
```

No Grafana required V1.

---

# 66. Log rotation

Ensure logs do not fill disk.

Docker logging limit or logrotate.

---

# 67. Load test

Create safe test script.

Target sequence:

```text
30 concurrent
50 concurrent
100 concurrent
```

Flow:

```text
login
open builder
create 20-question attempt
save answers
submit
portfolio
```

Use test DB/accounts.

---

# 68. Load metrics

Collect:

```text
p50
p95
error rate
CPU
RAM
DB connections
```

---

# 69. Pilot recommendation

If 50 concurrent is stable:
likely enough for initial 2–4 classes.

Do not extrapolate to whole school without data.

---

# 70. Release package

Create:

```text
scripts/package-release.mjs
```

or equivalent.

Exclude:

```text
.env
secret
node_modules
uploads
backups
test DB
artifacts not needed
```

---

# 71. Release manifest

Include:

```text
version
date
git commit if available
migration checksum
frontend build hash
```

---

# 72. Version bump

Consider:

```text
0.5.0
```

after V5 if product behavior materially changes.

Do not bump if project convention differs.

---

# 73. Pilot Metrics UX

Admin Pilot screen should prioritize:

```text
Activated
Practiced
Returned
Completed
Mastery improved
```

Not vanity metrics.

---

# 74. Retention

Add:

```text
7-day return
```

if data sufficient.

---

# 75. Active day

Keep distinct completed attempt days.

---

# 76. Support signal

Log/report:

```text
failed login
autosave errors
attempt finalize errors
import errors
```

aggregate only.

No sensitive response logging.

---

# 77. Error monitoring

At minimum:
structured server errors with request ID.

No password/body logging.

---

# 78. Product copy polish

Audit all student-facing Vietnamese.

Avoid:

```text
provisional
partial
confidence low
```

raw.

---

# 79. Staff copy

Can be more technical but still Vietnamese.

---

# 80. Empty states

Examples:

```text
Chưa có lượt luyện
Chưa có bài được giao
Chưa đủ dữ liệu để đánh giá
```

with appropriate CTA.

---

# 81. Content picker

Do not change education data.

Do not infer missing YCCĐ.

---

# 82. YCCĐ gap

Keep warning.

Do not auto-fill.

---

# 83. Practice default

Keep:

```text
TN
ĐS
TLN
GN
```

TL off.

---

# 84. Essay

Keep self-check.

---

# 85. Mastery

Keep algorithm.

---

# 86. Retry

Keep new attempt.

---

# 87. In-progress

No mastery update.

---

# 88. Question selection

Keep unseen priority.

---

# 89. Historical version

Keep.

Critical.

---

# 90. Portfolio history

Keep immutable.

---

# 91. Roster preview

Keep current.

Single-process limitation documented.

---

# 92. Optional abandon attempt

Still optional.

If implemented:

```text
status=abandoned
no mastery
no delete
```

Do not prioritize over Pilot readiness.

---

# 93. No new AI features

Do not add:

```text
chatbot
AI answer
AI grading
adaptive AI
```

---

# 94. No leaderboard

Explicit.

---

# 95. No parent portal

Out of scope.

---

# 96. No mobile native app

Responsive web only.

---

# 97. No deep Canvas/LTI in V5

Keep docs.

Pilot link integration enough.

---

# 98. Testing after each workstream

Run relevant tests.

Final run must be after all changes.

---

# 99. Final backend tests

```bash
npm test
npm run test:integration
```

---

# 100. Final frontend

```bash
npm run build
```

---

# 101. Security audit

```bash
npm audit
```

Record remaining vulnerabilities honestly.

---

# 102. Bundle report

Store:

```text
artifacts/v5-build.log
artifacts/v5-bundle-report.md
```

---

# 103. Visual QA screenshots

Required:

```text
v5-workspace-home-desktop.png
v5-student-home-mobile.png
v5-portfolio-low-confidence.png
v5-portfolio-overview-mobile.png
v5-history-mobile.png
v5-player-mobile.png
v5-teacher-class.png
v5-sidebar-mobile.png
```

---

# 104. Visual manual review

Reject if:

- too many cards;
- small text;
- too much metadata;
- long empty whitespace;
- unbalanced buttons;
- unclear primary action;
- mobile scroll unnecessarily long.

---

# 105. UX acceptance question

Ask internally:

> A new student opens the app. Can they know what to do in 5 seconds?

If no:
not done.

---

# 106. Teacher acceptance question

> A teacher opens the app. Can they find “who needs attention?” in under 30 seconds?

If no:
not done.

---

# 107. Portfolio acceptance question

> Can a parent/teacher understand a LOW-confidence 90% without thinking the child has mastered the topic?

If no:
not done.

---

# 108. Mobile acceptance question

> Is the important action visible before analytics?

If no:
not done.

---

# 109. Pilot acceptance question

> Can the server lose power and recover without losing persisted DB/media?

If not verified:
not production-ready.

---

# 110. Backup acceptance question

> Has a backup actually been restored successfully on a different target?

If no:
not production-ready.

---

# 111. Performance acceptance question

> Does student login load staff-only code?

If yes:
continue splitting.

---

# 112. Permission acceptance question

> Can a teacher infer/read a student's attempt from another subject?

If yes:
critical bug.

---

# 113. Final Definition of Done — UX

- [ ] Staff Home action-oriented.
- [ ] Student Home action-oriented.
- [ ] LOW confidence no misleading headline percentage.
- [ ] Portfolio mobile compact.
- [ ] History mobile reasonable length.
- [ ] Tooltips explain Mastery/Confidence.
- [ ] Student wording polished.
- [ ] Teacher workflow decision-first.

---

# 114. Definition of Done — performance

- [ ] route lazy loading;
- [ ] student initial route excludes staff modules;
- [ ] before/after bundle recorded;
- [ ] no build regression.

---

# 115. Definition of Done — permissions

- [ ] teacher class+subject;
- [ ] board/viewer policy documented/tested;
- [ ] no cross-student;
- [ ] no cross-subject.

---

# 116. Definition of Done — production

For true Production Ready:

- [ ] Ubuntu/Docker smoke;
- [ ] HTTPS;
- [ ] DB volume persistence;
- [ ] media persistence;
- [ ] external backup;
- [ ] restore drill;
- [ ] monitoring;
- [ ] log rotation;
- [ ] load test.

If these were not run:
final report must say:

```text
Pilot code ready; production infrastructure verification pending.
```

---

# 117. Definition of Done — source/release

- [ ] no secret;
- [ ] no node_modules;
- [ ] release package script;
- [ ] release manifest.

---

# 118. Documentation updates

Update:

```text
docs/USER-GUIDE.md
docs/STUDENT_PORTFOLIO.md
docs/DEPLOYMENT_SELF_HOST.md
docs/BACKUP_RESTORE.md
docs/ROLES_PERMISSIONS.md
docs/PILOT_METRICS.md
docs/VERIFICATION_REPORT.md
```

Create:

```text
docs/V5_PRODUCT_POLISH_AUDIT.md
docs/V5_PILOT_READINESS.md
```

---

# 119. Final report format

AI must answer:

## 1. Baseline

Tests/build before.

## 2. UX changes

Concrete.

## 3. Portfolio semantics

LOW confidence etc.

## 4. Mobile

Changes.

## 5. Permission

Board/viewer/teacher.

## 6. Performance

Before/after bundles.

## 7. Production verification

What actually ran.

## 8. Backup/restore

Evidence.

## 9. Load test

Evidence.

## 10. Tests

Commands/results.

## 11. Artifacts

Paths.

## 12. Known limitations

Truthful.

---

# 120. Không được báo DONE giả

Không DONE nếu:

- chỉ đổi CSS;
- không xử lý Confidence LOW;
- Student Home vẫn analytics-first;
- mobile Portfolio vẫn quá dài;
- route split không đo bundle;
- production chưa test nhưng gọi production-ready;
- backup chỉ tạo mà chưa restore;
- board/viewer scope mơ hồ;
- không chạy final tests.

---

# 121. Priorities nếu context/thời gian bị giới hạn

Không bỏ toàn bộ scope.

Thứ tự:

```text
P0
Permission correctness
Confidence semantics
Student/Teacher critical UX
Backup/restore production gate

P1
Mobile Portfolio
Staff Workspace
Performance split
Load test

P2
Visual polish
Release packaging
Minor copy
```

---

# 122. Kết luận yêu cầu cho coding agent

Repo hiện tại **đã đủ chức năng cốt lõi**.

Không thêm hệ thống mới.

Mục tiêu vòng này là biến:

> một web app kỹ thuật đầy đủ chức năng

thành:

> **một sản phẩm giáo dục đủ đơn giản để học sinh dùng hàng ngày, đủ rõ để giáo viên ra quyết định, và đủ chắc để Pilot trên hạ tầng thật.**

Bắt đầu bằng audit hiện trạng.

Không reset.

Không rewrite.

Không thêm feature ngoài scope.

Chỉ kết luận hoàn thành sau khi:

```text
UX
Permissions
Performance
Production verification
Backup/restore
Tests
```

đều có bằng chứng.

---

# PHẦN III — ƯU TIÊN THỰC TẾ ĐỀ XUẤT CHO THẦY HIẾU

Nếu chỉ có một vòng AI coding tiếp theo, nên yêu cầu theo thứ tự:

## P0 — Làm trước Pilot

1. LOW-confidence UX.
2. Student Home action-first.
3. Teacher Dashboard decision-first.
4. Board/viewer permission.
5. Production HTTPS.
6. Backup ngoại vi.
7. Restore test.
8. Load test 30–50 HS.

## P1 — Ngay sau

9. Route code splitting.
10. Mobile Portfolio compact.
11. History 10/page mobile.
12. Tooltip Mastery/Confidence.
13. Staff Home action dashboard.
14. release packaging.

## P2 — Sau khi có dữ liệu Pilot

15. đánh giá retention;
16. tune Mastery presentation;
17. recommendation A;
18. sau nữa mới A+C.

---

# PHẦN IV — QUAN ĐIỂM SẢN PHẨM

Phiên bản hiện tại đã có đủ nền để ngừng “xây hệ thống” và bắt đầu “làm sản phẩm”.

Đây là một bước chuyển quan trọng.

Giai đoạn trước:

```text
Có chức năng chưa?
```

Giai đoạn tiếp:

```text
Người dùng có hiểu không?
Người dùng có quay lại không?
Dữ liệu có giúp ra quyết định không?
Hệ thống có chịu được học sinh thật không?
Có phục hồi được khi server lỗi không?
```

Đây mới là tiêu chuẩn phù hợp cho vòng tiếp theo.
