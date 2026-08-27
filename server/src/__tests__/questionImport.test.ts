import QuizQuestion from '../models/QuizQuestion';
import {
  parseQuestionCsv,
  prepareQuestion,
  importQuestions,
} from '../services/questionImportService';
import { ensureIndexes } from './setup';

beforeEach(async () => {
  await ensureIndexes(QuizQuestion);
});

describe('prepareQuestion', () => {
  const base = {
    category: 'Geography',
    difficulty: 'easy',
    question: 'What is the capital of France?',
    options: ['Paris', 'London', 'Berlin', 'Madrid'],
    answer: 'Paris',
  };

  it('resolves an answer given as text', () => {
    const r = prepareQuestion(base, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.answer).toBe(0);
      expect(r.value.category).toBe('geography');
    }
  });

  it('treats a bare 1–4 as a 1-based option number', () => {
    const r = prepareQuestion({ ...base, answer: '2' }, 1);
    expect(r.ok && r.value.answer).toBe(1);
  });

  it('prefers a literal option match over the 1-based reading', () => {
    // "144" is one of the options, so it means the option, not "option 144".
    const r = prepareQuestion(
      {
        category: 'math',
        question: 'What is 12 times 12?',
        options: ['124', '144', '132', '154'],
        answer: '144',
      },
      1,
    );
    expect(r.ok && r.value.answer).toBe(1);
  });

  it('rejects an answer that is not one of the options', () => {
    const r = prepareQuestion({ ...base, answer: 'Rome' }, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/not one of the options/);
  });

  it('rejects duplicate options — they make the question unanswerable', () => {
    const r = prepareQuestion(
      { ...base, options: ['Paris', 'Paris', 'Berlin', 'Madrid'] },
      4,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/all be different/);
  });

  it('rejects the wrong number of options', () => {
    const r = prepareQuestion({ ...base, options: ['Paris', 'London'] }, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Expected 4 options/);
  });

  it('reports the row number so a big file can be fixed', () => {
    const r = prepareQuestion({ ...base, question: 'hi' }, 42);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.row).toBe(42);
  });

  it('defaults an unknown difficulty to medium rather than failing', () => {
    const r = prepareQuestion({ ...base, difficulty: 'impossible' }, 1);
    expect(r.ok && r.value.difficulty).toBe('medium');
  });
});

describe('parseQuestionCsv', () => {
  it('handles quoted fields containing commas', () => {
    const csv =
      'category,difficulty,question,option1,option2,option3,option4,answer\n' +
      'history,easy,"In 1969, who walked on the Moon?",Armstrong,Gagarin,Glenn,Shepard,Armstrong\n';

    const rows = parseQuestionCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe('In 1969, who walked on the Moon?');
  });

  it('ignores blank lines', () => {
    const csv =
      'category,difficulty,question,option1,option2,option3,option4,answer\n' +
      '\n' +
      'math,easy,What is 2 plus 2?,3,4,5,6,4\n' +
      '\n';
    expect(parseQuestionCsv(csv)).toHaveLength(1);
  });
});

describe('importQuestions', () => {
  const rows = [
    {
      category: 'math',
      difficulty: 'easy',
      question: 'What is 2 plus 2?',
      options: ['3', '4', '5', '6'],
      answer: '4',
    },
    {
      category: 'math',
      difficulty: 'easy',
      // Same question, different punctuation and case — must be caught.
      question: 'what is 2 plus 2',
      options: ['3', '4', '5', '6'],
      answer: '4',
    },
    {
      category: 'math',
      difficulty: 'hard',
      question: 'What is the derivative of x squared?',
      options: ['x', '2x', 'x cubed', '2'],
      answer: '2x',
    },
  ];

  it('imports valid rows and collapses in-file duplicates', async () => {
    const report = await importQuestions(rows);

    expect(report.received).toBe(3);
    expect(report.duplicatesInFile).toBe(1);
    expect(report.inserted).toBe(2);
    expect(await QuizQuestion.countDocuments({})).toBe(2);
  });

  it('skips questions already in the database on a re-import', async () => {
    await importQuestions(rows);
    const second = await importQuestions(rows);

    expect(second.inserted).toBe(0);
    expect(second.duplicatesInDatabase).toBe(2);
    expect(await QuizQuestion.countDocuments({})).toBe(2);
  });

  it('dryRun validates without writing', async () => {
    const report = await importQuestions(rows, { dryRun: true });

    expect(report.valid).toBe(2);
    expect(report.inserted).toBe(0);
    expect(await QuizQuestion.countDocuments({})).toBe(0);
  });

  it('imports the good rows and reports the bad ones', async () => {
    const report = await importQuestions([
      rows[0],
      { category: 'math', question: 'Broken', options: ['a'], answer: 'a' },
      rows[2],
    ]);

    expect(report.inserted).toBe(2);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].row).toBe(2);
  });
});
