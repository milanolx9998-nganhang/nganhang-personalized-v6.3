/**
 * Test thuật toán matrixBalancer
 * Kịch bản: mô phỏng đúng bug anh mô tả
 *   - Phân môn Vật lí 7.0đ, có 2 ô TL khóa 0.7đ mỗi ô, tổng 1.4đ
 *   - Phần TN/ĐS chiếm 4.0đ
 *   - Essay budget còn lại = 7.0 - 1.4 - 4.0 = 1.6đ cho các ô TL chưa khóa
 *   - Yêu cầu: tổng sau redistribute = 7.0đ chính xác
 */
import { autoDistribute, redistribute, totalScoreOf, totalScoreByBranch } from '../src/services/matrixBalancer.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function expectEq(a, b, msg = '') {
  if (Math.abs(a - b) > 0.001) throw new Error(`${msg} kỳ vọng ${b}, nhận ${a}`);
}

// ==================== KỊCH BẢN 1: Khóa ô với điểm bội 0.25, budget lệch ==================== 
test('Kịch bản bug gốc: 7.0đ, TL khóa 0.75+0.75, TN/ĐS=4.0 → tổng vẫn 7.0', () => {
  const lockedCells = [
    // TN + ĐS đã có sẵn (chiếm 4.0đ)
    { branch_code: 'VL', q_type: 'mcq4',       cognitive_level: 'M1', question_count: 8, score_per_question: 0.25, is_locked: true },  // 2.0đ
    { branch_code: 'VL', q_type: 'true_false', cognitive_level: 'M2', question_count: 4, score_per_question: 0.5,  is_locked: true },  // 2.0đ
    // 2 câu tự luận KHÓA với 0.75đ mỗi câu = 1.5đ (đúng bội 0.25)
    { branch_code: 'VL', q_type: 'essay', cognitive_level: 'M3', question_count: 1, score_per_question: 0.75, is_locked: true },
    { branch_code: 'VL', q_type: 'essay', cognitive_level: 'M4', question_count: 1, score_per_question: 0.75, is_locked: true },
  ];

  const cfg = [{
    branch_id: 1, branch_code: 'VL', score: 7.0,
    tn: 8, ds: 4, tln: 0, tl: 3,  // Yêu cầu 3 ô TL (2 đã khóa + 1 chưa)
  }];

  const result = redistribute({
    cells: lockedCells, totalScore: 7.0,
    ratios: [30, 30, 20, 20], branchConfigs: cfg,
  });

  const total = totalScoreByBranch(result, 'VL');
  console.log(`    Tổng tính được: ${total}đ (cần 7.0đ)`);
  console.log(`    Chi tiết: ${result.map(c => `${c.q_type}-${c.cognitive_level}:${c.question_count}×${c.score_per_question}`).join(', ')}`);
  expectEq(total, 7.0, 'Tổng điểm phân môn');
});

// ==================== KỊCH BẢN 2: Budget bội 0.25 ====================
test('Budget 1.25đ cho 1 essay → dồn đủ vào ô duy nhất', () => {
  const lockedCells = [
    { branch_code: 'T', q_type: 'mcq4', cognitive_level: 'M1', question_count: 20, score_per_question: 0.25, is_locked: true }, // 5.0đ
    { branch_code: 'T', q_type: 'short', cognitive_level: 'M3', question_count: 2, score_per_question: 0.25, is_locked: true }, // 0.5 + 0.25 = 0.75đ? Không, 2×0.25=0.5đ
  ];
  // Tổng khóa: 5.0 + 0.5 = 5.5đ; budget 7.0 → còn 1.5đ cho 1 essay
  const cfg = [{ branch_id: null, branch_code: 'T', score: 7.0, tn: 20, ds: 0, tln: 2, tl: 1 }];
  const result = redistribute({ cells: lockedCells, totalScore: 7.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreByBranch(result, 'T');
  const essay = result.find(c => c.q_type === 'essay' && !c.is_locked);
  console.log(`    Essay tạo ra: ${essay?.score_per_question}đ, tổng: ${total}đ`);
  expectEq(total, 7.0);
  expectEq(essay.score_per_question, 1.5);
});

// ==================== KỊCH BẢN 3: autoDistribute từ đầu ====================
test('Auto distribute 10đ: 24 TN + 8 ĐS + 0 TLN + 0 TL', () => {
  const cfg = [{ branch_id: null, branch_code: 'T', score: 10.0, tn: 24, ds: 8, tln: 0, tl: 0 }];
  const result = autoDistribute({ totalScore: 10.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreOf(result);
  const tnCount = result.filter(c => c.q_type === 'mcq4').reduce((s,c) => s+c.question_count, 0);
  const dsCount = result.filter(c => c.q_type === 'true_false').reduce((s,c) => s+c.question_count, 0);
  console.log(`    Tổng: ${total}đ, TN=${tnCount}, ĐS=${dsCount}`);
  expectEq(total, 10.0);
  expectEq(tnCount, 24);
  expectEq(dsCount, 8);
});

// ==================== KỊCH BẢN 4: KHTN 3 phân môn ====================
test('KHTN 10đ: VL 4đ + HH 3đ + SH 3đ, mỗi môn có TN+ĐS+TL', () => {
  const cfg = [
    { branch_id: 1, branch_code: 'VL', score: 4.0, tn: 8, ds: 2, tln: 0, tl: 1 },
    { branch_id: 2, branch_code: 'HH', score: 3.0, tn: 6, ds: 2, tln: 0, tl: 1 },
    { branch_id: 3, branch_code: 'SH', score: 3.0, tn: 6, ds: 2, tln: 0, tl: 1 },
  ];
  const result = autoDistribute({ totalScore: 10.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreOf(result);
  const vl = totalScoreByBranch(result, 'VL');
  const hh = totalScoreByBranch(result, 'HH');
  const sh = totalScoreByBranch(result, 'SH');
  console.log(`    VL=${vl}đ, HH=${hh}đ, SH=${sh}đ, Tổng=${total}đ`);
  expectEq(vl, 4.0); expectEq(hh, 3.0); expectEq(sh, 3.0); expectEq(total, 10.0);
});

// ==================== KỊCH BẢN 5: Khóa nhiều ô essay với điểm bội 0.25 ====================
test('Khóa 3 ô essay với điểm 0.25 + 0.75 + 0.25 (budget còn 0.75đ)', () => {
  const lockedCells = [
    { branch_code: 'T', q_type: 'mcq4', cognitive_level: 'M1', question_count: 8, score_per_question: 0.25, is_locked: true }, // 2.0đ
    { branch_code: 'T', q_type: 'essay', cognitive_level: 'M2', question_count: 1, score_per_question: 0.25, is_locked: true },
    { branch_code: 'T', q_type: 'essay', cognitive_level: 'M3', question_count: 1, score_per_question: 0.75, is_locked: true },
    { branch_code: 'T', q_type: 'essay', cognitive_level: 'M4', question_count: 1, score_per_question: 0.25, is_locked: true },
    // Tổng đã khóa: 2.0 + 0.25 + 0.75 + 0.25 = 3.25đ; budget 4.0 → còn 0.75đ cho 1 TL
  ];
  const cfg = [{ branch_id: null, branch_code: 'T', score: 4.0, tn: 8, ds: 0, tln: 0, tl: 4 }];
  const result = redistribute({ cells: lockedCells, totalScore: 4.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreByBranch(result, 'T');
  const newEssay = result.find(c => c.q_type === 'essay' && !c.is_locked);
  console.log(`    Essay mới: ${newEssay?.score_per_question}đ (cần 0.75đ), tổng: ${total}đ`);
  expectEq(total, 4.0);
  expectEq(newEssay.score_per_question, 0.75);
});

// ==================== KỊCH BẢN 6: Edge — budget vừa khớp 0 ====================
test('Edge case: locked hết budget, không có essay dư', () => {
  const lockedCells = [
    { branch_code: 'T', q_type: 'mcq4', cognitive_level: 'M1', question_count: 40, score_per_question: 0.25, is_locked: true }, // 10đ
  ];
  const cfg = [{ branch_id: null, branch_code: 'T', score: 10.0, tn: 40, ds: 0, tln: 0, tl: 0 }];
  const result = redistribute({ cells: lockedCells, totalScore: 10.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreByBranch(result, 'T');
  const essayCount = result.filter(c => c.q_type === 'essay').length;
  console.log(`    Tổng: ${total}đ, #essay: ${essayCount}`);
  expectEq(total, 10.0);
  expectEq(essayCount, 0);
});

// ==================== KỊCH BẢN 7: V2 BUG reproducer ====================
test('V2 BUG reproducer: 7.0đ, khóa 2 TL=0.75đ + TN/ĐS=4.0đ, 3 TL target', () => {
  const lockedCells = [
    { branch_code: 'VL', q_type: 'mcq4',       cognitive_level: 'M1', question_count: 8, score_per_question: 0.25, is_locked: true }, // 2đ
    { branch_code: 'VL', q_type: 'true_false', cognitive_level: 'M2', question_count: 4, score_per_question: 0.5,  is_locked: true }, // 2đ
    { branch_code: 'VL', q_type: 'essay', cognitive_level: 'M3', question_count: 1, score_per_question: 0.75, is_locked: true },
    { branch_code: 'VL', q_type: 'essay', cognitive_level: 'M4', question_count: 1, score_per_question: 0.75, is_locked: true },
  ];
  const cfg = [{ branch_id: 1, branch_code: 'VL', score: 7.0, tn: 8, ds: 4, tln: 0, tl: 3 }];
  const result = redistribute({ cells: lockedCells, totalScore: 7.0, ratios: [30,30,20,20], branchConfigs: cfg });
  const total = totalScoreByBranch(result, 'VL');
  const newEssay = result.find(c => c.q_type === 'essay' && !c.is_locked);
  console.log(`    V4.2 tính được: ${total}đ ${total === 7.0 ? '✓' : '❌'}`);
  console.log(`    Essay thả rông: ${newEssay?.score_per_question}đ (cần 1.5đ dư, bội 0.25)`);
  expectEq(total, 7.0, 'Tổng phải khớp chính xác 7.0đ');
  expectEq(newEssay.score_per_question, 1.5, 'Essay thả rông nhận toàn bộ dư');
});

// ==================== KỊCH BẢN 8: Budget KHÔNG bội 0.25 → phải báo lỗi ====================
test('Budget 0.7đ (không bội 0.25) → throw error rõ ràng', () => {
  const lockedCells = [
    { branch_code: 'T', q_type: 'mcq4', cognitive_level: 'M1', question_count: 8, score_per_question: 0.25, is_locked: true }, // 2.0đ
    { branch_code: 'T', q_type: 'true_false', cognitive_level: 'M2', question_count: 4, score_per_question: 0.5, is_locked: true }, // 2.0đ
    { branch_code: 'T', q_type: 'essay', cognitive_level: 'M3', question_count: 1, score_per_question: 0.7, is_locked: true }, // 0.7 KHÔNG bội 0.25
    { branch_code: 'T', q_type: 'essay', cognitive_level: 'M4', question_count: 1, score_per_question: 0.7, is_locked: true }, // 0.7 KHÔNG bội 0.25
    // Tổng khóa: 4.0 + 1.4 = 5.4đ; budget 7.0 → còn 1.6đ (không bội 0.25)
  ];
  const cfg = [{ branch_id: null, branch_code: 'T', score: 7.0, tn: 8, ds: 4, tln: 0, tl: 3 }];
  let threw = false;
  let errMsg = '';
  try {
    redistribute({ cells: lockedCells, totalScore: 7.0, ratios: [30,30,20,20], branchConfigs: cfg });
  } catch (e) {
    threw = true;
    errMsg = e.message;
  }
  console.log(`    Có throw: ${threw}`);
  console.log(`    Thông điệp: ${errMsg}`);
  if (!threw) throw new Error('Phải throw lỗi khi budget không chia hết 0.25');
});

console.log(`\n════════════════════════════════`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
