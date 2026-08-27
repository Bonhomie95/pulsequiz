/**
 * Generators for the remaining categories, over the tables in data2.ts.
 */
import { build, pick, type Question, type Difficulty } from './types';
import * as D from './data2';
import * as D3 from './data3';
import * as D4 from './data4';
import * as D5 from './data5';
import * as D6 from './data6';
import * as D7 from './data7';
import * as D8 from './data8';
import { GK } from './dataGK';

const D2 = D;

/** Turn a flat fact table into questions. */
function fromFacts(
  category: string,
  facts: { q: string; a: string; pool: string[]; d: 'easy' | 'medium' | 'hard' }[],
  rng: () => number,
): Question[] {
  return facts
    .map((f) => build(category, f.d, f.q, f.a, f.pool, rng, 'curated'))
    .filter(Boolean) as Question[];
}

// ── Biology ─────────────────────────────────────────────────────────────────
export function biologyDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('Biology', D3.BIOLOGY_FACTS, rng),
    ...fromFacts('Biology', D6.BIO_FACTS2, rng),
  ];
  const organNames = D2.ORGANS.map((o) => o.organ);
  const organJobs = D2.ORGANS.map((o) => o.job);
  const systems = [...new Set(D2.ORGANS.map((o) => o.system))];

  for (const o of D2.ORGANS) {
    out.push(build('Biology', 'easy', `Which organ is responsible for ${o.job}?`,
      capitalise(o.organ), organNames.filter((n) => n !== o.organ).map(capitalise), rng));
    out.push(build('Biology', 'medium', `What is the main job of the ${o.organ}?`,
      capitalise(o.job), organJobs.filter((j) => j !== o.job).map(capitalise), rng));
    out.push(build('Biology', 'hard', `The ${o.organ} belongs to which body system?`,
      capitalise(o.system), systems.filter((s) => s !== o.system).map(capitalise), rng));
  }

  const groups = [...new Set(D2.ANIMAL_CLASSES.map((a) => a.group))];
  for (const a of D2.ANIMAL_CLASSES) {
    // Frogs/amphibian, sharks/fish and so on are primary-school knowledge.
    const OBVIOUS = new Set(['Frog', 'Toad', 'Shark', 'Salmon', 'Eagle', 'Owl', 'Penguin', 'Butterfly', 'Ant', 'Spider', 'Snail']);
    out.push(build('Biology', OBVIOUS.has(a.animal) ? 'easy' : 'medium',
      `${a.animal}s belong to which animal group?`,
      a.group, groups.filter((g) => g !== a.group), rng));
  }

  const collectives = D2.ANIMAL_GROUP_NAMES.map((a) => a.collective);
  for (const a of D2.ANIMAL_GROUP_NAMES) {
    const KNOWN = new Set(['lions', 'wolves', 'fish', 'cattle', 'sheep', 'bees', 'puppies']);
    out.push(build('Biology', KNOWN.has(a.animal) ? 'easy' : 'medium',
      `What is a group of ${a.animal} called?`,
      capitalise(a.collective), collectives.filter((c) => c !== a.collective).map(capitalise), rng));
  }

  return out.filter(Boolean) as Question[];
}

// ── Technology ──────────────────────────────────────────────────────────────
export function technologyDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('Technology', D3.TECH_FACTS, rng),
    ...fromFacts('Technology', D6.TECH_FACTS2, rng),
    ...fromFacts('Technology', D8.TECH4, rng),
  ];
  const meanings = D2.TECH_ACRONYMS.map((a) => a.meaning);
  const acronyms = D2.TECH_ACRONYMS.map((a) => a.acronym);

  const EASY_ACRONYMS = new Set(['CPU', 'RAM', 'USB', 'PDF', 'GPS', 'HTML', 'AI', 'OS']);

  for (const a of D2.TECH_ACRONYMS) {
    out.push(build('Technology', EASY_ACRONYMS.has(a.acronym) ? 'easy' : 'medium',
      `What does ${a.acronym} stand for?`, a.meaning,
      meanings.filter((m) => m !== a.meaning), rng));
    out.push(build('Technology', 'hard', `Which acronym means "${a.meaning}"?`, a.acronym,
      acronyms.filter((x) => x !== a.acronym), rng));
  }

  const creators = D2.LANGUAGES.map((l) => l.creator);
  const langNames = D2.LANGUAGES.map((l) => l.language);
  const years = D2.LANGUAGES.map((l) => l.year);

  for (const l of D2.LANGUAGES) {
    out.push(build('Technology', 'hard', `Who created the ${l.language} programming language?`,
      l.creator, creators.filter((c) => c !== l.creator), rng));
    out.push(build('Technology', 'medium', `Which language is mainly used for ${l.useFor}?`,
      l.language, langNames.filter((n) => n !== l.language), rng));
    out.push(build('Technology', 'hard', `In which year did ${l.language} first appear?`,
      l.year, years.filter((y) => y !== l.year), rng));
    out.push(build('Technology', 'easy', `Is ${l.language} a programming language?`,
      'Yes, it is a programming language',
      ['No, it is an operating system', 'No, it is a database', 'No, it is a web browser'], rng));
  }

  const kinds = D2.FILE_EXTENSIONS.map((f) => f.kind);
  for (const f of D2.FILE_EXTENSIONS) {
    out.push(build('Technology', 'easy', `A file ending in ${f.ext} is what?`,
      capitalise(f.kind), kinds.filter((k) => k !== f.kind).map(capitalise), rng));
  }

  const founders = D2.TECH_FOUNDERS.map((c) => c.founder);
  for (const c of D2.TECH_FOUNDERS) {
    out.push(build('Technology', 'medium', `Who founded ${c.company}?`, c.founder,
      founders.filter((f) => f !== c.founder), rng));
    out.push(build('Technology', 'easy', `${c.founder.split(' and ')[0]} co-founded which company?`,
      c.company, D2.TECH_FOUNDERS.map((x) => x.company).filter((x) => x !== c.company), rng));
  }

  return out.filter(Boolean) as Question[];
}

// ── History ─────────────────────────────────────────────────────────────────
export function historyDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('History', D3.HISTORY_FACTS, rng),
    ...fromFacts('History', D5.HIST_FACTS2, rng),
    ...fromFacts('History', D7.HIST3, rng),
    ...fromFacts('History', D8.HIST4, rng),
  ];
  const years = D2.EVENTS.map((e) => e.year);
  const eventNames = D2.EVENTS.map((e) => e.event);

  for (const e of D2.EVENTS) {
    out.push(build('History', e.era, `In which year did ${e.event} happen?`, e.year,
      nearYears(e.year, years), rng));
    out.push(build('History', e.era === 'easy' ? 'medium' : 'hard',
      `Which of these happened in ${e.year}?`, capitalise(e.event),
      eventNames.filter((n) => n !== e.event).map(capitalise), rng));
  }

  const people = D2.LEADERS.map((l) => l.person);
  const roles = D2.LEADERS.map((l) => l.role);
  for (const l of D2.LEADERS) {
    const HOUSEHOLD = new Set(['George Washington', 'Winston Churchill', 'Nelson Mandela', 'Mahatma Gandhi', 'Julius Caesar', 'Cleopatra', 'Napoleon Bonaparte', 'Abraham Lincoln']);
    out.push(build('History', HOUSEHOLD.has(l.person) ? 'easy' : 'medium',
      `Who was ${l.role}?`, l.person,
      people.filter((p) => p !== l.person), rng));
    out.push(build('History', 'hard', `${l.person} is best known as what?`, capitalise(l.role),
      roles.filter((r) => r !== l.role).map(capitalise), rng));
  }

  const builders = D2.CIVILISATIONS.map((c) => c.who);
  const things = D2.CIVILISATIONS.map((c) => c.thing);
  for (const c of D2.CIVILISATIONS) {
    out.push(build('History', 'medium', `Which civilisation built ${c.thing}?`, c.who,
      builders.filter((b) => b !== c.who), rng));
    out.push(build('History', 'easy', `Which of these did ${c.who.replace(/^The /, 'the ')} build?`,
      capitalise(c.thing), things.filter((t) => t !== c.thing).map(capitalise), rng));
  }

  return out.filter(Boolean) as Question[];
}

/** Wrong years that look like real guesses, not noise. */
function nearYears(correct: string, pool: string[]): string[] {
  const n = parseInt(correct.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return pool.filter((y) => y !== correct);
  const near = [n - 1, n + 1, n - 5, n + 5, n - 10, n + 10, n - 20]
    .filter((y) => y > 0)
    .map(String);
  return [...near, ...pool.filter((y) => y !== correct)];
}

// ── Sports ──────────────────────────────────────────────────────────────────
export function sportsDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('Sports', D3.SPORT_FACTS, rng),
    ...fromFacts('Sports', D5.SPORT_FACTS2, rng),
    ...fromFacts('Sports', D7.SPORT3, rng),
    ...fromFacts('Sports', D8.SPORT4, rng),
  ];
  const counts = [...new Set(D2.SPORT_TEAMS.map((s) => s.players))];
  const sportNames = D2.SPORT_TEAMS.map((s) => s.sport);

  for (const s of D2.SPORT_TEAMS) {
    const WELL_KNOWN = new Set(['football (soccer)', 'basketball', 'baseball', 'volleyball']);
    out.push(build('Sports', WELL_KNOWN.has(s.sport) ? 'easy' : 'medium',
      `How many players per side in ${s.sport}?`, s.players,
      counts.filter((c) => c !== s.players), rng));
    out.push(build('Sports', 'hard', `Which sport has ${s.players} players on each side?`,
      capitalise(s.sport), sportNames.filter((n) => n !== s.sport).map(capitalise), rng));
  }

  const items = D2.SPORT_EQUIPMENT.map((e) => e.item);
  const equipSports = D2.SPORT_EQUIPMENT.map((e) => e.sport);
  for (const e of D2.SPORT_EQUIPMENT) {
    out.push(build('Sports', 'easy', `Which sport uses ${e.item}?`, capitalise(e.sport),
      equipSports.filter((s) => s !== e.sport).map(capitalise), rng));
    out.push(build('Sports', 'medium', `What equipment is central to ${e.sport}?`, capitalise(e.item),
      items.filter((i) => i !== e.item).map(capitalise), rng));
  }

  const termSports = [...new Set(D2.SPORT_TERMS.map((t) => t.sport))];
  const terms = D2.SPORT_TERMS.map((t) => t.term);
  for (const t of D2.SPORT_TERMS) {
    out.push(build('Sports', 'easy', `In which sport would you hear "${t.term}"?`,
      capitalise(t.sport), termSports.filter((s) => s !== t.sport).map(capitalise), rng));
    out.push(build('Sports', 'medium', `Which term comes from ${t.sport}?`, capitalise(t.term),
      terms.filter((x) => x !== t.term).map(capitalise), rng));
  }

  return out.filter(Boolean) as Question[];
}

// ── Food & Cooking ──────────────────────────────────────────────────────────
export function foodDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('Food & Cooking', D3.FOOD_FACTS, rng),
    ...fromFacts('Food & Cooking', D6.FOOD_FACTS2, rng),
    ...fromFacts('Food & Cooking', D7.FOOD3, rng),
    ...fromFacts('Food & Cooking', D8.FOOD4, rng),
  ];
  const countries = D2.DISH_ORIGINS.map((d) => d.country);
  const dishes = D2.DISH_ORIGINS.map((d) => d.dish);

  for (const d of D2.DISH_ORIGINS) {
    out.push(build('Food & Cooking', 'easy', `${d.dish} is a traditional dish from which country?`,
      d.country, countries.filter((c) => c !== d.country), rng));
    out.push(build('Food & Cooking', 'easy', `Which dish comes from ${d.country}?`, d.dish,
      dishes.filter((x) => x !== d.dish), rng));
  }

  const sources = D2.INGREDIENT_SOURCE.map((i) => i.source);
  const ingredients = D2.INGREDIENT_SOURCE.map((i) => i.ingredient);
  for (const i of D2.INGREDIENT_SOURCE) {
    out.push(build('Food & Cooking', 'medium', `${i.ingredient} comes from what?`, capitalise(i.source),
      sources.filter((s) => s !== i.source).map(capitalise), rng));
    out.push(build('Food & Cooking', 'hard', `Which ingredient comes from ${i.source}?`, i.ingredient,
      ingredients.filter((x) => x !== i.ingredient), rng));
  }

  const meanings = D2.COOKING_TERMS.map((t) => t.meaning);
  const termNames = D2.COOKING_TERMS.map((t) => t.term);
  for (const t of D2.COOKING_TERMS) {
    out.push(build('Food & Cooking', 'medium', `In cooking, what does "${t.term}" mean?`,
      capitalise(t.meaning), meanings.filter((m) => m !== t.meaning).map(capitalise), rng));
    out.push(build('Food & Cooking', 'hard', `Which term means ${t.meaning}?`, t.term,
      termNames.filter((x) => x !== t.term), rng));
  }

  return out.filter(Boolean) as Question[];
}

// ── Pop Culture ─────────────────────────────────────────────────────────────
export function popCultureDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [...fromFacts('Pop Culture', D3.POP_FACTS, rng),
    ...fromFacts('Pop Culture', D6.POP_FACTS2, rng),
    ...fromFacts('Pop Culture', D7.POP3, rng),
    ...fromFacts('Pop Culture', D8.POP4, rng),
  ];

  const authors = D2.AUTHORS.map((a) => a.author);
  const works = D2.AUTHORS.map((a) => a.work);
  for (const a of D2.AUTHORS) {
    const FAMOUS = new Set(['Romeo and Juliet', 'Pride and Prejudice', 'The Hobbit', 'Nineteen Eighty-Four', 'To Kill a Mockingbird']);
    out.push(build('Pop Culture', FAMOUS.has(a.work) ? 'easy' : 'medium',
      `Who wrote "${a.work}"?`, a.author,
      authors.filter((x) => x !== a.author), rng));
    out.push(build('Pop Culture', 'hard', `Which book did ${a.author} write?`, a.work,
      works.filter((w) => w !== a.work), rng));
  }

  const painters = D2.ARTISTS.map((a) => a.artist);
  const paintings = D2.ARTISTS.map((a) => a.work);
  for (const a of D2.ARTISTS) {
    const ICONIC = new Set(['the Mona Lisa', 'The Starry Night', 'The Scream']);
    out.push(build('Pop Culture', ICONIC.has(a.work) ? 'easy' : 'medium',
      `Who painted ${a.work}?`, a.artist,
      painters.filter((x) => x !== a.artist), rng));
    out.push(build('Pop Culture', 'hard', `Which work is by ${a.artist}?`, capitalise(a.work),
      paintings.filter((p) => p !== a.work).map(capitalise), rng));
  }

  const composers = D2.COMPOSERS.map((c) => c.composer);
  for (const c of D2.COMPOSERS) {
    out.push(build('Pop Culture', 'hard', `Who composed ${c.work}?`, c.composer,
      composers.filter((x) => x !== c.composer), rng));
  }

  const figures = D2.MYTHOLOGY.map((m) => m.figure);
  const domains = D2.MYTHOLOGY.map((m) => m.domain);
  const pantheons = [...new Set(D2.MYTHOLOGY.map((m) => m.pantheon))];
  for (const m of D2.MYTHOLOGY) {
    out.push(build('Pop Culture', 'easy', `In ${m.pantheon} mythology, who is the god of ${m.domain}?`,
      m.figure, figures.filter((f) => f !== m.figure), rng));
    out.push(build('Pop Culture', 'medium', `${m.figure} is a god of what?`, capitalise(m.domain),
      domains.filter((d) => d !== m.domain).map(capitalise), rng));
    out.push(build('Pop Culture', 'medium', `${m.figure} belongs to which mythology?`, m.pantheon,
      pantheons.filter((p) => p !== m.pantheon), rng));
  }

  return out.filter(Boolean) as Question[];
}

// ── General Knowledge ───────────────────────────────────────────────────────
export function generalDerived(rng: () => number): Question[] {
  const out: (Question | null)[] = [
    // Its own material first — language, time, measurement, everyday convention.
    // Nothing else generates these, so the cross-category dedupe can't strip it.
    ...fromFacts('General Knowledge', GK, rng),
    // Then a slice of everything else, to top up whatever is left.
    ...fromFacts('General Knowledge', pick(D3.PHYSICS_FACTS, 12, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.HISTORY_FACTS, 12, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.BIOLOGY_FACTS, 12, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.SPORT_FACTS, 10, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.TECH_FACTS, 10, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.FOOD_FACTS, 10, rng), rng),
    ...fromFacts('General Knowledge', pick(D3.POP_FACTS, 10, rng), rng),
    ...fromFacts('General Knowledge', pick(D4.GEO_FACTS, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D4.CHEM_FACTS, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D4.PHYS_FACTS2, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D5.HIST_FACTS2, 10, rng), rng),
    ...fromFacts('General Knowledge', pick(D5.SPORT_FACTS2, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D6.TECH_FACTS2, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D6.FOOD_FACTS2, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D6.POP_FACTS2, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D6.BIO_FACTS2, 6, rng), rng),
    ...fromFacts('General Knowledge', pick(D7.GEO3, 6, rng), rng),
    ...fromFacts('General Knowledge', pick(D7.HIST3, 8, rng), rng),
    ...fromFacts('General Knowledge', pick(D7.SPORT3, 6, rng), rng),
  ];

  for (const f of D2.MISC_FACTS) {
    out.push(build('General Knowledge', f.difficulty, f.question, f.answer, f.pool, rng));
  }

  const results = D2.COLOURS_MIX.map((c) => c.result);
  for (const c of D2.COLOURS_MIX) {
    out.push(build('General Knowledge', 'easy', `What colour do you get mixing ${c.mix}?`,
      c.result, results.filter((r) => r !== c.result).concat(['Brown', 'Turquoise']), rng));
  }

  // Pull a slice from the other tables — that is what "general knowledge" is.
  const authors = D2.AUTHORS.map((a) => a.author);
  for (const a of pick(D2.AUTHORS, 10, rng)) {
    out.push(build('General Knowledge', 'medium', `Who wrote "${a.work}"?`, a.author,
      authors.filter((x) => x !== a.author), rng));
  }

  const figures = D2.MYTHOLOGY.map((m) => m.figure);
  for (const m of pick(D2.MYTHOLOGY, 8, rng)) {
    out.push(build('General Knowledge', 'medium',
      `In ${m.pantheon} mythology, who is the god of ${m.domain}?`, m.figure,
      figures.filter((f) => f !== m.figure), rng));
  }

  const countries = D2.DISH_ORIGINS.map((d) => d.country);
  for (const d of pick(D2.DISH_ORIGINS, 10, rng)) {
    out.push(build('General Knowledge', 'easy', `${d.dish} comes from which country?`, d.country,
      countries.filter((c) => c !== d.country), rng));
  }

  const builders = D2.CIVILISATIONS.map((c) => c.who);
  for (const c of pick(D2.CIVILISATIONS, 8, rng)) {
    out.push(build('General Knowledge', 'medium', `Which civilisation built ${c.thing}?`, c.who,
      builders.filter((b) => b !== c.who), rng));
  }

  const acronymMeanings = D2.TECH_ACRONYMS.map((a) => a.meaning);
  for (const a of pick(D2.TECH_ACRONYMS, 10, rng)) {
    out.push(build('General Knowledge', 'medium', `What does ${a.acronym} stand for?`, a.meaning,
      acronymMeanings.filter((m) => m !== a.meaning), rng));
  }

  const leaders = D2.LEADERS.map((l) => l.person);
  for (const l of pick(D2.LEADERS, 8, rng)) {
    out.push(build('General Knowledge', 'medium', `Who was ${l.role}?`, l.person,
      leaders.filter((p) => p !== l.person), rng));
  }

  const eventYears = D2.EVENTS.map((e) => e.year);
  for (const e of pick(D2.EVENTS, 10, rng)) {
    out.push(build('General Knowledge', e.era, `In which year did ${e.event} happen?`, e.year,
      nearYears(e.year, eventYears), rng));
  }

  const sportTerms = [...new Set(D2.SPORT_TERMS.map((t) => t.sport))];
  for (const t of pick(D2.SPORT_TERMS, 8, rng)) {
    out.push(build('General Knowledge', 'easy', `In which sport would you hear "${t.term}"?`,
      capitalise(t.sport), sportTerms.filter((s) => s !== t.sport).map(capitalise), rng));
  }

  return out.filter(Boolean) as Question[];
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
