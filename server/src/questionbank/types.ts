/**
 * Question bank generation.
 *
 * Two kinds of question live here:
 *
 *   - DERIVED — built from a reference table in `data.ts`. The answer is read
 *     from the table rather than recalled, so correctness reduces to "is the
 *     table right", which is a small, reviewable surface.
 *   - CURATED — written by hand. These carry the usual risk of any authored
 *     trivia and want a human accuracy pass before real-money play.
 *
 * Everything is emitted through `build()`, which enforces the shape the
 * importer expects, shuffles option order, and balances answer positions.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  category: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
  /** Provenance, stripped before export. */
  _origin?: 'derived' | 'curated';
}

/** A curated question, written answer-first for legibility. */
export type Curated = [Difficulty, string, string[], number];

/** Deterministic PRNG — regenerating the bank produces the same file. */
export function makeRng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x100000000;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: T[], n: number, rng: () => number): T[] {
  return shuffle(arr, rng).slice(0, n);
}

export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Assemble a question from a correct answer and a pool of wrong candidates.
 *
 * Returns null when three distinct, plausible distractors cannot be found —
 * a question you cannot give four real options is not a question.
 */
export function build(
  category: string,
  difficulty: Difficulty,
  question: string,
  correct: string,
  distractorPool: string[],
  rng: () => number,
  origin: 'derived' | 'curated' = 'derived',
): Question | null {
  const correctText = String(correct).trim();
  if (!correctText) return null;

  const seen = new Set([correctText.toLowerCase()]);
  const wrong: string[] = [];

  for (const candidate of shuffle(distractorPool, rng)) {
    const text = String(candidate).trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    wrong.push(text);
    if (wrong.length === 3) break;
  }

  if (wrong.length < 3) return null;
  if (question.length > 120 || [correctText, ...wrong].some((o) => o.length > 60)) return null;

  const options = shuffle([correctText, ...wrong], rng);
  return {
    category,
    difficulty,
    question,
    options,
    answer: options.indexOf(correctText),
    _origin: origin,
  };
}

/** Turn a hand-written [difficulty, question, options, answer] into a Question. */
export function curated(category: string, rows: Curated[], rng: () => number): Question[] {
  const out: Question[] = [];
  for (const [difficulty, question, options, answer] of rows) {
    if (options.length !== 4) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    if (answer < 0 || answer > 3) continue;
    if (question.length > 120 || options.some((o) => o.length > 60)) continue;

    const correctText = options[answer];
    const shuffled = shuffle(options, rng);
    out.push({
      category,
      difficulty,
      question,
      options: shuffled,
      answer: shuffled.indexOf(correctText),
      _origin: 'curated',
    });
  }
  return out;
}

/**
 * Take exactly the target counts per difficulty, dropping duplicates.
 * Reports a shortfall rather than silently producing an unbalanced file.
 */
/**
 * @param claimed Fingerprints already used by an earlier category. Categories
 *   overlap by nature — "what temperature does water boil at" is fair game for
 *   both Chemistry and Food — but a player who sees the same question twice in
 *   one session reads it as a bug. The caller passes one shared set so each
 *   question lands in exactly one category, first come first served.
 */
export function selectBalanced(
  pool: Question[],
  targets: Record<Difficulty, number>,
  rng: () => number,
  claimed?: Set<string>,
): { questions: Question[]; shortfall: Record<Difficulty, number> } {
  const seen = new Set<string>();
  const byDifficulty: Record<Difficulty, Question[]> = { easy: [], medium: [], hard: [] };

  for (const q of shuffle(pool, rng)) {
    const key = normalise(q.question);
    if (seen.has(key) || claimed?.has(key)) continue;
    seen.add(key);
    byDifficulty[q.difficulty].push(q);
  }

  const questions: Question[] = [];
  const shortfall: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };

  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const take = byDifficulty[d].slice(0, targets[d]);
    // Only questions actually kept are claimed; the rest stay available.
    take.forEach((q) => claimed?.add(normalise(q.question)));
    questions.push(...take);
    shortfall[d] = Math.max(0, targets[d] - take.length);
  }

  return { questions: balanceAnswerPositions(questions, rng), shortfall };
}

/**
 * Even out where the correct answer sits.
 *
 * Left alone, a generated set clusters — and players notice a slot that is
 * right 40% of the time long before they notice anything else about the quiz.
 */
function balanceAnswerPositions(questions: Question[], rng: () => number): Question[] {
  const target = Math.ceil(questions.length / 4);
  const counts = [0, 0, 0, 0];

  return shuffle(questions, rng).map((q) => {
    const correctText = q.options[q.answer];

    // Prefer the least-used slot that still has room.
    let slot = counts.indexOf(Math.min(...counts));
    if (counts[slot] >= target) slot = q.answer;

    const rest = q.options.filter((_, i) => i !== q.answer);
    const options: string[] = [];
    let r = 0;
    for (let i = 0; i < 4; i++) options.push(i === slot ? correctText : rest[r++]);

    counts[slot] += 1;
    return { ...q, options, answer: slot };
  });
}
