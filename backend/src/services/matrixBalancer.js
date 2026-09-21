/**
 * matrixBalancer.js — Thuật toán tự động & tái phân bổ ma trận
 *
 * ĐẶC BIỆT: Đã vá 2 bug của V2 làm rớt điểm khi có ô khóa lẻ:
 *
 * BUG 1 (V2): `essayBudget = r025(cfg.score - usedBudget)` — làm tròn sớm gộp,
 *             mất 0.1đ ngay từ bước tính ngân sách.
 * FIX: Giữ `essayBudget` chính xác (float), chỉ làm tròn TỪNG ô.
 *
 * BUG 2 (V2): Vòng sửa chênh `while (abs(diff) >= 0.24)` bỏ qua lẻ <0.24đ.
 * FIX: Chuyển sang làm việc với "units" = điểm × 100 (integer), không còn
 *      floating point drift. Dư/thiếu lẻ được cộng vào 1 ô essay thả rông cuối.
 *
 * Kết quả: tổng điểm sau redistribute LUÔN khớp chính xác với budget cấu hình.
 */

const LEVELS = ['M1', 'M2', 'M3', 'M4'];
import {matrixError} from './matrixValidation.js';
const TYPE_WEIGHTS = {
  mcq4:       [4, 3, 2, 1],  // TN nghiêng về mức thấp
  true_false: [2, 3, 3, 2],  // ĐS cân đối
  matching: [2,3,3,2],
  short:      [1, 2, 4, 3],  // Trả lời ngắn nghiêng VD
  essay:      [1, 2, 3, 4],  // Tự luận nghiêng VDC
};
const DEFAULT_TYPE_SCORE = { mcq4: 0.25, true_false: 0.5, short: 0.5, matching:0.5 };

/** Chia "total" (integer) vào N ô theo weights — dùng thuật toán Largest Remainder */
function largestRemainder(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const ideal = weights.map(w => (w / sum) * total);
  const floors = ideal.map(v => Math.floor(v));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const fracs = ideal.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fracs.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) floors[fracs[k].i]++;
  return floors;
}

/** Round to nearest 0.25 */
const r025 = v => Math.round(v * 4) / 4;

/** Convert điểm (float, step 0.01) sang units integer (× 100) và ngược lại */
const toUnits = v => Math.round(v * 100);   // 0.7 → 70
const toScore = u => Math.round(u) / 100;    // 70 → 0.70

// Tối ưu theo điểm trên toàn ma trận, không tham chiếu kho câu hỏi.
// DP giữ số câu/điểm từng dạng và ngân sách phân môn; ô khóa không được di chuyển.
function balanceLevels(cells,totalScore,ratios){
 const locked=cells.filter(c=>c.is_locked),free=cells.filter(c=>!c.is_locked);
 const fixed=LEVELS.map(l=>locked.filter(c=>c.cognitive_level===l).reduce((s,c)=>s+toUnits(c.score_per_question)*c.question_count,0));
 const target=ratios.map(r=>totalScore*r);
 const items=free.flatMap(c=>Array.from({length:c.question_count},()=>({...c,question_count:1}))).sort((a,b)=>b.score_per_question-a.score_per_question);
 let states=new Map([['0,0,0',{v:[0,0,0],node:null}]]);
 let used=0,transitions=0;
 for(const item of items){
  const score=toUnits(item.score_per_question),next=new Map();
  for(const state of states.values())for(let li=0;li<4;li++){
   if(++transitions>4000000)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Quá nhiều tổ hợp phân bổ; giảm số câu hoặc dùng bước điểm 0.25.');
   const v=[...state.v];if(li<3)v[li]+=score;
   const key=v.join(',');
   if(!next.has(key))next.set(key,{v,node:{previous:state.node,li,item}});
  }
  if(next.size>400000)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Cấu hình quá nhiều tổ hợp điểm. Hãy chia ma trận hoặc dùng bước điểm 0.25.');
  states=next;used+=score;
 }
 let best=null,bestLoss=Infinity;
 for(const state of states.values()){
  const actual=[...state.v,used-state.v.reduce((a,b)=>a+b,0)];
  const loss=actual.reduce((s,n,i)=>s+Math.abs(n+fixed[i]-target[i]),0);
  if(loss<bestLoss){bestLoss=loss;best=state;}
 }
 const result=[...locked],merged=new Map();
 for(let node=best?.node;node;node=node.previous){
  const c={...node.item,cognitive_level:LEVELS[node.li]};
  // TL giữ mỗi câu một ô, không gộp mất số ô và bước điểm.
  if(c.q_type==='essay'){result.push(c);continue;}
  const key=JSON.stringify([c.branch_id,c.branch_code,c.outcome_id,c.yccd_id,c.topic_id,c.q_type,c.cognitive_level,c.score_per_question]);
  if(merged.has(key))merged.get(key).question_count++;else{merged.set(key,c);result.push(c);}
 }
 return improveEssayAllocation(result,totalScore,ratios);
}

/**
 * Phân bổ tự động TẤT CẢ ô (không khóa gì) — dùng khi user nhấn "Tự động phân bổ"
 *
 * Input:
 *   totalScore: điểm tổng (VD 10)
 *   ratios: [m1, m2, m3, m4] — tỉ trọng % (tổng = 100)
 *   branchConfigs: [{ branch_id, branch_code, score, tn, ds, tln, tl, tlScore }]
 *     — nếu không có KHTN: truyền 1 phần tử duy nhất với branch_id=null
 *
 * Output: array cells [{branch_id, q_type, cognitive_level, question_count, score_per_question}]
 */
export function autoDistribute({ totalScore, ratios, branchConfigs }) {
  validateRatios(ratios);
  validateBudgets(totalScore,branchConfigs,[]);
  const result = [];

  for (const br of branchConfigs) {
    if (!br.score || br.score <= 0) continue;

    // --- Bước 1: phân bổ SỐ CÂU của TN/ĐS/TLN theo từng mức ---
    for (const qType of ['mcq4', 'true_false', 'short','matching']) {
      const key = qType === 'mcq4' ? 'tn' : qType === 'true_false' ? 'ds' : qType==='matching'?'gn':'tln';
      const cnt = br[key] || 0;
      if (cnt <= 0) continue;

      const tw = TYPE_WEIGHTS[qType];
      const weights = ratios.map((r, i) => r * tw[i]);
      const dist = largestRemainder(cnt, weights);
      LEVELS.forEach((lv, li) => {
        if (dist[li] > 0) {
          result.push({
            branch_id: br.branch_id, branch_code: br.branch_code,
            q_type: qType, cognitive_level: lv,
            question_count: dist[li],
            score_per_question: DEFAULT_TYPE_SCORE[qType],
            is_locked: false,
          });
        }
      });
    }

    // --- Bước 2: phân bổ ĐIỂM của TỰ LUẬN ---
    // Tính điểm đã tiêu hao cho TN/ĐS/TLN
    let usedUnits = 0;  // dùng units (integer) để tránh drift
    const branchCells = result.filter(c => c.branch_code === br.branch_code);
    for (const c of branchCells) {
      usedUnits += toUnits(c.question_count * c.score_per_question);
    }
    const branchScoreUnits = toUnits(br.score);
    const essayBudgetUnits = Math.max(0, branchScoreUnits - usedUnits);
    const essayCount = br.tl || 0;
    if (essayBudgetUnits <= 0 || essayCount <= 0) continue;

    // Đếm điểm đã dùng theo mức (units)
    const lvUsedUnits = [0, 0, 0, 0];
    for (const c of branchCells) {
      const li = LEVELS.indexOf(c.cognitive_level);
      if (li >= 0) lvUsedUnits[li] += toUnits(c.question_count * c.score_per_question);
    }
    // Target điểm từng mức theo ratio (units)
    const lvTargetUnits = ratios.map(r => Math.round((branchScoreUnits * r) / 100));
    const rawRemainUnits = lvTargetUnits.map((t, i) => Math.max(0, t - lvUsedUnits[i]));

    // Phân bổ essayBudgetUnits vào essayCount ô (KHÔNG vào 4 mức cố định — 1 mức có thể có nhiều ô)
    // Cách V4.3: nếu essayCount = 1, dồn toàn bộ budget vào mức có rawRemain cao nhất
    //            nếu essayCount > 1, chia budget theo rawRemain rồi làm tròn 0.25
    const essayCells = distributeEssayScores({
      essayCount,
      essayBudgetUnits,
      rawRemainUnits,
    });
    for (const ec of essayCells) {
      result.push({
        branch_id: br.branch_id, branch_code: br.branch_code,
        q_type: 'essay', cognitive_level: ec.cognitive_level,
        question_count: 1,
        score_per_question: toScore(ec.scoreUnits),
        is_locked: false,
      });
    }
  }

  return balanceLevels(result, totalScore, ratios);
}

/**
 * Phân bổ điểm cho essayCount ô tự luận — MỌI Ô LÀ BỘI 0.25đ
 *
 * Yêu cầu: essayBudgetUnits PHẢI là bội của 25 (tức budget chia hết 0.25đ).
 * Nếu không, ném lỗi rõ ràng để user điều chỉnh cấu hình thay vì silent rounding.
 *
 * Thuật toán:
 * 1. Chuyển budget sang "slots 0.25": slots = budgetUnits / 25
 * 2. Chia slots cho các ô theo Largest Remainder dựa trên rawRemain
 * 3. Mỗi ô có ít nhất 1 slot (= 0.25đ)
 * 4. Tổng slots = budget slots → tổng điểm khớp chính xác
 */
function distributeEssayScores({ essayCount, essayBudgetUnits, rawRemainUnits }) {
  if (essayCount <= 0) return [];
  if (essayBudgetUnits <= 0) return [];

  // Budget phải là bội 25 units (0.25đ)
  if (essayBudgetUnits % 25 !== 0) {
    throw new Error(
      `Điểm budget cho tự luận phải là bội của 0.25đ (hiện ${(essayBudgetUnits / 100).toFixed(2)}đ). ` +
      `Hãy điều chỉnh điểm phân môn hoặc số câu TN/ĐS/TLN để số dư chia hết 0.25đ.`
    );
  }

  const totalSlots = essayBudgetUnits / 25;  // Tổng số "0.25đ block"

  // Không đủ slots để mỗi ô có tối thiểu 0.25đ
  if (totalSlots < essayCount) {
    throw new Error(
      `Không đủ điểm cho ${essayCount} câu tự luận (budget ${(essayBudgetUnits / 100).toFixed(2)}đ, ` +
      `cần tối thiểu ${(essayCount * 0.25).toFixed(2)}đ). Giảm số câu TL hoặc tăng điểm phân môn.`
    );
  }

  // Xếp mức theo rawRemain giảm dần để biết ưu tiên mức nào
  const levelOrder = rawRemainUnits
    .map((u, i) => ({ level: LEVELS[i], remain: u, idx: i }))
    .sort((a, b) => b.remain - a.remain);

  if (essayCount === 1) {
    // 1 ô duy nhất: dồn hết budget vào mức thiếu nhiều nhất
    return [{ cognitive_level: levelOrder[0].level, scoreUnits: essayBudgetUnits }];
  }

  // Nhiều ô: chia slots theo perLevelCount (số câu mỗi mức)
  const perLevelCount = largestRemainder(essayCount, rawRemainUnits);

  // Chia totalSlots vào từng mức theo tỉ lệ rawRemain
  const slotsPerLevel = largestRemainder(totalSlots, rawRemainUnits);

  const cells = [];
  LEVELS.forEach((lv, li) => {
    const cnt = perLevelCount[li];
    if (cnt <= 0) return;
    const levelSlots = slotsPerLevel[li];
    if (levelSlots <= 0) {
      // Mức có cnt>0 nhưng slot=0: mượn 1 slot/ô từ mức khác
      for (let k = 0; k < cnt; k++) {
        cells.push({ cognitive_level: lv, scoreUnits: 25, _borrowed: true });
      }
      return;
    }
    // Chia levelSlots cho cnt ô trong mức này (mỗi ô ≥ 1 slot)
    const base = Math.floor(levelSlots / cnt);
    const extra = levelSlots - base * cnt;
    for (let k = 0; k < cnt; k++) {
      const slots = base + (k < extra ? 1 : 0);
      cells.push({ cognitive_level: lv, scoreUnits: Math.max(25, slots * 25) });
    }
  });

  // Điều chỉnh lại cho đúng tổng budget (do có thể "mượn slots" từ borrowed)
  let actualUnits = cells.reduce((s, c) => s + c.scoreUnits, 0);
  while (actualUnits > essayBudgetUnits) {
    // Trừ bớt 1 slot (25 units) từ ô có điểm cao nhất (> 25)
    const target = cells
      .filter(c => c.scoreUnits > 25)
      .sort((a, b) => b.scoreUnits - a.scoreUnits)[0];
    if (!target) break;
    target.scoreUnits -= 25;
    actualUnits -= 25;
  }
  while (actualUnits < essayBudgetUnits) {
    // Cộng 1 slot vào ô đầu tiên (ưu tiên mức thiếu nhiều nhất theo levelOrder)
    const targetLevel = levelOrder.find(lo => cells.some(c => c.cognitive_level === lo.level));
    if (!targetLevel) break;
    const target = cells.find(c => c.cognitive_level === targetLevel.level);
    target.scoreUnits += 25;
    actualUnits += 25;
  }

  // Dọn flag _borrowed
  for (const c of cells) delete c._borrowed;
  return cells;
}

/**
 * Tái phân bổ khi user đã khóa một số ô.
 * — Giữ nguyên tất cả ô đã khóa (`is_locked = true`)
 * — Phân bổ lại các ô còn lại để tổng điểm khớp chính xác budget
 */
export function redistribute({ cells, totalScore, ratios, branchConfigs }) {
  validateRatios(ratios);
  validateBudgets(totalScore,branchConfigs,cells.filter(c=>c.is_locked));
  const locked = cells.filter(c => c.is_locked);
  const result = [...locked];

  for (const br of branchConfigs) {
    if (!br.score || br.score <= 0) continue;
    const branchScoreUnits = toUnits(br.score);

    // Match theo branch_id nếu có, fallback branch_code, fallback null/null
    const lockedInBranch = locked.filter(c => {
      if (br.branch_id != null && c.branch_id != null) return c.branch_id === br.branch_id;
      if (br.branch_code != null && c.branch_code != null) return c.branch_code === br.branch_code;
      return !c.branch_id && !br.branch_id;
    });

    // --- Bước 1: phân bổ SỐ CÂU của TN/ĐS/TLN còn lại ---
    for (const qType of ['mcq4', 'true_false', 'short','matching']) {
      const key = qType === 'mcq4' ? 'tn' : qType === 'true_false' ? 'ds' : qType==='matching'?'gn':'tln';
      const targetCount = br[key] || 0;
      if (targetCount <= 0) continue;

      const lockedOfType = lockedInBranch.filter(c => c.q_type === qType);
      const lockedCount = lockedOfType.reduce((s, c) => s + c.question_count, 0);
      const remaining = Math.max(0, targetCount - lockedCount);
      if (remaining <= 0) continue;

      // Chỉ phân bổ vào mức KHÔNG bị khóa loại này
      const lockedLevels = new Set(lockedOfType.map(c => c.cognitive_level));
      const tw = TYPE_WEIGHTS[qType];
      const weights = ratios.map((r, i) => lockedLevels.has(LEVELS[i]) ? 0 : r * tw[i]);
      if (weights.every(w => w === 0)) weights.fill(1);  // Tất cả mức đã khóa loại này rồi
      const dist = largestRemainder(remaining, weights);

      LEVELS.forEach((lv, li) => {
        if (dist[li] <= 0) return;
        result.push({
          branch_id: br.branch_id, branch_code: br.branch_code,
          q_type: qType, cognitive_level: lv,
          question_count: dist[li],
          score_per_question: DEFAULT_TYPE_SCORE[qType],
          is_locked: false,
        });
      });
    }

    // --- Bước 2: phân bổ ĐIỂM của TỰ LUẬN còn lại ---
    // Tính units đã tiêu (locked + vừa thêm) — match branch
    let usedUnits = 0;
    const branchAll = result.filter(c => {
      if (br.branch_id != null && c.branch_id != null) return c.branch_id === br.branch_id;
      if (br.branch_code != null && c.branch_code != null) return c.branch_code === br.branch_code;
      return !c.branch_id && !br.branch_id;
    });
    for (const c of branchAll) {
      usedUnits += toUnits(c.question_count * c.score_per_question);
    }
    const essayBudgetUnits = Math.max(0, branchScoreUnits - usedUnits);

    const targetEssayCount = br.tl || 0;
    const lockedEssayCount = lockedInBranch.filter(c => c.q_type === 'essay').reduce((s,c)=>s+c.question_count,0);
    const remainingEssayCount = Math.max(0, targetEssayCount - lockedEssayCount);

    if (essayBudgetUnits <= 0 || remainingEssayCount <= 0) continue;

    const lockedEssayLevels = new Set(
      lockedInBranch.filter(c => c.q_type === 'essay').map(c => c.cognitive_level)
    );

    // Điểm đã dùng theo mức (cả locked + mới)
    const lvUsedUnits = [0, 0, 0, 0];
    for (const c of branchAll) {
      const li = LEVELS.indexOf(c.cognitive_level);
      if (li >= 0) lvUsedUnits[li] += toUnits(c.question_count * c.score_per_question);
    }
    const lvTargetUnits = ratios.map(r => Math.round((branchScoreUnits * r) / 100));
    const rawRemainUnits = lvTargetUnits.map((t, i) =>
      lockedEssayLevels.has(LEVELS[i]) ? 0 : Math.max(0, t - lvUsedUnits[i])
    );

    const essayCells = distributeEssayScores({
      essayCount: remainingEssayCount,
      essayBudgetUnits,
      rawRemainUnits,
    });
    for (const ec of essayCells) {
      result.push({
        branch_id: br.branch_id, branch_code: br.branch_code,
        q_type: 'essay', cognitive_level: ec.cognitive_level,
        question_count: 1,
        score_per_question: toScore(ec.scoreUnits),
        is_locked: false,
      });
    }
  }

  return balanceLevels(result, totalScore, ratios);
}

/** Tính tổng điểm của tập cells (dùng units để tránh drift) */
export function totalScoreOf(cells) {
  let units = 0;
  for (const c of cells) {
    units += toUnits(c.question_count * c.score_per_question);
  }
  return toScore(units);
}

/** Tính tổng điểm theo branch */
export function totalScoreByBranch(cells, branchCode) {
  let units = 0;
  for (const c of cells) {
    if (c.branch_code === branchCode) {
      units += toUnits(c.question_count * c.score_per_question);
    }
  }
  return toScore(units);
}

function validateRatios(ratios) {
  if (!Array.isArray(ratios) || ratios.length !== 4) {
    throw new Error('ratios phải là mảng 4 số [M1, M2, M3, M4]');
  }
  if(ratios.some(r=>!Number.isFinite(r)||r<0||r>100))throw new Error('Tỷ trọng phải là số từ 0 đến 100');
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`Tỉ trọng M1+M2+M3+M4 phải = 100 (hiện tại ${sum})`);
  }
}

function validateBudgets(total,configs,locked){
 if(total>100)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Tổng điểm tối đa 100 cho mỗi lần phân bổ');
 if(!Number.isFinite(total)||total<=0||!Array.isArray(configs)||!configs.length)throw matrixError('MATRIX_CONFIG_INVALID','Cấu hình tổng điểm/phân môn không hợp lệ');
 if(configs.reduce((s,b)=>s+toUnits(b.score),0)!==toUnits(total))throw matrixError('MATRIX_BRANCH_SCORE_MISMATCH','Tổng điểm phân môn phải bằng tổng điểm đề');
 const keys=new Set();let count=0;
 for(const b of configs){
  const key=b.branch_id??b.branch_code??'_all';if(keys.has(key))throw matrixError('MATRIX_BRANCH_DUPLICATE','Phân môn bị lặp');keys.add(key);
  const matching=locked.filter(c=>b.branch_id!=null&&c.branch_id!=null?c.branch_id===b.branch_id:b.branch_code!=null&&c.branch_code!=null?c.branch_code===b.branch_code:!c.branch_id&&!b.branch_id);
  for(const [field,type] of Object.entries({tn:'mcq4',ds:'true_false',tln:'short',gn:'matching',tl:'essay'})){
   const n=b[field]||0;if(!Number.isInteger(n)||n<0)throw matrixError('MATRIX_COUNT_INVALID','Số câu phải là số nguyên không âm');count+=n;
   if(matching.filter(c=>c.q_type===type).reduce((s,c)=>s+c.question_count,0)>n)throw matrixError('MATRIX_LOCK_CONFLICT','Số câu đã khóa vượt cấu hình dạng '+type);
  }
  const fixedTypes=['mcq4','true_false','short','matching'],field={mcq4:'tn',true_false:'ds',short:'tln',matching:'gn'};
  const used=matching.reduce((s,c)=>s+toUnits(c.score_per_question)*c.question_count,0)+fixedTypes.reduce((s,t)=>s+Math.max(0,(b[field[t]]||0)-matching.filter(c=>c.q_type===t).reduce((a,c)=>a+c.question_count,0))*toUnits(DEFAULT_TYPE_SCORE[t]),0);
  if(used>toUnits(b.score))throw matrixError('MATRIX_SCORE_MISMATCH','Điểm câu cố định và ô khóa vượt ngân sách phân môn');
  const essays=(b.tl||0)-matching.filter(c=>c.q_type==='essay').reduce((s,c)=>s+c.question_count,0);
  if(!essays&&used!==toUnits(b.score))throw matrixError('MATRIX_SCORE_MISMATCH','Số câu chưa dùng hết điểm; thêm câu hoặc điều chỉnh điểm phân môn');
 }
 if(count>200)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Mỗi lần phân bổ tối đa 200 câu');
}

// Mở thêm miền nghiệm điểm TL (bước 0.25), thay vì chỉ đổi mức của một phân hoạch điểm.
// Cận dưới L1 = 2 * tổng điểm vượt đích; chỉ cắt trạng thái không thể tốt hơn nghiệm hiện tại.
function improveEssayAllocation(seed,total,ratios){
 const target=ratios.map(r=>total*r),actual=LEVELS.map(l=>seed.filter(c=>c.cognitive_level===l).reduce((s,c)=>s+toUnits(c.score_per_question)*c.question_count,0));
 const loss=actual.reduce((s,v,i)=>s+Math.abs(v-target[i]),0);
 if(loss<1e-7)return seed;
 const locked=seed.filter(c=>c.is_locked),free=seed.filter(c=>!c.is_locked),groups=new Map();
 for(const c of free.filter(c=>c.q_type==='essay')){
  const key=JSON.stringify([c.branch_id,c.branch_code]);
  const g=groups.get(key)||{cell:c,count:0,budget:0};g.count+=c.question_count;g.budget+=toUnits(c.score_per_question)*c.question_count;groups.set(key,g);
 }
 if(!groups.size)return seed;
 const fixed=LEVELS.map(l=>locked.filter(c=>c.cognitive_level===l).reduce((s,c)=>s+toUnits(c.score_per_question)*c.question_count,0));
 let states=new Map([['0,0,0',{v:[0,0,0],mask:0,node:null}]]),used=0,transitions=0;
 function step(item,units,group){
  const next=new Map();used+=units;
  for(const state of states.values())for(let li=0;li<4;li++){
   if(++transitions>4000000)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Quá nhiều tổ hợp tự luận; chia nhỏ cấu hình.');
   const mask=group?state.mask|(1<<li):0;
   if(group&&mask.toString(2).replaceAll('0','').length>group.count)continue;
   const v=[...state.v];if(li<3)v[li]+=units;
   const a=[...v,used-v.reduce((s,n)=>s+n,0)];
   if(2*a.reduce((s,n,i)=>s+Math.max(0,n+fixed[i]-target[i]),0)>=loss-1e-7)continue;
   const key=v.join(',')+':'+mask;if(!next.has(key))next.set(key,{v,mask,node:{previous:state.node,li,item,units,group}});
  }
  if(next.size>400000)throw matrixError('MATRIX_COMPLEXITY_LIMIT','Miền điểm tự luận quá lớn; chia nhỏ cấu hình trước khi phân bổ.');
  states=next;
 }
 for(const c of free.filter(c=>c.q_type!=='essay'))for(let i=0;i<c.question_count;i++)step(c,toUnits(c.score_per_question),null);
 for(const group of groups.values()){
  states=new Map([...states.values()].map(s=>[s.v.join(','),{...s,mask:0}]));
  for(let slot=0;slot<group.budget/25;slot++)step(group.cell,25,group);
 }
 let best=null,bestLoss=loss;
 for(const s of states.values()){
  const a=[...s.v,used-s.v.reduce((x,y)=>x+y,0)],value=a.reduce((sum,n,i)=>sum+Math.abs(n+fixed[i]-target[i]),0);
  if(value<bestLoss){best=s;bestLoss=value;}
 }
 if(!best)return seed;
 const result=[...locked],fixedCells=new Map(),essays=new Map();
 for(let n=best.node;n;n=n.previous){
  if(n.group){const levels=essays.get(n.group)||[0,0,0,0];levels[n.li]++;essays.set(n.group,levels);}
  else {const c={...n.item,cognitive_level:LEVELS[n.li],question_count:1},key=JSON.stringify([c.branch_id,c.branch_code,c.q_type,c.cognitive_level,c.score_per_question,c.yccd_id,c.topic_id]);if(fixedCells.has(key))fixedCells.get(key).question_count++;else fixedCells.set(key,c);}
 }
 result.push(...fixedCells.values());
 for(const [g,slots] of essays){
  const counts=slots.map(n=>n>0?1:0);let remaining=g.count-counts.reduce((s,n)=>s+n,0);
  while(remaining-->0){const li=slots.map((n,i)=>({i,room:n-counts[i]})).sort((a,b)=>b.room-a.room)[0].i;counts[li]++;}
  for(let li=0;li<4;li++)for(let i=0;i<counts[li];i++)result.push({...g.cell,cognitive_level:LEVELS[li],question_count:1,score_per_question:(Math.floor(slots[li]/counts[li])+(i<slots[li]%counts[li]?1:0))/4});
 }
 return result;
}
