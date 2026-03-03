import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import QuizQuestion from '../models/QuizQuestion';

dotenv.config();

const VALID_DIFF = ['easy', 'medium', 'hard'] as const;

async function run() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('✅ Mongo connected');

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

      return {
        category,
        difficulty,
        question: q.question,
        options: q.options,
        answer: answerIndex,
      };
    });

    // Upsert each question — skip if identical question+category already exists
    let inserted = 0;
    let skipped = 0;

    for (const q of prepared) {
      const res = await (QuizQuestion as any).updateOne(
        { question: q.question, category: q.category },
        { $setOnInsert: q },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    console.log(`📥 ${file}: ${inserted} inserted, ${skipped} skipped (already exist)`);
  }

  await mongoose.disconnect();
  console.log('🎉 Seeding complete');
}

run().catch((e) => {
  console.error('❌ Seed failed', e);
  process.exit(1);
});
