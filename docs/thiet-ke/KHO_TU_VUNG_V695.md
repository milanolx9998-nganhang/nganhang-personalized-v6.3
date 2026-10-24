# Kho từ vựng & Đấu từ vựng — V6.9.5 (kế hoạch 1.0, 24/10/2026)

> Trạng thái: **bản nháp chờ anh Hiếu duyệt**, chưa có mã. Sau khi duyệt: giao Codex phản biện backend, Argon phản biện giao diện (như V6.9.3/V6.9.4).

## 1. Câu hỏi của anh Hiếu và trả lời ngắn

> "Battle bên tiếng Anh có kho từ vựng để đấu từ vựng riêng, vậy bên admin cũng cần một kho từ vựng của tiếng Anh và tiếng Trung, đúng không?"

**Đúng — nhưng là kho riêng, không nhét từ vựng vào ngân hàng câu hỏi.** Lý do:

| | Nhét vào ngân hàng câu hỏi | Kho từ vựng riêng (đề xuất) |
|---|---|---|
| Nhập liệu | 1 từ = 4–6 câu soạn tay (nghĩa, viết, ghép…) | 1 từ = 1 dòng Excel; máy tự sinh câu |
| Phương án nhiễu | cố định, chép đi chép lại | bốc mỗi trận từ các từ cùng Unit / cùng loại từ |
| Duyệt | mỗi câu qua quy trình duyệt nặng | duyệt theo dòng từ, nhẹ |
| Thống kê | theo câu | theo **từ**: "em hay sai từ nào" |
| Tiếng Trung | không có chỗ cho pinyin, thanh điệu | có trường riêng: chữ Hán, pinyin, Hán Việt |

Một từ là một "nguyên liệu"; câu hỏi là "món" máy nấu từ nguyên liệu lúc vào trận.

## 2. Hiện trạng mã (đã kiểm)

- Môn `TiengAnh` có sẵn; chương trình đã có cấu trúc **Unit = Chương**, mỗi Unit có Bài "Vocabulary: …" (`seed-kntt.js`). → gắn từ vào Unit/Bài được ngay.
- **Chưa có môn Tiếng Trung** trong seed (`grep` không thấy). Cần anh xác nhận trường có dạy, khối nào, sách nào.
- Đấu bốc câu ở `services/battle/deck.js` từ ngân hàng (`USABLE_*`, kho `school`, 4 loại câu tự chấm).
- **Điểm vướng kỹ thuật:** bảng `battle_questions` bắt buộc `question_version_id` (khóa ngoại tới `question_versions`), và khi nạp lại phòng thì JOIN lấy nội dung câu (`storage.js:45`). Câu sinh từ từ vựng không có phiên bản câu hỏi → phải mở đường riêng (mục 5.3).

## 3. Phạm vi

**Làm:**
1. Kho từ vựng Tiếng Anh + Tiếng Trung ở trang quản trị: xem, lọc, sửa, nhập Excel (xem trước → xác nhận, như nhập danh sách HS), duyệt.
2. Máy sinh câu hỏi từ từ vựng (6 dạng Anh, 6 dạng Trung).
3. Chế độ **Đấu từ vựng** trong Đấu trường (đôi, nhiều người, với máy) và trong Quiz lớp của giáo viên.
4. Thống kê theo từ: từ em hay sai, từ cả lớp hay sai.

**Chưa làm (giai đoạn sau):** ghi âm phát âm của HS và chấm nói; ảnh minh hoạ cho từ; flashcard lặp lại ngắt quãng (SRS) đầy đủ; chép nguyên câu ví dụ từ sách giáo khoa.

## 4. Dữ liệu

### 4.1 Một dòng từ vựng (`vocab_entries`)

| Trường | Anh | Trung | Ghi chú |
|---|---|---|---|
| `subject_id`, `grade` | ✓ | ✓ | |
| `chapter` (Unit) / `topic_id` (Bài) | ✓ | ✓ | `topic_id` để lọc giống sảnh/gợi ý bài |
| `term` | từ / cụm từ | chữ Hán | bắt buộc |
| `reading` | IPA (tuỳ chọn) | **pinyin có dấu** (bắt buộc) | pinyin lưu cả dạng số `ni3 hao3` để sinh câu thanh điệu |
| `han_viet` | – | tuỳ chọn | |
| `pos` | n / v / adj / adv / phr… | danh/động/tính/lượng từ… | dùng chọn phương án nhiễu cùng loại |
| `meaning_vi` | ✓ | ✓ | bắt buộc; nhiều nghĩa ngăn bằng `;` |
| `example`, `example_vi` | tuỳ chọn | tuỳ chọn | **do giáo viên tự viết**, không chép hàng loạt từ sách |
| `accept` | cách viết chấp nhận thêm (colour/color) | – | dùng cho dạng gõ |
| `confusable_group` | nhóm từ đồng nghĩa / dễ nhầm | | không bao giờ làm nhiễu cho nhau → tránh câu có 2 đáp án đúng |
| `level` | 1 nhận biết / 2 thông hiểu | | |
| `status` | `draft` → `approved` → `retired` | | chỉ `approved` vào trận |
| `created_by`, `approved_by`, thời điểm | | | audit |

Khoá trùng: (`subject_id`, `grade`, `lower(term)`, `meaning_vi`) — cùng từ khác nghĩa là 2 dòng.

### 4.2 Bảng khác
- `vocab_student_stats(student_id, entry_id, seen, correct, last_wrong_at)` — cập nhật sau mỗi trận / lượt luyện; không đụng `mastery_events` (giữ nguyên quy tắc Đấu không tính thành thạo).
- Battle: thêm đường câu từ vựng (5.3).

### 4.3 Quy mô ước tính
Anh 6–9: ~12 Unit × 20–30 từ × 4 khối ≈ 1.000–1.400 từ. Trung: tuỳ chương trình, thường ít hơn. Bảng nhỏ — cache theo khối 60 giây như deck hiện tại là đủ.

## 5. Sinh câu hỏi

### 5.1 Dạng câu — Tiếng Anh
| Mã | Dạng | Hiển thị bằng loại câu sẵn có | Giây gợi ý |
|---|---|---|---|
| EN1 | Từ → nghĩa | `multiple_choice` 4 phương án | 8 |
| EN2 | Nghĩa → từ | `multiple_choice` | 8 |
| EN3 | Điền từ vào câu ví dụ (chỉ khi có `example`) | `multiple_choice` | 12 |
| EN4 | Gõ đúng chính tả từ nghĩa | `short_answer` (không phân biệt hoa/thường, khoảng trắng; nhận `accept`) | 15 |
| EN5 | Ghép 4 từ – 4 nghĩa | `matching` | 20 |
| EN6 | Nghe → chọn từ (đọc bằng giọng máy của trình duyệt) | `multiple_choice` + nút loa | 10 — **giai đoạn 3** |

### 5.2 Dạng câu — Tiếng Trung
| Mã | Dạng | Loại câu | Giây |
|---|---|---|---|
| ZH1 | Chữ Hán → nghĩa | `multiple_choice` | 8 |
| ZH2 | Nghĩa → chữ Hán | `multiple_choice` | 8 |
| ZH3 | Chữ Hán → pinyin (nhiễu = cùng âm khác thanh) | `multiple_choice` | 8 |
| ZH4 | Pinyin → chữ Hán | `multiple_choice` | 8 |
| ZH5 | Chọn thanh điệu đúng của chữ | `multiple_choice` 4 thanh | 6 |
| ZH6 | Ghép 4 chữ – 4 nghĩa | `matching` | 20 |

Không có dạng gõ chữ Hán (bàn phím HS không tiện). Gõ pinyin số (`ni3`) để giai đoạn sau nếu thầy cô muốn.

### 5.3 Đưa vào trận — hai cách, đề xuất cách A

**A. Ảnh chụp nội dung trong trận (đề xuất).** Migration bổ sung (không xoá gì):
- `battle_questions`: thêm `source text DEFAULT 'bank'`, `vocab_entry_ids int[]`, `content_snapshot jsonb`; cho `question_version_id`, `question_id` được NULL kèm `CHECK (source='bank' AND question_version_id IS NOT NULL OR source='vocab' AND content_snapshot IS NOT NULL)`.
- `storage.js` nạp phòng: `LEFT JOIN` + `COALESCE(v.content, q.content_snapshot)`.
- `deck.js`: thêm `drawVocab(room)` sinh câu (seed ngẫu nhiên lưu cùng phòng để tái dựng được), trả đúng hình dạng câu như ngân hàng → engine, chấm, DTO, giao diện chơi **dùng lại gần như nguyên**.
- Rủi ro: cổng kiểm migration có thể chặn `DROP NOT NULL` → Codex kiểm; nếu chặn thì dùng cách B.

**B. Bảng riêng `battle_vocab_questions`** cùng khoá (`room_id`, `idx`), storage gộp hai nguồn. Không đụng ràng buộc cũ, nhưng mọi chỗ đọc câu phải hợp hai bảng.

### 5.4 Chọn phương án nhiễu
Ưu tiên: cùng Unit + cùng loại từ → cùng khối + cùng loại từ → cùng khối. Loại bỏ: cùng `confusable_group`, nghĩa trùng (so khớp sau chuẩn hoá), cùng `term`. Không đủ 3 nhiễu thì không sinh dạng đó cho từ ấy. Phạm vi trận cần **≥ 8 từ đã duyệt** (đôi 7 câu), **≥ 12 từ** cho trận 10–15 câu.

## 6. Chế độ Đấu từ vựng

- **Cờ mới** `battle_modes.vocab` (mặc định tắt, bật ở `/admin/battle`), như các cờ V6.9.3.
- **Sảnh:** khi chọn môn Anh/Trung có thêm nút **"⚡ Đấu từ vựng"** cạnh "Đấu cùng bài này"; thẻ gợi ý bài "Vocabulary: …" mở thẳng trận từ vựng.
- **Ghép trận:** vé có `content:'vocab'`; chỉ ghép vé từ vựng với nhau (không trộn câu bài học). Mở rộng phạm vi giữ nguyên quy tắc: Unit → các Unit đã học → cả khối.
- **Nhịp:** đồng bộ từng câu, 8–15 giây/câu, mặc định 10 câu. Từ vựng là kiến thức nhớ nhanh nên **tính điểm theo tốc độ được phép** ở chế độ này (khác Đấu bài học giữ "Đúng là chính"). Xếp hạng (LP) **không tính** trận từ vựng ở bản đầu, tránh cày điểm.
- **Quiz lớp (giáo viên):** khi tạo Quiz chọn "Nội dung: Câu hỏi bài học / Từ vựng"; với Từ vựng chọn Unit, số câu, dạng câu được phép (ví dụ chỉ EN1+EN2 cho lớp 6 đầu năm).
- **Sau trận:** màn kết quả có danh sách "Từ em sai" (từ, nghĩa, pinyin/IPA, câu ví dụ) và nút "Luyện lại các từ này".

## 7. Trang quản trị "Kho từ vựng"

Vị trí: **Ngân hàng & Nội dung → Kho từ vựng** (`/admin/vocab`; giáo viên tổ Ngoại ngữ thấy cùng trang, chỉ môn mình dạy).

- **Danh sách:** lọc Môn · Khối · Unit · Trạng thái · tìm từ; cột Từ | Pinyin/IPA | Nghĩa | Loại từ | Unit | Trạng thái; sửa trên dòng.
- **Nhập Excel:** tải mẫu (2 mẫu: Anh, Trung) → chọn file → xem trước từng dòng: Thêm mới / Cập nhật / Trùng / Lỗi (thiếu nghĩa, pinyin sai dấu, Unit không tồn tại) → Xác nhận. Giống luồng nhập danh sách HS đã dùng tốt.
- **Duyệt:** người nhập là giáo viên → `draft`; tổ trưởng Ngoại ngữ hoặc admin bấm "Duyệt các từ đã chọn". Admin nhập thì được chọn "duyệt luôn".
- **Độ phủ:** bảng Unit × số từ đã duyệt, đánh dấu Unit chưa đủ 8 từ (chưa đấu được) — giống bảng độ phủ bài học V6.8.
- **Gợi ý bằng AI (tuỳ chọn, giai đoạn 2):** dán danh sách từ → máy điền nháp IPA/pinyin/nghĩa/loại từ → luôn ở trạng thái `draft`, giáo viên duyệt. Pinyin do AI điền phải được giáo viên Trung kiểm.
- **Quyền:** xem: GV môn; nhập/sửa: GV môn (draft); duyệt/xoá mềm (`retired`): tổ trưởng, admin. Mọi thay đổi ghi audit.

## 8. Luyện từ vựng một mình (giai đoạn 3)
Trên trang Tự luyện của HS: "Luyện từ vựng Unit X" — 10 câu trộn dạng, không giới hạn giờ; ưu tiên từ em hay sai (`vocab_student_stats`). Đây là bước đệm trước khi làm SRS thật.

## 9. Giai đoạn và tiêu chí nghiệm thu

| GĐ | Nội dung | Kiểm chứng |
|---|---|---|
| 0 | Anh duyệt kế hoạch; chốt mục 10; Codex + Argon phản biện | file phản biện trong `docs/thiet-ke/phan-bien/` |
| 1 | Migration `vocab_entries`, `vocab_student_stats`; API CRUD + nhập Excel + duyệt; trang Kho từ vựng; mẫu Excel Anh/Trung | unit: chuẩn hoá pinyin/term, phát hiện trùng; integration: nhập 300 dòng, quyền theo vai trò; Playwright: nhập → duyệt, mobile 390 px |
| 2 | Bộ sinh câu EN1–5, ZH1–6; đường câu từ vựng vào Đấu (5.3); cờ `vocab`; nút sảnh; ghép trận `content:'vocab'`; Quiz lớp chọn Từ vựng; "Từ em sai" | unit: không có câu 2 đáp án đúng trên 1.000 lần sinh; nhiễu cùng Unit; integration: trận đôi + Quiz lớp từ đầu đến kết quả; tải: 40 HS × 15 câu ACK p95 không tệ hơn Quiz lớp hiện tại |
| 3 | Luyện từ vựng một mình, thống kê từ hay sai (HS + GV), EN6 nghe | Playwright trên server thử |

Mỗi giai đoạn: build, unit, security, integration Đấu xanh; thử trên DB sao chép; anh duyệt rồi mới "up main".

## 10. Cần anh Hiếu chốt

1. **Tiếng Trung:** trường dạy khối nào, sách nào? Có cần Hán Việt không?
2. **Nguồn từ:** thầy cô tổ Anh/Trung có sẵn danh sách từ theo Unit (Excel/Word) không? Có → em làm mẫu Excel khớp file đó.
3. **Ai duyệt:** tổ trưởng Ngoại ngữ, hay giáo viên tự duyệt từ của mình cho nhanh?
4. **Tốc độ tính điểm** trong Đấu từ vựng: đồng ý "trả lời nhanh được thêm điểm" cho riêng chế độ này?
5. **Xếp hạng:** trận từ vựng có cộng LP không? (Đề xuất: chưa.)
6. **Cách đưa vào trận:** A (ảnh chụp nội dung, đề xuất) hay B (bảng riêng) — em để Codex kiểm cổng migration rồi chốt.
