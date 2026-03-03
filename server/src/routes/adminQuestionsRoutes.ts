import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import QuizQuestion from '../models/QuizQuestion';

const router = Router();
router.use(requireAdmin);

// GET /admin/questions?category=&difficulty=&page=&search=
router.get('/', async (req: Request, res: Response) => {
  const page       = Math.max(1, Number(req.query.page) || 1);
  const limit      = Math.min(50, Number(req.query.limit) || 20);
  const { category, difficulty, search } = req.query as Record<string, string>;

  const filter: any = {};
  if (category)   filter.category = category;
  if (difficulty) filter.difficulty = difficulty;
  if (search)     filter.question = { $regex: search, $options: 'i' };

  const [questions, total] = await Promise.all([
    QuizQuestion.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    QuizQuestion.countDocuments(filter),
  ]);

  // Category summary for filter UI
  const categories = await QuizQuestion.distinct('category');

  res.json({ questions, total, page, categories });
});

// POST /admin/questions — create
router.post('/', async (req: Request, res: Response) => {
  const { category, question, options, answer, difficulty } = req.body;
  if (!category || !question || !Array.isArray(options) || options.length !== 4 || answer == null) {
    return res.status(400).json({ message: 'category, question, options[4], and answer required' });
  }
  const q = await QuizQuestion.create({ category, question, options, answer: Number(answer), difficulty: difficulty ?? 'medium' });
  res.status(201).json({ question: q });
});

// PATCH /admin/questions/:id — update
router.patch('/:id', async (req: Request, res: Response) => {
  const { category, question, options, answer, difficulty } = req.body;
  const updates: any = {};
  if (category)   updates.category = category;
  if (question)   updates.question = question;
  if (options)    updates.options  = options;
  if (answer != null) updates.answer = Number(answer);
  if (difficulty) updates.difficulty = difficulty;

  const q = await QuizQuestion.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!q) return res.status(404).json({ message: 'Question not found' });
  res.json({ question: q });
});

// DELETE /admin/questions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await QuizQuestion.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
