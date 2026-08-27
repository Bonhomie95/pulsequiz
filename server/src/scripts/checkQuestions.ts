/**
 * Validate every seed file before it reaches a database.
 *
 *   npm run questions:check
 *
 * Structural problems only — this cannot tell you an answer is factually
 * wrong. It catches the things that are mechanically detectable: malformed
 * rows, duplicate options, answers out of range, repeated questions, and a
 * predictable answer position.
 */
import fs from 'fs';
import path from 'path';
import { fingerprintQuestion } from '../models/QuizQuestion';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
/** One quiz consumes this many of each difficulty. */
const PER_QUIZ = { easy: 4, medium: 4, hard: 2 } as const;
const HEALTHY_QUIZZES = 50;

const seedDir = path.join(__dirname, '..', 'seed');
const problems: string[] = [];
const warnings: string[] = [];
const fingerprints = new Map<string, string>();

let total = 0;
const positions = [0, 0, 0, 0];
const rows: {
  category: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  quizzes: number;
}[] = [];

for (const file of fs
  .readdirSync(seedDir)
  .filter((f) => f.startsWith('questions.') && f.endsWith('.json'))
  .sort()) {
  let data: any[];
  try {
    data = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8'));
  } catch (err) {
    problems.push(`${file}: not valid JSON — ${(err as Error).message}`);
    continue;
  }

  if (!Array.isArray(data)) {
    problems.push(`${file}: expected an array`);
    continue;
  }

  const counts = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  const categories = new Set<string>();

  data.forEach((q, i) => {
    total += 1;
    const where = `${file}[${i}]`;

    if (!q.category) problems.push(`${where}: missing category`);
    else categories.add(String(q.category));

    if (typeof q.question !== 'string' || q.question.trim().length < 8) {
      problems.push(`${where}: question missing or too short`);
    } else if (q.question.length > 300) {
      problems.push(`${where}: question is ${q.question.length} characters (max 300)`);
    } else if (q.question.length > 120) {
      warnings.push(`${where}: question is ${q.question.length} characters — long for a phone screen`);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      problems.push(`${where}: needs exactly 4 options, has ${q.options?.length ?? 0}`);
    } else {
      if (new Set(q.options.map((o: unknown) => String(o).trim().toLowerCase())).size !== 4) {
        problems.push(`${where}: duplicate options`);
      }
      if (q.options.some((o: unknown) => !String(o ?? '').trim())) {
        problems.push(`${where}: blank option`);
      }
      const longest = q.options.reduce((a: string, b: string) => (String(a).length >= String(b).length ? a : b));
      if (Number.isInteger(q.answer) && q.options[q.answer] === longest && String(longest).length > 24) {
        warnings.push(`${where}: the correct answer is much the longest option — a giveaway`);
      }
    }

    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      problems.push(`${where}: answer index ${q.answer} is out of range`);
    } else {
      positions[q.answer] += 1;
    }

    if (!DIFFICULTIES.includes(q.difficulty)) {
      problems.push(`${where}: difficulty "${q.difficulty}" is not easy/medium/hard`);
    } else {
      counts[q.difficulty] += 1;
    }

    const key = `${String(q.category).toLowerCase()}::${fingerprintQuestion(q.question ?? '')}`;
    const prior = fingerprints.get(key);
    if (prior) problems.push(`${where}: same question as ${prior}`);
    else fingerprints.set(key, where);
  });

  if (categories.size > 1) {
    problems.push(`${file}: mixes categories — ${[...categories].join(', ')}`);
  }

  const quizzes = Math.min(
    Math.floor(counts.easy / PER_QUIZ.easy),
    Math.floor(counts.medium / PER_QUIZ.medium),
    Math.floor(counts.hard / PER_QUIZ.hard),
  );

  rows.push({
    category: [...categories][0] ?? file,
    total: data.length,
    easy: counts.easy,
    medium: counts.medium,
    hard: counts.hard,
    quizzes,
  });
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('\nCATEGORY'.padEnd(23) + 'TOTAL   EASY  MED  HARD   QUIZZES');
console.log('─'.repeat(60));

for (const r of rows.sort((a, b) => a.quizzes - b.quizzes)) {
  const flag = r.quizzes >= HEALTHY_QUIZZES ? '' : '  ← thin';
  console.log(
    r.category.padEnd(22) +
      String(r.total).padStart(5) +
      String(r.easy).padStart(7) +
      String(r.medium).padStart(5) +
      String(r.hard).padStart(6) +
      String(r.quizzes).padStart(10) +
      flag,
  );
}

console.log('─'.repeat(60));
console.log(`${total} questions across ${rows.length} categories`);

const pct = positions.map((p) => ((p / total) * 100).toFixed(1));
console.log(`answer position:  A ${pct[0]}%   B ${pct[1]}%   C ${pct[2]}%   D ${pct[3]}%`);

const skew = Math.max(...positions) / total;
if (skew > 0.35) {
  problems.push(
    `Answer position is skewed — ${(skew * 100).toFixed(1)}% sit in one slot. ` +
      'Players learn that faster than you would think.',
  );
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.slice(0, 15).forEach((w) => console.log('  ' + w));
  if (warnings.length > 15) console.log(`  …and ${warnings.length - 15} more`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  problems.slice(0, 30).forEach((p) => console.error('  ' + p));
  if (problems.length > 30) console.error(`  …and ${problems.length - 30} more`);
  console.error('');
  process.exit(1);
}

const thin = rows.filter((r) => r.quizzes < HEALTHY_QUIZZES);
console.log(
  thin.length
    ? `\nNo structural problems. ${thin.length} categor${thin.length === 1 ? 'y' : 'ies'} still below ${HEALTHY_QUIZZES} distinct quizzes.\n`
    : '\nNo structural problems, and every category is well stocked.\n',
);
