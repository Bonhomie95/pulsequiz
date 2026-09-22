import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import QuizQuestion, { fingerprintQuestion } from '../models/QuizQuestion';

dotenv.config();

const VALID_DIFF = ['easy', 'medium', 'hard'] as const;

/** `npm run seed -- --wipe` replaces the bank instead of adding to it. */
const WIPE = process.argv.slice(2).includes('--wipe');

async function run() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('✅ Mongo connected');

  if (WIPE) {
    const { deletedCount } = await QuizQuestion.deleteMany({});
    console.log(`🧹 Removed ${deletedCount} existing questions`);
  }

  const seedDir = __dirname;
  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.startsWith('questions.') && f.endsWith('.json'));

  for (const file of files) {
    const fullPath = path.join(seedDir, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      console.warn(`⚠️ ${file} skipped (not array)`);
      continue;
    }

    const prepared = data.map((q, i) => {
      /* ---------------- NORMALIZE ---------------- */

      const category =
        typeof q.category === 'string'
          ? q.category.trim().toLowerCase()
          : undefined;

      const rawDifficulty =
        typeof q.difficulty === 'string'
          ? q.difficulty.trim().toLowerCase()
          : '';

      const difficulty = VALID_DIFF.includes(rawDifficulty as any)
        ? (rawDifficulty as (typeof VALID_DIFF)[number])
        : 'medium';

      /* ---------------- ANSWER ---------------- */

      const answerIndex =
        typeof q.answer === 'string' ? q.options.indexOf(q.answer) : q.answer;

      if (answerIndex < 0 || answerIndex > 3) {
        throw new Error(`❌ Invalid answer at ${file} [${i}]`);
      }

      const explanation =
        typeof q.explanation === 'string' && q.explanation.trim()
          ? q.explanation.trim()
          : null;

      return {
        category,
        difficulty,
        question: q.question,
        options: q.options,
        answer: answerIndex,
        explanation,
        fingerprint: fingerprintQuestion(q.question),
      };
    });

    // Upsert each question — skip if identical question+category already exists
    let inserted = 0;
    let skipped = 0;

    let updated = 0;
    for (const q of prepared) {
      // Keyed on the fingerprint (same key as the unique index), so a reworded
      // question doesn't duplicate and an added explanation lands on re-run.
      const res = await (QuizQuestion as any).updateOne(
        { category: q.category, fingerprint: q.fingerprint },
        {
          $set: {
            question: q.question,
            options: q.options,
            answer: q.answer,
            difficulty: q.difficulty,
            explanation: q.explanation,
          },
          // Never reset what live play has measured about a question.
          $setOnInsert: { timesServed: 0, timesCorrect: 0, reportCount: 0, disabled: false },
        },
        { upsert: true },
      );
      if (res.upsertedCount > 0) inserted++;
      else if (res.modifiedCount > 0) updated++;
      else skipped++;
    }

    console.log(`📥 ${file}: ${inserted} inserted, ${updated} updated, ${skipped} unchanged`);
  }

  await mongoose.disconnect();
  console.log('🎉 Seeding complete');
}

run().catch((e) => {
  console.error('❌ Seed failed', e);
  process.exit(1);
});
