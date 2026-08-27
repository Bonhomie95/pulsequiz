/**
 * Deterministic math question generator.
 *
 * Math is the one category where questions can be produced at volume with a
 * guaranteed-correct answer key, because the answer is computed rather than
 * recalled. Everything else has to be authored and fact-checked.
 *
 * Distractors are chosen to look plausible — off-by-one, sign errors, the
 * common wrong operation — so the question tests the skill rather than being
 * answerable by elimination.
 *
 *   npx ts-node src/seed/generateMath.ts > src/seed/questions.math.json
 */

type Difficulty = 'easy' | 'medium' | 'hard';

interface Q {
  category: 'Math';
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
}

/** Deterministic PRNG so regenerating produces the same file. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rng = makeRng(20260821);

const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function build(
  difficulty: Difficulty,
  question: string,
  correct: number | string,
  distractors: (number | string)[],
): Q | null {
  const correctStr = String(correct);
  const unique = [correctStr];

  for (const d of distractors) {
    const s = String(d);
    if (!unique.includes(s)) unique.push(s);
    if (unique.length === 4) break;
  }
  // A question we can't give four distinct plausible options is not a question.
  if (unique.length < 4) return null;

  // Shuffle, then locate the answer.
  const options = [...unique];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    category: 'Math',
    difficulty,
    question,
    options,
    answer: options.indexOf(correctStr),
  };
}

const questions: Q[] = [];
const seen = new Set<string>();

function add(q: Q | null) {
  if (!q) return;
  const key = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen.has(key)) return;
  seen.add(key);
  questions.push(q);
}

// ── Easy: single-operation arithmetic ────────────────────────────────────────
for (let a = 2; a <= 12; a++) {
  for (let b = 2; b <= 12; b++) {
    add(build('easy', `What is ${a} × ${b}?`, a * b, [
      a * b + a,          // one row too far in the times table
      a * b - b,
      a + b,              // wrong operation
      a * b + 1,
      a * (b + 1),
    ]));
  }
}

for (let a = 20; a <= 99; a += 3) {
  const b = 10 + ((a * 7) % 40);
  add(build('easy', `What is ${a} + ${b}?`, a + b, [
    a + b + 10,           // carry mistake
    a + b - 10,
    a - b,
    a + b + 1,
  ]));
  add(build('easy', `What is ${a + b} − ${b}?`, a, [a + 10, a - 10, a + b, a - 1]));
}

for (const [n, d] of [[144, 12], [121, 11], [169, 13], [196, 14], [225, 15], [256, 16], [81, 9], [100, 10], [64, 8], [49, 7]]) {
  add(build('easy', `What is ${n} ÷ ${d}?`, n / d, [d, n / d + 1, n / d - 1, n - d]));
  add(build('medium', `What is the square root of ${n}?`, d, [d + 1, d - 1, n / 4, d * 2]));
}

// ── Medium: percentages, fractions, order of operations ──────────────────────
for (const pct of [5, 10, 12, 15, 20, 25, 30, 40, 60, 75, 80, 90]) {
  for (const base of [40, 80, 120, 200, 250, 300, 500]) {
    const value = (pct / 100) * base;
    if (!Number.isInteger(value)) continue;
    add(build('medium', `What is ${pct}% of ${base}?`, value, [
      value * 2,
      value / 2,
      base - value,        // the complement, a classic slip
      value + 10,
    ]));
  }
}

for (let i = 0; i < 40; i++) {
  const a = 2 + Math.floor(rng() * 9);
  const b = 2 + Math.floor(rng() * 9);
  const c = 2 + Math.floor(rng() * 9);
  add(build('medium', `What is ${a} + ${b} × ${c}?`, a + b * c, [
    (a + b) * c,           // ignoring precedence — the point of the question
    a + b + c,
    a * b + c,
    a + b * c + 1,
  ]));
}

for (let i = 0; i < 30; i++) {
  const price = 20 + Math.floor(rng() * 16) * 5;
  const discount = pick([10, 15, 20, 25, 30, 40, 50]);
  const final = price - (price * discount) / 100;
  if (!Number.isInteger(final)) continue;
  add(build('medium',
    `A $${price} item is discounted by ${discount}%. What is the sale price?`,
    `$${final}`,
    [`$${price - discount}`, `$${(price * discount) / 100}`, `$${final + 5}`, `$${final - 5}`],
  ));
}

// ── Medium: geometry ─────────────────────────────────────────────────────────
for (let s = 3; s <= 20; s++) {
  add(build('medium', `What is the area of a square with sides of ${s} cm?`, `${s * s} cm²`, [
    `${4 * s} cm²`,        // confusing area with perimeter
    `${s * s + s} cm²`,
    `${s * 2} cm²`,
    `${s * s - s} cm²`,
  ]));
  add(build('easy', `What is the perimeter of a square with sides of ${s} cm?`, `${4 * s} cm`, [
    `${s * s} cm`,
    `${2 * s} cm`,
    `${3 * s} cm`,
    `${4 * s + 4} cm`,
  ]));
}

for (const [b, h] of [[6, 4], [8, 5], [10, 7], [12, 9], [14, 6], [20, 11], [9, 8], [15, 12]]) {
  add(build('medium',
    `What is the area of a triangle with a base of ${b} cm and a height of ${h} cm?`,
    `${(b * h) / 2} cm²`,
    [`${b * h} cm²`, `${b + h} cm²`, `${(b * h) / 2 + b} cm²`, `${b * h * 2} cm²`],
  ));
}

// ── Hard: algebra, sequences, compound reasoning ─────────────────────────────
for (let i = 0; i < 40; i++) {
  const m = 2 + Math.floor(rng() * 11);
  const x = 2 + Math.floor(rng() * 20);
  const c = 1 + Math.floor(rng() * 30);
  const result = m * x + c;
  add(build('hard', `If ${m}x + ${c} = ${result}, what is x?`, x, [
    result - c,            // forgot to divide
    Math.round(result / m),
    x + 1,
    x - 1,
  ]));
}

for (let i = 0; i < 25; i++) {
  const start = 1 + Math.floor(rng() * 9);
  const step = 2 + Math.floor(rng() * 8);
  const seq = [start, start + step, start + 2 * step, start + 3 * step];
  const next = start + 4 * step;
  add(build('hard',
    `What comes next in the sequence ${seq.join(', ')}, …?`,
    next,
    [next + step, next - step, next + 1, seq[3] * 2],
  ));
}

for (let i = 0; i < 20; i++) {
  const base = 2 + Math.floor(rng() * 5);
  const exp = 3 + Math.floor(rng() * 4);
  const value = base ** exp;
  add(build('hard', `What is ${base} to the power of ${exp}?`, value, [
    base * exp,            // multiplying instead of exponentiating
    base ** (exp - 1),
    base ** (exp + 1),
    value + base,
  ]));
}

for (const [principal, rate, years] of [[1000, 10, 2], [2000, 5, 3], [500, 20, 2], [1500, 10, 3], [800, 25, 2]]) {
  const simple = principal + (principal * rate * years) / 100;
  add(build('hard',
    `$${principal} earns ${rate}% simple interest per year. What is it worth after ${years} years?`,
    `$${simple}`,
    [`$${principal + (principal * rate) / 100}`, `$${(principal * rate * years) / 100}`, `$${simple + 100}`, `$${principal * years}`],
  ));
}

for (let i = 0; i < 20; i++) {
  const total = 60 + Math.floor(rng() * 8) * 20;
  const ratioA = 1 + Math.floor(rng() * 4);
  const ratioB = ratioA + 1 + Math.floor(rng() * 3);
  const share = (total / (ratioA + ratioB)) * ratioA;
  if (!Number.isInteger(share)) continue;
  add(build('hard',
    `$${total} is split in the ratio ${ratioA}:${ratioB}. What is the smaller share?`,
    `$${share}`,
    [`$${total - share}`, `$${total / 2}`, `$${share + 10}`, `$${total / (ratioA + ratioB)}`],
  ));
}

// ── Output ───────────────────────────────────────────────────────────────────
const byDifficulty = questions.reduce<Record<string, number>>((acc, q) => {
  acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1;
  return acc;
}, {});

process.stderr.write(
  `Generated ${questions.length} math questions: ${JSON.stringify(byDifficulty)}\n`,
);
process.stdout.write(JSON.stringify(questions, null, 2) + '\n');
