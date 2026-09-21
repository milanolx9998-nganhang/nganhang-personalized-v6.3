/**
 * SEED Chương trình SGK Kết nối tri thức
 * Toán, Ngữ Văn, Tiếng Anh — Lớp 6 đến 12
 * 
 * Chạy: node src/db/seed-kntt.js
 * An toàn chạy lại nhiều lần (ON CONFLICT DO NOTHING)
 */
import 'dotenv/config';
import { pool } from './pool.js';

// ================================================================
// TOÁN 6–12 (Kết nối tri thức)
// ================================================================
const TOAN = {
  6: [
    // HK1
    { ch: 'Chương 1: Số tự nhiên', topics: ['Tập hợp', 'Tập hợp số tự nhiên', 'Phép cộng và phép trừ số tự nhiên', 'Phép nhân và phép chia số tự nhiên', 'Lũy thừa với số mũ tự nhiên', 'Thứ tự thực hiện các phép tính'] },
    { ch: 'Chương 2: Tính chia hết trong tập hợp số tự nhiên', topics: ['Quan hệ chia hết và tính chất', 'Dấu hiệu chia hết', 'Số nguyên tố. Hợp số', 'Ước chung và bội chung'] },
    { ch: 'Chương 3: Số nguyên', topics: ['Số nguyên âm và tập hợp số nguyên', 'Phép cộng và phép trừ số nguyên', 'Phép nhân và phép chia hết hai số nguyên', 'Thực hành giải toán với số nguyên'] },
    // HK2
    { ch: 'Chương 4: Một số yếu tố thống kê', topics: ['Thu thập và phân loại dữ liệu', 'Biểu đồ tranh', 'Biểu đồ cột — Biểu đồ cột kép'] },
    { ch: 'Chương 5: Phân số', topics: ['Phân số với tử và mẫu là số nguyên', 'So sánh phân số', 'Phép cộng và phép trừ phân số', 'Phép nhân và phép chia phân số', 'Số thập phân', 'Phép toán với số thập phân', 'Bài toán về tỉ số và tỉ số phần trăm'] },
    { ch: 'Chương 6: Hình học trực quan', topics: ['Hình vuông — Tam giác đều — Lục giác đều', 'Hình chữ nhật — Hình thoi — Hình bình hành — Hình thang cân', 'Chu vi và diện tích của một số hình trong thực tiễn'] },
    { ch: 'Chương 7: Số thập phân', topics: ['Số thập phân', 'Các phép tính với số thập phân', 'Bài toán về tỉ số phần trăm'] },
    { ch: 'Chương 8: Những hình hình học cơ bản', topics: ['Điểm. Đường thẳng', 'Tia. Đoạn thẳng. Độ dài đoạn thẳng', 'Trung điểm của đoạn thẳng', 'Góc'] },
  ],
  7: [
    { ch: 'Chương 1: Số hữu tỉ', topics: ['Tập hợp các số hữu tỉ', 'Cộng, trừ, nhân, chia số hữu tỉ', 'Lũy thừa của một số hữu tỉ', 'Quy tắc dấu ngoặc và quy tắc chuyển vế', 'Hoạt động thực hành trải nghiệm'] },
    { ch: 'Chương 2: Số thực', topics: ['Số vô tỉ. Căn bậc hai số học', 'Số thực. Giá trị tuyệt đối của số thực'] },
    { ch: 'Chương 3: Góc và đường thẳng song song', topics: ['Các góc ở vị trí đặc biệt', 'Hai đường thẳng song song', 'Định lí và chứng minh'] },
    { ch: 'Chương 4: Biểu thức đại số', topics: ['Biểu thức số. Biểu thức đại số', 'Đa thức một biến', 'Phép cộng, trừ đa thức một biến', 'Nghiệm của đa thức một biến'] },
    { ch: 'Chương 5: Một số yếu tố thống kê', topics: ['Thu thập, phân loại và biểu diễn dữ liệu', 'Phân tích và xử lí dữ liệu'] },
    { ch: 'Chương 6: Tam giác', topics: ['Tổng các góc của một tam giác', 'Tam giác bằng nhau', 'Các trường hợp bằng nhau của tam giác', 'Tam giác cân'] },
    { ch: 'Chương 7: Một số yếu tố xác suất', topics: ['Làm quen với biến cố', 'Làm quen với xác suất của biến cố'] },
  ],
  8: [
    { ch: 'Chương 1: Biểu thức đại số', topics: ['Đơn thức và đa thức nhiều biến', 'Các phép tính với đa thức nhiều biến', 'Hằng đẳng thức đáng nhớ', 'Phân tích đa thức thành nhân tử', 'Phân thức đại số'] },
    { ch: 'Chương 2: Một số yếu tố thống kê', topics: ['Thu thập và phân loại dữ liệu', 'Biểu đồ', 'Các số đặc trưng đo xu thế trung tâm'] },
    { ch: 'Chương 3: Tứ giác', topics: ['Tứ giác', 'Hình thang — Hình thang cân', 'Hình bình hành — Hình chữ nhật', 'Hình thoi — Hình vuông', 'Diện tích đa giác'] },
    { ch: 'Chương 4: Phương trình bậc nhất một ẩn', topics: ['Mở đầu về phương trình', 'Phương trình bậc nhất một ẩn', 'Giải bài toán bằng cách lập phương trình'] },
    { ch: 'Chương 5: Một số yếu tố xác suất', topics: ['Phép thử nghiệm và không gian mẫu', 'Xác suất của biến cố'] },
    { ch: 'Chương 6: Tam giác đồng dạng', topics: ['Định lí Thalès trong tam giác', 'Tam giác đồng dạng', 'Các trường hợp đồng dạng của tam giác'] },
    { ch: 'Chương 7: Định lí Pythagore. Các loại tứ giác đặc biệt', topics: ['Định lí Pythagore', 'Đường trung bình của tam giác', 'Đường trung bình của hình thang', 'Đối xứng trục — Đối xứng tâm'] },
  ],
  9: [
    { ch: 'Chương 1: Hệ thức lượng trong tam giác vuông', topics: ['Tỉ số lượng giác của góc nhọn', 'Hệ thức về cạnh và góc trong tam giác vuông', 'Ứng dụng thực tiễn hệ thức lượng'] },
    { ch: 'Chương 2: Đường tròn', topics: ['Đường tròn — Mối quan hệ giữa đường kính và dây', 'Vị trí tương đối của đường thẳng và đường tròn', 'Đường tròn ngoại tiếp — Đường tròn nội tiếp tam giác', 'Góc nội tiếp', 'Độ dài đường tròn — Diện tích hình tròn'] },
    { ch: 'Chương 3: Hàm số bậc nhất y = ax + b', topics: ['Khái niệm hàm số và đồ thị', 'Hàm số bậc nhất y = ax + b', 'Đường thẳng song song — Đường thẳng cắt nhau'] },
    { ch: 'Chương 4: Hệ phương trình bậc nhất hai ẩn', topics: ['Phương trình bậc nhất hai ẩn', 'Hệ hai phương trình bậc nhất hai ẩn', 'Giải bài toán bằng cách lập hệ phương trình'] },
    { ch: 'Chương 5: Phương trình bậc hai một ẩn', topics: ['Phương trình bậc hai một ẩn', 'Công thức nghiệm', 'Hệ thức Vi-ét và ứng dụng', 'Giải bài toán bằng cách lập phương trình bậc hai'] },
    { ch: 'Chương 6: Một số yếu tố thống kê và xác suất', topics: ['Bảng tần số tương đối', 'Biểu đồ tần số tương đối', 'Xác suất — Phép thử với các khả năng xảy ra như nhau'] },
    { ch: 'Chương 7: Hình học không gian', topics: ['Hình trụ — Hình nón — Hình cầu', 'Diện tích xung quanh — Thể tích hình trụ, hình nón', 'Diện tích mặt cầu — Thể tích hình cầu'] },
  ],
  10: [
    { ch: 'Chương 1: Mệnh đề và tập hợp', topics: ['Mệnh đề', 'Tập hợp', 'Các phép toán trên tập hợp'] },
    { ch: 'Chương 2: Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', topics: ['Bất phương trình bậc nhất hai ẩn', 'Hệ bất phương trình bậc nhất hai ẩn'] },
    { ch: 'Chương 3: Hàm số — Đồ thị và ứng dụng', topics: ['Hàm số và đồ thị', 'Hàm số bậc hai'] },
    { ch: 'Chương 4: Hệ thức lượng trong tam giác', topics: ['Giá trị lượng giác của một góc từ 0° đến 180°', 'Định lí côsin và định lí sin', 'Giải tam giác và ứng dụng'] },
    { ch: 'Chương 5: Thống kê', topics: ['Số gần đúng và sai số', 'Các số đặc trưng đo độ phân tán'] },
    { ch: 'Chương 6: Vectơ', topics: ['Khái niệm vectơ', 'Tổng — hiệu hai vectơ', 'Tích của một vectơ với một số'] },
    { ch: 'Chương 7: Tọa độ trong mặt phẳng', topics: ['Tọa độ của vectơ', 'Phương trình đường thẳng', 'Phương trình đường tròn'] },
  ],
  11: [
    { ch: 'Chương 1: Hàm số lượng giác. Phương trình lượng giác', topics: ['Góc lượng giác', 'Giá trị lượng giác của góc lượng giác', 'Các hàm số lượng giác', 'Phương trình lượng giác cơ bản'] },
    { ch: 'Chương 2: Dãy số. Cấp số cộng và cấp số nhân', topics: ['Dãy số', 'Cấp số cộng', 'Cấp số nhân'] },
    { ch: 'Chương 3: Giới hạn. Hàm số liên tục', topics: ['Giới hạn của dãy số', 'Giới hạn của hàm số', 'Hàm số liên tục'] },
    { ch: 'Chương 4: Đạo hàm', topics: ['Đạo hàm', 'Các quy tắc tính đạo hàm', 'Đạo hàm và sự biến thiên của hàm số'] },
    { ch: 'Chương 5: Phép dời hình. Phép đồng dạng', topics: ['Phép tịnh tiến', 'Phép đối xứng trục — Phép đối xứng tâm', 'Phép quay', 'Phép vị tự — Phép đồng dạng'] },
    { ch: 'Chương 6: Đường thẳng và mặt phẳng. Quan hệ song song', topics: ['Đường thẳng và mặt phẳng trong không gian', 'Hai đường thẳng song song', 'Đường thẳng song song với mặt phẳng', 'Hai mặt phẳng song song', 'Phép chiếu song song'] },
    { ch: 'Chương 7: Xác suất', topics: ['Biến cố hợp — biến cố giao — biến cố độc lập', 'Xác suất có điều kiện'] },
  ],
  12: [
    { ch: 'Chương 1: Ứng dụng đạo hàm', topics: ['Tính đơn điệu của hàm số', 'Cực trị của hàm số', 'Giá trị lớn nhất — Giá trị nhỏ nhất', 'Đường tiệm cận', 'Khảo sát và vẽ đồ thị hàm số'] },
    { ch: 'Chương 2: Lũy thừa, Hàm số mũ. Logarit, Hàm số logarit', topics: ['Lũy thừa', 'Hàm số mũ', 'Logarit', 'Hàm số logarit', 'Phương trình — bất phương trình mũ và logarit'] },
    { ch: 'Chương 3: Nguyên hàm — Tích phân', topics: ['Nguyên hàm', 'Tích phân', 'Ứng dụng tích phân'] },
    { ch: 'Chương 4: Số phức', topics: ['Số phức', 'Các phép toán trên tập số phức'] },
    { ch: 'Chương 5: Quan hệ vuông góc trong không gian', topics: ['Hai đường thẳng vuông góc', 'Đường thẳng vuông góc với mặt phẳng', 'Góc và khoảng cách', 'Hai mặt phẳng vuông góc'] },
    { ch: 'Chương 6: Thể tích khối đa diện', topics: ['Khối đa diện', 'Khối đa diện lồi và khối đa diện đều', 'Thể tích khối đa diện'] },
    { ch: 'Chương 7: Phương pháp tọa độ trong không gian', topics: ['Hệ tọa độ trong không gian', 'Phương trình mặt phẳng', 'Phương trình đường thẳng'] },
    { ch: 'Chương 8: Mặt nón — Mặt trụ — Mặt cầu', topics: ['Mặt nón tròn xoay — Hình nón tròn xoay', 'Mặt trụ tròn xoay — Hình trụ tròn xoay', 'Mặt cầu — Khối cầu'] },
  ],
};

// ================================================================
// NGỮ VĂN 6–12 (Kết nối tri thức)
// ================================================================
const NGUVAN = {
  6: [
    { ch: 'Bài 1: Tôi và các bạn', topics: ['Bài học đường đời đầu tiên (Tô Hoài)', 'Nếu cậu muốn có một người bạn (Saint-Exupéry)', 'Thực hành tiếng Việt: Từ đơn — Từ phức', 'Viết bài văn kể lại trải nghiệm'] },
    { ch: 'Bài 2: Gõ cửa trái tim', topics: ['Mây và sóng (R. Tagore)', 'Chuyện cổ tích về loài người (Xuân Quỳnh)', 'Thực hành tiếng Việt: Biện pháp tu từ', 'Viết đoạn văn ghi lại cảm xúc về bài thơ'] },
    { ch: 'Bài 3: Yêu thương và chia sẻ', topics: ['Cô bé bán diêm (Andersen)', 'Gió lạnh đầu mùa (Thạch Lam)', 'Thực hành tiếng Việt: Cụm danh từ', 'Viết bài văn tả người'] },
    { ch: 'Bài 4: Quê hương yêu dấu', topics: ['Chùm ca dao về quê hương', 'Thực hành tiếng Việt: So sánh', 'Viết bài văn tả cảnh sinh hoạt'] },
    { ch: 'Bài 5: Những nẻo đường xứ sở', topics: ['Cô Tô (Nguyễn Tuân)', 'Hang Én (Hồ Thị Hoàng Anh)', 'Thực hành tiếng Việt: Mở rộng vị ngữ', 'Viết bài văn thuyết minh thuật lại sự kiện'] },
    { ch: 'Bài 6: Chuyện kể về những người anh hùng', topics: ['Thánh Gióng', 'Sự tích Hồ Gươm', 'Thực hành tiếng Việt: Từ Hán Việt', 'Viết bài văn đóng vai nhân vật kể lại sự việc'] },
    { ch: 'Bài 7: Thế giới cổ tích', topics: ['Thạch Sanh', 'Cây khế', 'Thực hành tiếng Việt: Dấu chấm phẩy', 'Viết bài văn nghị luận trình bày ý kiến'] },
    { ch: 'Bài 8: Khác biệt và gần gũi', topics: ['Xem người ta kìa! (Lạc Thanh)', 'Thực hành tiếng Việt: Trạng ngữ', 'Viết bài văn trình bày ý kiến'] },
  ],
  7: [
    { ch: 'Bài 1: Bầu trời tuổi thơ', topics: ['Những câu hát dân gian về vẻ đẹp quê hương', 'Thực hành tiếng Việt: Phó từ', 'Viết bài văn kể về kỷ niệm tuổi thơ'] },
    { ch: 'Bài 2: Bài học cuộc sống', topics: ['Tục ngữ về thiên nhiên, lao động và con người', 'Thực hành tiếng Việt: Thành ngữ', 'Viết bài văn nghị luận xã hội'] },
    { ch: 'Bài 3: Cội nguồn yêu thương', topics: ['Mẹ tôi (Edmondo De Amicis)', 'Thực hành tiếng Việt: Liên kết câu', 'Viết thư — Viết email'] },
    { ch: 'Bài 4: Giai điệu đất nước', topics: ['Mùa xuân nho nhỏ (Thanh Hải)', 'Thực hành tiếng Việt: Từ láy', 'Viết bài văn biểu cảm về con người, sự việc'] },
    { ch: 'Bài 5: Màu sắc trăm miền', topics: ['Một thứ quà của lúa non (Thạch Lam)', 'Thực hành tiếng Việt: Câu rút gọn — Câu đặc biệt', 'Viết bài văn thuyết minh về quy tắc, luật lệ'] },
  ],
  8: [
    { ch: 'Bài 1: Câu chuyện của lịch sử', topics: ['Lá cờ thêu sáu chữ vàng (Nguyễn Huy Tưởng)', 'Thực hành tiếng Việt: Trợ từ — Thán từ', 'Viết bài văn kể lại sự việc có thật liên quan lịch sử'] },
    { ch: 'Bài 2: Vẻ đẹp cổ điển', topics: ['Qua Đèo Ngang (Bà Huyện Thanh Quan)', 'Thu điếu (Nguyễn Khuyến)', 'Thực hành tiếng Việt: Biệt ngữ xã hội', 'Viết bài văn phân tích bài thơ'] },
    { ch: 'Bài 3: Truyện ngắn và tiểu thuyết', topics: ['Lão Hạc (Nam Cao)', 'Tức nước vỡ bờ (Ngô Tất Tố)', 'Thực hành tiếng Việt: Câu ghép', 'Viết bài văn nghị luận xã hội'] },
    { ch: 'Bài 4: Sức sống của văn hóa dân gian', topics: ['Hội Lim — Chèo', 'Thực hành tiếng Việt: Câu phủ định', 'Viết bài văn thuyết minh về lễ hội'] },
    { ch: 'Bài 5: Nghị luận xã hội', topics: ['Bàn về đọc sách (Chu Quang Tiềm)', 'Thực hành tiếng Việt: Hành động nói', 'Viết bài văn nghị luận xã hội'] },
  ],
  9: [
    { ch: 'Bài 1: Thế giới kỳ ảo', topics: ['Chuyện người con gái Nam Xương (Nguyễn Dữ)', 'Thực hành tiếng Việt: Biện pháp nói quá', 'Viết bài nghị luận về tác phẩm văn học'] },
    { ch: 'Bài 2: Những bài học từ trải nghiệm', topics: ['Bến quê (Nguyễn Minh Châu)', 'Thực hành tiếng Việt: Nghĩa tường minh — Hàm ý', 'Viết bài văn tự sự có yếu tố miêu tả và biểu cảm'] },
    { ch: 'Bài 3: Hồn thơ đất Việt', topics: ['Đồng chí (Chính Hữu)', 'Bài thơ về tiểu đội xe không kính (Phạm Tiến Duật)', 'Mùa xuân nho nhỏ (Thanh Hải)', 'Thực hành tiếng Việt: Thành phần gọi — đáp, phụ chú', 'Viết bài văn phân tích bài thơ'] },
    { ch: 'Bài 4: Truyện ngắn hiện đại', topics: ['Làng (Kim Lân)', 'Lặng lẽ Sa Pa (Nguyễn Thành Long)', 'Thực hành tiếng Việt: Khởi ngữ', 'Viết bài văn phân tích tác phẩm truyện'] },
    { ch: 'Bài 5: Nghị luận xã hội', topics: ['Phong cách Hồ Chí Minh (Lê Anh Trà)', 'Đấu tranh cho một thế giới hòa bình (Mác-két)', 'Thực hành tiếng Việt: Liên kết câu — Liên kết đoạn', 'Viết bài nghị luận xã hội'] },
  ],
  10: [
    { ch: 'Bài 1: Sức hấp dẫn của truyện kể', topics: ['Truyện An Dương Vương và Mị Châu – Trọng Thủy', 'Thực hành tiếng Việt: Lỗi dùng từ, lỗi về trật tự từ', 'Viết văn bản nghị luận phân tích đánh giá tác phẩm'] },
    { ch: 'Bài 2: Vẻ đẹp của thơ ca', topics: ['Tỏ lòng (Phạm Ngũ Lão)', 'Cảnh ngày hè (Nguyễn Trãi)', 'Thực hành tiếng Việt: Biện pháp lặp cấu trúc', 'Viết bài văn nghị luận phân tích tác phẩm thơ'] },
    { ch: 'Bài 3: Kí và truyện kí', topics: ['Ai đã đặt tên cho dòng sông? (Hoàng Phủ Ngọc Tường)', 'Thực hành tiếng Việt: Ngữ cảnh', 'Viết văn bản thuyết minh'] },
    { ch: 'Bài 4: Văn bản thông tin', topics: ['Thực hành đọc văn bản thông tin', 'Viết bản tin, thông cáo báo chí'] },
    { ch: 'Bài 5: Nghị luận văn học', topics: ['Thực hành viết bài văn nghị luận', 'Nói và nghe: Thuyết trình'] },
  ],
  11: [
    { ch: 'Bài 1: Thơ và truyện thơ', topics: ['Tự tình (Hồ Xuân Hương)', 'Câu cá mùa thu (Nguyễn Khuyến)', 'Thực hành tiếng Việt: Ngôn ngữ nói — ngôn ngữ viết', 'Viết bài văn phân tích tác phẩm thơ'] },
    { ch: 'Bài 2: Truyện ngắn', topics: ['Hai đứa trẻ (Thạch Lam)', 'Chữ người tử tù (Nguyễn Tuân)', 'Thực hành tiếng Việt: Ngữ cảnh và nghĩa của từ', 'Viết bài phân tích tác phẩm truyện'] },
    { ch: 'Bài 3: Tuỳ bút, Tản văn, Truyện kí', topics: ['Người lái đò sông Đà (Nguyễn Tuân)', 'Thực hành tiếng Việt: Phong cách ngôn ngữ nghệ thuật', 'Viết bài văn nghị luận phân tích tác phẩm'] },
    { ch: 'Bài 4: Văn nghị luận', topics: ['Một số thể loại văn nghị luận trung đại', 'Chiếu cầu hiền (Ngô Thì Nhậm)', 'Thực hành tiếng Việt: Đặc điểm ngôn ngữ văn nghị luận', 'Viết bài nghị luận về tư tưởng đạo lí'] },
    { ch: 'Bài 5: Truyện và tiểu thuyết', topics: ['Vợ nhặt (Kim Lân)', 'Thực hành tiếng Việt: Sự phát triển nghĩa của từ', 'Viết bài văn nghị luận về tác phẩm truyện'] },
  ],
  12: [
    { ch: 'Bài 1: Truyện ngắn', topics: ['Vợ chồng A Phủ (Tô Hoài)', 'Rừng xà nu (Nguyễn Trung Thành)', 'Chiếc thuyền ngoài xa (Nguyễn Minh Châu)', 'Viết bài văn nghị luận phân tích tác phẩm truyện'] },
    { ch: 'Bài 2: Thơ', topics: ['Tây Tiến (Quang Dũng)', 'Việt Bắc (Tố Hữu)', 'Đất nước (Nguyễn Khoa Điềm)', 'Sóng (Xuân Quỳnh)', 'Viết bài phân tích tác phẩm thơ'] },
    { ch: 'Bài 3: Kịch và văn bản nghị luận', topics: ['Hồn Trương Ba, da hàng thịt (Lưu Quang Vũ)', 'Tuyên ngôn Độc lập (Hồ Chí Minh)', 'Viết bài văn nghị luận xã hội'] },
    { ch: 'Bài 4: Phong cách ngôn ngữ', topics: ['Phong cách ngôn ngữ báo chí', 'Phong cách ngôn ngữ chính luận', 'Thực hành viết văn bản nghị luận'] },
    { ch: 'Bài 5: Văn học nước ngoài', topics: ['Thuốc (Lỗ Tấn)', 'Số phận con người (Sô-lô-khốp)', 'Ông già và biển cả (Hemingway)'] },
  ],
};

// ================================================================
// TIẾNG ANH 6–12 (Kết nối tri thức — Global Success)
// ================================================================
const TIENGANH = {
  6: [
    { ch: 'Unit 1: My new school', topics: ['Vocabulary: School things', 'Grammar: Present simple — to be', 'Reading & Speaking: New school activities'] },
    { ch: 'Unit 2: My house', topics: ['Vocabulary: Rooms & furniture', 'Grammar: There is / There are', 'Reading & Writing: Describe your house'] },
    { ch: 'Unit 3: My friends', topics: ['Vocabulary: Appearance & personality', 'Grammar: Present continuous', 'Reading & Speaking: Talk about friends'] },
    { ch: 'Unit 4: My neighbourhood', topics: ['Vocabulary: Places in town', 'Grammar: Comparative adjectives', 'Reading & Writing: My neighbourhood guide'] },
    { ch: 'Unit 5: Natural wonders of Viet Nam', topics: ['Vocabulary: Landscapes & nature', 'Grammar: Superlative adjectives', 'Reading & Speaking: Travel plans'] },
    { ch: 'Unit 6: Our Tet holiday', topics: ['Vocabulary: Tet activities & food', 'Grammar: Should / Shouldn\'t', 'Reading & Writing: Tet traditions'] },
    { ch: 'Unit 7: Television', topics: ['Vocabulary: TV programmes', 'Grammar: Conjunctions (and, but, so, because)', 'Reading & Speaking: Favourite shows'] },
    { ch: 'Unit 8: Sports and games', topics: ['Vocabulary: Sports', 'Grammar: Past simple — irregular verbs', 'Reading & Writing: A sports event'] },
    { ch: 'Unit 9: Cities of the world', topics: ['Vocabulary: Cities & landmarks', 'Grammar: Superlative & possessive case', 'Reading & Speaking: Famous cities'] },
    { ch: 'Unit 10: Our houses in the future', topics: ['Vocabulary: Future homes', 'Grammar: Will for predictions', 'Reading & Writing: Smart homes'] },
  ],
  7: [
    { ch: 'Unit 1: Hobbies', topics: ['Vocabulary: Hobbies & interests', 'Grammar: Verbs of liking + V-ing', 'Reading & Speaking: Talk about hobbies'] },
    { ch: 'Unit 2: Healthy living', topics: ['Vocabulary: Health & exercise', 'Grammar: Imperatives — Should', 'Reading & Writing: Healthy habits'] },
    { ch: 'Unit 3: Community service', topics: ['Vocabulary: Volunteer activities', 'Grammar: Past simple vs Present perfect', 'Reading & Speaking: Helping the community'] },
    { ch: 'Unit 4: Music and arts', topics: ['Vocabulary: Musical instruments — Art forms', 'Grammar: Adverbs of frequency', 'Reading & Writing: Favourite music'] },
    { ch: 'Unit 5: Vietnamese food and drink', topics: ['Vocabulary: Food & cooking', 'Grammar: A/an, some, any — How much/many', 'Reading & Speaking: Vietnamese cuisine'] },
    { ch: 'Unit 6: A visit to a school', topics: ['Vocabulary: School facilities', 'Grammar: Could — Will be able to', 'Reading & Writing: A school visit report'] },
    { ch: 'Unit 7: Traffic', topics: ['Vocabulary: Transport — Road signs', 'Grammar: Used to', 'Reading & Speaking: Traffic rules'] },
    { ch: 'Unit 8: Films', topics: ['Vocabulary: Film types', 'Grammar: Connectors (although, however)', 'Reading & Writing: Film review'] },
    { ch: 'Unit 9: Festivals around the world', topics: ['Vocabulary: Festivals', 'Grammar: Adverbial phrases', 'Reading & Speaking: Celebrating festivals'] },
    { ch: 'Unit 10: Energy sources', topics: ['Vocabulary: Energy — Environment', 'Grammar: Future continuous', 'Reading & Writing: Renewable energy'] },
  ],
  8: [
    { ch: 'Unit 1: Leisure activities', topics: ['Vocabulary: Free time activities', 'Grammar: Verbs of liking + gerunds/to-inf', 'Reading & Writing: Survey about leisure'] },
    { ch: 'Unit 2: Life in the countryside', topics: ['Vocabulary: Countryside scenes', 'Grammar: Comparative forms of adverbs', 'Reading & Speaking: City vs Countryside'] },
    { ch: 'Unit 3: Peoples of Viet Nam', topics: ['Vocabulary: Ethnic groups & customs', 'Grammar: Questions — Articles with proper nouns', 'Reading & Writing: Cultural diversity'] },
    { ch: 'Unit 4: Our customs and traditions', topics: ['Vocabulary: Customs & traditions', 'Grammar: Should — Have to — Must', 'Reading & Speaking: Vietnamese traditions'] },
    { ch: 'Unit 5: Festivals in Viet Nam', topics: ['Vocabulary: Festival items & activities', 'Grammar: Compound & complex sentences', 'Reading & Writing: A festival report'] },
    { ch: 'Unit 6: Folk tales', topics: ['Vocabulary: Fairy tale characters', 'Grammar: Past continuous — Past simple with when/while', 'Reading & Speaking: Tell a folk tale'] },
    { ch: 'Unit 7: Pollution', topics: ['Vocabulary: Environment — Pollution types', 'Grammar: Conditional type 1 — If clauses', 'Reading & Writing: Pollution problems'] },
    { ch: 'Unit 8: English speaking countries', topics: ['Vocabulary: Countries & nationalities', 'Grammar: Present simple for facts', 'Reading & Speaking: English-speaking countries'] },
    { ch: 'Unit 9: Natural disasters', topics: ['Vocabulary: Natural disasters', 'Grammar: Passive voice — Past perfect', 'Reading & Writing: Disaster report'] },
    { ch: 'Unit 10: Communication', topics: ['Vocabulary: Communication forms', 'Grammar: Future forms review', 'Reading & Speaking: The future of communication'] },
  ],
  9: [
    { ch: 'Unit 1: Local environment', topics: ['Vocabulary: Crafts & places', 'Grammar: Complex sentences — Relative clauses', 'Reading & Writing: A local craft village'] },
    { ch: 'Unit 2: City life', topics: ['Vocabulary: City features', 'Grammar: Comparison of adjectives & adverbs', 'Reading & Speaking: Living in the city'] },
    { ch: 'Unit 3: Teen stress and pressure', topics: ['Vocabulary: Stress & emotions', 'Grammar: Reported speech', 'Reading & Writing: Giving advice'] },
    { ch: 'Unit 4: Life in the past', topics: ['Vocabulary: Past life', 'Grammar: Used to — Wish', 'Reading & Speaking: Childhood memories'] },
    { ch: 'Unit 5: Wonders of Viet Nam', topics: ['Vocabulary: Wonders & heritage', 'Grammar: Passive voice review — suggest + V-ing', 'Reading & Writing: Travel guide'] },
    { ch: 'Unit 6: Viet Nam: Then and now', topics: ['Vocabulary: Modern vs traditional', 'Grammar: Present perfect — Past simple', 'Reading & Speaking: Changes in life'] },
    { ch: 'Unit 7: Recipes and eating habits', topics: ['Vocabulary: Cooking & food', 'Grammar: Quantifiers — Conditional type 1', 'Reading & Writing: Recipe writing'] },
    { ch: 'Unit 8: Tourism', topics: ['Vocabulary: Tourism & travel', 'Grammar: Articles — Reported questions', 'Reading & Speaking: Travel planning'] },
    { ch: 'Unit 9: English in the world', topics: ['Vocabulary: Language learning', 'Grammar: Relative clauses — Conditional type 2', 'Reading & Writing: The importance of English'] },
    { ch: 'Unit 10: Space exploration', topics: ['Vocabulary: Space & technology', 'Grammar: Past perfect — Reported speech review', 'Reading & Speaking: Space travel'] },
  ],
  10: [
    { ch: 'Unit 1: Family life', topics: ['Vocabulary: Family members & chores', 'Grammar: Present simple vs Present continuous', 'Reading & Writing: Family routines'] },
    { ch: 'Unit 2: Humans and the environment', topics: ['Vocabulary: Environment & conservation', 'Grammar: Present perfect', 'Reading & Speaking: Environmental issues'] },
    { ch: 'Unit 3: Music', topics: ['Vocabulary: Music genres & instruments', 'Grammar: Connectors of addition & contrast', 'Reading & Writing: Music review'] },
    { ch: 'Unit 4: For a better community', topics: ['Vocabulary: Volunteer work', 'Grammar: Past simple & Past continuous', 'Reading & Speaking: Community projects'] },
    { ch: 'Unit 5: Inventions', topics: ['Vocabulary: Inventions & discoveries', 'Grammar: Passive voice', 'Reading & Writing: An invention presentation'] },
  ],
  11: [
    { ch: 'Unit 1: A long and healthy life', topics: ['Vocabulary: Health & fitness', 'Grammar: Infinitives & gerunds', 'Reading & Writing: Healthy lifestyle'] },
    { ch: 'Unit 2: The generation gap', topics: ['Vocabulary: Family conflicts — Generational values', 'Grammar: Should — Ought to — Modal verbs in the past', 'Reading & Speaking: Bridging the gap'] },
    { ch: 'Unit 3: Cities of the future', topics: ['Vocabulary: Smart cities & urban life', 'Grammar: Conditional sentences review', 'Reading & Writing: Future city plan'] },
    { ch: 'Unit 4: ASEAN and Viet Nam', topics: ['Vocabulary: ASEAN countries & organization', 'Grammar: Gerund vs Infinitive (complex)', 'Reading & Speaking: ASEAN goals'] },
    { ch: 'Unit 5: Global warming', topics: ['Vocabulary: Climate change & solutions', 'Grammar: Reported speech (advanced)', 'Reading & Writing: Climate change essay'] },
  ],
  12: [
    { ch: 'Unit 1: Life stories', topics: ['Vocabulary: Achievements & biography', 'Grammar: Conditional type 3 — Mixed conditionals', 'Reading & Writing: A biography'] },
    { ch: 'Unit 2: Urbanisation', topics: ['Vocabulary: Urban issues & migration', 'Grammar: Cleft sentences', 'Reading & Speaking: Urban vs rural'] },
    { ch: 'Unit 3: The green movement', topics: ['Vocabulary: Sustainability & eco-friendly', 'Grammar: Passive causative (have/get sth done)', 'Reading & Writing: Green initiatives'] },
    { ch: 'Unit 4: The mass media', topics: ['Vocabulary: Media & journalism', 'Grammar: Participle & to-infinitive clauses', 'Reading & Speaking: Media influence'] },
    { ch: 'Unit 5: Cultural identity', topics: ['Vocabulary: Culture — Heritage — Identity', 'Grammar: Articles review — Relative clauses (non-defining)', 'Reading & Writing: Cultural preservation'] },
  ],
};

// ================================================================
// SEED FUNCTION
// ================================================================
async function seedSubjectTopics(subjectCode, data) {
  const { rows: subs } = await pool.query('SELECT id FROM subjects WHERE code = $1', [subjectCode]);
  if (!subs.length) {
    console.log(`  ⚠ Không tìm thấy môn ${subjectCode} — bỏ qua`);
    return;
  }
  const subjectId = subs[0].id;

  let total = 0;
  for (const [gradeStr, chapters] of Object.entries(data)) {
    const grade = parseInt(gradeStr, 10);
    let order = 0;
    for (const ch of chapters) {
      for (const topicName of ch.topics) {
        order++;
        const { rowCount } = await pool.query(
          `INSERT INTO topics (subject_id, grade, chapter, name, order_index)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [subjectId, grade, ch.ch, topicName, order]
        );
        if (rowCount > 0) total++;
      }
    }
  }
  console.log(`  ✓ ${subjectCode}: ${total} bài mới`);
}

async function main() {
  console.log('═══ SEED SGK KẾT NỐI TRI THỨC ═══');
  console.log('  Toán + Ngữ Văn + Tiếng Anh (Lớp 6–12)\n');

  await seedSubjectTopics('Toan', TOAN);
  await seedSubjectTopics('NguVan', NGUVAN);
  await seedSubjectTopics('TiengAnh', TIENGANH);

  // Thống kê
  const { rows: stats } = await pool.query(`
    SELECT s.code, s.name, COUNT(t.id)::int as topic_count
    FROM subjects s
    LEFT JOIN topics t ON t.subject_id = s.id
    WHERE s.code IN ('Toan', 'NguVan', 'TiengAnh')
    GROUP BY s.code, s.name
    ORDER BY s.code
  `);

  console.log('\n📊 Thống kê sau seed:');
  for (const s of stats) {
    console.log(`  ${s.name}: ${s.topic_count} bài/chủ đề`);
  }

  console.log('\n✅ Hoàn tất! Anh có thể xem ở trang Môn học · Chương · Bài');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
