import express, { Router, Request, Response } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import QuizQuestion from '../models/QuizQuestion';
import { escapeRegex } from '../utils/escapeRegex';
import { auditAdmin } from '../utils/adminAudit';
import {
  importQuestions,
  parseQuestionCsv,
  prepareQuestion,
  CSV_TEMPLATE,
  type RawQuestion,
} from '../services/questionImportService';

const router = Router();
router.use(requireAdmin);

// GET /admin/questions?category=&difficulty=&page=&search=&flagged=
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  // String() so a `?category[$ne]=x` query can't smuggle an operator in.
  const q = req.query as Record<string, unknown>;
  const category = typeof q.category === 'string' ? q.category : '';
  const difficulty = typeof q.difficulty === 'string' ? q.difficulty : '';
  const search = typeof q.search === 'string' ? q.search.slice(0, 100) : '';
  const flagged = q.flagged;
  const status = q.status; // 'active' | 'disabled'

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (difficulty) filter.difficulty = difficulty;
  if (search) filter.question = { $regex: escapeRegex(search), $options: 'i' };
  if (flagged === '1') filter.reportCount = { $gt: 0 };
  if (status === 'disabled') filter.disabled = true;
  if (status === 'active') filter.disabled = { $ne: true };

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
router.post('/import', express.json({ limit: '5mb' }), async (req: Request, res: Response) => {
  const { csv, questions, dryRun } = req.body ?? {};
  const defaultCategory =
    typeof req.body?.defaultCategory === 'string' ? req.body.defaultCategory : undefined;

  let rows: RawQuestion[];
  const fromCsv = typeof csv === 'string' && csv.trim().length > 0;
  if (fromCsv) {
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
    firstRowNumber: fromCsv ? 2 : 1,
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

// POST /admin/questions — create one. Same validation as bulk import.
router.post('/', async (req: Request, res: Response) => {
  const { category, question, options, answer, difficulty, explanation } = req.body ?? {};
  const prepared = prepareQuestion({ category, question, options, answer, difficulty, explanation }, 1);
  if (!prepared.ok) return res.status(400).json({ message: prepared.error.message });

  try {
    const q = await QuizQuestion.create(prepared.value);
    await auditAdmin(req, 'questions.create', { targetType: 'question', targetId: q._id.toString() });
    res.status(201).json({ question: q });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'That question already exists in this category' });
    }
    throw err;
  }
});

// PATCH /admin/questions/:id — update (any subset of fields, validated as a whole)
router.patch('/:id', async (req: Request, res: Response) => {
  const doc = await QuizQuestion.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Question not found' });
  const before = { question: doc.question, answer: doc.answer, disabled: doc.disabled };

  const body = req.body ?? {};
  const contentChanged = ['category', 'question', 'options', 'answer', 'difficulty'].some(
    (k) => body[k] !== undefined,
  );

  if (contentChanged) {
    const prepared = prepareQuestion(
      {
        category: body.category ?? doc.category,
        question: body.question ?? doc.question,
        options: body.options ?? doc.options,
        answer: body.answer ?? doc.answer,
        difficulty: body.difficulty ?? doc.difficulty,
        explanation: body.explanation !== undefined ? body.explanation : doc.explanation,
      },
      1,
    );
    if (!prepared.ok) return res.status(400).json({ message: prepared.error.message });
    const v = prepared.value;
    doc.category = v.category;
    doc.question = v.question;
    doc.options = v.options;
    doc.answer = v.answer;
    doc.difficulty = v.difficulty;
    doc.explanation = v.explanation;
    // An edited question has presumably been fixed — clear the reports so it
    // leaves the flagged queue and players can report it afresh.
    doc.reportCount = 0;
    doc.reportedBy = [];
  }
  if (body.explanation !== undefined && !contentChanged) {
    // Adding an explanation doesn't fix a reported question, so reports stay.
    const e = String(body.explanation ?? '').trim() || null;
    if (e && e.length > 400) {
      return res.status(400).json({ message: 'Explanation is longer than 400 characters' });
    }
    doc.explanation = e;
  }
  if (body.disabled !== undefined) doc.disabled = body.disabled === true;

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
    before,
    after: { question: doc.question, answer: doc.answer, disabled: doc.disabled },
  });

  res.json({ question: doc });
});

// DELETE /admin/questions/:id
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const before = await QuizQuestion.findByIdAndDelete(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Question not found' });
  await auditAdmin(req, 'questions.delete', {
    targetType: 'question',
    targetId: req.params.id,
    before: { question: before.question, category: before.category },
  });
  res.json({ ok: true });
});

export default router;
