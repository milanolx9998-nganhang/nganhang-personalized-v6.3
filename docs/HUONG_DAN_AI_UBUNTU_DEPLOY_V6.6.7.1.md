# HƯỚNG DẪN CHO AI QUẢN LÝ MÁY HOME (Ubuntu + Supabase self-host)
## Kéo git → kiểm tra → deploy `perf-v6671-followup` lên `main` → sửa dữ liệu

**Dự án:** `milanolx9998-nganhang/nganhang-personalized-v6.3`
**Thư mục repo trên máy:** `/home/hieu/nganhang-personalized-v6.3`
**Nhánh cần deploy:** `perf-v6671-followup`
**`main` hiện tại (đang chạy):** `423be0c20c65a86be82a588150dc913ac9e5f3cf`
**Người giao việc:** chủ repo (anh Hiếu). File này là yêu cầu deploy của anh ấy. Gặp bất kỳ điểm STOP nào thì dừng và báo lại, không tự suy diễn.

---

## 0. Luật tuyệt đối

1. **Không in, không chép, không tóm tắt secret.**
   - Áp dụng cho: `backend/.env`, `.git/config` (remote có thể chứa token), `.env` của Supabase, `DATABASE_URL`, mật khẩu, JWT, service-role key.
   - Chỉ được báo *có / không có* một khóa (vd. `grep -c '^REDIS_URL=' backend/.env`), không in giá trị.
   - Mọi output git có URL remote phải che, vd. `| sed -E 's#https://[^@/]*@#https://***@#g'`.
2. **Không phá dữ liệu:**
   - không `DROP` / `TRUNCATE` / `DELETE` / `UPDATE` tay trên database production;
   - không reset DB;
   - không sửa schema bằng tay;
   - không đổi cấu hình Supabase / Supavisor.
3. **Không:**
   - `git push --force`, `git reset --hard` trên nhánh khác `main` của thư mục deploy;
   - rebase, sửa lịch sử;
   - `git clean`.
4. **Không đụng:**
   - `uploads/` (dữ liệu thật, untracked);
   - `docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md` (untracked);

   Không add, không xóa, không mở đọc nếu không cần.
5. **Không:**
   - restart / stop `supabase.service`;
   - `docker compose down`, `docker system prune`;
   - cài lại Redis (`install-home-redis.sh`) khi Redis đang chạy tốt.
6. **Không chạy k6 vào production.** Không tạo tài khoản thử trên production.
7. **Luôn sao lưu trước khi làm bất cứ bước dữ liệu nào** (mục 4).
8. Thấy trạng thái khác mô tả trong file này thì **STOP + báo** kèm SHA / kết quả lệnh thực tế.

---

## 1. Đang deploy cái gì

Chuỗi commit trên nhánh (nối tiếp `main`, fast-forward được):

```text
423be0c  (main đang chạy)  perf: harden redis runtime and burst validation
69108dc  perf: complete v6.6.7.1 audit follow-up
5fe2d88  docs: add full pre-merge perf runbook
3ed2257  perf: finalize follow-up release gate
<tip>    test/docs: fix long-standing v63 failures, data-health script, Ubuntu deploy guide (vòng này)
```

Thay đổi so với `main`: **chỉ** tài liệu, test, script vận hành, file deploy.

| Nhóm | File |
|---|---|
| Tài liệu | `AI_HANDOFF.md`, `AI_WORK_LOG.md`, `docs/*` |
| Test | `backend/test/**` |
| Script mới | `backend/scripts/data-health.mjs` (chỉ đọc) |
| Script vận hành | `scripts/check-home-runtime.sh`, `scripts/install-home-redis.sh`, `scripts/deploy-server.sh` (cổng health nhận `cache: ok / degraded`) |
| Deploy | `deploy/systemd/nganhang-redis.service`, `deploy/compose.home.yaml` |

**Không có** thay đổi `backend/src/**`, `frontend/src/**` hay migration SQL mới. Code đang phục vụ học sinh vẫn giống `423be0c`, nên rủi ro deploy thấp. Việc chính sau deploy là **dữ liệu** (mục 7).

---

## 2. Preflight (chỉ đọc)

```bash
cd /home/hieu/nganhang-personalized-v6.3
pwd
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin 2>&1 | sed -E 's#https://[^@/]*@#https://***@#g'
git rev-parse origin/main
git rev-parse origin/perf-v6671-followup
git merge-base --is-ancestor origin/main origin/perf-v6671-followup; echo "main là tổ tiên của nhánh: exit=$?"
git merge-base --is-ancestor 3ed2257496e509e0e4f07d36de05fceb7104cce8 origin/perf-v6671-followup; echo "3ed2257 là tổ tiên: exit=$?"
git log --oneline -6 origin/perf-v6671-followup
git diff --name-only origin/main origin/perf-v6671-followup -- backend/src frontend/src 'backend/src/db/*.sql'
systemctl --user is-active nganhang.service nganhang-redis.service supabase.service
curl -sS -m 5 http://127.0.0.1:3001/api/health
```

**Kỳ vọng:**
- `origin/main` = `423be0c…`, trừ khi anh Hiếu đã đẩy thêm commit. Nếu khác thì **STOP**, báo SHA mới.
- Cả hai kiểm tra tổ tiên cho `exit=0`.
- Lệnh `git diff --name-only … backend/src frontend/src …` **không in ra gì**. In ra file nào thì **STOP**.
- `git status`: chỉ được phép có `?? uploads/` và `?? docs/UX_AUDIT_POWER_WORKFLOWS_PLAN.md`. Có file `M` / `A` / `D` khác thì **STOP**, không stash, không reset.
- 3 service `active`; health `{"status":"ok", …, "cache":"ok"}`.

Ghi lại vào báo cáo:
- `PRE_HEAD` = SHA đang checkout;
- `PRE_BRANCH`;
- `DEPLOYED_SHA` (bản đang chạy thường = `423be0c`).

---

## 3. Kiểm tra chỉ chạy được trên máy này (trước khi deploy)

Chạy trên **bản của nhánh**, nhưng không đổi thư mục deploy. Dùng worktree tạm:

```bash
cd /home/hieu/nganhang-personalized-v6.3
rm -rf /tmp/ngh-verify && git worktree add --detach /tmp/ngh-verify origin/perf-v6671-followup
cd /tmp/ngh-verify
bash -n scripts/deploy-server.sh && bash -n scripts/check-home-runtime.sh && bash -n scripts/install-home-redis.sh && echo BASH_OK
systemd-analyze verify deploy/systemd/nganhang-redis.service && echo SYSTEMD_OK   # không có tool → ghi SKIPPED_ENVIRONMENT
tmp_env="$(mktemp)"; printf 'DOMAIN=example.invalid\nAPP_VERSION=6.6.7\nREDIS_MAXMEMORY=256mb\n' > "$tmp_env"
docker compose --project-name nganhang-home-app-check --env-file "$tmp_env" -f deploy/compose.home.yaml config --quiet && echo COMPOSE_OK
rm -f "$tmp_env"
cd /home/hieu/nganhang-personalized-v6.3
REQUIRE_REDIS=1 /tmp/ngh-verify/scripts/check-home-runtime.sh     # chỉ đọc; kỳ vọng RUNTIME_CHECK_OK
```

- Compose báo thiếu biến thì chỉ thêm biến giả vô hại vào `tmp_env`. **Không** sửa `compose.home.yaml`.
- Lỗi bash / systemd / compose thật, hoặc runtime báo `RUNTIME_CHECK_FAILED` thì **STOP + báo**. Không tự restart.
- Không cần chạy `npm test` / build ở đây: CI "Verify & Deploy" chạy unit, security và build trước khi deploy. Máy Windows đã chạy toàn bộ bộ test (xem `AI_WORK_LOG.md`).

---

## 4. Sao lưu (bắt buộc)

```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
node ../scripts/backup.mjs
```

- Script dump database + nén `uploads/` vào `BACKUP_DIR` (mặc định `../backups`), có `manifest.json` + checksum. Không đóng gói `.env`.
- Chỉ báo **tên thư mục backup** và kết quả OK / FAIL, không in nội dung.
- Backup FAIL thì **STOP**. Không deploy, không làm bước dữ liệu.

Chụp số liệu dữ liệu **trước** deploy để so sánh:

```bash
cd /home/hieu/nganhang-personalized-v6.3
# data-health.mjs chưa có trên main: chạy bản trong worktree, nhưng với .env / DB của máy (thư mục backend thật)
cp /tmp/ngh-verify/backend/scripts/data-health.mjs backend/scripts/data-health.tmp.mjs
cd backend && node scripts/data-health.tmp.mjs --json > /tmp/ngh-data-health-before.json; echo "exit=$?"
rm -f scripts/data-health.tmp.mjs          # xóa ngay: thư mục deploy phải sạch trước bước 5
```

`exit=3` nghĩa là có migration chưa chạy hoặc đã bị sửa. Nếu là "đã bị sửa sau khi chạy" thì **STOP**. Nếu là "chưa chạy" thì deploy (bước 5) sẽ tự migrate.

---

## 5. Deploy

### 5.1. Đưa thư mục deploy về đúng `main` (quan trọng)

`scripts/deploy-server.sh`:
- ghi `PREVIOUS_SHA = HEAD` của **thư mục này**;
- rồi `git reset --hard origin/main` trên **nhánh đang checkout**.

Nếu thư mục đang đứng ở `perf-v6671-followup`, hoặc đã merge sẵn vào `main` ở đây, thì `PREVIOUS_SHA` sẽ sai và bước rollback tự động mất tác dụng. Vì vậy:

```bash
cd /home/hieu/nganhang-personalized-v6.3
git switch main                      # chỉ khác nhánh ở docs/test/script → không ảnh hưởng app đang chạy
git merge --ff-only origin/main      # chỉ để main LOCAL bắt kịp bản đang chạy (fast-forward); KHÔNG merge nhánh perf ở đây
git rev-parse HEAD                   # PHẢI = bản đang chạy (423be0c…). Khác → STOP.
git status --short                   # chỉ uploads/ và docs/UX_AUDIT… untracked
```

**Không** merge nhánh `perf-v6671-followup` trong thư mục này. Việc đưa `main` lên tip làm bằng push ở 5.2.

### 5.2. Đẩy `main` tới tip của nhánh (fast-forward, không force)

```bash
TIP="$(git rev-parse origin/perf-v6671-followup)"
git push origin "$TIP:refs/heads/main" 2>&1 | sed -E 's#https://[^@/]*@#https://***@#g'
```

- Git từ chối vì "non-fast-forward" nghĩa là `main` đã bị đổi. **STOP**, không thêm `--force`.
- Push xong, workflow **"Verify & Deploy"** tự chạy trên self-hosted runner của máy này:
  - verify: `npm ci`, build frontend, unit, security, migration gate;
  - deploy: `/home/hieu/nganhang-personalized-v6.3/scripts/deploy-server.sh` (lock → fetch → build → backup nếu có SQL → migrate → restart `nganhang.service` → chờ health → tự rollback app nếu fail).
- **Không** chạy `deploy-server.sh` bằng tay cùng lúc. Có lock, lần sau sẽ bỏ qua, nhưng làm vậy gây rối.
- Theo dõi: `gh run list --branch main --limit 3` rồi `gh run watch <id>` nếu có `gh`; không thì mở tab Actions trên GitHub. Đợi xong, **không** viết vòng lặp poll dày.
- Workflow không chạy (runner offline) thì mới deploy tay, **một lần**:

  ```bash
  /home/hieu/nganhang-personalized-v6.3/scripts/deploy-server.sh
  ```

  Kỳ vọng dòng cuối `DEPLOY_OK`. Các mã khác:
  - `DEPLOY_BLOCKED_*`, `DEPLOY_FAILED_MIGRATION` → **STOP**;
  - `DEPLOY_FAILED_ROLLED_BACK_APP` → app đã về bản cũ; báo log, **STOP**;
  - `DEPLOY_FAILED_NOT_RECOVERED` → **báo ngay**, kèm `journalctl --user -u nganhang.service -n 200`.

### 5.3. Kiểm sau deploy

```bash
cd /home/hieu/nganhang-personalized-v6.3
git rev-parse HEAD                                   # = TIP
curl -sS -m 5 http://127.0.0.1:3001/api/health       # status ok, cache ok, version 6.6.7
REQUIRE_REDIS=1 scripts/check-home-runtime.sh         # RUNTIME_CHECK_OK
journalctl --user -u nganhang.service -n 100 --no-pager | grep -iE "error|degraded|không dọn" || echo "log sạch"
git worktree remove /tmp/ngh-verify --force
```

Mở giao diện bằng trình duyệt:
- đăng nhập admin;
- vào "Ngân hàng câu hỏi", "Duyệt câu";
- đăng nhập một học sinh thử, mở trang tự luyện.

Chỉ xem, không sửa dữ liệu.

---

## 6. Rollback (chỉ khi app hỏng sau deploy)

- Deploy script đã tự rollback app khi health fail.
- Nếu cần quay `main` về bản cũ sau khi đã báo anh Hiếu: dùng **revert**, không force-push.

  ```bash
  rm -rf /tmp/ngh-revert && git worktree add /tmp/ngh-revert origin/main && cd /tmp/ngh-revert
  git revert --no-edit 423be0c20c65a86be82a588150dc913ac9e5f3cf..HEAD
  git push origin HEAD:refs/heads/main     # CI deploy lại bản tương đương 423be0c
  ```

- Vòng này không có migration mới, nên không cần khôi phục DB. Chỉ dùng backup ở mục 4 khi anh Hiếu yêu cầu.

---

## 7. Sửa dữ liệu (sau deploy thành công)

Chạy báo cáo sức khỏe dữ liệu (chỉ đọc):

```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
node scripts/data-health.mjs                 # bản cho người đọc
node scripts/data-health.mjs --json > /tmp/ngh-data-health-after.json; echo "exit=$?"
```

Xử lý theo đúng các mục dưới đây. **Không tự sáng tạo thêm lệnh sửa dữ liệu.**

### D1. Migration (mục "CHẶN")
- `Migration chưa chạy` → `npm run migrate` (idempotent, có advisory lock), rồi chạy lại data-health.
- `Migration đã bị sửa sau khi chạy` → **STOP**, báo tên file. Không sửa `app_migrations`.
- `Thiếu question_edit_operations / index` → `npm run migrate`.

### D2. Bài ↔ YCCĐ KHTN 7 (Vật lí)
Dấu hiệu: data-health báo `KHTN khối 7: … YCCĐ nhưng chưa có liên kết Bài nào`, hoặc số `yccd_linked` của KHTN 7 bằng 0.

**Luôn chạy `--dry-run` để có căn cứ.** Dry-run chạy trong transaction và luôn rollback nên không ghi gì. Không cần chờ quyết định mới được chạy dry-run. Đọc thêm bảng "Tồn kho chương trình theo môn/khối" của data-health:
- `yccds_active = 0` cho KHTN 7 → máy chủ **chưa có dữ liệu Outcome/YCCĐ**. Seed không có gì để liên kết; việc cần làm là nạp chương trình (xem D2b), không phải seed.
- `yccds_active > 0`, `published = 0` → seed sẽ dừng `NO_PUBLISHED_VERSION`. Hỏi anh Hiếu: công bố phiên bản chương trình, hay dùng `--allow-legacy`.

```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
node src/db/seed-khtn7-vatli-lessons.js --dry-run
```

- Dry-run in bản tóm tắt: số Bài sẽ tạo / liên kết, nguyên văn không khớp…
  - Báo bình thường → chạy thật: `node src/db/seed-khtn7-vatli-lessons.js`.
  - Báo `NO_PUBLISHED_VERSION` → **STOP, hỏi anh Hiếu** có cho dùng `--allow-legacy` không. Không tự thêm cờ.
  - Báo nguyên văn khớp nhiều YCCĐ hoặc thiếu YCCĐ → **STOP + báo**.
- Script idempotent: đã nạp rồi thì chạy lại không nhân đôi. Chạy lại data-health để xác nhận `yccd_linked > 0`.

### D2b. Máy chủ thiếu dữ liệu chương trình (Outcome / YCCĐ)
Dấu hiệu: data-health báo `có N câu nhưng chưa có YCCĐ ACTIVE`, và phần "Kiểm tra mã" có `no_yccd` ≈ `failed`.
- **Không tạo Outcome / YCCĐ bằng SQL.**
- Chương trình được nạp bằng giao diện **Chuẩn đầu ra** (admin), từ workbook chính thức qua hồ sơ tin cậy `KHTN_OUTCOME_YCCD_OFFICIAL_V1`: xem trước → sửa staging nếu cần → công bố phiên bản.
- Workbook nằm trên máy của anh Hiếu. Đây là việc của người, AI chỉ báo số liệu.
- Sau khi có chương trình, các câu có mã đã nhập trước đó vẫn chưa có YCCĐ. Báo anh Hiếu để có công cụ "nhận lại theo mã" riêng; **không** tự sửa từng câu.

### D3. Thao tác hoàn tác cũ
App tự dọn khi khởi động và mỗi 24 giờ. Nếu data-health vẫn báo `prunable > 0` sau khi đã restart, báo kèm log khởi động. Không `DELETE` tay.

### D4. Database tạm của test trên cụm Postgres
Nếu data-health báo `database tạm của test còn sót`:

```bash
cd /home/hieu/nganhang-personalized-v6.3
node scripts/cleanup-test-databases.mjs          # chỉ liệt kê
```

- Chỉ chạy `--apply` khi anh Hiếu đồng ý rõ ràng.
- Script chỉ nhận tên đúng mẫu `nganhang_<x>_test_<số>`, không bao giờ chạm `postgres` / database app.

### D5. Chất lượng câu hỏi → báo cho người, KHÔNG sửa bằng máy
Các mục trong "CẦN NGƯỜI XEM":
- câu có mã lệch phân loại / lệch phân môn L/H/S;
- câu có YCCĐ nhưng chưa gắn Bài;
- hồ sơ rà soát đang mở.

Chỉ **báo số liệu**. Lý do không sửa: sửa câu đã duyệt (kể cả gán Bài) sẽ tạo phiên bản mới và đưa câu về nháp, rút câu khỏi bài học sinh đang làm. Giáo viên xử lý trên giao diện:
- màn **Duyệt** → nhóm "Lỗi metadata", "Chưa gắn Bài";
- nút **"Gán Bài hàng loạt"**;
- tab **"Cần xem kỹ"**.

### D6. Cấu hình hiệu năng (chỉ kiểm, không in giá trị)

```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
for k in REDIS_URL REDIS_PREFIX DB_POOL_MAX RATE_LIMIT_API_IP RATE_LIMIT_LOGIN_IP TRUST_PROXY; do printf '%s=%s\n' "$k" "$(grep -c "^$k=" .env)"; done
node scripts/perf-db-check.mjs    # ghi lại: Supavisor session/transaction, max_connections, pg_stat_statements
```

- Thiếu `REDIS_URL` trong khi Redis đang chạy → báo, không tự sửa `.env`.
- `RATE_LIMIT_API_IP` chỉ nâng khi đã kiểm NAT (xem `docs/PERF_V6_6_7_REDIS_SUPAVISOR.md` §5), và phải được anh Hiếu đồng ý.

---

## 7b. Ghi chú kiểm link công khai (2026-09-24)
Kiểm từ Internet (DNS 8.8.8.8):
- `studylab.io.vn` có bản ghi trên Cloudflare;
- `nganhang.studylab.io.vn` **không có bản ghi DNS** (NXDOMAIN).

Timeout khi gọi `https://nganhang.studylab.io.vn/api/health` là do tên miền con chưa được trỏ, không do deploy. Trỏ DNS / Cloudflare Tunnel là việc của anh Hiếu trên Cloudflare; AI không tự sửa Caddy / DNS.

## 8. Việc KHÔNG làm trong vòng này
- k6 / load test: chưa có staging. Ghi `K6_STAGING = NOT_RUN`.
- Nâng cấp Supabase, đổi Supavisor, đổi `max_connections`.
- Sửa code, sửa test, commit lên repo. Máy này chỉ deploy + kiểm + sửa dữ liệu theo mục 7. Thấy lỗi code thì báo.

---

## 9. Báo cáo cuối (bắt buộc đúng khung)

```text
## HOME DEPLOY + DATA REPORT
1. Git
   PRE_HEAD / PRE_BRANCH:
   DEPLOYED_SHA trước:
   TIP deploy:
   origin/main sau push:
   HEAD thư mục deploy sau:
   Workflow run id + kết quả (verify / deploy):
2. Kiểm tra trước deploy
   bash -n: PASS/FAIL
   systemd-analyze: PASS/FAIL/SKIPPED_ENVIRONMENT
   docker compose config: PASS/FAIL
   runtime check trước: RUNTIME_CHECK_OK / FAILED
3. Backup: tên thư mục + OK/FAIL
4. Deploy: DEPLOY_OK / mã khác + tóm tắt log (không secret)
5. Sau deploy: health (status, cache, version), runtime check, log lỗi
6. Dữ liệu
   data-health trước → sau (exit code, blocking, attention — chỉ số đếm)
   D1 migration: không cần / đã chạy / STOP
   D2 KHTN7: không cần / dry-run tóm tắt / đã nạp / STOP chờ quyết định
   D3 edit ops: OK / báo
   D4 DB tạm: số lượng; đã / chưa apply
   D5 chất lượng câu hỏi: số liệu chuyển giáo viên
   D6 cấu hình: khóa có / không; perf-db-check tóm tắt
7. An toàn
   secret in ra: KHÔNG
   SQL tay trên production: KHÔNG
   force-push / rebase: KHÔNG
   uploads/ bị đụng: KHÔNG
   restart supabase: KHÔNG
   k6 production: KHÔNG
8. Trạng thái cuối: DEPLOYED_DATA_OK / DEPLOYED_NEEDS_DECISION / STOPPED (lý do)
```

---

## 10. Vòng 3 — Nạp chương trình, seed Bài ↔ YCCĐ, nhận lại YCCĐ theo mã

**Kết quả vòng 2:**
- DB máy chủ chưa có Outcome/YCCĐ nào.
- KHTN 9 có 80 câu, đều có mã, đều `DRAFT`, đều lỗi vì chưa gắn YCCĐ.
- KHTN 9 có 51 Bài nhưng 0 liên kết.

**Chuẩn nguyên văn:** luôn là workbook `Outcome_YCCD_KHTN_{6..9}.xlsx` (anh Hiếu chốt: SGK / KHDH viết khác một chút cũng lấy workbook làm chuẩn).

**Bài ↔ YCCĐ:** lấy từ KHDH 26-27 của trường (Tên bài ↔ Yêu cầu cần đạt), mục lục SGK KNTT, và file ThongKe Vật lí 7. Đã dựng sẵn thành `backend/src/db/seed-data/khtn{6..9}-lessons.json`. Báo cáo cho giáo viên rà: `docs/KHTN_BAI_YCCD_SEED_REVIEW.md`.

| Khối | YCCĐ có Bài | Ghi chú |
|---|---|---|
| 9 | 187/191 | đủ 51/51 Bài |
| 8 | 187/194 | |
| 7 | 89/107 | |
| 6 | 65/135 | KHDH khối 6 viết khác chương trình nhiều → giáo viên bổ sung trên giao diện |

Thứ tự làm. **H** = anh Hiếu, **A** = AI trên máy này.

### A0. Deploy bản mới của nhánh (có thêm script + seed + sửa `lessonSeed.js`)
Làm lại **đúng mục 5** với TIP mới của `origin/perf-v6671-followup`:
- thư mục deploy đứng ở `main` = bản đang chạy;
- backup;
- push fast-forward `main`;
- CI "Verify & Deploy".

Làm ngoài giờ học (app khởi động lại vài giây). Không có migration mới.

### H1. Nạp + công bố chương trình (giao diện, admin) — khối 9 trước, rồi 6, 7, 8
1. `/admin/curriculum` → "Môn học & Chương trình" → chọn **KHTN**, khối → **Tạo bản nháp**.
2. Tab **"Nạp Outcome / YCCĐ"** → chọn `Outcome_YCCD_KHTN_{khối}.xlsx` (bộ `G:\NSHM\26 27\outcome\New folder`). Hồ sơ tin cậy tự nhận.
3. Xem staging:
   - khối 7 có ô chứa nhiều YCCĐ → khi ghi phải tick **chấp nhận cảnh báo nguồn**;
   - khối 8 có YCCĐ trùng số (Chủ đề 18) → sửa số trong **"Sửa dữ liệu staging"**.

   **Không sửa câu chữ YCCĐ.** Seed đối chiếu theo nguyên văn workbook, sửa chữ thì seed báo thiếu.
4. Ghi nhập → **Công bố phiên bản**.

### A1. Seed Bài ↔ YCCĐ (sau mỗi khối đã công bố) — chạy thử trước
```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
node ../scripts/backup.mjs                                   # backup trước khi ghi
node src/db/seed-khtn-lessons.js --grade 9 --dry-run         # không ghi gì
```
Đọc bản tóm tắt JSON:
- `topics_reused` / `topics_created` / `links_created` / `skipped_uncertain`;
- `topic_branch_corrected`: khối 9 dự kiến chuyển Bài 16, 17 từ Hoá sang Vật lí đúng theo chương trình;
- `skipped_cross_branch`.

Lỗi:
- `NO_PUBLISHED_VERSION` → khối đó chưa công bố (H1), **STOP**.
- `YCCD_NOT_FOUND` / `AMBIGUOUS_YCCD_TEXT` / `DUPLICATE_LESSON` → **STOP**, gửi nguyên thông báo (không có secret).

Gửi tóm tắt cho anh Hiếu. **Được đồng ý** thì chạy thật:
```bash
node src/db/seed-khtn-lessons.js --grade 9
```
Lặp cho khối 6, 7, 8 khi đã công bố.
- **Không** chạy `seed-khtn7-vatli-lessons.js` cũ: dữ liệu ThongKe Vật lí 7 đã gộp vào `khtn7-lessons.json`.
- **Không** dùng `--include-uncertain` / `--allow-legacy` nếu anh Hiếu chưa cho.

### A2. Nhận lại YCCĐ theo mã cho câu nháp — chạy thử trước
```bash
cd /home/hieu/nganhang-personalized-v6.3/backend
node scripts/reresolve-question-codes.mjs --subject KHTN --grade 9 2>/dev/null
```
- Chỉ đụng câu có mã, chưa có YCCĐ, bản hiện hành `DRAFT`.
- Câu lệch mã → `conflicts` (bỏ qua); câu không phải nháp → `skipped_not_draft` (không sửa).

Gửi tóm tắt: `candidates`, `resolved`, `applied`, `lesson_auto / unmapped / ambiguous`, `conflicts`, `not_resolved` + lý do.
**Được đồng ý** thì ghi thật:
```bash
node scripts/reresolve-question-codes.mjs --subject KHTN --grade 9 --apply --actor <tên đăng nhập admin anh Hiếu chỉ định>
```

### A3. Kiểm lại
```bash
node scripts/data-health.mjs 2>/dev/null
```
Kỳ vọng:
- KHTN 9: `yccds_active` ≈ 191, `published` 1, `lesson_links` > 180;
- "Kiểm tra mã": `failed` giảm còn ≈ `conflicts + not_resolved` của A2.

### H2. Giáo viên rà phần còn thiếu
`docs/KHTN_BAI_YCCD_SEED_REVIEW.md` liệt kê theo khối:
- YCCĐ chưa gắn Bài nào;
- dòng KHDH không khớp;
- cặp khớp gần đúng;
- mục từ ô gộp chưa chắc.

Giáo viên liên kết thêm ở `/practice/curriculum` → "Liên kết bài học với YCCĐ". Câu có YCCĐ mà chưa có Bài thì dùng "Gán Bài hàng loạt" ở màn Duyệt.

### Báo cáo vòng 3
```text
A0: TIP deploy, workflow run, backup, health
H1: khối đã công bố + mã phiên bản
A1: tóm tắt dry-run từng khối; đã chạy thật khối nào (ai duyệt); topic_branch_corrected; skipped_*
A2: tóm tắt dry-run; đã ghi thật chưa (ai duyệt, actor); tóm tắt sau ghi
A3: data-health trước/sau (tồn kho KHTN, Kiểm tra mã)
An toàn: SQL tay KHÔNG · secret KHÔNG · câu không phải nháp bị sửa KHÔNG · --include-uncertain/--allow-legacy KHÔNG (trừ khi được cho phép)
```
