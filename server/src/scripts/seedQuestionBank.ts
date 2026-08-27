/**
 * Loads question-bank/*.json into MongoDB.
 *
 * Idempotent: keyed on the same { category, fingerprint } as the unique index,
 * so re-running updates wording in place rather than duplicating. Live
 * calibration counters (timesServed / timesCorrect / reportCount) are set only
 * on insert — reseeding must not wipe what real play has taught us about a
 * question's difficulty.
 *
 * Flags:
 *   --wipe            delete every existing question first (destructive)
 *   --only <Category> seed one category
 *   --dry-run         report what would change, write nothing
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import QuizQuestion, { fingerprintQuestion } from '../models/QuizQuestion';

dotenv.config();

const BANK = path.resolve(__dirname, '../../question-bank');

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const WIPE = flag('wipe');
const DRY = flag('dry-run');
const ONLY = value('only');

interface Q {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  answer: number;
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set. Add it to server/.env — see .env.example.');
    process.exit(1);
  }
  if (!fs.existsSync(BANK)) {
    console.error('No question-bank/ directory. Run:  npm run bank:build');
    process.exit(1);
  }

  const files = fs
    .readdirSync(BANK)
    .filter((f) => f.startsWith('questions.') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    console.error('question-bank/ is empty. Run:  npm run bank:build');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const host = mongoose.connection.host;
  const db = mongoose.connection.name;
  console.log(`Connected to ${host}/${db}${DRY ? '  (dry run — nothing will be written)' : ''}\n`);

  if (WIPE) {
    if (DRY) {
      const n = await QuizQuestion.estimatedDocumentCount();
      console.log(`--wipe would delete ${n} existing questions.\n`);
    } else {
      const { deletedCount } = await QuizQuestion.deleteMany({});
      console.log(`--wipe: deleted ${deletedCount} existing questions.\n`);
    }
  }

  console.log('CATEGORY              READ  INSERTED  UPDATED  UNCHANGED');
  console.log('─'.repeat(58));

  let totals = { read: 0, inserted: 0, updated: 0, unchanged: 0 };

  for (const file of files) {
    const data: Q[] = JSON.parse(fs.readFileSync(path.join(BANK, file), 'utf-8'));
    if (data.length === 0) continue;

    // The API lowercases the category before querying (quizController), so the
    // stored value must be lowercase or nothing is ever found.
    const category = data[0].category.trim().toLowerCase();
    if (ONLY && category !== ONLY.trim().toLowerCase()) continue;

    const ops = data.map((q) => ({
      updateOne: {
        filter: { category, fingerprint: fingerprintQuestion(q.question) },
        update: {
          $set: {
            category,
            question: q.question,
            options: q.options,
            answer: q.answer,
            difficulty: q.difficulty,
            fingerprint: fingerprintQuestion(q.question),
          },
          // Never reset what live play has measured.
          $setOnInsert: {
            timesServed: 0,
            timesCorrect: 0,
            reportCount: 0,
            disabled: false,
          },
        },
        upsert: true,
      },
    }));

    let inserted = 0;
    let updated = 0;
    if (DRY) {
      const existing = await QuizQuestion.countDocuments({
        category,
        fingerprint: { $in: data.map((q) => fingerprintQuestion(q.question)) },
      });
      inserted = data.length - existing;
      updated = existing;
    } else {
      // ordered:false so one bad row cannot abort the rest of the category.
      const res = await QuizQuestion.bulkWrite(ops, { ordered: false });
      inserted = res.upsertedCount ?? 0;
      updated = res.modifiedCount ?? 0;
    }
    const unchanged = data.length - inserted - updated;

    totals.read += data.length;
    totals.inserted += inserted;
    totals.updated += updated;
    totals.unchanged += unchanged;

    console.log(
      category.padEnd(20) +
        String(data.length).padStart(6) +
        String(inserted).padStart(10) +
        String(updated).padStart(9) +
        String(unchanged).padStart(11),
    );
  }

  console.log('─'.repeat(58));
  console.log(
    'TOTAL'.padEnd(20) +
      String(totals.read).padStart(6) +
      String(totals.inserted).padStart(10) +
      String(totals.updated).padStart(9) +
      String(totals.unchanged).padStart(11),
  );

  if (!DRY) {
    // What the game will actually see, read back from the database rather than
    // inferred from what we just sent.
    const live = await QuizQuestion.aggregate([
      { $match: { disabled: false } },
      { $group: { _id: { c: '$category', d: '$difficulty' }, n: { $sum: 1 } } },
    ]);
    const byCategory = new Map<string, Record<string, number>>();
    for (const row of live) {
      const c = row._id.c ?? '(none)';
      if (!byCategory.has(c)) byCategory.set(c, { easy: 0, medium: 0, hard: 0 });
      byCategory.get(c)![row._id.d] = row.n;
    }

    console.log('\nPlayable in the database now:\n');
    console.log('CATEGORY              EASY  MEDIUM  HARD   QUIZZES');
    console.log('─'.repeat(52));
    const problems: string[] = [];
    for (const [c, d] of [...byCategory].sort()) {
      // A round is 4 easy + 4 medium + 2 hard.
      const quizzes = Math.min(
        Math.floor(d.easy / 4),
        Math.floor(d.medium / 4),
        Math.floor(d.hard / 2),
      );
      console.log(
        c.padEnd(20) +
          String(d.easy).padStart(6) +
          String(d.medium).padStart(8) +
          String(d.hard).padStart(6) +
          String(quizzes).padStart(10),
      );
      if (quizzes === 0) problems.push(c);
    }
    console.log('─'.repeat(52));
    if (problems.length) {
      console.log(`\n⚠  Not enough questions to build a round in: ${problems.join(', ')}`);
    } else {
      console.log('\nEvery category can build a full round. Ready to play.');
    }
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('\nSeed failed:', e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
