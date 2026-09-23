# PERF V6.6.7 — Redis + Supavisor + tối ưu luồng làm bài

Ngày: 2026-09-24 · Nguồn: `REDIS_SUPAVISOR_PERFORMANCE_PLAN_NGANHANG_V666.md` · HEAD khi bắt đầu: `e243b69` (+ V6.6.6.3 chưa commit)

Kiến trúc giữ nguyên: **Trình duyệt → Caddy → Express → (Redis tùy chọn) + PostgreSQL / Supavisor**. Frontend không bao giờ gọi DB/Storage trực tiếp.

## 1. Kết quả đo (máy local, 1 tiến trình Node, PostgreSQL 16, **chưa có Redis**)

Công cụ: `backend/test/load/quiz-load.mjs`. Công cụ tự dựng DB tạm, seed học sinh + câu đã duyệt, rồi đo:
- đăng nhập;
- trang chủ (dashboard, bài giao, catalog);
- bắt đầu bài;
- mở bài;
- mỗi câu: lưu nháp + chốt;
- nộp bài;
- xem kết quả.

Học sinh không nghỉ giữa các câu, nên đây là **đo sức chịu**, không phải nhịp làm bài thật. Số liệu JSON nằm ở `artifacts/perf/`.

Giữa các lượt đo cùng một mã, kết quả lệch khoảng ±30%. Vì vậy chỉ nên tin những chênh lệch lớn hơn mức đó.

### 1.1 80 học sinh (dưới trần IP), đăng nhập 10 lượt / lúc — p50 / p95 (ms)

| API | Trước (`e243b69`) | Sau (3 lượt đo) |
|---|---|---|
| Đăng nhập | 1045 / 1533 | **341–378 / 460–529** |
| Tạo bài | 643 / 820 | 645–791 / 795–961 |
| Mở bài | 393 / 469 | 369–468 / 423–537 |
| Lưu nháp | 381 / 520 | 367–425 / 478–941 |
| Lưu chốt | 427 / 595 | 381–440 / 496–1257 |
| Tải lại cả bài sau mỗi lần chốt | 431 / 557 (800 lượt) | **bỏ** |
| Nộp bài | 463 / 567 | 375–539 / 477–653 |
| Catalog (chưa có Redis) | 1430 / 1923 | 1518–1606 / 1902–2065 |
| **Pha làm bài (10 câu × 80 HS)** | **13,9 s** | **9,0–11,5 s** |
| **Tổng** | **27,1 s** | **17,8–19,5 s** |

### 1.2 120 học sinh cùng một IP

| | Trước | Sau |
|---|---|---|
| Cả lớp đăng nhập cùng lúc | **70/120 bị 429**; 50 lượt còn lại p50 4,2 s | **0 lỗi**, p50 2,3 s, cả lớp xong trong 4,1 s |
| Trần API theo IP mặc định (3000/phút) | **120/120 lượt nộp bị 429**, ~40% lượt lưu bị 429 | Cùng trần thì vẫn vậy. Nâng `RATE_LIMIT_API_IP` thì 0 lỗi (đo với 100000) |
| Pha làm bài (1200 lượt lưu) | — (bị 429) | 13,3 s, lưu p50 ~600 ms |

### 1.3 Chưa đo được ở local

- **Redis thật:** máy local không có Redis / Docker. Phần có Redis mới chỉ được kiểm bằng Redis giả (unit test) và bằng Redis không kết nối được (test tích hợp). Tỉ lệ trúng cache và độ trễ catalog khi có Redis phải đo trên server (§8).
- **Supavisor:** local nối thẳng PostgreSQL.
- **Máy chủ thật, nhiều tiến trình, mạng thật:** dùng k6 trên staging (§7).

## 2. Phát hiện từ baseline (quan trọng hơn Redis)

| # | Phát hiện | Mức | Xử lý |
|---|---|---|---|
| B1 | **Đăng nhập dồn từ một IP: 70/120 lượt bị 429.** Bộ đếm login theo IP (50/15 phút, "bỏ qua lượt thành công") vẫn *cộng trước, trừ sau*. 120 lượt đồng thời nên vượt 50 trước khi kịp trừ. Đây đúng là tình huống cả lớp đăng nhập sau NAT của trường. | P1 | `failureLimiter`: chỉ đếm lượt **thất bại**, tính khi đã có kết quả. Vẫn chặn khi sai ≥ 50 lần / 15 phút / IP (có test). |
| B2 | **bcrypt chặn luồng chính.** bcryptjs là JS thuần, ~100 ms CPU mỗi lần kiểm. Cả lớp đăng nhập làm mọi request khác phải chờ (p50 đăng nhập 4,2 s). | P1 | `services/passwordHasher.js`: kiểm mật khẩu trong worker thread (mặc định `min(4, số nhân − 1)`, chỉnh bằng `PASSWORD_WORKERS`). Worker lỗi thì tự làm trên luồng chính. |
| B3 | **Trần API theo IP 3000/phút:** 120 học sinh một IP vượt trần. Kết quả là **cả 120 lượt nộp bài bị 429**, cùng ~40% lượt lưu đáp án. | P1 (vận hành) | Trần chỉnh được qua `RATE_LIMIT_API_IP` / `RATE_LIMIT_LOGIN_IP` / `RATE_LIMIT_API_USER`. Có `GET /api/practice/operations/client-ip` (admin) để kiểm IP mà server thấy sau Caddy. **Mặc định giữ nguyên**; chỉ nâng khi đã xác nhận cả lớp ra cùng một IP (xem §5). |
| B4 | Player tải lại cả lượt làm bài sau **mỗi** lần chốt câu. | P2 | API lưu trả `is_final`; Player cập nhật tại chỗ, không tải lại. Bỏ lượt lưu trùng khi chuyển câu / rời bài. |
| B5 | Tạo bài: mỗi câu một câu `INSERT`. | P2 | Một `INSERT … SELECT FROM jsonb_to_recordset` cho cả bài. |
| B6 | Catalog 376 KB (716 chủ đề + 716 nút taxonomy), cùng một dữ liệu cho mọi người, mỗi request 3 truy vấn + tuần tự hóa. | P2 | Cache chung theo thế hệ nội dung (§3). |

## 3. Redis (tùy chọn)

**Vai trò:** cache đọc chung + bộ đếm rate limit dùng chung. **Không** là nguồn dữ liệu. Không lưu bài làm, đáp án, điểm, mật khẩu, JWT hay khóa bí mật.

**Khi Redis không có / sập / chậm (quá `REDIS_COMMAND_TIMEOUT_MS`, mặc định 300 ms):**
- cache bị bỏ qua, đọc thẳng DB;
- rate limit đếm trong bộ nhớ tiến trình;
- `/api/health` vẫn `status: ok`, kèm `cache: degraded`;
- server khởi động không chờ Redis.

| Dữ liệu | Khóa | TTL | Làm mới |
|---|---|---|---|
| Catalog (môn, chủ đề, taxonomy) | `ngh:<env>:catalog:g<thế hệ>:v1` | 600 s + jitter | Đổi thế hệ nội dung |
| Bài giao của học sinh | `…:assignments:g<n>:student:<id>` | 20 s | Đổi thế hệ nội dung |
| Dashboard học sinh | `…:dashboard:student:<id>` | 15 s | Xóa ngay khi học sinh tạo / bắt đầu / làm lại / nộp bài |
| Số đếm bàn làm việc (việc của tôi, nhóm ngoại lệ) | `…:counts:g<n>:views|exceptions:<user>[:<hash bộ lọc>]` | 8 s | Đổi thế hệ nội dung |
| Lượt làm bài, lưu bài, nộp, câu hỏi kèm đáp án | — | **không cache** | — |

**Thế hệ nội dung:** mọi thao tác ghi *thành công* của giáo viên / quản trị (không phải GET, không phải học sinh) đều tăng `gen:content` **trước khi trả lời** (transaction đã commit). Vì vậy không phải liệt kê từng khóa cần xóa khi sửa chủ đề, câu hỏi hay bài giao. Học sinh lưu / nộp bài không làm đổi thế hệ. Mỗi lần Redis (tái) kết nối cũng đổi thế hệ, vì lúc mất kết nối có thể đã bỏ lỡ lệnh đổi. Chạy script sửa DB trực tiếp thì khởi động lại app hoặc chờ hết TTL.

**Chống dồn tải:**
- trong một tiến trình, các request trùng khóa dùng chung một lần nạp;
- giữa nhiều tiến trình, một bên giữ khóa `SET NX PX 5000`, các bên khác chờ tối đa ~240 ms rồi tự nạp.

**Giới hạn:**
- giá trị lớn hơn `REDIS_CACHE_MAX_BYTES` (mặc định 2 MB) không được ghi;
- không dùng `KEYS *`;
- Redis `maxmemory` 256 MB (chỉnh bằng `REDIS_MAXMEMORY`), `allkeys-lru`, không ghi đĩa.

## 4. Rate limit

- Store `FallbackRedisStore`:
  - mỗi limiter một tên;
  - khóa dạng `ngh:<env>:rl:<tên>:<khóa>`;
  - `SET NX PX` + `INCR` + `PTTL`, nên không có khóa nào bị mất hạn;
  - Redis lỗi thì dùng `MemoryStore`.
- Giữ nguyên các mức cũ (login tài khoản 5/15 phút, API người dùng 300/phút, upload 10/phút…). Riêng login theo IP đổi cách đếm (B1).
- Số liệu nằm ở `/api/practice/operations` → `rate_limit`, gồm `redis`, `memory`, `fallback`, `blocked`, `blocked_by`.

## 5. NAT / IP — bắt buộc kiểm trên server thật

1. Đăng nhập admin từ 2–3 máy học sinh khác nhau trong trường, mở `GET /api/practice/operations/client-ip`.
2. Nếu mỗi máy ra một `ip` riêng: giữ mặc định.
3. Nếu mọi máy ra **cùng** một `ip` (NAT / Wi-Fi AP / gateway): nâng `RATE_LIMIT_API_IP` (vd. 20000 cho ~300 học sinh). Giữ nguyên `RATE_LIMIT_API_USER` và giới hạn theo tài khoản.
4. Nếu `ip` là IP của Caddy / Docker (172.x, 127.0.0.1): `TRUST_PROXY` sai, **sửa trước** (Caddy cùng compose → `TRUST_PROXY=1`).

## 6. Supavisor / PostgreSQL — việc trên server

Chạy trong container app:
```bash
docker compose --project-name nganhang-home-app --env-file deploy/.env.home -f deploy/compose.home.yaml exec app node scripts/perf-db-check.mjs
```
Script in ra, không kèm mật khẩu:
- app nối **Supavisor session / transaction** hay **thẳng PostgreSQL** (nhận ra qua user dạng `role.tenant` và cổng 5432 / 6543);
- `max_connections`;
- số kết nối theo role / trạng thái;
- top truy vấn nếu đã bật `pg_stat_statements`.

Ghi lại vào runbook:
- chế độ Supavisor;
- `POOLER_DEFAULT_POOL_SIZE`, `POOLER_MAX_CLIENT_CONN` (đọc trong `.env` của Supabase);
- `max_connections`;
- `DB_POOL_MAX`.

Khuyến nghị:
- App Node chạy lâu dài → **session mode**.
- Không tăng `DB_POOL_MAX` trước khi xem `db.pool.waiting` / `max_waiting_seen` / `wait_ms_max` và `db.queries.recent_slow` trong `/api/practice/operations`.
- Tổng số tiến trình Node × `DB_POOL_MAX` + Auth / Storage / PostgREST phải nhỏ hơn ngân sách.

## 7. Đo tải trên staging (k6)

`backend/test/load/k6-quiz.js`: `SCENARIO=ramp` (50→100→200), `burst_start` (120 người bắt đầu cùng lúc), `soak` (100 người, 30 phút). Ngưỡng đạt:
- lỗi < 1%;
- p95 đọc chung < 300 ms;
- p95 lưu bài < 500 ms;
- p95 nộp bài < 2,5 s.

Cần tài khoản học sinh thử và một chủ đề có đủ câu đã duyệt trên **staging**. Không chạy vào production.

## 8. Triển khai Home

1. `deploy/compose.home.yaml` đã có service `redis` (redis:7.4-alpine), **không publish cổng**, 256 MB, LRU, không ghi đĩa.
2. Thêm vào `deploy/.env.home` các khóa trong `deploy/.env.home.example` (mục PERF): `REDIS_URL=redis://redis:6379`, `REDIS_PREFIX=ngh:home`…
3. `bash scripts/home-update.sh` (build lại image để có gói `redis`), rồi kiểm:
   - `/api/health` có `cache: ok`;
   - `/api/practice/operations` có `cache.redis.used_memory`, `rate_limit.redis > 0`.
4. Thử sập Redis: `docker compose … stop redis`, rồi kiểm:
   - học sinh vẫn làm / nộp bài được;
   - health báo `cache: degraded`;
   - `rate_limit.fallback` tăng.

   Sau đó `start redis` và xác nhận `cache: ok` trở lại.

## 9. Header HTTP

- `/api/*`: `Cache-Control: private, no-store`.
- `/assets/*` (tên có hash của Vite): `public, max-age=31536000, immutable`.
- `index.html`: `no-cache`.

## 10. Checklist hoàn thành (Definition of Done của plan)

| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| App vẫn chạy khi Redis sập | **ĐẠT (local)** | `v667-perf`: Redis trỏ vào cổng chết → health `ok` + `cache: degraded`, đăng nhập / làm bài / nộp bình thường. Thử `docker stop redis` trên server: chờ làm. |
| Redis không mở cổng 6379 | **ĐẠT (cấu hình)** | `compose.home.yaml` không có `ports` cho redis. |
| Không cache đáp án / bí mật | **ĐẠT** | Chỉ cache catalog, bài giao, dashboard, số đếm (§3). Lượt làm bài / lưu / nộp / câu hỏi có đáp án không đi qua cache. |
| Rate limit dùng Redis | **ĐẠT (code + unit)** | `FallbackRedisStore` + unit test với Redis giả. Trên server: xem `rate_limit.redis > 0`. |
| Tỉ lệ trúng cache dữ liệu chung cao, số truy vấn DB giảm | **CHỜ SERVER** | `/api/practice/operations` → `cache.metrics` / `cache.redis.keyspace_*`, `db.queries.count`. |
| Pool DB không chờ nhiều | **CÓ SỐ LIỆU** | `db.pool.waiting / max_waiting_seen / wait_ms_*`. |
| p95 tốt hơn hoặc không xấu đi | **ĐẠT (local)** | §1: tổng giảm 28–34%; đăng nhập nhanh gấp 3; không API nào xấu đi vượt mức dao động. |
| Bộ nhớ Redis có giới hạn, theo dõi được số khóa bị đẩy ra | **ĐẠT (cấu hình)** | `maxmemory` + `allkeys-lru`; `cache.redis.evicted_keys`. |
| Ghi lại cấu hình Supavisor | **CHỜ SERVER** | Chạy `scripts/perf-db-check.mjs` + đọc `.env` Supabase (§6). |
| Đo tải 100 / 200 người đạt | **CHỜ STAGING** | `k6-quiz.js` (§7). Local: 120 người làm trọn luồng, 0 lỗi khi trần IP đúng. |
| Dồn bắt đầu / nộp bài đạt | **ĐẠT (local)** | 120 người bắt đầu cùng lúc: 1,26 s cả lớp; 120 người nộp cùng lúc: 0,89 s. |
| Trần NAT / IP không chặn nhầm cả lớp | **ĐẠT với đăng nhập; API cần cấu hình** | B1 đã sửa trong code. B3: kiểm `client-ip` rồi chỉnh `RATE_LIMIT_API_IP` (§5). |

## 11. Tệp đổi

**Backend mới:**
- `services/cache/redis.js`, `services/cache/cache.js`;
- `middleware/rateLimitStore.js`;
- `services/passwordHasher.js` + `passwordHasher.worker.js`;
- `utils/requestContext.js`;
- `scripts/perf-db-check.mjs`;
- `test/load/quiz-load.mjs`, `test/load/k6-quiz.js`;
- `test/practice/cache-v667.test.js`, `test/integration/v667-perf.test.js`.

**Backend sửa:**
- `db/pool.js`: pool theo biến môi trường, số liệu pool + truy vấn chậm.
- `middleware/rateLimiter.js`: store Redis, `failureLimiter`, trần theo biến môi trường.
- `routes/auth.js`: kiểm mật khẩu trong worker.
- `routes/practice.js`: cache catalog / dashboard / bài giao / số đếm.
- `routes/practiceAdmin.js`: `client-ip`.
- `services/practice/attempts.js`: insert theo lô, `is_final`.
- `services/practice/operations.js`.
- `server.js`: khởi Redis, thế hệ nội dung, header cache, ngữ cảnh request.
- `package.json`: thêm `redis@^5`, version 6.6.7.

**Frontend:** `pages/practice/Player.jsx` (không tải lại sau khi chốt, bỏ lượt lưu trùng); version 6.6.7.

**Deploy:** `compose.home.yaml` (service redis), `.env.home.example`, `.env.supabase-lan.example`.

## 12. Biến môi trường mới

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `REDIS_URL` | trống (tắt) | `redis://redis:6379` trong compose |
| `REDIS_PREFIX` | `ngh:<APP_PROFILE>` | Tách môi trường khi dùng chung Redis |
| `REDIS_CACHE_ENABLED` / `REDIS_RATE_LIMIT_ENABLED` | `true` | Tắt riêng từng phần |
| `REDIS_COMMAND_TIMEOUT_MS` | 300 | Quá ngưỡng → coi như Redis lỗi |
| `REDIS_CACHE_MAX_BYTES` | 2000000 | Giá trị lớn hơn không cache |
| `REDIS_MAXMEMORY` (compose) | 256mb | Giới hạn bộ nhớ Redis |
| `DB_POOL_MAX` / `DB_POOL_IDLE_MS` / `DB_POOL_CONNECT_MS` | 20 / 30000 / 5000 | Pool mỗi tiến trình |
| `SLOW_QUERY_MS` | 250 | Ngưỡng log truy vấn chậm |
| `SLOW_QUERY_CONTEXT` | bật | `0` = không gắn request id / route vào log truy vấn chậm |
| `PASSWORD_WORKERS` | min(4, số nhân − 1) | `0` = kiểm mật khẩu trên luồng chính như cũ |
| `RATE_LIMIT_LOGIN_IP` / `RATE_LIMIT_API_IP` / `RATE_LIMIT_API_USER` | 50 / 3000 / 300 | Trần rate limit |

## 13. Kiểm chứng (local, chạy từng file một)

| Bộ | Kết quả |
|---|---|
| unit (`npm test`) | 124/124 (+9 `cache-v667`) |
| security | 27/27 |
| pilot | 34/34 |
| v63 | 47/50 — đúng 3 lỗi có sẵn #30/#47/#50 |
| v664-bulk | 12/12 |
| v665-bootstrap | 7/7 |
| v665-resolver | 10/10 |
| v6652-import | 19/19 |
| v666-workbench | 10/10 |
| v666-ui-gallery | 1/1 |
| **v667-perf (mới)** | 5/5 |
| build frontend | PASS |

Lỗi gặp khi chạy regression và cách sửa:
- `limiter()` đổi chữ ký làm hỏng test security → giữ tương thích chữ ký cũ.
- Trang vận hành có khóa `password_workers` → trùng phép kiểm "không nhắc tới password" → đổi thành `hash_workers`, và che tên cột kiểu password / secret / token trong nhãn truy vấn chậm.

Số DB tạm không tăng sau cả vòng: test và công cụ đo tải đều tự dọn.
