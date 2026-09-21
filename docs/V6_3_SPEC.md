# KIẾN TRÚC CHUẨN HÓA & MEGA PROMPT V6.3
## Ngân hàng câu hỏi – Outcome/YCCĐ Master – Smart Ingestion – Auto Matrix – Exam Generator – Learning Analytics
### Baseline: `nganhang-personalized-v5`
### KHTN 7 là reference implementation cho chuẩn Outcome/YCCĐ
### Trạng thái: CURRENT SPEC — ghi đè các quyết định cũ mâu thuẫn trong V6.1/V6.2
### Ngày: 14/09/2026

---

# 0. SOURCE OF TRUTH VÀ QUY TẮC GHI ĐÈ

File này là bản tổng hợp hiện hành.

Nếu nội dung trong V6/V6.1/V6.2 mâu thuẫn với V6.3, áp dụng V6.3.

Thứ tự ưu tiên khi triển khai:

```text
1. Current repo + migrations + tests thực tế
2. Quyết định CURRENT trong file V6.3 này
3. QUY_TAC_TAO_BO_CAU_HOI_KHTN_THEO_BAI_HIEN_TAI.md
4. CHUAN_PHAN_LOAI_MUC_DO_CHI_TIET.md
5. huong-dan-phan-loai-cau-hoi-4-muc-do-kem-tai-lieu.md
6. Các spec V6.2/V6.1/V6 cũ chỉ dùng làm background nếu không mâu thuẫn
```

Không reset database.

Không rewrite subsystem đã chạy tốt chỉ để “đồng bộ kiến trúc”.

---

# 1. CÁC QUYẾT ĐỊNH ĐÃ CHỐT

## 1.1. KHTN 7 làm chuẩn tham chiếu Outcome/YCCĐ

Quy ước KHTN:

```text
Phân môn L/H/S
→ Outcome đánh số lại từ 1 trong từng phân môn
→ YCCĐ đánh số lại từ 1 trong từng Outcome
```

Ví dụ:

```text
L.1
  L.1.1
  L.1.2
  L.1.3

L.2
  L.2.1
  L.2.2
```

KHTN 6, 8, 9 đã được chuẩn hóa theo logic này.

KHTN là **reference implementation**, không phải schema cứng của mọi môn.

---

## 1.2. Core Outcome/YCCĐ dùng chung toàn trường

Core:

```text
Subject
→ Grade
→ optional Domain / Mạch / Phân môn
→ Outcome
→ YCCĐ
```

Các môn không cần Domain được để trống.

Không bắt Toán/Văn/Anh giả lập L/H/S.

---

## 1.3. Metadata câu hỏi KHÔNG bắt buộc phải có sẵn trong file upload

Người dùng có thể upload:

```text
question_text
answer
```

cùng các field tùy chọn.

Outcome/YCCĐ/mức/dạng có thể để trống tại thời điểm upload.

Pipeline:

```text
UPLOAD
→ PARSE
→ IMPORTED_DRAFT
→ SMART METADATA SUGGESTION
→ PREVIEW
→ USER TICK / EDIT / BULK MAP
→ VALIDATE
→ CONFIRM
→ READY / APPROVED / ACTIVE
```

---

## 1.4. Metadata bắt buộc trước khi câu được đưa vào kho chính thức

Trước trạng thái:

```text
APPROVED
ACTIVE
```

câu phải có metadata bắt buộc theo Subject Profile.

Với KHTN:

```text
Subject
Grade
Domain L/H/S
Outcome
YCCĐ
Cognitive Level
Question Type
Question content
Answer representation
```

Không default im lặng.

---

## 1.5. AI/rule engine là trợ lý phân loại, không phải người phán quyết

AI được:

```text
suggest Outcome
suggest YCCĐ
suggest Cognitive Level
suggest Question Type
suggest Lesson/Topic
suggest Tags
```

AI không được:

```text
tạo Outcome/YCCĐ ngoài master
silent overwrite metadata file đã cung cấp
tự đổi mức không preview
tự Active câu khi confidence thấp
```

---

## 1.6. Auto Matrix phải dùng metadata chuẩn

Ma trận đề phải được xây từ:

```text
Outcome/YCCĐ
→ Cognitive Level
→ Question Type
→ Question Count
→ Score
```

Không chỉ:

```text
Phân môn × dạng × mức
```

---

# 2. TẦM NHÌN SẢN PHẨM

Hệ thống là:

> **Nền tảng học tập – đánh giá – quản trị nội dung – phân tích dữ liệu học tập dùng chung cho nhà trường.**

Các vòng phải khép kín:

```text
Curriculum Master
→ Question Bank
→ Matrix / Practice / Assignment
→ Attempt / Exam Evidence
→ Mastery / Analytics
→ Strength / Weakness
→ Action
→ Learning again
```

và:

```text
Question Usage
→ Question Quality
→ Needs Review
→ Content Improvement
```

---

# 3. DOMAIN ARCHITECTURE

Mô hình quyền:

```text
Identity
→ Position
→ Scope
→ Capability
→ Evidence/Data
```

Mô hình nội dung:

```text
Subject
→ Grade
→ optional Domain
→ Outcome
→ YCCĐ
→ Question
→ Question Version
```

Mô hình đánh giá:

```text
Assessment/Practice
→ Matrix Cell
→ Question Version
→ Student Response
→ Grade Result
```

---

# 4. ROLE / SCOPE — TÓM TẮT CURRENT

## 4.1. Một user có thể nhiều vai

Ví dụ:

```text
GV Vật lí 8A01
+
GVCN 7A01
+
Tổ trưởng KHCN
```

Không overwrite một role khi gán role khác.

---

## 4.2. GVCN

GVCN:

```text
xem tất cả môn của HS lớp chủ nhiệm
xem Portfolio
xem Attempts
xem Learning Map
thêm HS vào lớp chủ nhiệm
sửa thông tin cơ bản
reset mật khẩu
```

Không:

```text
chuyển lớp
khóa account
sửa learning evidence
sửa Question Bank môn khác
```

---

## 4.3. GV bộ môn

Được:

```text
Question Bank/content scope môn mình
learning data môn mình ở lớp được phân công
tạo/giao bài môn mình
tạo Draft ma trận môn mình
sinh đề thử từ ma trận thuộc scope
```

Mặc định không:

```text
reset password HS
edit account HS
xem dữ liệu môn khác
```

---

## 4.4. Tổ trưởng chuyên môn

Được:

```text
review/approve content theo tổ
Question Coverage
Question Quality
Learning Analytics môn/tổ
review/approve ma trận theo policy
```

---

## 4.5. Khối trưởng

Scope theo grade.

Read-heavy:

```text
class engagement
student portfolio
assignment completion
grade analytics
```

---

## 4.6. BGH

Read-only theo scope mặc định.

Có thể có approval capability nếu nhà trường bật.

Không hard-code:

```text
board => luôn có create/update matrix
```

---

# 5. OUTCOME/YCCĐ MASTER DATA

## 5.1. Schema core

```text
subject_code
subject_name
grade_code

domain_code        nullable
domain_name        nullable

outcome_order
outcome_code
outcome_title

yccd_order
yccd_code
yccd_text

source_document
source_locator

curriculum_version
status
notes
```

---

## 5.2. Stable IDs

DB:

```text
curriculum_outcomes.id
curriculum_yccds.id
```

Business keys:

```text
outcome_code
yccd_code
```

Không dùng:

```text
row number
title text
display order
```

làm identity.

---

## 5.3. KHTN 7 reference

KHTN:

```text
domain_code:
L = Vật lí
H = Hóa học
S = Sinh học
```

Outcome reset trong từng domain.

YCCĐ reset trong từng Outcome.

Ví dụ:

```text
L.2
L.2.1
L.2.2
```

---

## 5.4. Subject Profile

Mỗi môn có:

```text
subject_code
uses_domain
domain_label
outcome_label
yccd_label
code_policy
grade_required
metadata_required_before_active
smart_suggestion_enabled
```

Không hard-code chữ “Phân môn” cho mọi môn.

---

# 6. TEMPLATE CHUẨN TOÀN TRƯỜNG

File workbook V1.1 đi kèm spec này có:

```text
00_README
01_OUTCOME_YCCD_MASTER
02_KHTN7_REFERENCE
03_SUBJECT_PROFILE
04_QUESTION_UPLOAD_SIMPLE
05_QUESTION_UPLOAD_ADV
06_LOOKUPS
```

---

## 6.1. Upload đơn giản

GV có thể dùng:

```text
question_text
options
answer
explanation
grade_hint
subject_hint
lesson_hint
media
```

Không bắt gõ Outcome/YCCĐ/mức/dạng.

---

## 6.2. Upload nâng cao

Cho tổ chuyên môn / round-trip:

```text
record_action
question_id
question_version_id
subject
grade
domain
lesson
Outcome
YCCĐ
level
type
content
answer
media
tags
family
workflow status
```

Metadata có thể để trống cho `NEW`.

---

# 7. SMART INGESTION & METADATA ENRICHMENT

## 7.1. Pipeline

```text
File
→ Parser Adapter
→ NormalizedQuestion
→ Detect subject/grade
→ Candidate master scope
→ Suggest metadata
→ Preview
→ Human confirmation
→ Validation
→ Confirm
→ Transaction
```

---

## 7.2. Auto-detect Question Type

Rule-first:

```text
A/B/C/D + single key → TN
a/b/c/d truth values → ĐS
pair columns → GN
short determinate answer → TLN
extended constructed response → TL
```

AI chỉ hỗ trợ ca khó.

---

## 7.3. Outcome/YCCĐ suggestion

Không semantic search toàn database vô điều kiện.

Trình tự:

```text
subject
→ grade
→ optional domain
→ candidate Outcomes/YCCĐ trong master
→ ranking
```

Return:

```text
candidate_id
code
text
confidence
reason
```

Không invent.

---

## 7.4. Cognitive Level suggestion

KHTN dùng chuẩn hiện hành.

Đối với tính toán:

```text
0 bước            → NB
1 bước            → TH
>=2 bước          → VD
ngoài quy trình   → xét VDC
```

Đối với ĐS nhiều ý:

```text
classify each subitem
→ same level = that level
→ mixed levels = HỖN_HỢP + subitem_levels
```

---

## 7.5. Confidence UX

Gợi ý:

```text
>= 90%  → auto-tick suggestion, vẫn editable
70–89%  → suggestion, cần xác nhận
<70%    → không auto-tick
```

Threshold là config, tune theo pilot.

---

# 8. QUESTION VERSIONING

Question content hoặc answer thay đổi sau khi đã được dùng:

```text
CREATE_VERSION
```

Không mutate historical Question Version.

Attempt/Exam phải trỏ đúng version đã dùng.

---

# 9. QUESTION BANK QUALITY

Sau khi metadata chuẩn:

```text
usage_count
unique_students
correct_rate
partial_rate
skip_rate
uncertain_rate
median_time
teacher_reuse_count
report_count
```

Coverage:

```text
Outcome/YCCĐ × NB/TH/VD/VDC
```

Không tính coverage từ câu chưa resolve master metadata.

---

# 10. LEARNING ANALYTICS

Student:

```text
Mastery
Confidence
Trend
Learning Map
Strong Areas
Reinforcement Areas
Low Evidence
Declining Areas
```

Learning Map có thể switch:

```text
Theo Topic
Theo Outcome/YCCĐ
```

---

# 11. AUTO MATRIX — AUDIT CURRENT V5

Đã kiểm các module:

```text
backend/src/services/matrixBalancer.js
backend/src/services/examGenerator.js
backend/src/routes/matrix-balance.js
backend/src/routes/matrix.js
backend/src/routes/exams.js

frontend/src/components/MatrixTable.jsx
frontend/src/pages/Matrix.jsx
frontend/src/pages/Exams.jsx

backend/test/matrixBalancer.test.js
```

`matrixBalancer` hiện có bộ test cân điểm và đã hoạt động tốt ở nhiều ca.

Không rewrite toàn bộ balancer.

---

# 12. AUTO MATRIX — NHỮNG GÌ ĐANG TỐT

Giữ:

```text
largest remainder
integer score units
0.25 essay slot logic
locked cells
redistribute
branch configs
exact total budget handling trong các ca hợp lệ
```

Tiếp tục dùng test regression hiện có.

---

# 13. AUTO MATRIX — GAP 1: TYPE_WEIGHTS LÀM LỆCH TỈ TRỌNG MỨC

Current:

```js
TYPE_WEIGHTS = {
  mcq4:       [4,3,2,1],
  true_false: [2,3,3,2],
  short:      [1,2,4,3],
  essay:      [1,2,3,4]
}
```

và:

```text
effective_weight = user_ratio × type_weight
```

Hệ quả:

> Target level ratio của người dùng không còn là hard constraint.

Ví dụ target:

```text
30 / 30 / 20 / 20
```

có thể bị biến thành phân bố khác vì dạng câu.

---

# 14. QUY TẮC MỚI CHO TỈ TRỌNG MỨC

## Hard constraint

Tỉ trọng mức được tính theo **điểm**, không theo số câu.

Target:

```text
level_target_score[M1..M4]
```

Phải khớp chính xác khi mathematically feasible.

---

## Khi không thể khớp chính xác do granularity

Ví dụ score step không cho phép đạt đúng %.

Hệ thống phải:

```text
1. tìm nearest feasible distribution
2. hiển thị target vs actual
3. hiển thị delta
4. KHÔNG tự coi là đạt
5. yêu cầu người dùng Accept deviation hoặc chỉnh cấu hình
```

Không silent approximation.

---

## TYPE_WEIGHTS chỉ là soft preference

Có thể dùng:

```text
TN ưu tiên M1/M2
TL ưu tiên M3/M4
```

để chọn giữa nhiều nghiệm **đều thỏa hard constraints**.

Không được thay đổi target ratio.

---

# 15. AUTO MATRIX — GAP 2: CÓ THỂ LƯU MATRIX LỆCH TỔNG ĐIỂM

Current balance API trả:

```text
balanced = false
```

nhưng matrix create/update chưa khóa mọi trường hợp.

---

## Fix

Backend save phải tự tính:

```text
sum(question_count × score_per_question)
```

và so với:

```text
matrix.total_score
```

Nếu không khớp:

```text
HTTP 422 MATRIX_SCORE_MISMATCH
```

trừ khi matrix chưa có cells và đang ở configuration draft trước distribute.

---

# 16. AUTO MATRIX — GAP 3: CELL CHƯA CÓ OUTCOME/YCCĐ

Current matrix cell chủ yếu có:

```text
branch_id
topic_id
q_type
cognitive_level
question_count
score_per_question
```

Target V6.3:

```text
matrix_cell
├─ branch/domain_id
├─ topic_id optional
├─ outcome_id
├─ yccd_id
├─ cognitive_level
├─ question_type
├─ question_count
├─ score_per_question
├─ is_locked
└─ order_index
```

`yccd_id` là constraint nội dung chính.

`topic_id` là optional compatibility/navigation dimension.

---

# 17. AUTO MATRIX — GAP 4: EXAM GENERATOR FALLBACK QUÁ RỘNG

Current:

```text
exact
→ topic_relaxed
→ branch_relaxed
→ subject_relaxed
```

`subject_relaxed` bỏ cả cognitive level.

Đây là không chấp nhận được cho đề chuẩn ma trận.

---

# 18. SELECTION POLICY MỚI

## Default

```text
STRICT
```

Candidate bắt buộc match:

```text
subject
grade
domain/branch nếu cell có
Outcome
YCCĐ
cognitive_level
question_type
status
```

---

## Có thể relax thứ không làm thay đổi chuyên môn

Được relax sau warning:

```text
anti-repeat
cross-code non-overlap
usage priority
```

Vì đây không thay metadata của cell.

---

## Không tự relax

Không tự bỏ:

```text
YCCĐ
Outcome
Cognitive Level
Question Type
```

---

## User-controlled relaxation

Nếu nhà trường thật sự muốn:

```text
same_outcome_other_yccd
same_topic_other_yccd
```

phải là:

```text
explicit option
previewed
audited
```

không default.

Không bao giờ tự bỏ Cognitive Level trong generator chuẩn.

---

# 19. COVERAGE STATUS MỚI

Không dùng:

```text
enough_any
```

theo `subject_relaxed`.

Return:

```text
EXACT_READY
SHORTAGE
BLOCKED
```

Có thể thêm:

```text
RELAXATION_AVAILABLE
```

nhưng không đồng nghĩa READY.

---

## Coverage row

```text
YCCĐ
Level
Type
Need
Exact Available
After anti-repeat
Status
```

Ví dụ:

| YCCĐ | Mức | Dạng | Cần | Có exact | Trạng thái |
|---|---|---|---:|---:|---|
| L.2.1 | NB | TN | 2 | 8 | EXACT_READY |
| L.2.2 | VD | TLN | 2 | 1 | SHORTAGE |
| L.2.3 | VDC | GN | 1 | 0 | BLOCKED |

---

# 20. AUTO MATRIX — GAP 5: TAG EXTRA PHÁ MA TRẬN

Current tag extras được append sau khi matrix đã đủ câu.

Fix:

## Default

Tag là **selection preference** trong candidate pool exact.

Ví dụ:

```text
ưu tiên tag = Câu hay
```

nhưng vẫn phải match cell.

---

## Bonus questions

Nếu user muốn câu thêm ngoài ma trận:

```text
bonus_mode = true
```

và phải hiển thị riêng:

```text
Không tính điểm
Không tính ma trận
```

Không silently làm tổng câu/tổng điểm thay đổi.

---

# 21. AUTO MATRIX — GAP 6: SCORE CỦA EXAM ITEM

Matrix có:

```text
score_per_question
```

nhưng selected question có thể có score mặc định riêng.

Source of truth cho đề:

```text
assigned_score = matrix_cell.score_per_question
```

Exam item phải snapshot điểm được gán.

Không dùng `question.score` để thay score ma trận.

---

# 22. AUTO MATRIX — GAP 7: EXAM PHẢI SNAPSHOT QUESTION VERSION

Current generator sử dụng `question_id`.

Target:

```text
exam_items
├─ question_id
├─ question_version_id
├─ matrix_cell_id
├─ assigned_score
├─ selection_stage/policy
└─ option_order
```

Historical exam luôn render:

```text
question_version_id
```

không current mutable question.

---

# 23. AUTO MATRIX — GAP 8: THIẾU GHÉP NỐI

Matrix currently:

```text
mcq4
true_false
short
essay
```

Bổ sung:

```text
matching
```

Map UI:

```text
TN
ĐS
TLN
GN
TL
```

---

# 24. AUTO MATRIX — GAP 9: ROLE/CAPABILITY

Không dùng hard-coded:

```text
board can write
teacher cannot write
```

Target:

### Teacher

```text
matrix.create_draft
matrix.edit_own_draft
exam.generate_preview
```

trong content scope.

### Department Leader

```text
matrix.review
matrix.approve
matrix.lock
```

trong department scope.

### Board

```text
matrix.read
analytics.read
```

mặc định.

Approval capability nếu policy bật.

### Admin

Full matrix administration.

---

# 25. AUTO MATRIX — TARGET DOMAIN MODEL

## Matrix Template

```text
matrix_templates
---------------
id
name
subject_id
grade
purpose
duration
total_score
ratio_m1..m4
status
creator_id
approval metadata
```

## Matrix Scope

Có thể giữ `topic_scope` compatibility.

Nên bổ sung normalized relation:

```text
matrix_scope_items
------------------
template_id
outcome_id
yccd_id
weight optional
required boolean
```

## Matrix Cell

```text
matrix_cells
------------
template_id
branch_id optional
topic_id optional
outcome_id
yccd_id
q_type
cognitive_level
question_count
score_per_question
is_locked
order_index
```

---

# 26. AUTO MATRIX — AUTO GENERATION FLOW MỚI

User chọn:

```text
Subject
Grade
Scope Outcome/YCCĐ
Total score
Duration
Cognitive ratios
Question type structure
Branch score if applicable
```

System:

```text
1. Load selected YCCĐ
2. Query exact bank coverage
3. Build hard constraints
4. Allocate target score by cognitive level
5. Allocate score/count across YCCĐ
6. Allocate question types while preserving targets
7. Check exact feasibility
8. Show preview
9. User adjusts/locks
10. Save Draft
11. Review/Approve
12. Generate exam only when exact coverage ready
```

---

# 27. PHÂN BỔ YCCĐ

Default policy:

```text
equal by YCCĐ
```

hoặc:

```text
proportional by configured weight
```

UI cho phép user chỉnh weight.

Không dựa vào:

```text
số câu sẵn có trong kho
```

để tự tăng trọng số một YCCĐ.

Coverage shortage phải được báo, không đổi blueprint để “cho đủ câu”.

---

# 28. HARD CONSTRAINTS VS SOFT PREFERENCES

## Hard

```text
Total score
Branch total score
Question count by type nếu user khóa
Outcome/YCCĐ scope
Cognitive ratio by score
Question type
Matrix cell count
```

## Soft

```text
TYPE_WEIGHTS
question usage_count
anti-repeat
tag preference
question family diversity
source diversity
```

Soft constraint không được phá hard constraint.

---

# 29. PLAN SỬA AUTO MATRIX

## Phase M0 — Regression lock

Files:

```text
backend/test/matrixBalancer.test.js
```

Việc:

1. giữ 8 test hiện có;
2. thêm regression cho các bug mới;
3. không sửa thuật toán trước khi test đỏ tương ứng tồn tại.

Acceptance:

```text
old tests green
new bug tests red before fix
```

---

## Phase M1 — Matrix validation hardening

Files:

```text
backend/src/routes/matrix.js
backend/src/routes/matrix-balance.js
```

Thêm:

```text
validateMatrixTotals()
validateCellSchema()
validateRatioActual()
```

Server reject:

```text
score mismatch
invalid level
invalid q_type
invalid YCCĐ relation
```

Acceptance:

```text
không thể lưu ma trận 10 điểm nhưng cells chỉ 5 điểm
```

---

## Phase M2 — Outcome/YCCĐ in Matrix Cells

Migration:

```text
matrix_cells.outcome_id
matrix_cells.yccd_id
```

FK tới curriculum master.

Files:

```text
backend/src/routes/matrix.js
frontend/src/pages/Matrix.jsx
frontend/src/components/MatrixTable.jsx
```

UI:

```text
Outcome
YCCĐ
Mức
Dạng
Số câu
Điểm/câu
Tổng điểm
Coverage
```

Acceptance:

```text
mỗi cell biết chính xác nó đang kiểm tra YCCĐ nào
```

---

## Phase M3 — Ratio engine correction

File:

```text
backend/src/services/matrixBalancer.js
```

Refactor:

```text
TYPE_WEIGHTS:
hard multiplier → soft tie-breaker
```

New algorithm principle:

```text
first satisfy level score targets
then assign type distribution
```

Tests:

```text
30/30/20/20 on 10 points → actual 3/3/2/2 when feasible
type mix cannot distort target
locked cells preserve remaining target correctly
```

Acceptance:

```text
ratio_actual == ratio_target when feasible
```

---

## Phase M4 — Feasibility / Coverage exact

File:

```text
backend/src/services/examGenerator.js
backend/src/routes/exams.js
```

Coverage exact predicate:

```text
subject
grade
branch/domain
outcome
yccd
level
type
status
```

Return:

```text
EXACT_READY / SHORTAGE / BLOCKED
```

Remove use of `subject_relaxed` as readiness.

Acceptance:

```text
coverage nói READY chỉ khi đúng ma trận
```

---

## Phase M5 — Strict Exam Selection

File:

```text
backend/src/services/examGenerator.js
```

Remove default metadata relaxation.

Allowed fallback only for:

```text
anti-repeat reuse
cross-code overlap reuse
```

while keeping exact cell metadata.

If insufficient:

```text
throw MATRIX_CELL_SHORTAGE
```

with:

```text
cell_id
yccd
level
type
need
available
```

Acceptance:

```text
không có đề đủ số nhưng sai mức/YCCĐ
```

---

## Phase M6 — Exam Snapshot

Migration:

```text
exam_items.question_version_id
exam_items.matrix_cell_id
exam_items.assigned_score
exam_items.selection_policy
```

Files:

```text
backend/src/services/examGenerator.js
backend/src/routes/exams.js
```

Acceptance:

```text
edit question later không đổi đề cũ
score đề lấy từ matrix cell
```

---

## Phase M7 — Matching support

Files:

```text
backend/src/services/matrixBalancer.js
backend/src/routes/matrix-balance.js
backend/src/routes/matrix.js
frontend/src/components/MatrixTable.jsx
frontend/src/pages/Matrix.jsx
```

Support:

```text
matching
```

Acceptance:

```text
GN có thể xuất hiện trong matrix và generator như type độc lập
```

---

## Phase M8 — Tag selection policy

File:

```text
backend/src/services/examGenerator.js
frontend/src/pages/Exams.jsx
```

Default:

```text
tag preference inside exact cell
```

Bonus mode:

```text
explicit
non-scored
outside matrix
```

Acceptance:

```text
tag không tự làm đề vượt matrix counts/score
```

---

## Phase M9 — Permission alignment

Files:

```text
backend/src/routes/matrix.js
backend/src/routes/exams.js
frontend navigation/actions
```

Replace broad role checks bằng capability resolver V6.

Acceptance:

```text
teacher own-subject draft
leader review
board read-only default
admin full
```

---

## Phase M10 — UX Preview

Frontend:

```text
Matrix.jsx
MatrixTable.jsx
Exams.jsx
```

Before save/generate show:

```text
Target score
Actual score
Target ratios
Actual ratios
YCCĐ coverage
Shortage list
Question counts
Status
```

No “Sinh đề” primary CTA nếu có blocked cells.

---

## Phase M11 — E2E

Test flows:

```text
Create matrix
→ selected YCCĐ
→ auto distribute
→ exact ratio
→ coverage
→ shortage blocks
→ add questions
→ coverage ready
→ generate 2 codes
→ exact metadata preserved
→ question versions snapshotted
→ scores match matrix
```

---

# 30. AUTO MATRIX — TEST MATRIX

## Test A — exact ratio

```text
10 points
30/30/20/20
```

Expected:

```text
M1 3.0
M2 3.0
M3 2.0
M4 2.0
```

---

## Test B — impossible ratio

If discrete question scores cannot hit exact ratio:

Expected:

```text
balanced = false
nearest feasible shown
user acceptance required
```

---

## Test C — wrong total

```text
matrix total = 10
cells total = 5
```

Expected:

```text
422 MATRIX_SCORE_MISMATCH
```

---

## Test D — YCCĐ shortage

Cell:

```text
L.2.3
VD
TLN
need 2
available 1
```

Expected:

```text
SHORTAGE
generate disabled
```

---

## Test E — no cognitive fallback

Need:

```text
VD
```

bank only has NB.

Expected:

```text
BLOCKED
```

Not:

```text
take NB with warning
```

---

## Test F — historical version

Generate exam.

Edit question.

Expected:

```text
old exam still renders old question version
```

---

## Test G — assigned score

Question default score:

```text
0.25
```

Matrix score:

```text
0.5
```

Expected:

```text
exam item assigned_score = 0.5
```

---

## Test H — tag

Tag candidate does not match YCCĐ.

Expected:

```text
not selected
```

---

## Test I — matching

Matrix requires:

```text
GN
```

Expected:

```text
coverage + generation supported
```

---

# 31. UI AUTO MATRIX TARGET

Matrix builder sections:

```text
1. Thông tin đề
2. Phạm vi Outcome/YCCĐ
3. Cơ cấu điểm/mức
4. Cơ cấu dạng câu
5. Ma trận chi tiết
6. Coverage kho
7. Kiểm tra trước khi lưu
```

---

## 31.1. Coverage heatmap

Rows:

```text
YCCĐ
```

Columns:

```text
NB
TH
VD
VDC
```

Cell:

```text
needed / available exact
```

---

## 31.2. Warnings

Ví dụ:

```text
🔴 L.2.3 · VD · TLN: cần 2, kho có 1
🟡 Target M3 = 2.0đ, actual = 1.75đ
🟢 Tổng điểm = 10.0/10.0
```

---

# 32. MATRIX + QUESTION BANK ACTION LOOP

Từ shortage:

```text
Mở kho câu hỏi
```

với filters prefilled:

```text
Subject
Grade
Outcome
YCCĐ
Level
Type
```

Sau khi thêm câu:

```text
Refresh Coverage
```

không phải tạo lại matrix.

---

# 33. MATRIX + QUESTION QUALITY

Khi exact pool có nhiều câu:

Selection soft ranking:

```text
approved/stable quality
low usage
not recently used
family diversity
source diversity
tag preference
```

Không dùng quality để chọn sai metadata.

---

# 34. STUDENT / TEACHER / MANAGEMENT SUCCESS

## Student

Trong dưới 30 giây:

```text
mình mạnh gì
yếu gì
evidence đủ chưa
nên luyện gì
```

## Teacher

Trong 30 giây:

```text
ai cần chú ý
YCCĐ nào yếu
tạo bài/đề phù hợp
```

## Department Leader

```text
coverage gap
quality gap
matrix gap
```

## Board

```text
adoption
learning progress
bank health
assessment coverage
```

---

# 35. PHASE ORDER V6.3

Khuyến nghị:

```text
P0. Role/Scope foundation
P1. Outcome/YCCĐ master
P2. Smart Question Ingestion
P3. Matrix hardening + Outcome/YCCĐ
P4. Strict Exam Generator + version snapshot
P5. Question Quality/Coverage
P6. Learning Map/Strength-Weakness
P7. Role Dashboards
P8. Action Layer
P9. Production hardening
```

---

# 36. P0 TRƯỚC PILOT

Bắt buộc:

```text
GVCN
multi-position
student/content scope separation
Outcome/YCCĐ master
question metadata preview/confirm
matrix total score validation
matrix ratio correctness
no metadata-dropping fallback
exam version snapshot
negative permission tests
```

---

# 37. DEFINITION OF DONE — TEMPLATE

- [ ] KHTN 7 là reference.
- [ ] KHTN 6/8/9 dùng cùng numbering convention.
- [ ] Core không hard-code L/H/S.
- [ ] Môn không có Domain vẫn dùng được.
- [ ] Outcome code tường minh.
- [ ] YCCĐ code tường minh.
- [ ] Upload Simple.
- [ ] Upload Advanced.
- [ ] Metadata có thể để trống ở NEW.
- [ ] Metadata bắt buộc trước Approved/Active.
- [ ] AI chỉ suggest master records.
- [ ] Version-safe.

---

# 38. DEFINITION OF DONE — AUTO MATRIX

- [ ] Total score hard validation.
- [ ] Ratio by score, exact when feasible.
- [ ] Type weights không distort ratio.
- [ ] Matrix cells có Outcome/YCCĐ.
- [ ] GN supported.
- [ ] Coverage exact.
- [ ] No cognitive fallback.
- [ ] No YCCĐ fallback by default.
- [ ] Tag does not append scored questions silently.
- [ ] Exam item snapshots Question Version.
- [ ] Exam item snapshots matrix cell.
- [ ] Exam item snapshots assigned score.
- [ ] Shortage blocks generation.
- [ ] Permission follows capability/scope.
- [ ] E2E exact matrix → exact exam passes.

---

# 39. MEGA PROMPT CHO CODING AGENT

Bạn làm trực tiếp trên repo hiện có.

Không tạo subsystem song song.

## Bước 1

Audit exact current files:

```text
backend/src/services/matrixBalancer.js
backend/src/services/examGenerator.js
backend/src/routes/matrix-balance.js
backend/src/routes/matrix.js
backend/src/routes/exams.js
frontend/src/components/MatrixTable.jsx
frontend/src/pages/Matrix.jsx
frontend/src/pages/Exams.jsx
backend/test/matrixBalancer.test.js
```

và các migrations/schema liên quan.

Tạo:

```text
docs/V6_3_MATRIX_CURRENT_AUDIT.md
```

Mỗi requirement:

```text
KEEP
FIX
ADD
DEPRECATE
```

Không dừng sau audit.

---

## Bước 2

Viết test đỏ cho:

```text
ratio distortion
total score mismatch
missing YCCĐ coverage
cognitive fallback
tag extra overflow
question version snapshot
assigned score
matching
```

---

## Bước 3

Sửa theo Plan M1→M11.

Không đảo thứ tự nếu task sau phụ thuộc schema task trước.

---

## Bước 4

Chạy toàn bộ:

```text
matrix unit
backend integration
frontend build
role authorization
exam generation
```

---

## Bước 5

Tạo visual evidence:

```text
artifacts/v6_3-matrix-builder.png
artifacts/v6_3-matrix-coverage.png
artifacts/v6_3-matrix-shortage.png
artifacts/v6_3-exam-preview.png
```

---

## Bước 6

Final report phải có:

```text
Files changed
Migrations
Algorithm before/after
Ratio test evidence
Coverage test evidence
Fallback policy
Version snapshot evidence
Permission evidence
Known limitations
```

---

# 40. KHÔNG ĐƯỢC BÁO DONE NẾU

- target ratio vẫn bị TYPE_WEIGHTS làm lệch;
- matrix 10 điểm có thể lưu cells 5 điểm;
- matrix cell chưa biết YCCĐ;
- generator còn `subject_relaxed` và có thể lấy sai level;
- shortage vẫn được coi là generate-ready;
- tag extras làm tăng scored question count ngoài matrix;
- exam item không có Question Version;
- score lấy từ question default thay vì matrix;
- GN chưa dùng được;
- teacher/board permissions vẫn trái policy mới;
- chart/preview dùng fake data;
- test không có negative cases.

---

# 41. FINAL MATRIX TEST

Hệ thống chỉ đạt khi:

> Một giáo viên chọn môn, khối, Outcome/YCCĐ, cơ cấu 10 điểm, tỉ trọng NB/TH/VD/VDC và dạng câu; hệ thống tạo ma trận đúng điểm và đúng tỉ trọng khi khả thi, chỉ báo READY khi kho có đủ câu exact, chặn sinh nếu thiếu, sau đó sinh nhiều mã đề mà mỗi câu vẫn đúng YCCĐ/mức/dạng, điểm lấy từ matrix cell và nội dung được snapshot theo Question Version.

Nếu không:

```text
Auto Matrix chưa đạt.
```

---

# 42. FINAL PRODUCT PRINCIPLE

Metadata chuẩn là xương sống:

```text
Outcome
YCCĐ
Cognitive Level
Question Type
Question Version
```

Chúng nối:

```text
Question Bank
→ Matrix
→ Exam
→ Practice
→ Assignment
→ Attempt
→ Mastery
→ Learning Map
→ Coverage
→ Question Quality
→ Strength/Weakness
→ Dashboard
```

Không được “bẻ” metadata ở bước sinh đề chỉ để đủ số lượng.

> **Thiếu câu phải trở thành tín hiệu để cải thiện Question Bank, không phải lý do để generator tự chọn sai ma trận.**
