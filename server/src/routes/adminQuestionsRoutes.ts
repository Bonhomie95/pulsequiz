import { Router, Request, Response } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import QuizQuestion from '../models/QuizQuestion';
import { escapeRegex } from '../utils/escapeRegex';
import { auditAdmin } from '../utils/adminAudit';
import {
  importQuestions,
  parseQuestionCsv,
  CSV_TEMPLATE,
  type RawQuestion,
} from '../services/questionImportService';

const router = Router();
router.use(requireAdmin);

// GET /admin/questions?category=&difficulty=&page=&search=&flagged=
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { category, difficulty, search, flagged } = req.query as Record<string, string>;

  const filter: any = {};
  if (category) filter.category = category;
  if (difficulty) filter.difficulty = difficulty;
  if (search) filter.question = { $regex: escapeRegex(search), $options: 'i' };
  if (flagged === '1') filter.reportCount = { $gt: 0 };

  const [questions, total, categories] = await Promise.all([
    QuizQuestion.find(filter)
      .sort(flagged === '1' ? { reportCount: -1 } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    QuizQuestion.countDocuments(filter),
    QuizQuestion.distinct('category'),
  ]);

  res.json({ questions, total, page, categories });
});

/**
 * GET /admin/questions/coverage
 *
 * How many questions exist per category and difficulty. Seven categories ship
 * with 20 questions each, which a player exhausts in two sessions — this makes
 * that visible instead of something you discover from a support ticket.
 */
router.get('/coverage', async (_req: Request, res: Response) => {
  const rows = await QuizQuestion.aggregate<{
    _id: { category: string; difficulty: string };
    count: number;
  }>([
    { $match: { disabled: { $ne: true } } },
    { $group: { _id: { category: '$category', difficulty: '$difficulty' }, count: { $sum: 1 } } },
  ]);

  const byCategory: Record<
    string,
    { easy: number; medium: number; hard: number; total: number }
  > = {};

  for (const row of rows) {
    const cat = row._id.category ?? 'unknown';
    byCategory[cat] ??= { easy: 0, medium: 0, hard: 0, total: 0 };
    const diff = row._id.difficulty as 'easy' | 'medium' | 'hard';
    if (diff in byCategory[cat]) byCategory[cat][diff] += row.count;
    byCategory[cat].total += row.count;
  }

  // A single quiz consumes 4 easy / 4 medium / 2 hard. Below this a player
  // starts seeing repeats almost immediately.
  const HEALTHY_TOTAL = 200;

  const coverage = Object.entries(byCategory)
    .map(([category, counts]) => ({
      category,
      ...counts,
      // How many distinct quizzes this category can serve before recycling.
      sessionsBeforeRepeat: Math.min(
        Math.floor(counts.easy / 4),
        Math.floor(counts.medium / 4),
        Math.floor(counts.hard / 2),
      ),
      healthy: counts.total >= HEALTHY_TOTAL,
    }))
    .sort((a, b) => a.total - b.total);

  res.json({ coverage, healthyThreshold: HEALTHY_TOTAL });
});

/** GET /admin/questions/template.csv */
router.get('/template.csv', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="questions-template.csv"');
  res.send(CSV_TEMPLATE);
});

/**
 * POST /admin/questions/import
 * Body: { csv?: string, questions?: RawQuestion[], defaultCategory?: string, dryRun?: boolean }
 *
 * Always run with dryRun first — the report names every bad row.
 */
router.post('/import', requireSuperAdmin, async (req: Request, res: Response) => {
  const { csv, questions, defaultCategory, dryRun } = req.body ?? {};

  let rows: RawQuestion[];
  if (typeof csv === 'string' && csv.trim()) {
    rows = parseQuestionCsv(csv);
  } else if (Array.isArray(questions)) {
    rows = questions;
  } else {
    return res.status(400).json({ message: 'Provide either `csv` text or a `questions` array' });
  }

  if (rows.length === 0) {
    return res.status(400).json({ message: 'No rows found' });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ message: 'Import at most 5,000 questions at a time' });
  }

  const report = await importQuestions(rows, {
    defaultCategory,
    dryRun: dryRun === true,
  });

  if (!dryRun) {
    await auditAdmin(req, 'questions.import', {
      targetType: 'questions',
      targetId: defaultCategory ?? 'mixed',
      after: {
        received: report.received,
        inserted: report.inserted,
        errors: report.errors.length,
      },
    });
  }

  res.json(report);
});

// POST /admin/questions — create one
router.post('/', async (req: Request, res: Response) => {
  const { category, question, options, answer, difficulty } = req.body;
  if (!category || !question || !Array.isArray(options) || options.length !== 4 || answer == null) {
    return res.status(400).json({ message: 'category, question, options[4], and answer required' });
  }

  try {
    const q = await QuizQuestion.create({
      category: String(category).trim().toLowerCase(),
      question,
      options,
      answer: Number(answer),
      difficulty: difficulty ?? 'medium',
    });
    await auditAdmin(req, 'questions.create', { targetType: 'question', targetId: q._id.toString() });
    res.status(201).json({ question: q });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'That question already exists in this category' });
    }
    throw err;
  }
});

// PATCH /admin/questions/:id — update
router.patch('/:id', async (req: Request, res: Response) => {
  const { category, question, options, answer, difficulty, disabled } = req.body;
  const before = await QuizQuestion.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Question not found' });

  // Use a document save so the fingerprint hook runs on a text change.
  const doc = await QuizQuestion.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Question not found' });

  if (category) doc.category = String(category).trim().toLowerCase();
  if (question) doc.question = question;
  if (options) doc.options = options;
  if (answer != null) doc.answer = Number(answer);
  if (difficulty) doc.difficulty = difficulty;
  if (disabled !== undefined) doc.disabled = !!disabled;

  // An edited question has presumably been fixed — clear the report count so
  // it stops showing in the flagged queue.
  if (question || options || answer != null) doc.reportCount = 0;

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'That question already exists in this category' });
    }
    throw err;
  }

  await auditAdmin(req, 'questions.update', {
    targetType: 'question',
    targetId: req.params.id,
    before: { question: before.question, answer: before.answer, disabled: before.disabled },
    after: { question: doc.question, answer: doc.answer, disabled: doc.disabled },
  });

  res.json({ question: doc });
});

// DELETE /admin/questions/:id
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const before = await QuizQuestion.findById(req.params.id).lean();
  await QuizQuestion.findByIdAndDelete(req.params.id);
  await auditAdmin(req, 'questions.delete', {
    targetType: 'question',
    targetId: req.params.id,
    before: before ? { question: before.question, category: before.category } : null,
  });
  res.json({ ok: true });
});

export default router;
