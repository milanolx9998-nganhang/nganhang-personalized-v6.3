# KHTN 7 — Vật lí: nạp Bài và liên kết Bài ↔ YCCĐ

Ngày: 2026-09-23 · Nguồn: `Outcome_YCCD_KHTN_7_VatLi_NangLuongVaSuBienDoi_v2.xlsx` và
`ThongKe_YCCD_theo_Bai_SGK_KHTN7.xlsx` · Chương trình GDPT 2018 (TT 32/2018/TT-BGDĐT).

---

## 1. Vì sao cần script, không phải chỉ push mã

Dữ liệu chương trình nằm trong **cơ sở dữ liệu**, không đi theo git. Đẩy mã lên GitHub không mang
theo bảng `topics` hay `topic_yccd_map`. Vì vậy:

- dữ liệu nguồn đã được trích sẵn thành `backend/src/db/seed-data/khtn7-vatli-lessons.json` và
  **commit cùng mã**;
- máy chủ chỉ cần chạy một lệnh sau khi deploy:

```bash
cd backend && npm run seed:khtn7-lessons
```

Xem trước mà không ghi gì:

```bash
cd backend && node src/db/seed-khtn7-vatli-lessons.js --dry-run
```

Script **idempotent**: chạy lại không sinh dữ liệu trùng (đã kiểm: lần hai báo
`topics_reused: 13, links_already_present: 31`).

---

## 2. Quyết định quan trọng: giữ nguyên cách đánh số hiện có

Hai nguồn đánh số YCCĐ **khác nhau**, và đây là điều cần anh biết rõ:

| | Cách đánh số YCCĐ | Số Outcome Vật lí |
|---|---|---|
| Cơ sở dữ liệu hiện tại (từ `Outcome_YCCD_KHTN_7.xlsx` chính thức) | **1..n trong từng Outcome** | 10 (L.1–L.10) |
| Tệp mới anh gửi | **STT 19–49 toàn khối 7** | 13 (tách nhỏ hơn) |

Cả hai đều mô tả **đúng 31 YCCĐ Vật lí như nhau** — em đã đối chiếu và **31/31 khớp nguyên văn**.
Chỉ khác cách nhóm và cách đánh số.

**Em giữ nguyên cấu trúc đang có trong cơ sở dữ liệu**, và chỉ dùng tệp mới cho phần đang thiếu là
Bài và liên kết Bài ↔ YCCĐ. Lý do:

- mã câu hiện hành tham chiếu theo cấu trúc đang có — `Câu L. 1. 3.` nghĩa là Outcome L.1, YCCĐ số 3;
- đổi sang cấu trúc 13 Outcome với STT 19–49 sẽ làm **mọi mã câu đã viết cho khối 7 trỏ sai**;
- việc đổi chuẩn đánh số là quyết định của người phụ trách chương trình, không phải của phần mềm.

Nếu anh muốn dùng cách đánh số STT 19–49 làm chuẩn, nói em biết — đó là một lần nạp lại chương trình
khối 7 thành phiên bản mới, và mã câu khối 7 sẽ phải viết theo STT.

---

## 3. Cách ghép dữ liệu

YCCĐ được đối chiếu bằng **nguyên văn**, không bằng số thứ tự — vì hai nguồn đánh số khác nhau thì
ghép theo số chắc chắn sai. Thiếu một YCCĐ nào, script dừng và liệt kê; không đoán.

```
Tệp thống kê:  Bài 9. Đo tốc độ  ←  STT 21
                                     ↓ đối chiếu nguyên văn
Cơ sở dữ liệu:                    L.1.3  "Mô tả được sơ lược cách đo tốc độ…"
                                     ↓
                            topic_yccd_map(Bài 9, L.1.3)
```

Mỗi liên kết lưu `source_evidence` gồm tên tệp nguồn, STT gốc và nhãn trong cơ sở dữ liệu, để về sau
truy vết được vì sao Bài này gắn với YCCĐ kia.

---

## 4. Kết quả đã nạp

13 Bài (Bài 8 → Bài 20), 4 chương, 31 liên kết Bài ↔ YCCĐ.

| Bài | STT YCCĐ | Nhãn trong CSDL |
|---|---|---|
| 8. Tốc độ chuyển động | 19–20 | L.1.1, L.1.2 |
| 9. Đo tốc độ | 21 | L.1.3 |
| 10. Đồ thị quãng đường – thời gian | 22–23 | L.1.4, L.1.5 |
| 11. Thảo luận ảnh hưởng của tốc độ trong ATGT | 24 | L.1.6 |
| 12. Sóng âm | 25–26 | L.2.1, L.2.2 |
| 13. Độ to và độ cao của âm | 27–30 | L.3.1 … L.3.4 |
| 14. Phản xạ âm, chống ô nhiễm tiếng ồn | 31–32 | L.4.1, L.4.2 |
| 15. Năng lượng ánh sáng. Tia sáng, vùng tối | 33–35 | L.5.1 … L.5.3 |
| 16. Sự phản xạ ánh sáng | 36–38 | L.6.1 … L.6.3 |
| 17. Ảnh của vật qua gương phẳng | 39–40 | L.7.1, L.7.2 |
| 18. Nam châm | 41–42 | L.8.1, L.8.2 |
| 19. Từ trường | **43–47, 49** | L.9.1 … L.9.6 |
| 20. Chế tạo nam châm điện đơn giản | **48** | L.10.1 |

Chú ý hai dòng in đậm: STT của Bài 19 **không liền mạch** (49 nằm sau 48 của Bài 20). Đếm dồn theo
thứ tự sẽ gán sai chỗ này — có ca kiểm thử riêng khóa lại đúng trường hợp đó.

---

## 5. Kiểm chứng trên máy

Mã câu khối 7 giờ tự gắn Bài:

```
Câu L. 1. 1. NB. 1. TN   →  L.1 / L.1.1 / Bài 8. Tốc độ chuyển động
Câu L. 1. 3. TH. 1. TN   →  L.1 / L.1.3 / Bài 9. Đo tốc độ
Câu L. 1. 6. VD. 1. TN   →  L.1 / L.1.6 / Bài 11. Thảo luận về ảnh hưởng của tốc độ trong ATGT
Câu L. 3. 4. TH. 1. TN   →  L.3 / L.3.4 / Bài 13. Độ to và độ cao của âm
Câu L. 9. 6. NB. 1. TN   →  L.9 / L.9.6 / Bài 19. Từ trường
Câu L. 10. 1. VD. 1. TN  →  L.10 / L.10.1 / Bài 20. Chế tạo nam châm điện đơn giản
```

Tất cả đều `AUTO_MAPPED` — giáo viên không phải chọn Bài.

Khớp với fixture đã xác nhận trong audit: KHTN7 Bài 8 → L.1.1, L.1.2 · Bài 9 → L.1.3.

---

## 6. Còn thiếu

- **Hóa học và Sinh học khối 7** chưa có Bài và liên kết. Cần tệp thống kê tương tự cho hai phân môn
  đó; script hiện chỉ nạp phần Vật lí (`branch_code: "L"`).
- Các khối 6, 8, 9 chưa có Bài nào.
