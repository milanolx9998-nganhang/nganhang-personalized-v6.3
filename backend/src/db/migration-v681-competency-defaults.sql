-- V6.8.1: khung năng lực đặc thù của từng môn theo Chương trình GDPT 2018 (Thông tư 32/2018/TT-BGDĐT) có sẵn và đã công bố,
-- để biểu đồ năng lực của học sinh có trục ngay, không chờ nhà trường tự tạo khung.
--
-- level_rule: quy tắc MẶC ĐỊNH theo mức nhận thức của câu hỏi (1 NB, 2 TH, 3 VD, 4 VDC) → thành phần năng lực và trọng số.
-- Chỉ dùng cho câu chưa được gắn năng lực riêng (theo câu / YCCĐ / Chủ đề); là ƯỚC TÍNH của sản phẩm, không phải xếp loại
-- chính thức. Môn đánh giá theo kĩ năng (Ngữ văn, Tiếng Anh) hoặc theo loại hoạt động (Tin học, Công nghệ, GDCD, GDKT&PL)
-- không có level_rule: cần gắn theo YCCĐ / Chủ đề hoặc minh chứng thầy cô ghi.
--
-- Chỉ thêm: môn đã có khung (nháp hoặc đã công bố) thì giữ nguyên khung đó; khung KHTN / Toán tạo từ mẫu cũ (mã trục
-- KHTN-C1…, MATH-C1…) chỉ được điền level_rule khi còn trống.
ALTER TABLE competency_frameworks ADD COLUMN IF NOT EXISTS level_rule jsonb;

DO $$
DECLARE
  spec record; f integer; ax jsonb; n integer; admin integer;
  science jsonb := '{"1":{"C1":1},"2":{"C1":0.7,"C2":0.3},"3":{"C2":0.4,"C3":0.6},"4":{"C2":0.2,"C3":0.8}}';
BEGIN
  SELECT id INTO admin FROM users WHERE role='admin' ORDER BY id LIMIT 1;
  FOR spec IN SELECT * FROM (VALUES
    ('KHTN', 6, 9, 'Năng lực khoa học tự nhiên — CT GDPT 2018',
      '[["C1","Nhận thức khoa học tự nhiên"],["C2","Tìm hiểu tự nhiên"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]'::jsonb, science),
    ('VatLi', 10, 12, 'Năng lực vật lí — CT GDPT 2018',
      '[["C1","Nhận thức vật lí"],["C2","Tìm hiểu thế giới tự nhiên dưới góc độ vật lí"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]', science),
    ('HoaHoc', 10, 12, 'Năng lực hoá học — CT GDPT 2018',
      '[["C1","Nhận thức hoá học"],["C2","Tìm hiểu thế giới tự nhiên dưới góc độ hoá học"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]', science),
    ('SinhHoc', 10, 12, 'Năng lực sinh học — CT GDPT 2018',
      '[["C1","Nhận thức sinh học"],["C2","Tìm hiểu thế giới sống"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]', science),
    ('DiaLi', 6, 12, 'Năng lực địa lí — CT GDPT 2018',
      '[["C1","Nhận thức khoa học địa lí"],["C2","Tìm hiểu địa lí"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]', science),
    ('LichSu', 6, 12, 'Năng lực lịch sử — CT GDPT 2018',
      '[["C1","Tìm hiểu lịch sử"],["C2","Nhận thức và tư duy lịch sử"],["C3","Vận dụng kiến thức, kĩ năng đã học"]]',
      '{"1":{"C1":1},"2":{"C1":0.3,"C2":0.7},"3":{"C2":0.5,"C3":0.5},"4":{"C2":0.2,"C3":0.8}}'),
    ('Toan', 1, 12, 'Năng lực toán học — CT GDPT 2018',
      '[["C1","Tư duy và lập luận toán học"],["C2","Mô hình hoá toán học"],["C3","Giải quyết vấn đề toán học"],["C4","Giao tiếp toán học"],["C5","Sử dụng công cụ, phương tiện học toán"]]',
      '{"1":{"C1":0.6,"C4":0.4},"2":{"C1":0.7,"C4":0.3},"3":{"C2":0.4,"C3":0.6},"4":{"C1":0.2,"C2":0.3,"C3":0.5}}'),
    ('NguVan', 6, 12, 'Năng lực ngôn ngữ và văn học — CT GDPT 2018',
      '[["C1","Đọc"],["C2","Viết"],["C3","Nói và nghe"]]', NULL),
    ('TiengAnh', 3, 12, 'Năng lực giao tiếp tiếng Anh — CT GDPT 2018',
      '[["C1","Nghe"],["C2","Nói"],["C3","Đọc"],["C4","Viết"],["C5","Kiến thức ngôn ngữ"]]', NULL),
    ('TinHoc', 3, 12, 'Năng lực tin học — CT GDPT 2018',
      '[["C1","Sử dụng và quản lí các phương tiện công nghệ thông tin và truyền thông"],["C2","Ứng xử phù hợp trong môi trường số"],["C3","Giải quyết vấn đề với sự hỗ trợ của công nghệ thông tin và truyền thông"],["C4","Ứng dụng công nghệ thông tin và truyền thông trong học và tự học"],["C5","Hợp tác trong môi trường số"]]', NULL),
    ('CongNghe', 3, 12, 'Năng lực công nghệ — CT GDPT 2018',
      '[["C1","Nhận thức công nghệ"],["C2","Giao tiếp công nghệ"],["C3","Sử dụng công nghệ"],["C4","Đánh giá công nghệ"],["C5","Thiết kế kĩ thuật"]]', NULL),
    ('GDCD', 6, 9, 'Năng lực giáo dục công dân — CT GDPT 2018',
      '[["C1","Điều chỉnh hành vi"],["C2","Phát triển bản thân"],["C3","Tìm hiểu và tham gia hoạt động kinh tế – xã hội"]]', NULL),
    ('GDKTPL', 10, 12, 'Năng lực giáo dục kinh tế và pháp luật — CT GDPT 2018',
      '[["C1","Điều chỉnh hành vi"],["C2","Phát triển bản thân"],["C3","Tìm hiểu và tham gia hoạt động kinh tế – xã hội"]]', NULL)
  ) AS t(subject_code, grade_from, grade_to, title, axes, rule) JOIN subjects s ON s.code=t.subject_code
  LOOP
    CONTINUE WHEN EXISTS(SELECT 1 FROM competency_frameworks x WHERE x.subject_id=spec.id AND x.status IN('DRAFT','PUBLISHED'));
    INSERT INTO competency_frameworks(subject_id,grade_from,grade_to,code,title,source,version,level_rule)
      VALUES(spec.id,spec.grade_from,spec.grade_to,'GDPT2018-'||spec.subject_code,spec.title,'Chương trình GDPT 2018 — Thông tư 32/2018/TT-BGDĐT','2018',spec.rule)
      ON CONFLICT(subject_id,code,version) DO NOTHING RETURNING id INTO f;
    CONTINUE WHEN f IS NULL;
    n := 0;
    FOR ax IN SELECT * FROM jsonb_array_elements(spec.axes) LOOP
      INSERT INTO competency_axes(framework_id,code,name,order_index,allowed_evidence)
        VALUES(f,ax->>0,ax->>1,n,ARRAY['AUTO_GRADED_ITEM','MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION']);
      n := n + 1;
    END LOOP;
    UPDATE competency_frameworks SET status='PUBLISHED',published_at=now() WHERE id=f;
    IF admin IS NOT NULL THEN
      INSERT INTO competency_framework_versions(framework_id,snapshot,created_by)
        SELECT f,jsonb_build_object('framework',to_jsonb(fw),'axes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.order_index) FROM competency_axes a WHERE a.framework_id=f)),admin
        FROM competency_frameworks fw WHERE fw.id=f;
    END IF;
  END LOOP;
END $$;

-- Khung đã công bố từ mẫu cũ (mã trục KHTN-C1…C3, MATH-C1…C5): điền quy tắc theo mức nếu còn trống.
UPDATE competency_frameworks f SET level_rule='{"1":{"KHTN-C1":1},"2":{"KHTN-C1":0.7,"KHTN-C2":0.3},"3":{"KHTN-C2":0.4,"KHTN-C3":0.6},"4":{"KHTN-C2":0.2,"KHTN-C3":0.8}}'
  WHERE f.level_rule IS NULL AND f.status='PUBLISHED' AND (SELECT count(*) FROM competency_axes a WHERE a.framework_id=f.id AND a.status='ACTIVE' AND a.code IN('KHTN-C1','KHTN-C2','KHTN-C3'))=3;
UPDATE competency_frameworks f SET level_rule='{"1":{"MATH-C1":0.6,"MATH-C4":0.4},"2":{"MATH-C1":0.7,"MATH-C4":0.3},"3":{"MATH-C2":0.4,"MATH-C3":0.6},"4":{"MATH-C1":0.2,"MATH-C2":0.3,"MATH-C3":0.5}}'
  WHERE f.level_rule IS NULL AND f.status='PUBLISHED' AND (SELECT count(*) FROM competency_axes a WHERE a.framework_id=f.id AND a.status='ACTIVE' AND a.code IN('MATH-C1','MATH-C2','MATH-C3','MATH-C4'))=4;
