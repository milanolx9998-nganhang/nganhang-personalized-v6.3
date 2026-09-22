-- V6.6.5 — khóa tra cứu chuẩn chương trình theo mã câu + chế độ đánh số + trạng thái gắn Bài.
-- Additive tuyệt đối: chỉ thêm cột/chỉ mục mới, không đổi kiểu, không xóa, không rename.

-- 1. Outcome: giữ dấu vết nguồn và khóa tra cứu ổn định theo môn/khối/phân môn/số thứ tự.
ALTER TABLE curriculum_outcomes ADD COLUMN IF NOT EXISTS source_branch_code text;
ALTER TABLE curriculum_outcomes ADD COLUMN IF NOT EXISTS source_ordinal int;
ALTER TABLE curriculum_outcomes ADD COLUMN IF NOT EXISTS canonical_key text;
ALTER TABLE curriculum_outcomes ADD COLUMN IF NOT EXISTS source_text text;

-- 2. YCCĐ: tương tự, thêm số trang nguồn để truy vết về văn bản chương trình.
ALTER TABLE curriculum_yccds ADD COLUMN IF NOT EXISTS source_ordinal int;
ALTER TABLE curriculum_yccds ADD COLUMN IF NOT EXISTS canonical_key text;
ALTER TABLE curriculum_yccds ADD COLUMN IF NOT EXISTS source_text text;
ALTER TABLE curriculum_yccds ADD COLUMN IF NOT EXISTS source_page text;

-- 3. Câu hỏi: chế độ đánh số và trạng thái gắn Bài.
--    content_number KHÁC sequence toàn file: ở Mode A, năm hình thức của cùng một đơn vị kiến thức
--    dùng chung một content_number.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS numbering_mode text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_number int;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS lesson_status text;

DO $$ BEGIN
 ALTER TABLE questions ADD CONSTRAINT questions_numbering_mode_check
  CHECK (numbering_mode IS NULL OR numbering_mode IN ('CONTENT_UNIT_5_FORMS','INDEPENDENT_10','CUSTOM'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE questions ADD CONSTRAINT questions_lesson_status_check
  CHECK (lesson_status IS NULL OR lesson_status IN ('AUTO_MAPPED','MANUAL','UNMAPPED','AMBIGUOUS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Backfill dấu vết nguồn cho dữ liệu đã có.
--    Chỉ suy ra khi mã hiện có kết thúc bằng một số rõ ràng; không đoán bừa, không tạo chuẩn mới.
UPDATE curriculum_outcomes SET source_branch_code = COALESCE(source_branch_code, NULLIF(domain_code,''))
 WHERE source_branch_code IS NULL;
UPDATE curriculum_outcomes SET source_ordinal = COALESCE(source_ordinal, NULLIF(substring(code from '(\d+)\s*$'),'')::int)
 WHERE source_ordinal IS NULL;
UPDATE curriculum_yccds SET source_ordinal = COALESCE(source_ordinal, NULLIF(substring(code from '(\d+)\s*$'),'')::int)
 WHERE source_ordinal IS NULL;
UPDATE curriculum_outcomes SET source_text = COALESCE(source_text, title) WHERE source_text IS NULL;
UPDATE curriculum_yccds SET source_text = COALESCE(source_text, text) WHERE source_text IS NULL;

-- 5. canonical_key: <mã môn>:G<khối>:<phân môn>:<số Outcome>[:<số YCCĐ>]
--    Đây là khóa máy dùng để tra cứu/idempotency, không phải mã hiển thị cho giáo viên.
UPDATE curriculum_outcomes o
 SET canonical_key = s.code || ':G' || o.grade || ':' || o.source_branch_code || ':' || o.source_ordinal
 FROM subjects s
 WHERE s.id = o.subject_id AND o.canonical_key IS NULL
   AND o.source_branch_code IS NOT NULL AND o.source_ordinal IS NOT NULL;

UPDATE curriculum_yccds y
 SET canonical_key = o.canonical_key || ':' || y.source_ordinal
 FROM curriculum_outcomes o
 WHERE o.id = y.outcome_id AND y.canonical_key IS NULL
   AND o.canonical_key IS NOT NULL AND y.source_ordinal IS NOT NULL;

-- 6. Duy nhất theo phiên bản chương trình. COALESCE(...,0) để hàng chưa gắn phiên bản vẫn được
--    kiểm trùng trong cùng một không gian.
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_outcomes_canonical_key_idx
 ON curriculum_outcomes (COALESCE(curriculum_version_id,0), canonical_key)
 WHERE canonical_key IS NOT NULL AND status <> 'RETIRED';

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_yccds_canonical_key_idx
 ON curriculum_yccds (COALESCE(curriculum_version_id,0), canonical_key)
 WHERE canonical_key IS NOT NULL AND status <> 'RETIRED';

CREATE INDEX IF NOT EXISTS questions_lesson_status_idx ON questions (lesson_status)
 WHERE lesson_status IS NOT NULL;
