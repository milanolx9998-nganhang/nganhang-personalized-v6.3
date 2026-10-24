# V6.9.5 — Grok phản biện bản 655e4dc (24/10/2026)

Grok 4.7 qua CLI, chỉ đọc. Phân loại của Claude ở cuối.

Tôi sẽ chỉ đọc các file ưu tiên trong bản sạch `655e4dc` và viết báo cáo các lỗ hổng Argon còn bỏ sót.## Còn sót

1. `backend/src/services/vocab/matchQueue.js:5` — Vé trong `entries` không hết hạn; `rooms.js:315` khi rớt SSE chỉ đánh dấu `disconnected` trong phòng, không gọi `vocabQueue.removeUnlocked`. Đóng tab hoặc mất mạng: vé nằm đến khi tắt máy. Vòng `match` mỗi giây vẫn tính vé đó, có thể ghép thành trận với người đang online (đối thủ vắng). Xóa vé khi đóng SSE sảnh, khi `pagehide`, và sau một thời hạn chờ (vài phút); đừng ghép vé đã quá hạn.

2. `backend/src/services/vocab/catalog.js:24` — `vocabCount` tải mọi dòng rồi gọi `generateVocabQuestions(..., {count:15})` chỉ để biết có đủ câu không. `matchQueue.js:19` gọi mỗi lần vào hàng; `matchQueue.js:33` gọi lại mỗi vòng ghép (1 giây/nhóm). Bộ Bufopia 1.404 từ hoặc gộp nhiều cấp HSK: mỗi học sinh bấm tìm bạn là một lần sinh đề đầy đủ, và nhóm đang chờ lặp lại việc đó mỗi giây. Đếm bằng SQL (`COUNT` dòng `approved` trừ trùng `term`/`meaning`) hoặc cache theo bộ id; chỉ sinh đề lúc tạo phòng.

3. `backend/src/services/vocab/generator.js:117` — Vòng hai hỏi lại cùng một dòng bằng dạng khác. Trận cần 10 câu (`matchQueue.js:4`) nhưng sàn chỉ 8 từ (`catalog.js:5`). Bộ 8 từ luôn có ít nhất hai câu trùng từ: EN1 (đáp án là nghĩa) đứng cạnh EN2 (đề là chính nghĩa đó); ZH1/ZH2 và ZH3/ZH4 cũng thế. Học sinh thấy câu sau là biết câu trước. Cấm cặp dạng bổ sung cho nhau trên cùng `entry_id` trong một ván; nếu không đủ câu độc nhất thì từ chối trận, đừng đắp cho đủ 10.

4. `backend/src/services/vocab/generator.js:28` — `conflicts` coi cùng `term` là xung đột nên nghĩa kia không được làm nhiễu, nhưng đề EN1/ZH1/ZH3 (`generator.js:51`) không kèm loại từ, phiên âm hay ví dụ. Hai dòng `行` / `bank` trong một ván ra hai câu cùng chữ, khác đáp án. ZH3 (`generator.js:60`) còn sinh biến thể thanh và không đối chiếu các cách đọc khác của chính chữ đó: `chà` → nhiễu `chā` trong khi `chā` cũng là cách đọc đúng. Gộp các cách đọc của cùng chữ vào một câu (chấp nhận mọi cách đọc trong kho) hoặc ghi cách đọc/nghĩa lên đề để phân biệt; loại biến thể thanh nếu nó trùng `reading` của một dòng cùng `term`.

5. `backend/src/services/battle/storage.js:20` — `countVocab` lấy mọi câu `idx < asked_count` rồi câu không có đáp án tính là sai cho mọi `battle_players`. Quiz lớp tự chơi tăng `asked_count` theo người xa nhất (`selfPaced.js:11`), không theo từng em. Em đang ở câu 1 khi bạn khác đã mở câu 10: chín từ em chưa thấy bị ghi `wrong` vào `vocab_student_stats`. Màn "Từ em sai" (chỉ câu đã phát cho em) và thống kê giáo viên lệch nhau. Chỉ cộng những câu có trong tiến độ của đúng học sinh đó (`issued_count` / đáp án của em).

6. `frontend/src/pages/battle/components/VocabBattle.jsx:190` — Poll `/me`: không thấy `vocab_queue` và cũng không thấy `current_room_id` thì `onCancelled`. `matchQueue.js:39` xóa vé trước khi `createUnlocked` sinh đề và ghi phòng. Đúng lúc đó poll coi như bị hủy. `ArenaLobby.jsx:303` chỉ `setVocabQueue(null)`, không `fetchMe`. SSE sảnh chỉ mở khi có lobby/lớp/ghép bài (`ArenaLobby.jsx:182`); bật mỗi cờ từ vựng thì không có luồng kéo em vào phòng. Em ở lại sảnh trong khi đã bị xếp vào trận. Trong lúc tạo phòng hãy giữ vé hoặc trả trạng thái `matching`; poll chỉ hủy khi server bảo đã rời hàng; sau đó gọi lại `/me`.

7. `backend/src/services/vocab/bank.js:35` — Cột `level`/`cap`/`hsk` bị tách số: `A1` thành `1`. Có level thì bộ mới được `kind='hsk'` (`bank.js:84`). `catalog.js:35` thấy `kind==='hsk'` là gán `language:'zh'` dù từ tiếng Anh. Bộ Bufopia có cột level/CEFR bị coi là HSK, giao diện chỉ đưa dạng câu tiếng Trung, máy không sinh được vì `term` không phải chữ Hán. Chỉ gán `hsk` khi môn là Trung hoặc khi `term` là chữ Hán; `A1`/`B2` không được thành cấp HSK.

8. `backend/src/services/vocab/generator.js:13` — `meaningParts` cắt theo dấu phẩy và `/`. Nghĩa kiểu "trường học, nơi em đến mỗi ngày" hoặc "big, large" thành nhiều mảnh; mảnh nào trùng khít một từ khác thì hai từ thành đồng nghĩa, không được làm nhiễu cho nhau. Bộ toàn nghĩa câu có dấu phẩy (Bufopia) dễ hết nhiễu, câu bị bỏ, `vocabCount` báo không chơi được dù có hàng nghìn từ. Chỉ tách `;` và dấu `/` có khoảng trắng; đừng cắt mọi dấu phẩy. So khớp cả cụm đã chuẩn hóa, không so từng mảnh ngắn.

9. `backend/src/services/vocab/bank.js:42` — Pinyin nhiều chữ không dấu bị từ chối, trừ khi chuỗi có chữ số 1–5. Pinyin số (`ni3 hao3`, `ma5`) và nhiều cách đọc CC-CEDICT (`xing2/hang2`) được nhập nguyên. `toneVariants` (`generator.js:18`) chỉ đổi nguyên âm đã có dấu, nên ZH3/ZH4 hỏi đúng chuỗi thô, không có nhiễu thanh. Từ khinh thanh hai chữ không dấu (`dehua`) bị chặn. Khi nhập: đổi pinyin số sang dấu, tách cách đọc bằng `/` thành nhiều dòng hoặc nhiều đáp án đúng, và cho phép âm tiết không dấu đứng sau âm đã có dấu.

10. `backend/src/services/practice/importAdapters.js:11` — `safeZip` chỉ tin `header.size` và tỷ lệ khai trong mục lục zip, không giải nén để đo. Tệp 5 MB (`routes/vocab.js:11`) khai kích thước nhỏ rồi bung rất lớn khi `XLSX.read` (`bank.js:27`). Ô công thức không bị bỏ: không có giá trị cache thì chuỗi `=HYPERLINK(...)` / `=CMD|` thành `meaning_vi` và lọt vào đề. JSON (`bank.js:25`) `JSON.parse` cả tệp, không giới hạn độ lồng. Đo dung lượng sau khi giải, từ chối mục không phải XML của xlsx; bỏ ô bắt đầu bằng `=+-@`; từ chối JSON sâu hoặc không phải mảng đối tượng phẳng.

11. `backend/src/services/battle/rooms.js:311` — Dừng khẩn cấp xóa hàng rồi mới duyệt phòng đang có. `create` (`matchQueue.js:39`) đã xóa vé và đang `createUnlocked` thì phòng mới không nằm trong danh sách bị `finish`. Tắt cờ `vocab` không vào nhánh này: ván đã mở vẫn chạy; hàng chỉ tan ở vòng `match` kế (`matchQueue.js:48`). Trong `createUnlocked`, kiểm tra lại cờ và `battle_emergency_stop` ngay trước khi ghi phòng; tắt cờ từ vựng thì hủy các phòng từ vựng chưa xong cùng với hàng chờ.

12. `backend/src/services/vocab/bank.js:69` — Bản xem trước giữ cả `rows` thô trong RAM 15 phút, trần 50 bản cho mọi giáo viên, không trần theo người. Token có kiểm `actor` nên không xác nhận chéo tài khoản được, nhưng một người mở nhiều tab 5.000 dòng sẽ chiếm slot và bộ nhớ của cả trường; xác nhận lỗi thì `bank.js:94` nhét lại đúng bản đó. Trần theo user, chỉ giữ các dòng đã qua `inspect`, và đừng phục hồi token sau lỗi logic (chỉ phục hồi khi lỗi hạ tầng).

`clean()` không đổi chữ đã lưu (NFC, gộp khoảng trắng). Hỏng dữ liệu nằm ở bước gán `kind`/`language` và ở cách sinh câu, không phải ở chỗ sửa nghĩa trong DB. Chưa mở file dữ liệu đã nạp nên không đếm được bao nhiêu dòng HSK trùng `term` hay còn pinyin số.

## Ba việc làm trước

1. Bỏ sinh đề khỏi `vocabCount`; thêm hạn vé và cách gỡ vé khi rời trang; sửa poll để không hủy giữa lúc tạo phòng.
2. Siết luật sinh câu: không hỏi lại dạng bổ sung, phân biệt từ trùng chữ, không dùng biến thể thanh nếu đó là cách đọc thật khác, ngừng cắt nghĩa bằng mọi dấu phẩy.
3. Thống kê Quiz lớp theo đúng câu từng em đã nhận; chặn nhập nhầm bộ Anh thành HSK; chuẩn hóa pinyin lúc nhập; đo zip sau khi giải nén.

Đối chiếu bằng đọc có giới hạn (grep + đọc đoạn), không dùng LSP/`cg`, không sửa file, không chạy test.

---

## Phân loại của Claude

Sửa (sau khi Codex xong phần phát âm, tránh sửa chồng file): 1 (hạn vé + gỡ vé khi rời), 2 (cache `vocabCount`), 3 (cấm cặp dạng bổ sung trên cùng từ), 5 (`countVocab` theo tiến độ từng em ở Quiz lớp tự chơi), 6 (poll `/me` chờ hai nhịp trước khi coi là huỷ), 7 (chỉ coi là bộ HSK khi từ là chữ Hán), 12 (trần bản xem trước theo người).
Để lại: 4 (từ trùng chữ khác nghĩa — dữ liệu HSK/Bufopia hiện không có), 8 (tách nghĩa theo dấu phẩy — thiên về an toàn), 9 (pinyin số — dữ liệu HSK đã có dấu), 10 (zip/công thức — chỉ nhân sự nhập, đã giới hạn 5 MB), 11 (dừng khẩn cấp đua tạo phòng — hiếm).
