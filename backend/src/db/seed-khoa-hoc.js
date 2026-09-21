/**
 * SEED Chương trình SGK Kết nối tri thức
 * Vật Lí, Hóa Học, Sinh Học — Lớp 10 đến 12
 * 
 * Lưu ý: Lớp 6-9 các môn này nằm trong KHTN (đã seed bằng seed-khtn9.js)
 * Từ lớp 10 trở đi là môn riêng biệt.
 * 
 * Chạy: npm run seed-khoa-hoc
 * An toàn chạy lại nhiều lần (ON CONFLICT DO NOTHING)
 */
import 'dotenv/config';
import { pool } from './pool.js';

// ================================================================
// VẬT LÍ 10–12 (Kết nối tri thức)
// ================================================================
const VATLI = {
  10: [
    { ch: 'Chương 1: Mô tả chuyển động', topics: ['Tốc độ và vận tốc', 'Đồ thị độ dịch chuyển — thời gian', 'Chuyển động thẳng biến đổi đều', 'Sự rơi tự do'] },
    { ch: 'Chương 2: Lực và chuyển động', topics: ['Tổng hợp và phân tích lực', 'Ba định luật Newton', 'Lực ma sát', 'Lực cản và lực nâng'] },
    { ch: 'Chương 3: Năng lượng', topics: ['Động năng và định lí động năng', 'Thế năng', 'Cơ năng', 'Hiệu suất'] },
    { ch: 'Chương 4: Động lượng', topics: ['Động lượng', 'Định luật bảo toàn động lượng', 'Ứng dụng trong va chạm'] },
    { ch: 'Chương 5: Chuyển động tròn và biến dạng', topics: ['Động học chuyển động tròn đều', 'Lực hướng tâm', 'Biến dạng của vật rắn'] },
  ],
  11: [
    { ch: 'Chương 1: Dao động', topics: ['Dao động điều hoà', 'Mô tả dao động điều hoà', 'Bài toán về dao động điều hoà', 'Con lắc đơn — Con lắc lò xo', 'Dao động tắt dần — Dao động cưỡng bức — Cộng hưởng'] },
    { ch: 'Chương 2: Sóng', topics: ['Sóng ngang — Sóng dọc', 'Các đặc trưng của sóng', 'Giao thoa sóng', 'Sóng dừng'] },
    { ch: 'Chương 3: Điện trường', topics: ['Lực tương tác tĩnh điện', 'Khái niệm điện trường', 'Điện thế — Hiệu điện thế', 'Tụ điện'] },
    { ch: 'Chương 4: Dòng điện — Mạch điện', topics: ['Cường độ dòng điện', 'Điện trở — Định luật Ohm cho toàn mạch', 'Năng lượng điện — Công suất điện', 'Mạch điện với tụ điện'] },
    { ch: 'Chương 5: Từ trường', topics: ['Khái niệm từ trường', 'Lực từ — Cảm ứng từ', 'Từ trường của dòng điện', 'Ứng dụng của từ trường'] },
  ],
  12: [
    { ch: 'Chương 1: Vật lí nhiệt', topics: ['Cấu trúc của chất rắn — chất lỏng — chất khí', 'Thuyết động học phân tử', 'Các định luật về chất khí', 'Phương trình trạng thái khí lí tưởng', 'Nội năng — Định luật I nhiệt động lực học'] },
    { ch: 'Chương 2: Khí lí tưởng', topics: ['Mô hình khí lí tưởng', 'Quá trình đẳng nhiệt — đẳng tích — đẳng áp', 'Phương trình Clapeyron'] },
    { ch: 'Chương 3: Sóng điện từ', topics: ['Dao động và sóng điện từ', 'Đặc điểm và tính chất sóng điện từ', 'Thang sóng điện từ', 'Truyền thông bằng sóng điện từ'] },
    { ch: 'Chương 4: Quang học sóng', topics: ['Tán sắc ánh sáng', 'Giao thoa ánh sáng', 'Quang phổ'] },
    { ch: 'Chương 5: Lượng tử ánh sáng', topics: ['Hiện tượng quang điện', 'Thuyết lượng tử ánh sáng', 'Quang phổ vạch của nguyên tử hidro'] },
    { ch: 'Chương 6: Vật lí hạt nhân', topics: ['Cấu tạo hạt nhân', 'Phóng xạ', 'Phản ứng hạt nhân', 'Năng lượng liên kết hạt nhân', 'Phản ứng phân hạch — Phản ứng nhiệt hạch'] },
  ],
};

// ================================================================
// HÓA HỌC 10–12 (Kết nối tri thức)
// ================================================================
const HOAHOC = {
  10: [
    { ch: 'Chương 1: Cấu tạo nguyên tử', topics: ['Thành phần của nguyên tử', 'Nguyên tố hoá học', 'Cấu trúc lớp vỏ electron', 'Cấu hình electron nguyên tử'] },
    { ch: 'Chương 2: Bảng tuần hoàn các nguyên tố hoá học', topics: ['Bảng tuần hoàn', 'Xu hướng biến đổi tính chất trong bảng tuần hoàn', 'Định luật tuần hoàn'] },
    { ch: 'Chương 3: Liên kết hoá học', topics: ['Quy tắc octet', 'Liên kết ion', 'Liên kết cộng hoá trị', 'Liên kết hydrogen và tương tác van der Waals'] },
    { ch: 'Chương 4: Phản ứng oxi hoá — khử', topics: ['Phản ứng oxi hoá-khử', 'Số oxi hoá', 'Cân bằng phản ứng oxi hoá-khử'] },
    { ch: 'Chương 5: Năng lượng hoá học', topics: ['Biến thiên enthalpy của phản ứng hoá học', 'Ý nghĩa và cách tính biến thiên enthalpy'] },
    { ch: 'Chương 6: Tốc độ phản ứng hoá học', topics: ['Tốc độ phản ứng', 'Các yếu tố ảnh hưởng đến tốc độ phản ứng'] },
    { ch: 'Chương 7: Nguyên tố nhóm VIIA (Halogen)', topics: ['Đơn chất halogen', 'Hydrogen halide — Hydrohalic acid', 'Phản ứng của halogen và hợp chất'] },
  ],
  11: [
    { ch: 'Chương 1: Cân bằng hoá học', topics: ['Khái niệm cân bằng hoá học', 'Hằng số cân bằng', 'Sự chuyển dịch cân bằng — Nguyên lí Le Chatelier'] },
    { ch: 'Chương 2: Nitrogen — Sulfur', topics: ['Đơn chất nitrogen', 'Ammonia và muối ammonium', 'Nitric acid và muối nitrate', 'Đơn chất sulfur', 'Sulfuric acid và muối sulfate'] },
    { ch: 'Chương 3: Đại cương về hoá học hữu cơ', topics: ['Hợp chất hữu cơ — Hoá học hữu cơ', 'Công thức phân tử — Công thức cấu tạo', 'Đồng đẳng — Đồng phân'] },
    { ch: 'Chương 4: Hydrocarbon', topics: ['Alkane', 'Alkene', 'Alkyne', 'Arene (Benzene và đồng đẳng)'] },
    { ch: 'Chương 5: Dẫn xuất halogen — Alcohol — Phenol', topics: ['Dẫn xuất halogen', 'Alcohol', 'Phenol'] },
    { ch: 'Chương 6: Hợp chất carbonyl — Carboxylic acid', topics: ['Aldehyde — Ketone', 'Carboxylic acid'] },
  ],
  12: [
    { ch: 'Chương 1: Ester — Lipid', topics: ['Ester', 'Lipid', 'Xà phòng và chất giặt rửa'] },
    { ch: 'Chương 2: Carbohydrate', topics: ['Glucose — Fructose', 'Saccharose — Maltose', 'Tinh bột — Cellulose'] },
    { ch: 'Chương 3: Hợp chất chứa nitrogen', topics: ['Amine', 'Amino acid', 'Peptide — Protein'] },
    { ch: 'Chương 4: Polymer', topics: ['Đại cương polymer', 'Vật liệu polymer — Nhựa — Tơ — Cao su'] },
    { ch: 'Chương 5: Pin điện và điện phân', topics: ['Pin điện hoá', 'Điện phân', 'Ăn mòn kim loại — Bảo vệ kim loại'] },
    { ch: 'Chương 6: Nguyên tố nhóm IA và IIA', topics: ['Kim loại kiềm', 'Kim loại kiềm thổ', 'Hợp chất của kim loại kiềm — kiềm thổ'] },
    { ch: 'Chương 7: Sắt và một số kim loại quan trọng', topics: ['Sắt và hợp chất sắt', 'Hợp kim sắt — Gang — Thép', 'Chromium — Đồng — Nhôm và hợp chất'] },
  ],
};

// ================================================================
// SINH HỌC 10–12 (Kết nối tri thức)
// ================================================================
const SINHHOC = {
  10: [
    { ch: 'Chương 1: Thành phần hoá học của tế bào', topics: ['Các nguyên tố hoá học và nước', 'Carbohydrate và lipid', 'Protein', 'Nucleic acid'] },
    { ch: 'Chương 2: Cấu trúc tế bào', topics: ['Tế bào nhân sơ', 'Tế bào nhân thực', 'Vận chuyển các chất qua màng tế bào'] },
    { ch: 'Chương 3: Trao đổi chất và chuyển hoá năng lượng', topics: ['Năng lượng và trao đổi chất', 'Enzyme', 'Hô hấp tế bào', 'Quang hợp'] },
    { ch: 'Chương 4: Phân bào', topics: ['Chu kì tế bào và nguyên phân', 'Giảm phân'] },
    { ch: 'Chương 5: Vi sinh vật', topics: ['Đặc điểm chung của vi sinh vật', 'Các phương pháp nghiên cứu vi sinh vật', 'Vi sinh vật và ứng dụng trong thực tiễn'] },
  ],
  11: [
    { ch: 'Chương 1: Trao đổi chất và chuyển hoá năng lượng ở sinh vật', topics: ['Khái quát về trao đổi chất và chuyển hoá năng lượng', 'Trao đổi nước và khoáng ở thực vật', 'Quang hợp ở thực vật', 'Hô hấp ở thực vật', 'Dinh dưỡng và tiêu hoá ở động vật', 'Hô hấp ở động vật', 'Tuần hoàn ở động vật', 'Cân bằng nội môi'] },
    { ch: 'Chương 2: Cảm ứng ở sinh vật', topics: ['Cảm ứng ở thực vật', 'Cảm ứng ở động vật', 'Tập tính ở động vật'] },
    { ch: 'Chương 3: Sinh trưởng và phát triển ở sinh vật', topics: ['Sinh trưởng và phát triển ở thực vật', 'Hormone thực vật', 'Sinh trưởng và phát triển ở động vật', 'Hormone ở động vật có xương sống'] },
    { ch: 'Chương 4: Sinh sản ở sinh vật', topics: ['Sinh sản vô tính ở sinh vật', 'Sinh sản hữu tính ở thực vật', 'Sinh sản hữu tính ở động vật', 'Cơ chế điều hoà sinh sản', 'Ứng dụng trong nông nghiệp'] },
  ],
  12: [
    { ch: 'Chương 1: Di truyền phân tử và biến dị', topics: ['Gene — Mã di truyền — Nhân đôi DNA', 'Phiên mã — Dịch mã', 'Điều hoà biểu hiện gene', 'Đột biến gene', 'Đột biến nhiễm sắc thể'] },
    { ch: 'Chương 2: Tính quy luật của hiện tượng di truyền', topics: ['Quy luật Mendel', 'Tương tác gene — Gene đa hiệu', 'Liên kết gene — Hoán vị gene', 'Di truyền liên kết với giới tính', 'Ảnh hưởng của môi trường đến biểu hiện gene'] },
    { ch: 'Chương 3: Di truyền học quần thể', topics: ['Cấu trúc di truyền của quần thể', 'Định luật Hardy-Weinberg'] },
    { ch: 'Chương 4: Tiến hoá', topics: ['Bằng chứng tiến hoá', 'Học thuyết tiến hoá tổng hợp hiện đại', 'Các nhân tố tiến hoá', 'Quá trình hình thành loài', 'Nguồn gốc sự sống — Phát sinh loài người'] },
    { ch: 'Chương 5: Sinh thái học', topics: ['Môi trường sống — Các nhân tố sinh thái', 'Quần thể sinh vật', 'Quần xã sinh vật', 'Hệ sinh thái', 'Sinh quyển — Bảo vệ môi trường'] },
  ],
};

// ================================================================
// SEED FUNCTION
// ================================================================
async function seedSubjectTopics(subjectCode, data) {
  const { rows: subs } = await pool.query('SELECT id FROM subjects WHERE code = $1', [subjectCode]);
  if (!subs.length) {
    console.log(`  ⚠ Không tìm thấy môn ${subjectCode} — bỏ qua`);
    return 0;
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
  return total;
}

async function main() {
  console.log('═══ SEED SGK KẾT NỐI TRI THỨC — KHOA HỌC TỰ NHIÊN ═══');
  console.log('  Vật Lí + Hóa Học + Sinh Học (Lớp 10–12)\n');

  const vl = await seedSubjectTopics('VatLi', VATLI);
  console.log(`  ✓ Vật Lí: ${vl} bài mới`);
  
  const hh = await seedSubjectTopics('HoaHoc', HOAHOC);
  console.log(`  ✓ Hóa Học: ${hh} bài mới`);
  
  const sh = await seedSubjectTopics('SinhHoc', SINHHOC);
  console.log(`  ✓ Sinh Học: ${sh} bài mới`);

  // Thống kê tổng
  const { rows: stats } = await pool.query(`
    SELECT s.code, s.name, 
           COUNT(t.id) FILTER (WHERE t.grade = 10)::int as g10,
           COUNT(t.id) FILTER (WHERE t.grade = 11)::int as g11,
           COUNT(t.id) FILTER (WHERE t.grade = 12)::int as g12,
           COUNT(t.id)::int as total
    FROM subjects s
    LEFT JOIN topics t ON t.subject_id = s.id
    WHERE s.code IN ('VatLi', 'HoaHoc', 'SinhHoc')
    GROUP BY s.code, s.name
    ORDER BY s.code
  `);

  console.log('\n📊 Thống kê sau seed:');
  console.log('  Môn            | L10  | L11  | L12  | Tổng');
  console.log('  ───────────────┼──────┼──────┼──────┼──────');
  for (const s of stats) {
    const name = s.name.padEnd(13);
    console.log(`  ${name} | ${String(s.g10).padStart(4)} | ${String(s.g11).padStart(4)} | ${String(s.g12).padStart(4)} | ${String(s.total).padStart(4)}`);
  }

  console.log('\n✅ Hoàn tất!');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
