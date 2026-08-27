/**
 * Math generation.
 *
 * The only category where every answer is computed rather than recalled, so
 * the whole set is verifiable by construction — `verify.ts` re-derives each
 * one from the question text and checks it against the key.
 */
import { type Question, type Difficulty, shuffle } from './types';

interface Spec {
  difficulty: Difficulty;
  question: string;
  correct: number | string;
  wrong: (number | string)[];
}

export function mathQuestions(rng: () => number): Question[] {
  const specs: Spec[] = [];
  const rint = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

  // ── Easy: one operation ───────────────────────────────────────────────────
  for (let a = 2; a <= 12; a++) {
    for (let b = 2; b <= 12; b++) {
      specs.push({
        difficulty: 'easy',
        question: `What is ${a} × ${b}?`,
        correct: a * b,
        wrong: [a * b + a, a * b - b, a + b, a * (b + 1), a * b + 1],
      });
    }
  }

  for (let i = 0; i < 40; i++) {
    const a = rint(23, 99);
    const b = rint(11, 89);
    specs.push({
      difficulty: 'easy',
      question: `What is ${a} + ${b}?`,
      correct: a + b,
      wrong: [a + b + 10, a + b - 10, a + b + 1, Math.abs(a - b)],
    });
    specs.push({
      difficulty: 'easy',
      question: `What is ${a + b} − ${b}?`,
      correct: a,
      wrong: [a + 10, a - 10, a + b, a - 1],
    });
  }

  for (const [n, d] of [[144, 12], [121, 11], [169, 13], [196, 14], [225, 15], [256, 16], [81, 9], [100, 10], [64, 8], [49, 7], [36, 6], [132, 11], [156, 12], [180, 15]]) {
    specs.push({
      difficulty: 'easy',
      question: `What is ${n} ÷ ${d}?`,
      correct: n / d,
      wrong: [d, n / d + 1, n / d - 1, n - d],
    });
  }

  for (let s = 3; s <= 25; s++) {
    specs.push({
      difficulty: 'easy',
      question: `What is the perimeter of a square with sides of ${s} cm?`,
      correct: `${4 * s} cm`,
      wrong: [`${s * s} cm`, `${2 * s} cm`, `${3 * s} cm`, `${4 * s + 4} cm`],
    });
  }

  for (let n = 2; n <= 20; n++) {
    specs.push({
      difficulty: 'easy',
      question: `What is ${n} squared?`,
      correct: n * n,
      wrong: [n * 2, n * n + n, n * n - n, (n + 1) * (n + 1)],
    });
  }

  // ── Medium: percentages, precedence, geometry ────────────────────────────
  for (const pct of [5, 10, 12, 15, 20, 25, 30, 40, 60, 75, 80, 90]) {
    for (const base of [40, 80, 120, 200, 250, 300, 500, 600]) {
      const value = (pct / 100) * base;
      if (!Number.isInteger(value)) continue;
      specs.push({
        difficulty: 'medium',
        question: `What is ${pct}% of ${base}?`,
        correct: value,
        wrong: [value * 2, value / 2, base - value, value + 10],
      });
    }
  }

  for (let i = 0; i < 50; i++) {
    const a = rint(2, 10);
    const b = rint(2, 10);
    const c = rint(2, 10);
    specs.push({
      difficulty: 'medium',
      question: `What is ${a} + ${b} × ${c}?`,
      correct: a + b * c,
      wrong: [(a + b) * c, a + b + c, a * b + c, a + b * c + 1],
    });
  }

  for (let s = 3; s <= 22; s++) {
    specs.push({
      difficulty: 'medium',
      question: `What is the area of a square with sides of ${s} cm?`,
      correct: `${s * s} cm²`,
      wrong: [`${4 * s} cm²`, `${s * s + s} cm²`, `${s * 2} cm²`, `${s * s - s} cm²`],
    });
  }

  for (const [b, h] of [[6, 4], [8, 5], [10, 7], [12, 9], [14, 6], [20, 11], [9, 8], [15, 12], [18, 7], [24, 5]]) {
    specs.push({
      difficulty: 'medium',
      question: `A triangle has base ${b} cm and height ${h} cm. What is its area?`,
      correct: `${(b * h) / 2} cm²`,
      wrong: [`${b * h} cm²`, `${b + h} cm²`, `${(b * h) / 2 + b} cm²`, `${b * h * 2} cm²`],
    });
  }

  for (let i = 0; i < 30; i++) {
    const price = 20 + rint(0, 15) * 5;
    const discount = [10, 15, 20, 25, 30, 40, 50][rint(0, 6)];
    const final = price - (price * discount) / 100;
    if (!Number.isInteger(final)) continue;
    specs.push({
      difficulty: 'medium',
      question: `A $${price} item is discounted by ${discount}%. What is the sale price?`,
      correct: `$${final}`,
      wrong: [`$${price - discount}`, `$${(price * discount) / 100}`, `$${final + 5}`, `$${final - 5}`],
    });
  }

  for (const [n, d] of [[144, 12], [225, 15], [400, 20], [625, 25], [900, 30], [169, 13], [289, 17], [361, 19]]) {
    specs.push({
      difficulty: 'medium',
      question: `What is the square root of ${n}?`,
      correct: d,
      wrong: [d + 1, d - 1, n / 4, d * 2],
    });
  }

  // ── Hard: algebra, sequences, powers, rates ──────────────────────────────
  for (let i = 0; i < 45; i++) {
    const m = rint(2, 12);
    const x = rint(2, 20);
    const c = rint(1, 30);
    specs.push({
      difficulty: 'hard',
      question: `If ${m}x + ${c} = ${m * x + c}, what is x?`,
      correct: x,
      wrong: [m * x, Math.round((m * x + c) / m), x + 1, x - 1],
    });
  }

  for (let i = 0; i < 30; i++) {
    const start = rint(1, 9);
    const step = rint(2, 9);
    const seq = [start, start + step, start + 2 * step, start + 3 * step];
    const next = start + 4 * step;
    specs.push({
      difficulty: 'hard',
      question: `What comes next: ${seq.join(', ')}, …?`,
      correct: next,
      wrong: [next + step, next - step, next + 1, seq[3] * 2],
    });
  }

  for (const base of [2, 3, 4, 5, 6]) {
    for (const exp of [3, 4, 5]) {
      const value = base ** exp;
      if (value > 100000) continue;
      specs.push({
        difficulty: 'hard',
        question: `What is ${base} to the power of ${exp}?`,
        correct: value,
        wrong: [base * exp, base ** (exp - 1), base ** (exp + 1), value + base],
      });
    }
  }

  for (const [principal, rate, years] of [[1000, 10, 2], [2000, 5, 3], [500, 20, 2], [1500, 10, 3], [800, 25, 2], [1200, 15, 2], [2500, 8, 2]]) {
    const simple = principal + (principal * rate * years) / 100;
    specs.push({
      difficulty: 'hard',
      question: `$${principal} earns ${rate}% simple interest yearly. Value after ${years} years?`,
      correct: `$${simple}`,
      wrong: [`$${principal + (principal * rate) / 100}`, `$${(principal * rate * years) / 100}`, `$${simple + 100}`, `$${principal * years}`],
    });
  }

  for (let i = 0; i < 25; i++) {
    const total = 60 + rint(0, 8) * 20;
    const rA = rint(1, 4);
    const rB = rA + rint(1, 3);
    const share = (total / (rA + rB)) * rA;
    if (!Number.isInteger(share)) continue;
    specs.push({
      difficulty: 'hard',
      question: `$${total} is split in the ratio ${rA}:${rB}. What is the smaller share?`,
      correct: `$${share}`,
      wrong: [`$${total - share}`, `$${total / 2}`, `$${share + 10}`, `$${total / (rA + rB)}`],
    });
  }

  for (const [dist, time] of [[120, 2], [150, 3], [240, 4], [90, 1.5], [300, 5], [180, 3], [200, 4]]) {
    specs.push({
      difficulty: 'hard',
      question: `A car travels ${dist} km in ${time} hours. What is its average speed?`,
      correct: `${dist / time} km/h`,
      wrong: [`${dist * time} km/h`, `${dist / time + 10} km/h`, `${dist - time} km/h`, `${dist / (time * 2)} km/h`],
    });
  }

  // ── Assemble ─────────────────────────────────────────────────────────────
  const out: Question[] = [];
  for (const spec of specs) {
    const correct = String(spec.correct);
    const seen = new Set([correct]);
    const wrong: string[] = [];

    for (const w of spec.wrong) {
      const text = String(w);
      if (seen.has(text)) continue;
      seen.add(text);
      wrong.push(text);
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) continue;

    const options = shuffle([correct, ...wrong], rng);
    out.push({
      category: 'Math',
      difficulty: spec.difficulty,
      question: spec.question,
      options,
      answer: options.indexOf(correct),
      _origin: 'derived',
    });
  }

  return out;
}
