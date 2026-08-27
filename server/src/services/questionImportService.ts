/**
 * Bulk question import.
 *
 * The admin panel could only create questions one at a time, which is not a
 * path to the thousands of questions the game needs — seven of the eleven
 * shipped categories hold 20 questions each, which a player exhausts in two
 * sessions.
 *
 * This validates a whole batch, reports every problem with a row number, and
 * only then writes — so a bad row in the middle can't leave a half-imported
 * category behind.
 */
import QuizQuestion, { fingerprintQuestion } from '../models/QuizQuestion';
import { logger } from '../utils/logger';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface RawQuestion {
  category?: unknown;
  question?: unknown;
  options?: unknown;
  /** Either the 0-based index, or the answer text itself. */
  answer?: unknown;
  difficulty?: unknown;
}

export interface PreparedQuestion {
  category: string;
  question: string;
  options: string[];
  answer: number;
  difficulty: Difficulty;
  fingerprint: string;
}

export interface RowError {
  row: number;
  message: string;
  question?: string;
}

export interface ImportReport {
  received: number;
  valid: number;
  inserted: number;
  duplicatesInFile: number;
  duplicatesInDatabase: number;
  errors: RowError[];
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Parse a CSV batch.
 *
 * Expected header: category,difficulty,question,option1,option2,option3,option4,answer
 * `answer` may be a 1-based option number or the answer text.
 */
export function parseQuestionCsv(csv: string): RawQuestion[] {
  const rows = splitCsvRows(csv);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const cCategory = idx('category');
  const cDifficulty = idx('difficulty');
  const cQuestion = idx('question');
  const cAnswer = idx('answer');
  const optionCols = ['option1', 'option2', 'option3', 'option4'].map(idx);

  return rows.slice(1).map((cells) => ({
    category: cCategory >= 0 ? cells[cCategory] : undefined,
    difficulty: cDifficulty >= 0 ? cells[cDifficulty] : undefined,
    question: cQuestion >= 0 ? cells[cQuestion] : undefined,
    options: optionCols.map((c) => (c >= 0 ? cells[c] : undefined)),
    answer: cAnswer >= 0 ? cells[cAnswer] : undefined,
  }));
}

/** RFC-4180-ish splitter: handles quoted fields containing commas and newlines. */
function splitCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];

    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }

  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Validate one row.
 *
 * Rejects anything that would produce an unanswerable or trivially guessable
 * question: fewer than four distinct options, a missing answer, an answer that
 * isn't one of the options.
 */
export function prepareQuestion(
  raw: RawQuestion,
  row: number,
  defaultCategory?: string,
): { ok: true; value: PreparedQuestion } | { ok: false; error: RowError } {
  const fail = (message: string): { ok: false; error: RowError } => ({
    ok: false,
    error: { row, message, question: typeof raw.question === 'string' ? raw.question : undefined },
  });

  const category = String(raw.category ?? defaultCategory ?? '').trim().toLowerCase();
  if (!category) return fail('Missing category');

  const question = String(raw.question ?? '').trim();
  if (question.length < 8) return fail('Question text is missing or too short');
  if (question.length > 300) return fail('Question text is longer than 300 characters');

  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions.map((o) => String(o ?? '').trim()).filter(Boolean);
  if (options.length !== 4) return fail(`Expected 4 options, got ${options.length}`);

  const distinct = new Set(options.map((o) => o.toLowerCase()));
  if (distinct.size !== 4) return fail('Options must all be different');
  if (options.some((o) => o.length > 120)) return fail('An option is longer than 120 characters');

  // `answer` is either an index or the answer text.
  let answer: number;
  const rawAnswer = raw.answer;

  if (typeof rawAnswer === 'number') {
    answer = rawAnswer;
  } else {
    const text = String(rawAnswer ?? '').trim();
    if (!text) return fail('Missing answer');

    const asNumber = Number(text);
    if (Number.isInteger(asNumber)) {
      // A bare number in a CSV is ambiguous. Treat 1–4 as a 1-based option
      // number, which is what a human filling in a spreadsheet means, unless
      // that number is itself one of the options.
      const matchesOption = options.findIndex((o) => o === text);
      answer =
        matchesOption >= 0 && (asNumber < 1 || asNumber > 4)
          ? matchesOption
          : asNumber >= 1 && asNumber <= 4
            ? asNumber - 1
            : asNumber;
    } else {
      answer = options.findIndex((o) => o.toLowerCase() === text.toLowerCase());
      if (answer < 0) return fail(`Answer "${text}" is not one of the options`);
    }
  }

  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    return fail(`Answer index ${answer} is out of range (expected 0–3)`);
  }

  const rawDifficulty = String(raw.difficulty ?? 'medium').trim().toLowerCase();
  const difficulty = DIFFICULTIES.includes(rawDifficulty as Difficulty)
    ? (rawDifficulty as Difficulty)
    : 'medium';

  return {
    ok: true,
    value: {
      category,
      question,
      options,
      answer,
      difficulty,
      fingerprint: fingerprintQuestion(question),
    },
  };
}

/**
 * Validate and import a batch.
 *
 * `dryRun` validates and reports without writing, which is how an operator
 * should always check a new file first.
 */
export async function importQuestions(
  rows: RawQuestion[],
  options: { defaultCategory?: string; dryRun?: boolean } = {},
): Promise<ImportReport> {
  const report: ImportReport = {
    received: rows.length,
    valid: 0,
    inserted: 0,
    duplicatesInFile: 0,
    duplicatesInDatabase: 0,
    errors: [],
  };

  const prepared: PreparedQuestion[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    const result = prepareQuestion(raw, i + 1, options.defaultCategory);
    if (!result.ok) {
      report.errors.push(result.error);
      return;
    }

    const key = `${result.value.category}::${result.value.fingerprint}`;
    if (seen.has(key)) {
      report.duplicatesInFile += 1;
      return;
    }
    seen.add(key);
    prepared.push(result.value);
  });

  report.valid = prepared.length;

  if (!prepared.length) return report;

  // Which of these already exist? One query rather than one per row.
  const existing = await QuizQuestion.find(
    { fingerprint: { $in: prepared.map((q) => q.fingerprint) } },
    { category: 1, fingerprint: 1 },
  ).lean();

  const existingKeys = new Set(
    existing.map((e) => `${e.category}::${e.fingerprint}`),
  );

  const fresh = prepared.filter(
    (q) => !existingKeys.has(`${q.category}::${q.fingerprint}`),
  );
  report.duplicatesInDatabase = prepared.length - fresh.length;

  if (options.dryRun) return report;

  if (fresh.length) {
    // `ordered: false` so one late collision doesn't abandon the rest.
    const result = await QuizQuestion.insertMany(fresh, {
      ordered: false,
      rawResult: true,
    } as any).catch((err: any) => {
      // A concurrent import can still collide on the unique index.
      if (err?.writeErrors) {
        return { insertedCount: err.result?.nInserted ?? 0 };
      }
      throw err;
    });

    report.inserted = (result as any).insertedCount ?? fresh.length;
  }

  logger.info('Question import complete', {
    received: report.received,
    inserted: report.inserted,
    errors: report.errors.length,
  });

  return report;
}

/** A ready-to-fill template, so nobody has to guess the column names. */
export const CSV_TEMPLATE =
  'category,difficulty,question,option1,option2,option3,option4,answer\n' +
  'geography,easy,"What is the capital of France?",Paris,London,Berlin,Madrid,Paris\n' +
  'math,medium,"What is 12 × 12?","124","144","132","154",144\n';
