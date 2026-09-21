import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import { autoDistribute, redistribute, totalScoreOf } from '../services/matrixBalancer.js';
import {balanceReport} from '../services/matrixValidation.js';

const r = Router();
r.use(auth);

const BranchConfigSchema = z.object({
  branch_id: z.number().int().positive().nullable().optional(),
  branch_code: z.string().optional(),
  score: z.number().nonnegative(),
  tn: z.number().int().nonnegative().default(0),
  ds: z.number().int().nonnegative().default(0),
  tln: z.number().int().nonnegative().default(0),
  tl: z.number().int().nonnegative().default(0),
  gn: z.number().int().nonnegative().default(0),
});

const CellInputSchema = z.object({
  branch_id: z.number().int().positive().nullable().optional(),
  branch_code: z.string().optional(),
  q_type: z.enum(['mcq4', 'true_false', 'short', 'essay','matching']),
  outcome_id:z.number().int().positive().nullable().optional(),
  yccd_id:z.number().int().positive().nullable().optional(),
  topic_id:z.number().int().positive().nullable().optional(),
  cognitive_level: z.enum(['M1', 'M2', 'M3', 'M4']),
  question_count: z.number().int().positive(),
  score_per_question: z.number().positive(),
  is_locked: z.boolean().default(false),
});

// POST /api/matrix-balance/auto — tự động phân bổ từ đầu
r.post('/auto', async (req, res, next) => {
  try {
    const data = z.object({
      total_score: z.number().positive(),
      ratios: z.array(z.number().int().nonnegative()).length(4),
      branch_configs: z.array(BranchConfigSchema).min(1),
    }).parse(req.body);

    const cells = autoDistribute({
      totalScore: data.total_score,
      ratios: data.ratios,
      branchConfigs: data.branch_configs,
    });
    const totalActual = totalScoreOf(cells);
    res.json({cells,...balanceReport(cells,data.total_score,data.ratios)});
  } catch (err) { next(err); }
});

// POST /api/matrix-balance/redistribute — tái phân bổ giữ ô khóa
r.post('/redistribute', async (req, res, next) => {
  try {
    const data = z.object({
      total_score: z.number().positive(),
      ratios: z.array(z.number().int().nonnegative()).length(4),
      branch_configs: z.array(BranchConfigSchema).min(1),
      cells: z.array(CellInputSchema),
    }).parse(req.body);

    const cells = redistribute({
      cells: data.cells, totalScore: data.total_score,
      ratios: data.ratios, branchConfigs: data.branch_configs,
    });
    const totalActual = totalScoreOf(cells);
    res.json({cells,...balanceReport(cells,data.total_score,data.ratios)});
  } catch (err) { next(err); }
});

export default r;
