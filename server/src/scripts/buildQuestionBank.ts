/**
 * Build the question bank.
 *
 *   npm run bank:build              # all categories
 *   npm run bank:build -- --only Geography
 *   npm run bank:build -- --count 300
 *
 * Writes to server/question-bank/ (gitignored), one file per category, in the
 * same shape the importer and `npm run seed` already accept.
 *
 * The 80/80/40 split is not arbitrary. The engine deals 4 easy / 4 medium /
 * 2 hard per quiz, so capacity is min(easy/4, medium/4, hard/2). For 200
 * questions that split yields 20 distinct quizzes — an even 4/4/4 split would
 * yield only 16, because the extra hard questions have nothing to pair with.
 */
import fs from 'fs';
import path from 'path';

import { makeRng, selectBalanced, curated, type Question, type Difficulty, type Curated } from '../questionbank/types';
import { geographyQuestions, chemistryQuestions, physicsQuestions } from '../questionbank/derived';
import { mathQuestions } from '../questionbank/math';
import {
  biologyDerived, technologyDerived, historyDerived,
  sportsDerived, foodDerived, popCultureDerived, generalDerived,
} from '../questionbank/derived2';
import { CURATED } from '../questionbank/curated';

const OUT_DIR = path.join(__dirname, '..', '..', 'question-bank');

const FILE_FOR: Record<string, string> = {
  'General Knowledge': 'questions.general_knowledge.json',
  History: 'questions.history.json',
  Math: 'questions.math.json',
  Physics: 'questions.physics.json',
  Biology: 'questions.biology.json',
  Chemistry: 'questions.chemistry.json',
  Geography: 'questions.geography.json',
  'Pop Culture': 'questions.pop_culture.json',
  Sports: 'questions.sports.json',
  Technology: 'questions.technology.json',
  'Food & Cooking': 'questions.food_cooking.json',
};

type Generator = (rng: () => number) => Question[];

const GENERATORS: Record<string, Generator[]> = {
  Geography: [geographyQuestions],
  Chemistry: [chemistryQuestions],
  Physics: [physicsQuestions],
  Math: [mathQuestions],
  Biology: [biologyDerived],
  Technology: [technologyDerived],
  History: [historyDerived],
  Sports: [sportsDerived],
  'Food & Cooking': [foodDerived],
  'Pop Culture': [popCultureDerived],
  'General Knowledge': [generalDerived],
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function main() {
  const only = arg('only');
  const total = Number(arg('count') ?? 200);

  // Ratio derived from what the engine actually consumes.
  const targets: Record<Difficulty, number> = {
    easy: Math.round(total * 0.4),
    medium: Math.round(total * 0.4),
    hard: Math.round(total * 0.2),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nBuilding ${total} questions per category  (${targets.easy} easy / ${targets.medium} medium / ${targets.hard} hard)\n`);
  console.log('CATEGORY'.padEnd(22) + 'BUILT  DERIVED  CURATED  QUIZZES  SHORTFALL');
  console.log('─'.repeat(72));

  let grandTotal = 0;
  const shortfalls: string[] = [];
  // Shared across categories so no question is written to two files.
  const claimed = new Set<string>();

  for (const [category, generators] of Object.entries(GENERATORS)) {
    if (only && category.toLowerCase() !== only.toLowerCase()) continue;

    // Seeded per category so a rebuild is byte-identical.
    const rng = makeRng(`pulsequiz:${category}`);

    const pool: Question[] = [];
    for (const gen of generators) pool.push(...gen(rng));
    pool.push(...curated(category, (CURATED[category] ?? []) as Curated[], rng));

    const { questions, shortfall } = selectBalanced(pool, targets, rng, claimed);

    const derivedCount = questions.filter((q) => q._origin === 'derived').length;
    const curatedCount = questions.length - derivedCount;

    const counts = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
    questions.forEach((q) => (counts[q.difficulty] += 1));
    const quizzes = Math.min(
      Math.floor(counts.easy / 4),
      Math.floor(counts.medium / 4),
      Math.floor(counts.hard / 2),
    );

    const missing = shortfall.easy + shortfall.medium + shortfall.hard;
    if (missing > 0) {
      shortfalls.push(
        `${category}: short ${shortfall.easy} easy, ${shortfall.medium} medium, ${shortfall.hard} hard`,
      );
    }

    // Strip provenance before writing — the importer has no use for it.
    const output = questions.map(({ _origin, ...q }) => q);
    fs.writeFileSync(
      path.join(OUT_DIR, FILE_FOR[category]),
      JSON.stringify(output, null, 2) + '\n',
    );

    grandTotal += output.length;

    console.log(
      category.padEnd(22) +
        String(output.length).padStart(5) +
        String(derivedCount).padStart(9) +
        String(curatedCount).padStart(9) +
        String(quizzes).padStart(9) +
        (missing ? String(missing).padStart(11) : ''.padStart(11)),
    );
  }

  console.log('─'.repeat(72));
  console.log(`${grandTotal} questions written to question-bank/`);

  if (shortfalls.length) {
    console.log('\nShortfalls — the generator ran out of distinct questions:');
    shortfalls.forEach((s) => console.log('  ' + s));
    console.log('\nAdd rows to the reference tables in src/questionbank/data*.ts,');
    console.log('or curated questions in src/questionbank/curated.ts, then rebuild.');
  }

  console.log('\nNext:  npm run bank:verify   then   npm run bank:seed\n');
}

main();
