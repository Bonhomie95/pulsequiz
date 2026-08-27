# Authoring questions

Two things to get right: the **prompt** that produces them, and the **check**
that they're safe to import. The importer already refuses malformed rows, but it
cannot tell you an answer is factually wrong — that is what review is for.

---

## The prompt

Paste this into any capable LLM. Replace the two bracketed values and run it
once per category. Ask for 60–80 at a time; larger batches drift in quality and
repeat themselves.

````
You are writing multiple-choice trivia questions for a competitive quiz game
where players win real money from a leaderboard. A wrong answer key costs a
player their entire run, so factual accuracy matters more than volume.

CATEGORY: [Geography]
COUNT: [60]  — split 24 easy / 24 medium / 12 hard

Rules:

1. FACTUAL SAFETY
   - Only facts that are settled and stable. No "current" anything: no sitting
     office-holders, no reigning champions, no populations, no "largest/newest"
     that changes, no records that can be broken.
   - If a fact is disputed between reputable sources, skip it.
   - Prefer: capitals, chemical symbols, definitions, dated historical events,
     mathematical results, physical constants, published works, rules of a sport.

2. EXACTLY ONE DEFENSIBLE ANSWER
   - No "which of these is NOT…" unless the other three are unambiguously true.
   - No superlatives that depend on measurement method ("longest river").
   - No questions answerable by elimination alone.

3. THE THREE WRONG OPTIONS MUST BE PLAUSIBLE
   - Same category, same type, similar length and shape as the answer.
   - For numbers: near misses and the result of a likely mistake, not random.
   - Never make the correct answer the longest or most specific option — that
     is the single most common tell in generated quiz questions.
   - All four options must be distinct, and none may be a synonym of another.

4. DIFFICULTY MEANS AUDIENCE, NOT OBSCURITY
   - easy   — most adults know it without thinking.
   - medium — a well-read adult knows it, or can reason to it.
   - hard   — a specialist or enthusiast knows it. NOT trivia so obscure that
              nobody could reasonably know it; that is just a coin flip.

5. WRITING
   - Question under 120 characters, options under 60. Both are hard limits.
   - Plain, direct phrasing. No "Which of the following…".
   - British or American spelling is fine, but be consistent within a batch.
   - No emoji, no markdown, no trailing whitespace.

6. NO REPEATS
   - No two questions may test the same fact, even phrased differently.

OUTPUT
Return ONLY a JSON array, no prose before or after, no code fence.
Each object: category, difficulty, question, options (exactly 4), answer.
`answer` is the 0-based INDEX into `options`.
Put the correct answer at a DIFFERENT index across the batch — roughly a
quarter at each of 0, 1, 2, 3. Do not put it at index 0 every time.

[
  {
    "category": "Geography",
    "difficulty": "easy",
    "question": "What is the capital of Japan?",
    "options": ["Osaka", "Tokyo", "Kyoto", "Seoul"],
    "answer": 1
  }
]

Before you output, re-read every question and delete any where you are not
certain the marked answer is correct. A shorter, correct batch is worth more
than a longer one with a mistake in it.
````

### The category value must match exactly

Use one of these strings verbatim in the `category` field — the app sends these
and the server lowercases them to match:

| Use exactly | Seed file |
|---|---|
| `General Knowledge` | `questions.general_knowledge.json` |
| `History` | `questions.history.json` |
| `Math` | `questions.math.json` |
| `Physics` | `questions.physics.json` |
| `Biology` | `questions.biology.json` |
| `Chemistry` | `questions.chemistry.json` |
| `Geography` | `questions.geography.json` |
| `Pop Culture` | `questions.pop_culture.json` |
| `Sports` | `questions.sports.json` |
| `Technology` | `questions.technology.json` |
| `Food & Cooking` | `questions.food_cooking.json` |

Anything else creates a category no screen in the app can reach.

---

## Getting them into the database

### The quick path — merge into a seed file, then seed

Save the model's output to a file, then:

```bash
cd server
npm run questions:add -- --category geography --file ~/Downloads/geo-batch.json
```

That validates every row, rejects the bad ones with a line number, shuffles the
option order (so the answer isn't always where the model put it), drops anything
already present, merges into the right seed file, and prints a coverage report.
It does **not** touch the database.

Then load the seed files:

```bash
npm run seed
```

`seed` is idempotent — re-running it inserts only what's new, so it is safe to
run as often as you like.

### Checking before you commit

```bash
npm run questions:check
```

Validates every seed file: option counts, duplicate options, answer indexes in
range, cross-file duplicates, answer-position balance, and how many distinct
quizzes each category can serve before it starts repeating.

### The live path — import into a running database

For adding questions without a redeploy, the admin API takes the same JSON.
Always dry-run first; it reports every bad row by number and writes nothing:

```bash
# 1. See what would happen
curl -X POST https://<host>/api/admin/questions/import \
  -H 'Content-Type: application/json' \
  -b admin_token=<your-cookie> \
  -d '{"dryRun": true, "questions": '"$(cat batch.json)"'}'

# 2. Then import for real
curl -X POST https://<host>/api/admin/questions/import \
  -H 'Content-Type: application/json' \
  -b admin_token=<your-cookie> \
  -d '{"questions": '"$(cat batch.json)"'}'
```

CSV works too — send `{"csv": "<file contents>"}` with the header
`category,difficulty,question,option1,option2,option3,option4,answer`.
`GET /api/admin/questions/template.csv` returns a filled-in example.

### Seeing where you stand

```bash
curl https://<host>/api/admin/questions/coverage -b admin_token=<your-cookie>
```

Reports per category: counts by difficulty, how many distinct quizzes it can
serve before repeating, and whether it is above the healthy threshold.

---

## How much is enough

One quiz consumes 4 easy, 4 medium and 2 hard. So a category's real capacity is:

```
min(easy / 4, medium / 4, hard / 2)   distinct quizzes before it recycles
```

- **Below 6** — a daily player sees repeats within a week. This is where most
  categories sit today.
- **50** — a daily player goes about two months without a repeat.
- **125** (500 questions, split 200/200/100) — the target for a game whose whole
  retention loop is "come back tomorrow".

The bottleneck is almost always **hard** questions, because each quiz eats two
of them and they are the ones that take real effort to write. Generate hard
questions at twice the rate you think you need.

---

## The generated bank (2,200 questions)

`server/question-bank/` holds 200 questions per category — 80 easy / 80 medium /
40 hard, which is exactly 20 full rounds (4 easy + 4 medium + 2 hard each).

It is **gitignored**. It is regenerated deterministically from source, so the
source is what's backed up, not the JSON:

```bash
cd server
npm run bank:build     # regenerate question-bank/ from src/questionbank/
npm run bank:verify    # structural + semantic checks; exits non-zero on failure
npm run bank:seed      # load into MONGO_URI
```

Source layout, under `server/src/questionbank/`:

| File | Contents |
| --- | --- |
| `types.ts` | `build()`, `selectBalanced()`, `balanceAnswerPositions()`, seeded RNG |
| `data.ts` … `data8.ts` | reference tables (countries, elements, facts) |
| `dataGK.ts` | General Knowledge's own material |
| `derived.ts`, `derived2.ts` | table → question generators |
| `math.ts` | arithmetic generators |
| `curated.ts` | hand-written questions |

Builds are seeded per category, so the same source always produces the same
bank. Categories are deduplicated against each other — a question lands in
exactly one file, first come first served, with General Knowledge last.

### What `bank:verify` actually checks

Structural: four distinct options (case-insensitive), answer index in range,
exact 80/80/40 difficulty mix, no duplicate questions within a category, length
limits, and answer-position spread (all eleven files currently sit at a perfect
50/50/50/50, so the correct answer's slot carries no signal).

Semantic: every Math answer is **re-derived from the question text** by a second
implementation in `verifyQuestionBank.ts` that shares no code with the
generator, and each distractor is checked against that value so no question has
two correct options. A math question matching no verification rule is a hard
failure rather than a silent pass.

### Seeding

`bank:seed` upserts on `{ category, fingerprint }` — the same unique index the
model declares — so re-running updates wording in place instead of duplicating.
Live calibration counters (`timesServed`, `timesCorrect`, `reportCount`) are
written with `$setOnInsert`, so reseeding never discards what real play has
measured about a question's difficulty.

```bash
npm run bank:seed -- --dry-run              # report changes, write nothing
npm run bank:seed -- --only "Pop Culture"   # one category
npm run bank:seed -- --wipe                 # destructive: clear first
```

Categories are stored lowercase, because `quizController` lowercases before
querying. The eleven files match the eleven `id` values in
`mobile/app/quiz/categories.tsx` exactly.
