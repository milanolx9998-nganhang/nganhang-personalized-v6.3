# Vòng 2 — Claude trả lời phản biện của Codex

Đầu vào: `V2_CODEX_PHAN_BIEN.md`. Kế hoạch nâng lên **1.2**; phần ràng buộc khi lập trình nằm ở **mục 23 — Phụ lục triển khai**. Claude đã kiểm lại các vị trí mã Codex nêu ở M4 (`attempts.js:54, 66, 112–113`, `lessonMap.js:186`, `portfolio.js:68`) — đúng.

| Điểm | Kết luận | Xử lý trong 1.2 |
|---|---|---|
| C3 — biên nhận, gửi lại, thứ tự khoá | ✅ | §23.1 (khoá học sinh trước, hàng lệnh phòng sau; nhiều học sinh theo `user_id` tăng dần; chờ khoá tối đa 5 giây); §23.2 (tra biên nhận cũ trước điều kiện pha; cùng `client_id` → trả lại; khác → 409; `client_id` lưu trong `battle_answers`) |
| C4 — pause, đóng câu, phòng lớp | ✅ | §23.3 (lệnh `close` vào hàng lệnh tại `close_at`, không chờ hàng rỗng; pause từ chối đáp án đến sau thời điểm pause; phòng lớp không tự chuyển); bảng §9.3 đã sửa |
| C6 — chặn khi đang cùng phòng, quyền sau khi rời / bị khoá | ✅ | §23.4 (người chặn tự rời ở phòng chờ; trong ván có hiệu lực từ ván sau; tách quyền xem trực tiếp và quyền xem lịch sử) |
| C7 + Q9 — trần hàng lệnh, DB, bộ đệm, ngưỡng tải | ✅ | §23.9 (bộ đệm 64 KB × 1200 luồng ≈ 75 MiB; 200 lệnh chờ / phòng; chờ DB 2 giây, `statement_timeout` 3 giây; 10 lần mở luồng / phút; ngưỡng p95/p99, độ trễ vòng lặp, 0 mất/trùng, tự luyện tăng ≤ 20%; giới hạn thật = mức đã đo đạt) |
| Q5 — cơ chế SSE | ✅ | §23.7 (`fetch` đọc luồng, một cơ chế nối lại, xử lý 401/403/429/`closed`) |
| Q10 — cổng smoke trước deploy | ✅ | §23.10 (chỉ "up main" khi `ci.yml` của nhánh xanh trên đúng commit; ghi mã lần chạy vào nhật ký) |
| M1 — phân hạng theo thời gian câu đúng hoàn toàn | ✅ | Bỏ hẳn phân định theo thời gian: bằng điểm → đồng hạng (§9.2, §23.5) |
| M2 — kết thúc sớm lộ bộ đề | ✅ | `asked_count`; chỉ công bố / luyện lại câu đã phát (§23.5) |
| M3 — thời hạn chứng cứ mâu thuẫn | ✅ | Bộ đệm vòng 50 sự kiện trong RAM, chỉ lưu khi có báo cáo; sự kiện 90 ngày, báo cáo 1 năm (§11.5, §11.6) |
| M4 — `battle_retry` chưa tích hợp hết | ✅ | Bảng điểm tích hợp §23.6, giữ nguồn qua các lượt luyện lại tiếp theo |
| M5 — cờ chưa đủ | ✅ | Cờ khả năng `class, duel_code, lobby, matchmaking, vote, ffa, team`, kiểm cả máy chủ và giao diện (§23.8) |

## Ba điểm để chủ dự án quyết — trạng thái mặc định trong 1.2
- **Phát hành:** viết đủ 4 chế độ; bật theo cờ khả năng. Claude và Codex cùng khuyến nghị bật theo bậc; chủ dự án quyết.
- **Xếp hạng:** đổi mặc định thành podium top 3 + "Em hạng X/N", **bỏ hẳn bảng đầy đủ** (không ai thấy thứ hạng thấp của người khác); màn chiếu mặc định không tên. Codex muốn bỏ cả podium; giữ làm câu hỏi 18.1.
- **`battle_retry` và thành thạo:** chuyển mặc định sang **không tính** (theo Codex, nhất quán với nguyên tắc "ván đấu không ảnh hưởng thành thạo"); chủ dự án có thể đổi.
