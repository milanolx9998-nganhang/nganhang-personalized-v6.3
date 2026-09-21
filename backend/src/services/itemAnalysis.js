import { pool, tx } from '../db/pool.js';

/**
 * Item Analysis Engine — V4.5
 * Tính toán chỉ số chất lượng câu hỏi theo chuẩn psychometrics quốc tế:
 * - Difficulty Index (p-value)
 * - Discrimination Index (D)
 * - Point-Biserial Correlation (rpb)
 * - Distractor Analysis
 * 
 * Tham khảo: University of Washington, University of Florida, ProTesting.com
 */

/**
 * Phân tích item analysis cho 1 đợt thi (exam_run).
 * Yêu cầu: đã import exam_responses cho run_id.
 */
export async function analyzeExamRun(runId) {
  return tx(async (client) => {
    // 1. Lấy tất cả responses và tính tổng điểm từng HS
    const { rows: responses } = await client.query(`
      SELECT er.student_code, er.question_id, er.selected_answer, er.is_correct,
             er.score_earned, q.answer_key, q.q_type
      FROM exam_responses er
      JOIN questions q ON q.id = er.question_id
      WHERE er.run_id = $1
      ORDER BY er.student_code, er.question_id
    `, [runId]);

    if (responses.length === 0) {
      return { analyzed: 0, message: 'Không có dữ liệu trả lời.' };
    }

    // 2. Tính tổng điểm từng HS
    const studentScores = {};
    for (const r of responses) {
      if (!studentScores[r.student_code]) studentScores[r.student_code] = { total: 0, answers: [] };
      studentScores[r.student_code].total += parseFloat(r.score_earned || 0);
      studentScores[r.student_code].answers.push(r);
    }

    const students = Object.keys(studentScores);
    const N = students.length;
    if (N < 10) {
      return { analyzed: 0, message: `Cần ít nhất 10 HS để phân tích, hiện có ${N}.` };
    }

    // 3. Sắp xếp HS theo tổng điểm (cao → thấp) → chia top/bottom 27%
    const sorted = students.sort((a, b) => studentScores[b].total - studentScores[a].total);
    const groupSize = Math.max(Math.ceil(N * 0.27), 1);
    const topGroup = new Set(sorted.slice(0, groupSize));
    const bottomGroup = new Set(sorted.slice(-groupSize));

    // 4. Nhóm responses theo question_id
    const questionMap = {};
    for (const r of responses) {
      if (!questionMap[r.question_id]) questionMap[r.question_id] = [];
      questionMap[r.question_id].push(r);
    }

    // 5. Tính toán cho từng câu hỏi
    const results = [];

    for (const [qId, qResponses] of Object.entries(questionMap)) {
      const totalForQ = qResponses.length;

      // -- Difficulty Index (p) --
      const correct = qResponses.filter(r => r.is_correct).length;
      const p = correct / totalForQ;

      // -- Discrimination Index (D) --
      const topCorrect = qResponses.filter(r => topGroup.has(r.student_code) && r.is_correct).length;
      const topTotal = qResponses.filter(r => topGroup.has(r.student_code)).length;
      const bottomCorrect = qResponses.filter(r => bottomGroup.has(r.student_code) && r.is_correct).length;
      const bottomTotal = qResponses.filter(r => bottomGroup.has(r.student_code)).length;

      const pTop = topTotal > 0 ? topCorrect / topTotal : 0;
      const pBottom = bottomTotal > 0 ? bottomCorrect / bottomTotal : 0;
      const D = pTop - pBottom;

      // -- Point-Biserial Correlation (rpb) --
      const rpb = computePointBiserial(qResponses, studentScores);

      // -- Distractor Analysis (MCQ only) --
      let distractorData = null;
      const firstResp = qResponses[0];
      if (firstResp.q_type === 'mcq4') {
        distractorData = {};
        for (const opt of ['A', 'B', 'C', 'D']) {
          const optResponses = qResponses.filter(r => r.selected_answer === opt);
          const optCount = optResponses.length;
          const optRpb = optCount >= 2 ? computePointBiserialForOption(opt, qResponses, studentScores) : null;
          const optTopPct = topTotal > 0 ? qResponses.filter(r => topGroup.has(r.student_code) && r.selected_answer === opt).length / topTotal : 0;
          const optBotPct = bottomTotal > 0 ? qResponses.filter(r => bottomGroup.has(r.student_code) && r.selected_answer === opt).length / bottomTotal : 0;

          distractorData[opt] = {
            count: optCount,
            pct: Math.round((optCount / totalForQ) * 100),
            rpb: optRpb !== null ? round3(optRpb) : null,
            top_pct: Math.round(optTopPct * 100),
            bot_pct: Math.round(optBotPct * 100),
            is_key: opt === firstResp.answer_key,
          };
        }
      }

      // -- Quality Flag --
      let flag = 'good';
      if (D < 0) flag = 'flag';         // Âm = câu bị lỗi
      else if (D < 0.10) flag = 'poor';  // Kém phân biệt
      else if (D < 0.20) flag = 'review'; // Cần xem lại
      else if (p > 0.90 || p < 0.10) flag = 'review'; // Quá dễ/khó

      results.push({
        question_id: parseInt(qId),
        difficulty_index: round3(p),
        discrimination_index: round3(D),
        point_biserial: round3(rpb),
        distractor_analysis: distractorData,
        times_administered: totalForQ,
        quality_flag: flag,
      });
    }

    // 6. Cập nhật vào bảng questions
    for (const r of results) {
      await client.query(`
        UPDATE questions SET
          difficulty_index = $1,
          discrimination_index = $2,
          point_biserial = $3,
          distractor_analysis = $4,
          times_administered = COALESCE(times_administered, 0) + $5,
          quality_flag = $6
        WHERE id = $7
      `, [
        r.difficulty_index, r.discrimination_index, r.point_biserial,
        JSON.stringify(r.distractor_analysis), r.times_administered,
        r.quality_flag, r.question_id
      ]);
    }

    // 7. Tóm tắt
    const summary = {
      total_questions: results.length,
      total_students: N,
      avg_difficulty: round3(results.reduce((s, r) => s + r.difficulty_index, 0) / results.length),
      avg_discrimination: round3(results.reduce((s, r) => s + r.discrimination_index, 0) / results.length),
      quality: {
        good: results.filter(r => r.quality_flag === 'good').length,
        review: results.filter(r => r.quality_flag === 'review').length,
        poor: results.filter(r => r.quality_flag === 'poor').length,
        flag: results.filter(r => r.quality_flag === 'flag').length,
      },
    };

    return { analyzed: results.length, summary, details: results };
  });
}

/**
 * Point-Biserial Correlation cho "đúng vs tổng điểm"
 */
function computePointBiserial(qResponses, studentScores) {
  const N = qResponses.length;
  if (N < 3) return 0;

  const correctStudents = qResponses.filter(r => r.is_correct).map(r => studentScores[r.student_code].total);
  const wrongStudents = qResponses.filter(r => !r.is_correct).map(r => studentScores[r.student_code].total);

  if (correctStudents.length === 0 || wrongStudents.length === 0) return 0;

  const meanCorrect = mean(correctStudents);
  const meanWrong = mean(wrongStudents);
  const allScores = qResponses.map(r => studentScores[r.student_code].total);
  const sdAll = stdDev(allScores);

  if (sdAll === 0) return 0;

  const p = correctStudents.length / N;
  const q = 1 - p;

  return (meanCorrect - meanWrong) / sdAll * Math.sqrt(p * q);
}

/**
 * Point-Biserial cho 1 option cụ thể (distractor analysis)
 */
function computePointBiserialForOption(option, qResponses, studentScores) {
  const N = qResponses.length;
  const selectedStudents = qResponses.filter(r => r.selected_answer === option).map(r => studentScores[r.student_code].total);
  const otherStudents = qResponses.filter(r => r.selected_answer !== option).map(r => studentScores[r.student_code].total);

  if (selectedStudents.length === 0 || otherStudents.length === 0) return 0;

  const meanSel = mean(selectedStudents);
  const meanOther = mean(otherStudents);
  const allScores = qResponses.map(r => studentScores[r.student_code].total);
  const sdAll = stdDev(allScores);

  if (sdAll === 0) return 0;

  const p = selectedStudents.length / N;
  const q = 1 - p;

  return (meanSel - meanOther) / sdAll * Math.sqrt(p * q);
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
