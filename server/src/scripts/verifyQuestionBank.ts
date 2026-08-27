/**
 * Validates question-bank/*.json before it goes anywhere near a database.
 *
 * Two layers:
 *   1. Structural — shape, uniqueness, difficulty mix, answer-position spread.
 *   2. Semantic  — every Math question's answer is re-derived here, from the
 *      question text, by code that shares nothing with the generator. If the
 *      generator has an arithmetic bug this is what catches it.
 *
 * Exits non-zero on any error so it can gate `bank:seed` in a script chain.
 */
import fs from 'fs';
import path from 'path';
import { fingerprintQuestion } from '../models/QuizQuestion';

const BANK = path.resolve(__dirname, '../../question-bank');
const EXPECTED = { easy: 80, medium: 80, hard: 40 };

interface Q {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  answer: number;
}

const errors: string[] = [];
const warnings: string[] = [];
const err = (f: string, i: number, m: string) => errors.push(`${f}[${i}] ${m}`);

/* ── Semantic re-derivation for Math ──────────────────────────────────────
   Each entry: a pattern, and a function computing the answer from scratch.
   Deliberately written from the question text, not from the generator. */
const num = (s: string) => Number(s.replace(/[$,]/g, ''));
const MATH_RULES: { re: RegExp; expect: (m: RegExpMatchArray) => number }[] = [
  { re: /^What is (\d+) × (\d+)\?$/, expect: (m) => num(m[1]) * num(m[2]) },
  { re: /^What is (\d+) \+ (\d+)\?$/, expect: (m) => num(m[1]) + num(m[2]) },
  { re: /^What is (\d+) − (\d+)\?$/, expect: (m) => num(m[1]) - num(m[2]) },
  { re: /^What is (\d+) ÷ (\d+)\?$/, expect: (m) => num(m[1]) / num(m[2]) },
  { re: /^What is (\d+) squared\?$/, expect: (m) => num(m[1]) ** 2 },
  { re: /^What is the square root of (\d+)\?$/, expect: (m) => Math.sqrt(num(m[1])) },
  { re: /^What is (\d+) to the power of (\d+)\?$/, expect: (m) => num(m[1]) ** num(m[2]) },
  { re: /^What is (\d+)% of (\d+)\?$/, expect: (m) => (num(m[1]) / 100) * num(m[2]) },
  { re: /^What is (\d+) \+ (\d+) × (\d+)\?$/, expect: (m) => num(m[1]) + num(m[2]) * num(m[3]) },
  { re: /^What is the area of a square with sides of (\d+) cm\?$/, expect: (m) => num(m[1]) ** 2 },
  { re: /^What is the perimeter of a square with sides of (\d+) cm\?$/, expect: (m) => 4 * num(m[1]) },
  {
    re: /^A triangle has base (\d+) cm and height (\d+) cm\. What is its area\?$/,
    expect: (m) => (num(m[1]) * num(m[2])) / 2,
  },
  { re: /^If (\d+)x \+ (\d+) = (\d+), what is x\?$/, expect: (m) => (num(m[3]) - num(m[2])) / num(m[1]) },
  {
    re: /^What comes next: (\d+), (\d+), (\d+), (\d+), …\?$/,
    expect: (m) => num(m[4]) + (num(m[2]) - num(m[1])),
  },
  {
    re: /^A \$(\d+) item is discounted by (\d+)%\. What is the sale price\?$/,
    expect: (m) => num(m[1]) * (1 - num(m[2]) / 100),
  },
  {
    re: /^\$(\d+) is split in the ratio (\d+):(\d+)\. What is the smaller share\?$/,
    expect: (m) => (num(m[1]) / (num(m[2]) + num(m[3]))) * Math.min(num(m[2]), num(m[3])),
  },
  {
    re: /^\$(\d+) earns (\d+)% simple interest yearly\. Value after (\d+) years\?$/,
    expect: (m) => num(m[1]) + (num(m[1]) * num(m[2]) * num(m[3])) / 100,
  },
  {
    re: /^A car travels (\d+) km in (\d+) hours\. What is its average speed\?$/,
    expect: (m) => num(m[1]) / num(m[2]),
  },
];

function checkMath(q: Q, file: string, i: number): 'checked' | 'unmatched' {
  for (const rule of MATH_RULES) {
    const m = q.question.match(rule.re);
    if (!m) continue;
    const expected = rule.expect(m);
    const got = num(q.options[q.answer]);
    if (Math.abs(expected - got) > 1e-9) {
      err(file, i, `math: "${q.question}" — expected ${expected}, marked ${got}`);
    }
    // A distractor equal to the right answer would make two options correct.
    q.options.forEach((opt, oi) => {
      if (oi !== q.answer && Math.abs(num(opt) - expected) < 1e-9) {
        err(file, i, `math: "${q.question}" — distractor "${opt}" also equals the answer`);
      }
    });
    return 'checked';
  }
  return 'unmatched';
}

/* ── Structural checks ──────────────────────────────────────────────────── */
function checkFile(file: string) {
  const raw = fs.readFileSync(path.join(BANK, file), 'utf-8');
  let data: Q[];
  try {
    data = JSON.parse(raw);
  } catch (e) {
    errors.push(`${file}: not valid JSON — ${(e as Error).message}`);
    return;
  }
  if (!Array.isArray(data)) {
    errors.push(`${file}: top level is not an array`);
    return;
  }

  const byDifficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  const answerSlots = [0, 0, 0, 0];
  const fingerprints = new Map<string, number>();
  const categories = new Set<string>();
  let mathChecked = 0;
  let mathUnmatched = 0;

  data.forEach((q, i) => {
    if (typeof q.category !== 'string' || !q.category.trim()) err(file, i, 'missing category');
    else categories.add(q.category);

    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
      err(file, i, `bad difficulty ${JSON.stringify(q.difficulty)}`);
    } else byDifficulty[q.difficulty]++;

    if (typeof q.question !== 'string' || q.question.trim().length < 8) {
      err(file, i, 'question missing or too short');
    } else if (q.question.length > 160) {
      err(file, i, `question too long (${q.question.length} chars)`);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      err(file, i, `expected 4 options, got ${q.options?.length}`);
      return; // the checks below all assume four options
    }
    q.options.forEach((o, oi) => {
      if (typeof o !== 'string' || !o.trim()) err(file, i, `option ${oi} is empty`);
      else if (o.length > 80) err(file, i, `option ${oi} too long (${o.length} chars)`);
    });
    // Case-insensitive: "Gold" and "gold" would both read as correct.
    const lowered = q.options.map((o) => o.trim().toLowerCase());
    if (new Set(lowered).size !== 4) err(file, i, `duplicate options: ${JSON.stringify(q.options)}`);

    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      err(file, i, `answer index out of range: ${q.answer}`);
    } else answerSlots[q.answer]++;

    const fp = fingerprintQuestion(q.question ?? '');
    // Mirrors the unique { category, fingerprint } index — a collision here
    // means the seed would silently drop one of the two.
    if (fingerprints.has(fp)) {
      err(file, i, `duplicate question (also at index ${fingerprints.get(fp)}): "${q.question}"`);
    } else fingerprints.set(fp, i);

    if (file.includes('math')) {
      if (checkMath(q, file, i) === 'checked') mathChecked++;
      else mathUnmatched++;
    }
  });

  if (categories.size > 1) {
    errors.push(`${file}: mixed categories ${JSON.stringify([...categories])}`);
  }

  for (const [d, want] of Object.entries(EXPECTED)) {
    const got = byDifficulty[d];
    if (got !== want) errors.push(`${file}: ${d} count is ${got}, expected ${want}`);
  }

  // Answer position must not be guessable. With 200 questions an even spread is
  // 50 per slot; anything past 65 is a pattern a player could exploit.
  const worst = Math.max(...answerSlots);
  if (worst > 65) {
    errors.push(`${file}: answer position skewed — slots ${answerSlots.join('/')}`);
  } else if (worst > 58) {
    warnings.push(`${file}: answer positions a little uneven — ${answerSlots.join('/')}`);
  }

  const label = file.replace(/^questions\.|\.json$/g, '').padEnd(20);
  const mathNote = file.includes('math')
    ? `  math verified ${mathChecked}${mathUnmatched ? `, UNMATCHED ${mathUnmatched}` : ''}`
    : '';
  console.log(
    `${label} ${String(data.length).padStart(4)}  ` +
      `${byDifficulty.easy}/${byDifficulty.medium}/${byDifficulty.hard}  ` +
      `slots ${answerSlots.join('/')}${mathNote}`,
  );

  if (mathUnmatched > 0) {
    errors.push(
      `${file}: ${mathUnmatched} math questions matched no verification rule — ` +
        `add a rule to MATH_RULES so they are not shipped unchecked`,
    );
  }
}

function main() {
  if (!fs.existsSync(BANK)) {
    console.error(`No question-bank/ directory. Run:  npm run bank:build`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(BANK)
    .filter((f) => f.startsWith('questions.') && f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.error('question-bank/ has no questions.*.json files. Run: npm run bank:build');
    process.exit(1);
  }

  console.log(`Verifying ${files.length} files in question-bank/\n`);
  console.log('FILE                 N     E/M/H     ANSWER SLOTS');
  console.log('─'.repeat(72));
  files.forEach(checkFile);
  console.log('─'.repeat(72));

  // A question that is textually identical across two categories would pass the
  // per-category unique index but read as a repeat to a player.
  const global = new Map<string, string>();
  for (const f of files) {
    for (const q of JSON.parse(fs.readFileSync(path.join(BANK, f), 'utf-8')) as Q[]) {
      const fp = fingerprintQuestion(q.question ?? '');
      const prev = global.get(fp);
      if (prev && prev !== f) warnings.push(`same question in ${prev} and ${f}: "${q.question}"`);
      else global.set(fp, f);
    }
  }

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.slice(0, 20).forEach((w) => console.log(`  ! ${w}`));
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`);
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s):`);
    errors.slice(0, 40).forEach((e) => console.error(`  ✗ ${e}`));
    if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
    console.error('\nFAILED — not safe to seed.');
    process.exit(1);
  }

  console.log('\nAll checks passed.  Next:  npm run bank:seed');
}

main();
