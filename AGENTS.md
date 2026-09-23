# AGENTS.md — nganhang-personalized-v6.3

Luật vận hành cho mọi AI agent làm việc trong repo này (Claude Code, Cursor,
Codex, Hermes, Copilot...). Đọc file này trước khi thao tác.

## Đọc trước khi khảo sát rộng

1. `AI_HANDOFF.md` — trạng thái hiện tại, rủi ro, việc kế tiếp.
2. Mục mới nhất trong `AI_WORK_LOG.md`.
3. `PROJECT_CONTEXT.md` — bối cảnh nghiệp vụ.
4. `.codegraph/repo-map.md` — bản đồ symbol (nếu có).

## Async Tasks & No-Polling

- NEVER poll a backgrounded job yourself with sleep loops.
- Trust the harness / event-driven notification to wake you when the job finishes.
- Polling wastes context window, burns API cost, and causes unnecessary context compaction.

Chi tiết: chạy job nền → báo một câu trạng thái → **kết thúc lượt**. Runtime tự
đánh thức khi job xong. Lệnh có `sleep`, `timeout`, `wait`, `--watch`, hoặc
retry-loop chỉ để chờ job nền đã có handle trong phiên đều tính là polling.

Ngoại lệ hẹp: trạng thái harness không theo dõi được (CI run, deploy, queue hệ
thống ngoài). Khi đó chờ **một lần dài** khớp thời lượng thật (CI ~8 phút ⇒ một
lần check ~480s), không phải nhiều lần 60s.

Anti-pattern:

```bash
# SAI
while ! test -f build/done; do sleep 5; done
sleep 10 && npm run test -- --status
```

## Điều hướng code

Ưu tiên LSP / `.codegraph` (`cg def`, `cg refs`, `cg impact`) thay vì grep cho
symbol. Chỉ dùng `rg` cho chuỗi hiển thị, config key, thông báo lỗi, biến môi
trường. Không đọc nguyên file lớn trước.

## Trước khi kết thúc việc có ý nghĩa

- Thêm một mục ngắn vào `AI_WORK_LOG.md`: yêu cầu, tệp đã đổi, kiểm tra, kết quả, việc kế tiếp.
- Cập nhật `AI_HANDOFF.md` khi trạng thái, cấu hình, hành vi, rủi ro hoặc việc kế tiếp thay đổi.
- Rebuild `.codegraph` sau thay đổi code đáng kể.
- Không ghi secret, token, mật khẩu, khóa riêng, dữ liệu cá nhân thô vào các file ghi chú.

## Git

Chỉ commit/push khi người dùng yêu cầu. Repo có thể đang mang thay đổi chưa
commit — kiểm tra `git status` trước khi làm gì đụng lịch sử.
