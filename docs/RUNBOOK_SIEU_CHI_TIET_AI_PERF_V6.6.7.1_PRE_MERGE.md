# RUNBOOK SIÊU CHI TIẾT CHO AI
## Hoàn thiện `perf-v6671-followup` trước khi merge `main`

**Dự án:** `milanolx9998-nganhang/nganhang-personalized-v6.3`
**Ngày chuẩn:** 2026-09-24
**Branch làm việc bắt buộc:** `perf-v6671-followup`
**Base follow-up commit:** `69108dc6befbb4fec3baf2083c99d07d3ffbc57d`
**Mốc `main` an toàn hiện tại:** `423be0c20c65a86be82a588150dc913ac9e5f3cf`
**Commit docs-only setup của runbook:** xác định bằng `git log`; không được coi là commit hardening.
**Trạng thái mong muốn sau runbook:** branch phụ được sửa, kiểm tra, push SHA mới; `main` vẫn nguyên; chưa deploy; chờ audit cuối.

> **Lưu ý về commit:** `69108dc6befbb4fec3baf2083c99d07d3ffbc57d` là **base follow-up commit** đã chứa các thay đổi hardening trước đó. File runbook này được thêm bằng một docs-only setup commit sau base commit để AI khác có thể đọc trực tiếp từ GitHub. Vì vậy AI thực hiện phần hardening không được dừng chỉ vì `HEAD` không còn đúng `69108dc`; phải xác nhận `69108dc` là ancestor của `HEAD`, branch vẫn là `perf-v6671-followup`, và không có commit ngoài phạm vi gây bất ngờ. Không sửa lịch sử và không force-push.

---

# 0A. MACHINE DECLARATION — MÔI TRƯỜNG ĐÃ QUAN SÁT TRÊN MÁY HOME

Phần này là snapshot môi trường tại thời điểm tạo runbook. Đây là thông tin vận hành không chứa secret; AI sau phải **xác minh lại bằng lệnh**, không coi snapshot là bằng chứng thay cho kiểm tra hiện tại.

```text
Repository path: /home/hieu/nganhang-personalized-v6.3
Working branch khi chụp snapshot: perf-v6671-followup
Base follow-up commit: 69108dc6befbb4fec3baf2083c99d07d3ffbc57d
Safe main baseline: 423be0c20c65a86be82a588150dc913ac9e5f3cf
OS: Ubuntu 20.04
Kernel: Linux 5.15.0-139-generic
Node.js: v26.7.0
npm: 11.19.0
Docker: 28.1.1
Docker Compose: v2.35.1
systemd-analyze: /usr/bin/systemd-analyze
k6: NOT INSTALLED / command not found

User services observed active:
- github-runner.service
- nganhang-redis.service
- nganhang.service
- supabase.service

Listening sockets observed:
- app: 0.0.0.0:3001
- Redis: 127.0.0.1:6379
- PostgreSQL/Supavisor path: 0.0.0.0:5432 and [::]:5432

Local file contract observed:
- backend/.env mode: 600
- UPLOAD_DIR points to the repository uploads directory
- uploads/ is untracked and must not be staged, inspected unnecessarily, deleted, or committed
- docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md is untracked and must remain untouched
```

## Machine safety declarations

- `origin` is an HTTPS Git remote. The local configuration may contain an embedded credential. **Never print, copy, commit, summarize, or expose that value.** Use `git remote -v` only with output treated as sensitive, or inspect only the host/repository shape with credentials redacted.
- Do not read or report `backend/.env` values. The only allowed observation is file mode and a non-secret path setting such as `UPLOAD_DIR`.
- Do not infer that port `5432`, local health, active systemd services, or a bound socket proves public production availability.
- Do not install `k6` merely to make this pre-merge run green. If no isolated staging target and safe test credentials are explicitly provided, record `K6_STAGING = NOT_RUN`.
- Do not restart, stop, reconfigure, reprovision, or migrate any service/database just because it appears in this declaration.
- All commands in this runbook must preserve the production boundary: no production URL as a K6 target, no production accounts, no production database writes.

## Correct preflight rule after this runbook is uploaded

The exact starting SHA for the next AI is discovered, not hardcoded:

```bash
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git rev-parse origin/perf-v6671-followup
git merge-base --is-ancestor 69108dc6befbb4fec3baf2083c99d07d3ffbc57d HEAD
```

Expected:

```text
branch = perf-v6671-followup
origin/main = 423be0c20c65a86be82a588150dc913ac9e5f3cf unless moved externally
ancestor check for 69108dc... = exit 0
```

The next AI must record the actual `START_HEAD` and `START_REMOTE_BRANCH_SHA` in its final report. It must stop if the branch is wrong, if the base commit is not an ancestor, if the remote branch has an unexpected unrelated history, or if unexpected tracked changes exist.

---

# 0. VAI TRÒ CỦA AI TRONG VÒNG NÀY

Bạn đang đóng vai trò:

> **Release hardening assistant / pre-merge verifier**

Không đóng vai trò:

- kiến trúc sư tự thiết kế thêm tính năng;
- người tối ưu hệ thống theo cảm tính;
- người tự quyết định merge production;
- người tự sửa schema/database;
- người tự chạy load test production;
- người tự “dọn dẹp” repo ngoài phạm vi.

Mục tiêu duy nhất:

1. làm sạch trạng thái tài liệu bị stale;
2. làm K6 release-gate đủ nghiêm túc;
3. xác minh không regression;
4. push branch phụ;
5. dừng lại để người dùng/AI audit cuối.

---

# 1. ĐỊNH NGHĨA THÀNH CÔNG

Vòng này chỉ được coi là hoàn thành khi đồng thời thỏa tất cả:

```text
A. Branch vẫn là perf-v6671-followup.
B. main không thay đổi.
C. Không có migration/schema/database production change.
D. Không sửa business logic backend/src.
E. Không sửa frontend.
F. Không commit uploads/.
G. Không commit secrets/.env/token/password.
H. AI_HANDOFF.md phản ánh đúng branch/commit hiện tại.
I. load50/load100/load200 dùng 2m ramp + 5m steady + 1m ramp-down.
J. Threshold performance không bị làm lỏng.
K. Static/unit/security/build checks PASS.
L. Diff được review thủ công.
M. Commit mới được push lên perf-v6671-followup.
N. Không merge main.
O. Không deploy.
P. Có báo cáo cuối đầy đủ.
```

Nếu thiếu một trong các mục A–P:

```text
STATUS = NOT READY FOR FINAL AUDIT
```

---

# 2. PHẠM VI ĐƯỢC PHÉP SỬA

## 2.1. Files dự kiến được sửa

Chỉ hai file sau được sửa trong vòng này:

```text
AI_HANDOFF.md
backend/test/load/k6-quiz.js
```

## 2.2. Files được phép đọc/kiểm tra nhưng không nên sửa

```text
AI_WORK_LOG.md
docs/PERF_V6_6_7_REDIS_SUPAVISOR.md
deploy/systemd/nganhang-redis.service
deploy/compose.home.yaml
scripts/install-home-redis.sh
scripts/check-home-runtime.sh
scripts/deploy-server.sh
backend/test/practice/import-export.test.js
backend/test/practice/roundtrip.test.js
backend/package.json
frontend/package.json
.github/workflows/*
```

Nếu phát hiện lỗi thật trong nhóm này:

```text
STOP
```

Không tự sửa.

Báo cho người dùng:

```text
BLOCKER_FOUND
file:
line/area:
problem:
impact:
recommended fix:
```

Chỉ sửa tiếp nếu lỗi đó ngăn không cho hoàn thành chính xác 2 nhiệm vụ trong runbook và fix là cực nhỏ, an toàn, có thể chứng minh.

---

# 3. CÁC HÀNH ĐỘNG BỊ CẤM

## 3.1. Git

Không:

```bash
git checkout main
git switch main
git merge
git rebase origin/main
git reset --hard origin/main
git push origin main
git push --force
git push --force-with-lease
```

trừ `git fetch origin`.

Không sửa lịch sử commit `69108dc` bằng rebase/amend nếu không thật sự cần.

Ưu tiên:

```text
69108dc
   ↓
NEW_COMMIT
```

để audit rõ.

## 3.2. Database / Supabase

Không:

```text
ALTER TABLE
DROP
TRUNCATE
DELETE production data
CREATE/ALTER INDEX production
migration generation
migration apply
schema sync
Supabase migration
database reset
```

Không chạy migration production.

Không chạy test integration trỏ vào `DB_NAME=postgres`.

Không chỉnh Supabase Studio.

Không thay Supavisor config.

## 3.3. Runtime

Không:

```bash
systemctl --user restart nganhang.service
systemctl --user restart supabase.service
systemctl --user stop supabase.service
docker compose down
docker system prune
```

Không chạy provisioning Redis lại nếu không cần:

```bash
scripts/install-home-redis.sh
```

Không thay `.env`.

## 3.4. Performance

Không chạy K6 vào production.

Không dùng:

```text
BASE_URL = production public URL
```

Không tạo hàng trăm account production.

Không coi local/unit test là bằng chứng load staging.

---

# 4. PHASE 0 — PREFLIGHT / BẢO TOÀN TRẠNG THÁI

## 4.1. Chạy lệnh kiểm tra

```bash
pwd
git status --short
git branch --show-current
git rev-parse HEAD
git log -3 --oneline
git remote -v
```

## 4.2. Kỳ vọng

```text
branch:
perf-v6671-followup

HEAD:
START_HEAD = SHA thực tế sau khi runbook docs-only setup commit đã được push

base ancestor:
69108dc6befbb4fec3baf2083c99d07d
```

Không yêu cầu `HEAD` bằng `69108dc`; commit đó là base follow-up. Ghi SHA thực tế vào report và xác nhận:

```bash
git merge-base --is-ancestor 69108dc6befbb4fec3baf2083c99d07d HEAD
```

lệnh phải trả exit code `0`.

## 4.3. Nếu working tree không sạch

Nếu có file modified/untracked ngoài:

```text
uploads/
docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md
```

thì:

```text
STOP
```

Không xóa, không stash, không reset.

Báo:

```text
PREFLIGHT_BLOCKED: unexpected working-tree changes
```

Liệt kê file.

## 4.4. Fetch remote

```bash
git fetch origin
START_HEAD="$(git rev-parse HEAD)"
START_REMOTE_BRANCH_SHA="$(git rev-parse origin/perf-v6671-followup)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main)"
git rev-list --left-right --count origin/main...HEAD
git merge-base --is-ancestor 69108dc6befbb4fec3baf2083c99d07d3ffbc57d HEAD
```

Kỳ vọng:

```text
origin/main =
423be0c20c65a86be82a588150dc913ac9e5f3cf unless moved externally

START_HEAD == START_REMOTE_BRANCH_SHA
ancestor check for 69108dc... = exit 0
```

Nếu `START_HEAD != START_REMOTE_BRANCH_SHA`, nếu remote branch có lịch sử không fast-forward, hoặc nếu `69108dc` không phải ancestor:

```text
STOP
```

Không overwrite, force-push, reset hoặc rebase. Báo conflict trạng thái và các SHA thực tế.

---

# 5. PHASE 1 — SNAPSHOT TRƯỚC KHI SỬA

Ghi vào report nội bộ:

```text
PRE_EDIT_HEAD=
PRE_EDIT_MAIN=
PRE_EDIT_BRANCH=
```

Chạy:

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --name-status
```

Kỳ vọng branch hiện tại đi trước main bằng base follow-up cộng với commit docs-only setup của runbook (nếu file này đã được push), không tính các thay đổi hardening mới.

Không cần thay đổi gì ở phase này.

---

# 6. PHASE 2 — SỬA `AI_HANDOFF.md`

## 6.1. Vấn đề

`AI_HANDOFF.md` hiện có mô tả kiểu:

```text
Thay đổi local chưa commit sau re-audit...
Chỉ commit/push khi người dùng yêu cầu.
```

Nội dung này đã stale vì các thay đổi follow-up đã nằm trong:

```text
branch: perf-v6671-followup
commit: 69108dc6befbb4fec3baf2083c99d07d3ffbc57d
```

## 6.2. Yêu cầu nội dung mới

Phần đầu phải phản ánh tối thiểu:

```text
Follow-up re-audit đã được commit/push trên branch
perf-v6671-followup tại commit
69108dc6befbb4fec3baf2083c99d07d3ffbc57d.

Branch chưa merge main và chưa auto-deploy.

main vẫn ở:
423be0c20c65a86be82a588150dc913ac9e5f3cf
```

Sau khi tạo commit mới ở cuối runbook, nếu `AI_HANDOFF.md` nói “HEAD branch hiện tại = 69108dc” thì phải cân nhắc:

- Nếu câu đó chỉ ghi “follow-up ban đầu commit tại 69108dc” → giữ được.
- Nếu câu đó ghi “HEAD hiện tại” → sau commit mới phải cập nhật SHA mới trước commit hoặc trong cùng commit.

Tốt nhất dùng cấu trúc:

```text
Base follow-up commit: 69108dc...
Current branch: perf-v6671-followup
Current status: pre-merge final hardening; main unchanged at 423be0c...
```

Không hardcode “current HEAD” nếu nội dung sẽ stale ngay sau commit.

## 6.3. Không được sửa lịch sử sai

Không thay các thông tin lịch sử đúng chỉ vì chúng cũ.

Nếu phần dưới là historical log:

```text
mục lịch sử
```

giữ nguyên nếu không sai.

## 6.4. Những trạng thái bắt buộc giữ đúng

```text
PERF DoD: NOT DONE
staging load100: PENDING
staging load200: PENDING
burst staging: PENDING
NAT/IP: PENDING
cache hit / DB query reduction: PENDING
DB pool under real load: PENDING
shared curriculum cache: PARTIAL
```

Không nâng thành PASS.

---

# 7. PHASE 3 — SỬA K6 RELEASE-GATE

File:

```text
backend/test/load/k6-quiz.js
```

## 7.1. Không được refactor lớn

Không:

- đổi framework;
- chia file;
- thêm dependency;
- đổi request semantics;
- đổi API endpoint;
- đổi login flow;
- đổi response payload;
- đổi business scenario.

Chỉ thay thời lượng release-gate và nếu cần comment mô tả.

## 7.2. Thay đúng block

Từ:

```javascript
const flowStages = target => [
  {duration: '30s', target},
  {duration: '2m', target},
  {duration: '30s', target: 0},
];
```

thành:

```javascript
const flowStages = target => [
  {duration: '2m', target},
  {duration: '5m', target},
  {duration: '1m', target: 0},
];
```

## 7.3. Ý nghĩa

Mỗi scenario:

```text
load50
load100
load200
```

sẽ chạy:

```text
2 phút ramp-up
5 phút steady-state
1 phút ramp-down
```

Tổng mỗi scenario:

```text
8 phút
```

Mục đích:

- tránh kết luận dựa trên steady window quá ngắn;
- quan sát DB pool/cache/Redis dưới tải ổn định;
- phân biệt 100 và 200 user;
- phù hợp hơn với acceptance gate.

---

# 8. PHASE 4 — BẤT BIẾN K6 BẮT BUỘC

Sau khi sửa duration, kiểm thủ công toàn file.

## 8.1. Scenario phải còn đủ

```text
load50
load100
load200
ramp
burst_start
burst_submit
soak
```

## 8.2. `ramp`

`ramp` chỉ exploratory.

Không được dùng kết quả aggregate ramp để tuyên bố riêng:

```text
100-user PASS
200-user PASS
```

## 8.3. `soak`

Giữ:

```javascript
vus: 100
duration: '30m'
```

## 8.4. Burst start

Phải tiếp tục có:

```text
executor = per-vu-iterations
vus = BURST_USERS
iterations = 1
maxDuration = 5s
gracefulStop = 0s
```

Counter:

```text
burst_start_completed
```

Rate:

```text
burst_start_success
```

Threshold:

```text
count == BURST_USERS
rate == 1
```

## 8.5. Burst submit

Phải tiếp tục có:

```text
executor = per-vu-iterations
vus = BURST_USERS
iterations = 1
maxDuration = 10s
gracefulStop = 0s
```

Counter:

```text
burst_submit_completed
```

Rate:

```text
burst_submit_success
```

Threshold:

```text
count == BURST_USERS
rate == 1
```

## 8.6. HTTP error threshold

Giữ:

```javascript
http_req_failed: ['rate<0.01']
```

Không làm lỏng.

---

# 9. PHASE 5 — THRESHOLD ACCEPTANCE KHÔNG ĐƯỢC HẠ

## 9.1. `load50`

Giữ tối thiểu:

```text
shared p95 < 300ms
start p95 < 500ms
attempt p95 < 500ms
save p95 < 500ms
submit p95 < 2500ms
```

## 9.2. `load100`

Giữ:

```text
error < 1%
shared p95 < 300ms
start p95 < 500ms
attempt p95 < 500ms
save p95 < 500ms
submit p95 < 2500ms
```

## 9.3. `load200`

Giữ:

```text
error < 1%
shared p95 < 500ms
start p95 < 750ms
attempt p95 < 750ms
save p95 < 750ms
submit p95 < 3000ms
```

## 9.4. Nguyên tắc

Nếu staging sau này FAIL:

```text
FAIL = dữ liệu kỹ thuật
```

Không được sửa threshold thành rộng hơn chỉ để PASS.

---

# 10. PHASE 6 — KIỂM TRA USER MAPPING K6

Đọc logic:

```javascript
const configuredUsers = Number(__ENV.USERS || 0);
const defaultUsers = {
  load50: 50,
  load100: 100,
  load200: 200,
  soak: 100,
  ramp: 200
}[SCENARIO] || 200;

const FLOW_USERS =
  configuredUsers > 0
    ? configuredUsers
    : defaultUsers;
```

Xác nhận:

```text
SCENARIO=load50  -> default 50 accounts
SCENARIO=load100 -> default 100 accounts
SCENARIO=load200 -> default 200 accounts
```

Không thay logic nếu nó đúng.

Ghi chú rủi ro:

Nếu operator set:

```text
SCENARIO=load200 USERS=50
```

thì 200 VUs sẽ reuse 50 account.

Đây có thể hữu ích hoặc không tùy test.

Không cần sửa ở vòng này.

Chỉ ghi vào documentation/report:

> Khi chạy acceptance staging, không set `USERS` thấp hơn target; phải chuẩn bị đủ account độc lập theo target, trừ khi cố ý kiểm tra account reuse.

---

# 11. PHASE 7 — STATIC CHECK NGAY SAU EDIT

Chạy:

```bash
git diff --check
node --check backend/test/load/k6-quiz.js
```

Nếu fail:

```text
STOP
FIX ONLY THE DIRECT SYNTAX/WHITESPACE ISSUE
RE-RUN
```

Không tiếp tục test khi syntax chưa sạch.

---

# 12. PHASE 8 — REVIEW DIFF NHỎ TRƯỚC KHI TEST LỚN

Chạy:

```bash
git status --short
git diff --stat
git diff -- AI_HANDOFF.md
git diff -- backend/test/load/k6-quiz.js
```

Điều kiện PASS:

```text
Modified files expected:
M AI_HANDOFF.md
M backend/test/load/k6-quiz.js
```

Cho phép:

```text
?? uploads/
?? docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md
```

nếu đó là trạng thái tồn tại từ trước.

Nhưng không được add chúng.

Nếu xuất hiện:

```text
M backend/src/...
M frontend/src/...
M backend/src/db/...
```

thì:

```text
STOP
```

---

# 13. PHASE 9 — BASH / RUNTIME SCRIPT STATIC CHECK

Từ repo root:

```bash
bash -n scripts/install-home-redis.sh
bash -n scripts/check-home-runtime.sh
bash -n scripts/deploy-server.sh
```

Điều kiện:

```text
exit code = 0
```

Không cần chạy installer.

---

# 14. PHASE 10 — FIXTURE STATIC CHECK

Chạy:

```bash
node --check backend/test/practice/import-export.test.js
node --check backend/test/practice/roundtrip.test.js
```

Mục tiêu:

Xác nhận commit trước vẫn syntax clean.

Không sửa nếu PASS.

---

# 15. PHASE 11 — BACKEND UNIT/PRACTICE

```bash
cd backend
npm test
```

Baseline gần nhất:

```text
124 pass
0 fail
1 skipped
```

## 15.1. PASS

Nếu:

```text
0 fail
```

tiếp tục.

## 15.2. FAIL

Nếu có fail:

Không ngay lập tức sửa code.

Phân loại:

### Loại A — fail trực tiếp do edit K6/AI_HANDOFF

Về lý thuyết gần như không thể.

Kiểm lại.

### Loại B — fixture/environment

Ví dụ upload path/environment.

Báo rõ.

### Loại C — business logic regression

```text
STOP
```

Không sửa `backend/src` trong vòng này.

Gửi report blocker.

---

# 16. PHASE 12 — SECURITY TEST

Trong `backend`:

```bash
npm run test:security
```

Baseline:

```text
27 pass
0 fail
```

Nếu fail:

```text
STOP
```

Không bypass.

Không sửa test để làm xanh trừ khi test fixture thực sự sai và có bằng chứng.

---

# 17. PHASE 13 — FRONTEND BUILD

```bash
cd ../frontend
npm run build
```

PASS khi:

```text
exit code 0
```

Nếu warning không fatal:

ghi warning trong report.

Nếu build fail:

```text
STOP
```

Không tự sửa frontend trong vòng này.

---

# 18. PHASE 14 — SYSTEMD UNIT VERIFY

Từ repo root:

```bash
systemd-analyze verify deploy/systemd/nganhang-redis.service
```

Nếu tool không tồn tại:

```text
SKIPPED_ENVIRONMENT
```

Không cài package chỉ để chạy check này.

Nếu unit verify fail:

Báo chính xác.

Không tự thay unit nếu lỗi không liên quan thay đổi hiện tại.

---

# 19. PHASE 15 — COMPOSE VALIDATION

Chỉ dùng placeholder env.

Không dùng production secret trong log/report.

Ví dụ tạo env tạm ngoài repo hoặc `/tmp`:

```bash
tmp_env="$(mktemp)"
cat > "$tmp_env" <<'EOF'
DOMAIN=example.invalid
APP_VERSION=6.6.7
REDIS_MAXMEMORY=256mb
EOF
```

Nếu compose còn yêu cầu biến khác, thêm placeholder vô hại.

Chạy:

```bash
docker compose \
  --project-name nganhang-home-app-check \
  --env-file "$tmp_env" \
  -f deploy/compose.home.yaml \
  config --quiet
```

Sau đó:

```bash
rm -f "$tmp_env"
```

Không commit file tạm.

PASS:

```text
exit code 0
```

---

# 20. PHASE 16 — RUNTIME CHECK READ-ONLY

Chỉ nếu đang chạy trên Home server và script kiểm tra được.

```bash
REQUIRE_REDIS=1 scripts/check-home-runtime.sh
```

Expected:

```text
REDIS_OK: policy=allkeys-lru maxmemory=268435456 appendonly=no
HEALTH status=ok cache=ok
CACHE_OK
RUNTIME_CHECK_OK
```

## 20.1. Nếu không chạy được vì môi trường

Không restart service.

Ghi:

```text
RUNTIME_CHECK = NOT_RUN_ENVIRONMENT
```

## 20.2. Nếu Redis degraded

Không tự sửa runtime.

Ghi:

```text
RUNTIME_CHECK = DEGRADED
```

và stop trước commit nếu đây là bất thường so với baseline server.

---

# 21. PHASE 17 — KHÔNG CHẠY K6 THẬT NẾU CHƯA CÓ STAGING

Kiểm:

```bash
command -v k6 || true
```

Ngay cả nếu có binary K6:

Không chạy nếu chưa có:

```text
staging BASE_URL
staging test accounts
staging password
subject/topic đủ dữ liệu test
xác nhận target không phải production
```

Nếu thiếu bất kỳ thứ nào:

```text
K6_STAGING = NOT_RUN
```

Đây là kết quả đúng.

Không phải failure của vòng pre-merge.

---

# 22. PHASE 18 — REVIEW SECURITY / SECRET HYGIENE

Chạy:

```bash
git diff
git diff --name-only
```

Kiểm thủ công xem diff có:

```text
password=
token=
Authorization:
DATABASE_URL=
REDIS_URL=redis://user:password@
SUPABASE_KEY=
GITHUB_TOKEN=
```

hay secret thật không.

Không coi tên biến là secret.

Chỉ secret value mới là vấn đề.

Nếu phát hiện secret:

```text
STOP
REMOVE IT
DO NOT COMMIT
```

Nếu secret từng được commit:

```text
STOP
REPORT POSSIBLE SECRET EXPOSURE
```

Không chỉ xóa rồi coi như xong; cần rotate/revoke.

---

# 23. PHASE 19 — VERIFY KHÔNG CÓ MIGRATION CHANGE

Chạy:

```bash
git diff --name-only origin/main...HEAD -- 'backend/src/db/*.sql'
git diff --name-only -- 'backend/src/db/*.sql'
```

Vòng edit mới phải không tạo migration.

Nếu current branch đã có SQL từ commit cũ, đọc để xác định đó có phải historical expected change không.

Nhưng commit mới không được thêm SQL.

---

# 24. PHASE 20 — VERIFY KHÔNG CÓ BUSINESS LOGIC CHANGE

Chạy:

```bash
git diff --name-only
```

Không được có:

```text
backend/src/
frontend/src/
```

trong working diff mới.

Nếu có:

```text
STOP
```

---

# 25. PHASE 21 — FINAL DIFF INSPECTION

Chạy:

```bash
git diff --check
git status --short
git diff --stat
git diff
```

AI phải đọc toàn bộ diff.

Không chỉ dựa vào `--stat`.

## 25.1. Kỳ vọng

```text
AI_HANDOFF.md:
- remove stale local/uncommitted claim
- describe branch pre-merge state accurately

backend/test/load/k6-quiz.js:
- only flowStages duration/comment changes
```

Nếu diff lớn bất thường:

```text
STOP
```

---

# 26. PHASE 22 — STAGING AREA

Chỉ add:

```bash
git add AI_HANDOFF.md backend/test/load/k6-quiz.js
```

Không:

```bash
git add .
git add -A
```

Sau đó:

```bash
git diff --cached --name-status
git diff --cached --stat
git diff --cached
```

Kỳ vọng chỉ 2 file.

Nếu nhiều hơn:

```bash
git restore --staged <unexpected-file>
```

Không xóa working copy.

---

# 27. PHASE 23 — COMMIT

Commit:

```bash
git commit -m "perf: finalize follow-up release gate"
```

Không amend commit cũ nếu không cần.

Sau commit:

```bash
NEW_SHA="$(git rev-parse HEAD)"
PARENT_SHA="$(git rev-parse HEAD^)"
echo "$NEW_SHA"
echo "$PARENT_SHA"
```

Kỳ vọng:

```text
PARENT_SHA = START_HEAD
```

Trong vòng chạy tiếp theo, commit hardening phải nối tiếp trực tiếp từ `START_HEAD` thực tế đã ghi ở preflight. Không yêu cầu parent bằng `69108dc` nếu runbook docs-only setup commit đã nằm sau base commit.

Nếu parent không đúng `START_HEAD`:

```text
STOP
```

Không push trước khi hiểu lịch sử.

---

# 28. PHASE 24 — POST-COMMIT VERIFY

Chạy:

```bash
git status --short
git log -3 --oneline
git show --stat --oneline HEAD
git show --name-status --oneline HEAD
```

Working tree có thể vẫn có:

```text
?? uploads/
?? docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md
```

Không sao nếu chúng tồn tại từ trước.

Nhưng commit mới không được chứa chúng.

---

# 29. PHASE 25 — PUSH BRANCH PHỤ

Chạy:

```bash
git push origin perf-v6671-followup
```

Không push main.

Sau push:

```bash
git fetch origin
git rev-parse HEAD
git rev-parse origin/perf-v6671-followup
git rev-parse origin/main
```

PASS khi:

```text
HEAD == origin/perf-v6671-followup
origin/main == 423be0c20c65a86be82a588150dc913ac9e5f3cf
```

Nếu main thay đổi do người khác trong lúc làm:

Không kết luận lỗi.

Ghi:

```text
MAIN_MOVED_EXTERNALLY
```

và báo SHA mới.

Không rebase tự động.

---

# 30. PHASE 26 — GITHUB ACTIONS

Kiểm xem branch push có workflow run không.

Nếu workflow chỉ trigger main:

```text
NO_BRANCH_CI_RUN = EXPECTED
```

Không tự sửa workflow trong vòng này.

Nếu workflow có branch run:

Theo dõi kết quả.

Nếu fail:

Ghi rõ job/step.

Không merge.

---

# 31. PHASE 27 — PULL REQUEST

Có thể tạo/update PR review link nếu user muốn.

Nhưng:

```text
DO NOT MERGE
DO NOT ENABLE AUTO-MERGE
```

Không bấm squash/rebase merge.

Chỉ đưa link review.

---

# 32. PHASE 28 — BÁO CÁO CUỐI CHUẨN

AI phải trả về đúng cấu trúc sau.

---

## PRE-MERGE HARDENING REPORT

### 1. Git state

```text
Repository:
Branch:
Base main before work:
Starting branch SHA:
New commit SHA:
New commit parent:
origin/main after push:
origin/perf-v6671-followup after push:
```

### 2. Files changed in new commit

```text
AI_HANDOFF.md
backend/test/load/k6-quiz.js
```

Nếu khác, giải thích.

### 3. Exact changes

```text
AI_HANDOFF:
- ...

K6:
- load50 = 2m ramp + 5m steady + 1m ramp-down
- load100 = 2m ramp + 5m steady + 1m ramp-down
- load200 = 2m ramp + 5m steady + 1m ramp-down
- thresholds unchanged
- burst unchanged
- soak unchanged
```

### 4. Verification results

```text
git diff --check:
PASS/FAIL

bash -n install-home-redis:
PASS/FAIL

bash -n check-home-runtime:
PASS/FAIL

bash -n deploy-server:
PASS/FAIL

node --check k6:
PASS/FAIL

node --check import-export fixture:
PASS/FAIL

node --check roundtrip fixture:
PASS/FAIL

backend npm test:
<actual result>

security:
<actual result>

frontend build:
PASS/FAIL

systemd-analyze verify:
PASS/FAIL/SKIPPED_ENVIRONMENT

docker compose config:
PASS/FAIL/SKIPPED_ENVIRONMENT

runtime check:
PASS/DEGRADED/NOT_RUN_ENVIRONMENT

K6 staging:
NOT_RUN / RUN
```

### 5. Safety verification

```text
Production DB modified: NO
Supabase schema modified: NO
Migration added/modified: NO
backend/src modified in new commit: NO
frontend/src modified in new commit: NO
uploads committed: NO
secrets committed: NO
main merged: NO
main pushed: NO
deployment performed: NO
production K6 performed: NO
```

### 6. Remaining PERF gates

```text
load100 staging: PENDING
load200 staging: PENDING
burst_start staging: PENDING
burst_submit staging: PENDING
soak staging: PENDING
NAT/IP: PENDING
cache hit ratio: PENDING
DB query reduction: PENDING
DB pool under load: PENDING
Redis peak/evictions: PENDING
save p95/p99: PENDING
shared curriculum cache: PARTIAL
PERF RELEASE: NOT DONE
```

### 7. Review links

```text
Branch:
Commit:
PR:
```

### 8. Final status

Chỉ được dùng một trong:

```text
READY_FOR_FINAL_AUDIT
```

hoặc:

```text
NOT_READY_FOR_FINAL_AUDIT
```

Không dùng:

```text
READY_FOR_PRODUCTION
PERF_DONE
PRODUCTION_READY
```

---

# 33. XỬ LÝ SỰ CỐ / DECISION TREE

## Case A — branch không đúng

```text
STOP
```

Không switch main.

Báo.

## Case B — HEAD/remote branch không khớp preflight

Nếu `START_HEAD != START_REMOTE_BRANCH_SHA`, nếu `69108dc` không phải ancestor, hoặc nếu branch có commit ngoài phạm vi không giải thích được:

```text
STOP
```

Không reset, rebase, force-push hoặc overwrite. Đọc lịch sử và báo các SHA thực tế.

## Case C — origin/main đã đổi

Không rebase tự động.

Báo SHA mới.

Tiếp tục chỉ nếu thay đổi main không ảnh hưởng 2 file đang sửa và user đã cho phép workflow tiếp tục.

An toàn nhất:

```text
STOP BEFORE PUSH
```

## Case D — unit fail

Không sửa business logic.

Báo fail.

## Case E — security fail

STOP.

## Case F — frontend build fail

STOP.

## Case G — runtime Redis degraded

Không restart.

Báo.

## Case H — compose validation fail

Phân biệt:

```text
missing placeholder env
```

với:

```text
real compose syntax/config error
```

Chỉ bổ sung placeholder env nếu thiếu env.

Không sửa compose trong vòng này.

## Case I — secret xuất hiện trong diff

STOP.

Remove secret khỏi working diff.

Nếu đã push secret:

báo cần revoke/rotate.

## Case J — untracked uploads

Không add.

Không xóa.

Không inspect nội dung nếu không cần.

## Case K — K6 binary không có

Không cài nếu user chưa yêu cầu.

Ghi:

```text
K6 staging not run
```

## Case L — staging không có

Không thay production thành staging.

Không chạy.

---

# 34. SAU KHI HOÀN TẤT BRANCH PHỤ

Dừng.

Không merge.

Người dùng sẽ gửi SHA mới cho audit cuối.

Audit cuối sẽ kiểm:

```text
commit parent
diff
CI state
release-gate duration
stale docs
unexpected files
main state
```

Chỉ sau audit cuối mới xem xét merge.

---

# 35. KẾ HOẠCH MERGE SAU NÀY — CHỈ THAM KHẢO, KHÔNG THỰC HIỆN

Nếu audit cuối PASS:

1. xác nhận `main` chưa có thay đổi ngoài dự kiến;
2. xác nhận branch diff sạch;
3. merge PR;
4. workflow Verify & Deploy chạy;
5. kiểm CI;
6. kiểm `/api/health`;
7. kiểm app UI smoke;
8. kiểm Redis state;
9. nếu app failure, dùng rollback/revert;
10. chưa tuyên bố PERF DONE cho tới khi staging load gates hoàn tất.

Không làm các bước này trong vòng hiện tại.

---

# 36. ROLLBACK MODEL SAU MERGE — CHỈ THAM KHẢO

Mốc hiện tại:

```text
423be0c20c65a86be82a588150dc913ac9e5f3cf
```

Vì follow-up không có schema/migration production change, rollback code tương đối đơn giản.

Ưu tiên:

```bash
git revert <merge-or-followup-commit>
git push origin main
```

Không ưu tiên force-reset main.

Nhưng vòng hiện tại không được merge nên không cần rollback.

---

# 37. CHECKLIST 1 DÒNG CHO AI

Trước khi nói xong, tự xác nhận:

```text
[ ] đúng branch
[ ] đúng starting SHA
[ ] main không đổi do mình
[ ] sửa đúng 2 file
[ ] AI_HANDOFF hết stale
[ ] K6 = 2m/5m/1m
[ ] threshold không giảm
[ ] burst không phá
[ ] soak không phá
[ ] git diff --check PASS
[ ] bash syntax PASS
[ ] node syntax PASS
[ ] unit PASS
[ ] security PASS
[ ] frontend build PASS
[ ] compose validate PASS hoặc skipped hợp lý
[ ] runtime read-only PASS hoặc báo đúng
[ ] no secret
[ ] no migration
[ ] no backend/src
[ ] no frontend/src
[ ] no uploads commit
[ ] commit parent = START_HEAD thực tế sau docs-only setup commit
[ ] push branch phụ
[ ] main chưa merge
[ ] không deploy
[ ] report đầy đủ
```

Nếu một mục bắt buộc chưa đạt:

```text
NOT_READY_FOR_FINAL_AUDIT
```

---

# 38. PROMPT NGẮN ĐỂ GỬI KÈM FILE NÀY CHO AI

> Đọc toàn bộ file runbook này trước khi thao tác. Thực hiện tuần tự từng phase, không bỏ qua preflight, không mở rộng phạm vi, không merge `main`, không deploy và không đụng database production. Nếu gặp trạng thái khác với giả định ban đầu, ưu tiên STOP + báo cáo thay vì tự suy diễn. Sau khi hoàn tất, push chỉ branch `perf-v6671-followup` và trả về báo cáo theo đúng template ở Phase 28 để audit cuối.

---

# 39. TRẠNG THÁI MONG MUỐN CUỐI CÙNG

```text
Branch:
perf-v6671-followup

History:
423be0c main base
   ↓
69108dc follow-up
   ↓
<NEW_SHA> final pre-merge hardening

main:
423be0c (unchanged unless moved externally)

Deploy:
NO

Production DB:
UNCHANGED

Supabase schema:
UNCHANGED

K6 production:
NOT RUN

K6 staging:
PENDING unless a real isolated staging target is explicitly available

Final label:
READY_FOR_FINAL_AUDIT
```
