/**
 * Merge a batch of authored questions into a seed file.
 *
 *   npm run questions:add -- --category geography --file ./batch.json
 *   npm run questions:add -- --category geography --file ./batch.json --dry-run
 *
 * Validates every row, shuffles each question's option order (models reliably
 * put the correct answer first, which players learn fast), drops anything
 * already present, and writes the merged file. Touches no database.
 */
import fs from 'fs';
import path from 'path';

import {
  prepareQuestion,
  parseQuestionCsv,
  type RawQuestion,
} from '../services/questionImportService';
import { fingerprintQuestion } from '../models/QuizQuestion';

/** Seed file per category, keyed by the lowercased category value. */
const SEED_FILES: Record<string, string> = {
  'general knowledge': 'questions.general_knowledge.json',
  history: 'questions.history.json',
  math: 'questions.math.json',
  physics: 'questions.physics.json',
  biology: 'questions.biology.json',
  chemistry: 'questions.chemistry.json',
  geography: 'questions.geography.json',
  'pop culture': 'questions.pop_culture.json',
  sports: 'questions.sports.json',
  technology: 'questions.technology.json',
  'food & cooking': 'questions.food_cooking.json',
};

/** Canonical display value written into the file. */
const DISPLAY: Record<string, string> = {
  'general knowledge': 'General Knowledge',
  history: 'History',
  math: 'Math',
  physics: 'Physics',
  biology: 'Biology',
  chemistry: 'Chemistry',
  geography: 'Geography',
  'pop culture': 'Pop Culture',
  sports: 'Sports',
  technology: 'Technology',
  'food & cooking': 'Food & Cooking',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** Deterministic shuffle so re-running the same batch produces the same file. */
function makeRng(seed: string) {
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

function main() {
  const categoryArg = arg('category');
  const fileArg = arg('file');
  const dryRun = process.argv.includes('--dry-run');

  if (!categoryArg || !fileArg) {
    console.error('Usage: npm run questions:add -- --category <name> --file <path> [--dry-run]');
    console.error('\nCategories:');
    for (const key of Object.keys(SEED_FILES)) console.error(`  ${DISPLAY[key]}`);
    process.exit(1);
  }

  const key = categoryArg.trim().toLowerCase().replace(/_/g, ' ').replace(/ and /g, ' & ');
  const seedFile = SEED_FILES[key];
  if (!seedFile) {
    console.error(`Unknown category "${categoryArg}".`);
    console.error('Valid: ' + Object.values(DISPLAY).join(', '));
    process.exit(1);
  }

  if (!fs.existsSync(fileArg)) {
    console.error(`No such file: ${fileArg}`);
    process.exit(1);
  }

  // ── Read the batch (JSON array, or CSV) ─────────────────────────────────
  const raw = fs.readFileSync(fileArg, 'utf8').trim();
  let rows: RawQuestion[];

  if (raw.startsWith('[')) {
    rows = JSON.parse(raw);
  } else if (/^category\s*,/i.test(raw)) {
    rows = parseQuestionCsv(raw);
  } else {
    console.error(
      'Could not read that file — expected a JSON array or a CSV starting with a "category," header.\n' +
        'If the model wrapped its answer in a code fence, remove the ``` lines.',
    );
    process.exit(1);
  }

  // ── Validate ────────────────────────────────────────────────────────────
  const prepared: { question: string; options: string[]; answer: number; difficulty: string }[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const result = prepareQuestion(row, i + 1, DISPLAY[key]);
    if (!result.ok) {
      errors.push(`  row ${result.error.row}: ${result.error.message}`);
      return;
    }
    if (result.value.category !== key) {
      errors.push(
        `  row ${i + 1}: category is "${result.value.category}", expected "${key}"`,
      );
      return;
    }
    prepared.push(result.value);
  });

  // ── Merge ───────────────────────────────────────────────────────────────
  const seedPath = path.join(__dirname, '..', 'seed', seedFile);
  const existing: any[] = fs.existsSync(seedPath)
    ? JSON.parse(fs.readFileSync(seedPath, 'utf8'))
    : [];

  const seen = new Set(existing.map((q) => fingerprintQuestion(q.question)));
  const merged = [...existing];
  let added = 0;
  let duplicates = 0;

  for (const q of prepared) {
    const fp = fingerprintQuestion(q.question);
    if (seen.has(fp)) {
      duplicates += 1;
      continue;
    }
    seen.add(fp);

    // Shuffle so the answer isn't wherever the model happened to put it.
    const rng = makeRng(fp);
    const correctText = q.options[q.answer];
    const options = [...q.options];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    merged.push({
      category: DISPLAY[key],
      difficulty: q.difficulty,
      question: q.question,
      options,
      answer: options.indexOf(correctText),
    });
    added += 1;
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`\n${DISPLAY[key]}  (${seedFile})\n`);
  console.log(`  read      ${rows.length}`);
  console.log(`  added     ${added}`);
  console.log(`  duplicate ${duplicates}`);
  console.log(`  rejected  ${errors.length}`);

  if (errors.length) {
    console.log('\nRejected rows:');
    errors.slice(0, 25).forEach((e) => console.log(e));
    if (errors.length > 25) console.log(`  …and ${errors.length - 25} more`);
  }

  const counts = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  const positions = [0, 0, 0, 0];
  for (const q of merged) {
    counts[q.difficulty] = (counts[q.difficulty] ?? 0) + 1;
    positions[q.answer] += 1;
  }
  const quizzes = Math.min(
    Math.floor(counts.easy / 4),
    Math.floor(counts.medium / 4),
    Math.floor(counts.hard / 2),
  );

  console.log(
    `\n  total ${merged.length}  (easy ${counts.easy} / medium ${counts.medium} / hard ${counts.hard})`,
  );
  console.log(`  answer positions  A ${positions[0]}  B ${positions[1]}  C ${positions[2]}  D ${positions[3]}`);
  console.log(`  distinct quizzes before repeats: ${quizzes}`);

  const limiter =
    quizzes === Math.floor(counts.hard / 2)
      ? 'hard'
      : quizzes === Math.floor(counts.easy / 4)
        ? 'easy'
        : 'medium';
  if (quizzes < 50) {
    console.log(`  ⚠  limited by ${limiter} questions — add more of those first`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.\n');
    return;
  }

  if (added === 0) {
    console.log('\nNothing new to write.\n');
    return;
  }

  fs.writeFileSync(seedPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${seedPath}`);
  console.log('Run `npm run seed` to load it into the database.\n');
}

main();
