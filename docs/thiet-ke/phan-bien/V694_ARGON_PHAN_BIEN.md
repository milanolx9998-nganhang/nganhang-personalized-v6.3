# Phản biện Sảnh Đấu V6.9.4 — Gemini 4 Argon (qua agy CLI), 24/10/2026

Đọc trực tiếp repo (chế độ chỉ đọc) gồm kế hoạch, phản biện Codex và phần backend đang làm dở. Đường dẫn file:/// là của máy anh Hiếu.

### 1. Góc nhìn học sinh: Chọn được ván đấu trong 10 giây

Học sinh THCS (lớp 6–9) mở tab **Đấu** khi "chưa biết đấu gì" thường có hai nỗi sợ: **sợ vào nhầm bài chưa học** và **ngại chờ lâu không có người**. Trong [ArenaLobby.jsx](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/frontend/src/pages/battle/ArenaLobby.jsx#L1070-L1393) hiện tại, khối Hero lớn + Thẻ Bậc học thuật + Bảng cao thủ (20 dòng) + 4 ô `<select>` đẩy danh sách phòng tụt sâu quá 2 màn hình điện thoại.

Để học sinh quyết định được trong **10 giây**, sảnh cần vận hành theo **3 nhịp quét mắt**:
1. **0–2 giây (Ưu tiên khẩn):** Thấy ngay **Phòng đang diễn ra của em**, **Phòng lớp của Thầy/Cô** (`kind: 'class'`) hoặc **Giờ vàng** trên đỉnh.
2. **2–5 giây (1 chạm chọn môn):** Quét dải **Chip Môn học có số đếm hoạt động thật** (`🔥 KHTN (6)` · `📐 Toán (3)` · `🌍 Anh (1)`). Không bắt mở `<select>` mới biết môn nào đang có người.
3. **5–10 giây (1 chạm vào trận):** Trong mỗi **Khối môn** (xếp môn đông nhất lên đầu), ưu tiên hiển thị theo thứ tự:
   - **Dải đang tìm đối thủ** (gọn 1 dòng, nút `⚡ Đấu cùng`).
   - **Lưới Phòng đang chờ** (xếp phòng thiếu 1 người `1/2`, `3/4` lên đầu; gắn nhãn `🎯 Bài em đang học` nếu khớp `suggestions` từ `/options`).
   - **Dải Đang đấu** thu gọn ở chân khối môn (tối đa 2–3 dòng mảnh làm "bằng chứng xã hội" tạo không khí sôi động, không dựng thẻ to ngang hàng phòng chờ).

#### Nhãn chữ & Trạng thái trống (Empty State)
- **Nhãn thúc đẩy hành động:** Ghi `Thiếu 1 bạn · Vào là đấu!` (khi `capacity - players === 1`), `7 câu · 30s · Chủ phòng: Minh`, `🏅 Tính hạng` (chỉ hiện khi `ranked: true`). Ván đang đấu ghi `👀 Đang so tài · Câu 4/10` (không có nút bấm gây hiểu lầm).
- **Nhãn tìm đối thủ:** Đổi `"Tìm cùng"` thành **`⚡ Đấu cùng`** (rõ nghĩa là nhảy vào ghép trận ngay cùng phạm vi đó).
- **Khi môn/bộ lọc trống:** Hiện ngay 2 nút gắn sẵn phạm vi đang chọn: `[⚡ Tìm bạn môn Toán (tự gọi máy nếu vắng)]` và `[+ Mở phòng Toán chờ bạn]`.

#### Bố cục đề xuất (ASCII Wireframe)

**Desktop (≥ 1024 px):**
```text
+-----------------------------------------------------------------------------------+
| [📌 Phòng lớp 8A1 của Cô Lan · KHTN CĐ2 · 18 bạn]                    [Vào ngay →] |
+-----------------------------------------------------------------------------------+
| ⚡ ĐẤU TRƯỜNG  [⚡ Tìm đối thủ nhanh] [+ Tạo phòng] [🤖 Đấu máy]  Mã:[______][Vào] |
+-----------------------------------------------------------------------------------+
| Môn: (Tất cả 9) (🔥 KHTN 5) (📐 Toán 3) (🌍 Anh 1) | Lọc:[Phân môn▾][Chương/Bài▾] |
| Xem: [● Tất cả] [Vào được ngay (4)] [Đang tìm (3)] [Đang đấu (2)]                 |
+-----------------------------------------------------------------------------------+
| 📐 TOÁN (2 phòng chờ · 3 bạn đang tìm · 1 ván đang đấu)                           |
| +-------------------------------------------------------------------------------+ |
| | 🟢 3 bạn cùng khối đang tìm đối thủ · Chương I: Đa thức          [⚡ Đấu cùng] | |
| +-------------------------------------------------------------------------------+ |
| +--------------------------------------+ +--------------------------------------+ |
| | [Đấu đôi] [🔥 Thiếu 1 bạn]     1/2 👤| | [Nhiều người] [Còn 2 chỗ]     2/4 👤| |
| | Chương I · Hằng đẳng thức   🎯Đang học| | Cả môn Toán · 10 câu · 30s          | |
| | Chủ phòng: Nam 🏅 · 7 câu · 30s      | | Chủ phòng: Linh · Không tính hạng    | |
| |                      [Vào phòng ngay]| |                          [Vào phòng] | |
| +--------------------------------------+ +--------------------------------------+ |
| 👀 Đang so tài: [Đấu đôi · Chương I · Câu 6/7]  [4 người · Cả môn · Câu 3/10]     |
+-----------------------------------------------------------------------------------+
| [🏅 Bậc học thuật của em: Học giả II · 140 LP]      [🌟 Bảng cao thủ] [Lịch sử ▾] |
+-----------------------------------------------------------------------------------+
```

**Mobile (360 px — không tràn ngang, chạm ≥ 44 px):**
```text
+------------------------------------+
| ⚡ ĐẤU TRƯỜNG     Mã:[___6 số][Vào] |
| [⚡ Tìm đối thủ nhanh (1 chạm)   ] |
| [+ Tạo phòng mới ] [🤖 Đấu máy   ] |
+------------------------------------+
| (Tất cả 9)(🔥KHTN 5)(📐Toán 3) ▸  | <-- Cuộn ngang
| [Tất cả] [Phòng chờ] [Đang tìm] [⚙]| <-- [⚙] mở sheet lọc Chương/Bài
+------------------------------------+
| 📐 TOÁN · 2 chờ · 3 đang tìm       |
| +--------------------------------+ |
| | 🟢 3 bạn tìm Chương I [⚡Đấu cùng]|
| +--------------------------------+ |
| | [1v1 · Thiếu 1 bạn]     1/2 bạn| |
| | Chương I: Hằng đẳng thức       | |
| | Nam 🏅 · 7 câu · 30s  [Vào ngay]| |
| +--------------------------------+ |
| | 👀 1 ván đang đấu (Câu 6/7) ▾  | |
+------------------------------------+
```

---

### 2. Đối chiếu với kế hoạch V6.9.4 và phản biện Codex

#### Đồng ý
- **Gom theo môn + dịch sẵn `scope_label` từ cache khối** ([SANH_DAU_V694.md](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/docs/thiet-ke/SANH_DAU_V694.md#L26), Phản biện #6): giải quyết triệt để việc giao diện phải tải `/options?count=7` (vốn lọc bỏ các bài < 7 câu nên làm mất nhãn của phòng 10/15 câu hoặc bài ít câu).
- **Bảo mật & Tách biệt Quiz lớp** (Phản biện #2, #3, #12): `liveCard` dùng whitelist tuyệt đối (không host, không tên người chơi, không `code`/điểm/đề); loại hoàn toàn phòng `class` khỏi `live` (đúng Phụ lục 1.2 [CHE_DO_CHOI_V693.md](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md#L160-L176)) và chưa mở chế độ Khán giả.
- **Tối ưu tải 300 luồng SSE & chống suy đoán nhóm nhỏ** (Phản biện #5, #10, #11, #13): cache `blockedIds` 60s có hủy hai chiều khi chặn/bỏ chặn, tái kiểm DB mỗi 15s cho luồng sảnh, gom nhóm `seeking < 2` về cấp môn **trước khi lọc**.

#### Không đồng ý / Cần chỉnh lại
1. **Đếm vé "Môn nào cũng được" vào mọi môn (Phản biện #1, #9 & [`lobby.js:26`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L26)):** Khi học sinh bấm Tìm đối thủ mặc định (`choices: []` — "Môn nào cũng được") hoặc khi vé đã nới rộng (`gradual`), `e.current.ids` phủ khắp các môn đã học. Cách tính hiện tại cộng `+1` người tìm vào **tất cả các môn** (2 bạn tìm tự do làm cả 6 môn đều báo "2 bạn đang tìm"), gây ảo giác đông giả tạo. **Đề xuất:** Chỉ cộng vào môn khi vé có chọn môn cụ thể (hoặc môn gốc trước khi nới); vé không chọn môn gom vào chỉ số chung `seeking_any` ("Đang tìm mọi môn").
2. **Xếp thứ tự khối môn theo `a.id - b.id` ([`lobby.js:62`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L62)):** Làm môn có phòng chờ nhưng `id` lớn bị chìm xuống dưới. Cần xếp theo mức độ có thể vào chơi ngay: `(waiting > 0) desc → (waiting + seeking) desc → live desc → id asc`.
3. **Hiển thị 50 ván `live` ngang hàng phòng chờ (Kế hoạch §3–4):** Quá tải thị giác trên mobile. Mặc định mỗi khối môn chỉ nên vẽ 2–3 dòng `live` thu gọn, bấm mới mở rộng.

#### Điểm cả Kế hoạch lẫn Phản biện đều bỏ sót
- **Giờ thấp điểm / Trường ít học sinh (0 phòng · 0 người tìm):** Theo Kế hoạch §2.3 (*"Môn không có gì thì ẩn"*), giờ vắng cả sảnh sẽ trống trơn. Khi tổng hoạt động toàn sảnh = 0, cần hiển thị **"Gợi ý mở màn"** gồm 3 môn/bài học sinh vừa luyện kèm nút 1 chạm `[⚡ Tìm bạn (20s vắng tự đấu máy)]`.
- **Lộ thông tin và tâm lý nản khi `count === 1` ở cấp môn:** Dù đã gộp chương về môn khi `count < 2`, ở lớp/khối nhỏ nếu hiện `"1 bạn đang tìm môn Tin học"` vẫn dễ đoán người và gây cảm giác vắng. Khi `count === 1`, giao diện nên hiện **"Đang có bạn chờ ghép môn..."** thay vì ghi số `1`.
- **Phòng "treo" chiếm đỉnh sảnh:** Chủ phòng tạo phòng công khai rồi mất kết nối (`disconnected`) hoặc treo không bấm Bắt đầu sẽ nằm mãi ở đầu sảnh. Cần đẩy phòng có chủ phòng `disconnected` hoặc chờ > 3 phút xuống dưới.

---

### 3. Rủi ro kỹ thuật trong backend đang làm dở (`file:line`)

1. **[`backend/src/services/battle/lobby.js:4`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L4) và [`lobby.js:15-19`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L15-L19) (`scopeTopics`, `matchesScope`) — Phòng chế độ Bỏ phiếu (`content_mode: 'vote'`) chưa chọn môn khớp nhầm mọi bộ lọc và mất khỏi `subjects`:**
   - Khi phòng đang ở vòng bầu chọn môn (`scope = {subject_id: null, branch_id: null, topic_ids: null}`), `scopeTopics` trả về **mọi bài của mọi môn trong khối**. Tại dòng 16, điều kiện `&& scope.subject_id != null` cho phép phòng `subject_id: null` đi tiếp xuống dòng 18 và khớp `true` với **bất kỳ** `subject_id`, `branch_id`, `chapter`, `topic_id` nào trong query! Ngược lại ở dòng 60, `ids` rỗng nên phòng này không được tính vào `subjects` nào.
2. **[`backend/src/services/battle/lobby.js:46-62`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L46-L62) (`buildLobby`) — Phòng lớp (`kind: 'class'`) làm sai tổng `subjects[].waiting`, vi phạm cờ tắt `lobby`, và có thể bị cắt mất bởi `slice(0, 100)`:**
   - Phòng `class` được đẩy chung vào `waiting` (dòng 53). Hệ quả: (a) Khi `battle_modes.lobby = false` nhưng `class = true`, dòng 60 vẫn cộng phòng `class` vào `subjects` (trái phản biện #11 *"nhóm mới rỗng"*); (b) Ở giao diện [ArenaLobby.jsx](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/frontend/src/pages/battle/ArenaLobby.jsx#L336-L344), phòng `class` được tách lên khu ghim riêng nên số đếm `waiting` ở tiêu đề môn bị dư `+1` so với số thẻ phòng chờ của môn đó; (c) Dòng 56 xếp theo `a.capacity - a.players`: phòng `class` (`capacity: 50`) luôn bị đẩy xuống cuối mảng `waiting` và sẽ bị `waiting.slice(0, 100)` cắt mất nếu có > 100 phòng chờ.
3. **[`backend/src/services/battle/lobbyCache.js:6-15`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobbyCache.js#L6-L15) (`createLobbyCache`) — Lỗi thứ tự `Map` khi hết TTL gây xóa nhầm entry đang `pending` và đệ quy vô hạn:**
   - Khi key cũ hết hạn (`!e.pending && now() - e.at >= ttl`), `entries.set(key, e)` cập nhật tại chỗ mà **không đưa `key` về cuối `Map`**. Khi cache đầy (`entries.size > max`), `entries.delete(entries.keys().next().value)` (dòng 9) xóa chính `key` vừa tạo đang `pending: true`. Khi `await e.promise` xong, dòng 14 `if (entries.get(key) !== e) return this.get(key)` tự gọi đệ quy lại liên tục dưới tải đồng thời cao. Cần `entries.delete(key)` trước khi `entries.set(key, e)` và chỉ retry khi bị `delete(key)` tường minh.
4. **[`backend/src/services/battle/lobby.js:11-13`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L11-L13), [`deck.js:34`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/deck.js#L34) & [`dto.js:60,124`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/dto.js#L60) — Mất ngữ nghĩa "chọn cả Chương" và lệch bộ lọc Chương ở Frontend:**
   - `normalizeScope` ([`deck.js:34`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/deck.js#L34)) biến `scope.chapter` thành mảng `topic_ids` và xóa trường `chapter`. Do đó `scopeLabel` ([`lobby.js:11-13`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/lobby.js#L11-L13)) luôn hiển thị phòng chọn cả chương thành `"Chương I · N bài"` kèm mảng `topics` dài toàn chương; đồng thời `r.scope.chapter` không tồn tại trong `lobbyCard`/`liveCard`, làm bộ lọc `ch:` ở [`ArenaLobby.jsx:368-370`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/frontend/src/pages/battle/ArenaLobby.jsx#L368-L370) luôn lọc ra 0 phòng nếu không đổi sang đọc `r.scope_label.chapter`.
5. **[`backend/src/services/battle/rooms.js:287-295`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js#L287-L295) & [`matchmaking.js:112`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/matchmaking.js#L112) — Nhân bản tính toán 300 lần mỗi nhịp phát SSE & `started_at: null` ở pha đếm ngược:**
   - Mỗi lần `streams.publish('lobby')` gửi tới 300 luồng SSE, `battleRooms.lobby()` chạy lại 300 lần `[...entries.values()].map(refresh)` và tính lại `scopeLabel(r.scope, catalog)` cho từng phòng thay vì gắn sẵn `scope_label` trên phòng hoặc cache theo nhịp khối. Ngoài ra ở [`rooms.js:290`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js#L290), dùng `r.play_started_at ?? null` thay vì `r.play_started_at ?? r.started_at ?? null` làm phòng đang đếm ngược (`status: 'playing'`, `phase: 'countdown'`) bị `started_at: null`.

---

### 4. Năm ý tưởng nâng cao (Xếp theo Giá trị / Công sức giảm dần)

1. **Huy hiệu `🎯 Bài em đang học` / `💪 Bài cần gỡ điểm` ngay trên thẻ Sảnh** *(Giá trị: Rất cao · Công sức: Rất thấp)*
   - Đối chiếu `topic_ids` của thẻ phòng / nhóm `seeking` với `optionsCatalog.suggestions` đã có sẵn ở client ([`FindMatchSheet.jsx:96-109`](file:///C:/Users/Duong%20Hieu/Desktop/ngan%20hang%20cau%20hoi/nganhang-personalized-v6.3/frontend/src/pages/battle/components/FindMatchSheet.jsx#L96-L109)) để gắn nhãn trực tiếp lên thẻ phòng. Học sinh chưa biết đấu gì thấy ngay phòng khớp bài mình vừa học trên lớp.
2. **Nút `⚡ Đấu cùng` tự động ưu tiên vào phòng chờ sẵn trước khi xếp hàng** *(Giá trị: Rất cao · Công sức: Thấp)*
   - Khi bấm `⚡ Đấu cùng` ở một Môn/Chương: nếu trên sảnh vừa có phòng chờ công khai cùng phạm vi còn chỗ thì vào thẳng phòng đó; nếu chưa có mới gọi `POST /match` với `flex: 'gradual', bot_fill: true` để đảm bảo luôn có trận trong ≤ 20 giây.
3. **Nút `"Đặt gạch đấu tiếp"` trên các ván Đang đấu sắp xong (`asked_count >= question_count - 2`)** *(Giá trị: Cao · Công sức: Trung bình)*
   - Ván đang ở câu 6/7 hoặc 9/10 chỉ còn ~20 giây là tan. Cho phép bấm `[Đặt gạch đấu Chương này]` để tạo sẵn vé/phòng chờ cùng phạm vi, đón đầu ngay nhóm người chơi vừa kết thúc ván đó muốn đấu tiếp.
4. **Đấu với "Bóng ma" (Ghost Replay) của ván vừa kết thúc trong giờ vắng** *(Giá trị: Cao · Công sức: Trung bình)*
   - Lưu lại mốc thời gian & điểm từng câu (ẩn danh) của một số ván hoàn thành trong ngày để học sinh vào giờ thấp điểm có thể bấm `"Thử sức bộ đề này"`, đua điểm theo nhịp câu hỏi thật của bạn cùng khối mà không cần người online đồng thời hay mở quyền Khán giả.
5. **Nhãn `🔥 Chương nóng tuần này` theo thống kê ván đấu 24h trong RAM** *(Giá trị: Trung bình · Công sức: Thấp)*
   - Đếm nhẹ số ván đã đấu theo `(grade, subject_id, chapter)` trong RAM 24h qua để gắn nhãn `🔥 Ôn nhiều` lên 2 Chương đầu bảng, giúp học sinh vào mùa kiểm tra chọn ngay tâm điểm ôn tập của cả khối.
