/**
 * Derived generators.
 *
 * Each reads its answer out of a reference table, and draws distractors from
 * the same table so they are always the right *kind* of thing — a wrong
 * capital is another real capital, a wrong element symbol is another real
 * symbol. That is what makes elimination hard and the question fair.
 */
import { build, pick, type Question, type Difficulty } from './types';
import * as D from './data';
import * as D3 from './data3';
import * as D4 from './data4';
import * as D7 from './data7';
import * as D8 from './data8';

// ── Geography ───────────────────────────────────────────────────────────────

/** Well-known countries can carry an easy question; the rest are medium/hard. */
const EASY_COUNTRIES = new Set([
  'France', 'Germany', 'Italy', 'Spain', 'Japan', 'China', 'India', 'Egypt',
  'Brazil', 'Canada', 'Australia', 'Russia', 'Mexico', 'United States',
  'United Kingdom', 'Nigeria', 'Kenya', 'South Korea', 'Argentina', 'Greece',
  'Portugal', 'Netherlands', 'Ireland', 'Norway', 'Sweden', 'Denmark', 'Cuba',
  'Jamaica', 'Thailand', 'Turkey', 'Poland', 'New Zealand', 'Peru', 'Chile',
]);

const HARD_COUNTRIES = new Set([
  'Kazakhstan', 'Mongolia', 'Bolivia', 'Paraguay', 'Botswana', 'Namibia',
  'Ivory Coast', 'Cameroon', 'Tanzania', 'Papua New Guinea', 'Fiji',
]);

/**
 * Everything not explicitly easy or hard is medium — but "what is the capital
 * of Belgium" is not a medium question for most players. The middle tier here
 * is deliberately thin.
 */

function countryDifficulty(country: string): Difficulty {
  if (EASY_COUNTRIES.has(country)) return 'easy';
  if (HARD_COUNTRIES.has(country)) return 'hard';
  return 'medium';
}

export function geographyQuestions(rng: () => number): Question[] {
  const out: Question[] = [...D4.GEO_FACTS, ...D7.GEO3].map((f) =>
    build('Geography', f.d, f.q, f.a, f.pool, rng, 'curated'),
  ).filter(Boolean) as Question[];
  const allCapitals = D.COUNTRIES.map((c) => c.capital);
  const allCountries = D.COUNTRIES.map((c) => c.country);
  const allCurrencies = [...new Set(D.COUNTRIES.map((c) => c.currency))];
  const continents = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];

  for (const row of D.COUNTRIES) {
    const difficulty = countryDifficulty(row.country);
    // The reverse direction (capital → country) is a rung easier than recall
    // in the other direction, because the capital name usually gives it away.

    // Capital → country. Distractors from the same continent where possible,
    // so the question tests knowledge rather than continent-spotting.
    const sameContinent = D.COUNTRIES.filter(
      (c) => c.continent === row.continent && c.capital !== row.capital,
    ).map((c) => c.capital);

    out.push(
      build('Geography', difficulty, `What is the capital of ${row.country}?`, row.capital,
        [...pick(sameContinent, 6, rng), ...pick(allCapitals, 4, rng)], rng)!,
    );

    // Country → continent, only where it isn't trivially obvious.
    if (difficulty !== 'easy') {
      out.push(
        build('Geography', 'medium', `${row.country} is on which continent?`, row.continent,
          continents.filter((c) => c !== row.continent), rng)!,
      );
    }

    // Currency — a naturally harder recall.
    if (row.currency !== 'Euro' && row.currency !== 'US dollar') {
      out.push(
        build('Geography', 'hard', `What is the currency of ${row.country}?`, row.currency,
          pick(allCurrencies.filter((c) => c !== row.currency), 8, rng), rng)!,
      );
    }
  }

  // Which country has this capital? (the reverse direction)
  for (const row of pick(D.COUNTRIES, 40, rng)) {
    out.push(
      build('Geography', countryDifficulty(row.country) === 'easy' ? 'easy' : 'medium',
        `${row.capital} is the capital of which country?`, row.country,
        pick(allCountries.filter((c) => c !== row.country), 8, rng), rng)!,
    );
  }

  // Physical features.
  const poolFor: Record<string, string[]> = {
    river: D.RIVERS, mountain: D.MOUNTAINS, ocean: D.OCEANS, desert: D.DESERTS,
    island: D.ISLANDS, lake: D.LAKES, trench: D.TRENCHES, rainforest: D.RAINFORESTS,
  };

  for (const item of D.LANDMARKS) {
    out.push(
      build('Geography', 'medium', `What is ${item.fact}?`, item.answer,
        (poolFor[item.kind] ?? []).filter((x) => x !== item.answer), rng)!,
    );
  }

  return out.filter(Boolean);
}

// ── Chemistry ───────────────────────────────────────────────────────────────

const COMMON_ELEMENTS = new Set([
  'Hydrogen', 'Helium', 'Carbon', 'Nitrogen', 'Oxygen', 'Sodium', 'Iron',
  'Gold', 'Silver', 'Copper', 'Zinc', 'Calcium', 'Chlorine', 'Lead', 'Mercury',
  'Lithium', 'Neon', 'Aluminium', 'Silicon', 'Sulfur', 'Potassium', 'Argon',
  'Magnesium', 'Nickel', 'Tin', 'Platinum', 'Uranium', 'Iodine', 'Boron',
  'Phosphorus', 'Fluorine', 'Titanium', 'Chromium', 'Cobalt', 'Manganese',
]);

export function chemistryQuestions(rng: () => number): Question[] {
  const out: Question[] = [...D4.CHEM_FACTS, ...D7.CHEM3, ...D8.CHEM4].map((f) =>
    build('Chemistry', f.d, f.q, f.a, f.pool, rng, 'curated'),
  ).filter(Boolean) as Question[];
  const allSymbols = D.ELEMENTS.map((e) => e.symbol);
  const allNames = D.ELEMENTS.map((e) => e.name);
  const allNumbers = D.ELEMENTS.map((e) => String(e.number));
  const allCategories = [...new Set(D.ELEMENTS.map((e) => e.category))];

  for (const el of D.ELEMENTS) {
    const easy = COMMON_ELEMENTS.has(el.name);

    out.push(
      build('Chemistry', easy ? 'easy' : 'medium',
        `What is the chemical symbol for ${el.name.toLowerCase()}?`, el.symbol,
        allSymbols.filter((s) => s !== el.symbol), rng)!,
    );

    out.push(
      build('Chemistry', easy ? 'medium' : 'hard',
        `Which element has the symbol ${el.symbol}?`, el.name,
        allNames.filter((n) => n !== el.name), rng)!,
    );

    if (el.number <= 30) {
      out.push(
        build('Chemistry', 'hard',
          `What is the atomic number of ${el.name.toLowerCase()}?`, String(el.number),
          allNumbers.filter((n) => n !== String(el.number)), rng)!,
      );
    }

    if (el.category !== 'nonmetal') {
      out.push(
        build('Chemistry', 'hard',
          `${el.name} belongs to which group of elements?`, el.category,
          allCategories.filter((c) => c !== el.category), rng)!,
      );
    }
  }

  const allFormulas = D.COMPOUNDS.map((c) => c.formula);
  const allCompoundNames = D.COMPOUNDS.map((c) => c.name);

  const EASY_COMPOUNDS = new Set([
    'water', 'carbon dioxide', 'table salt', 'methane', 'ammonia', 'ozone',
    'carbon monoxide', 'hydrogen peroxide', 'glucose', 'ethanol',
  ]);

  for (const c of D.COMPOUNDS) {
    out.push(
      build('Chemistry', EASY_COMPOUNDS.has(c.name) ? 'easy' : 'medium',
        `What is the chemical formula for ${c.name}?`, c.formula,
        allFormulas.filter((f) => f !== c.formula), rng)!,
    );
    out.push(
      build('Chemistry', EASY_COMPOUNDS.has(c.name) ? 'medium' : 'hard',
        `Which compound has the formula ${c.formula}?`, c.name,
        allCompoundNames.filter((n) => n !== c.name), rng)!,
    );
  }

  return out.filter(Boolean);
}

// ── Physics ─────────────────────────────────────────────────────────────────

export function physicsQuestions(rng: () => number): Question[] {
  const out: Question[] = [...D3.PHYSICS_FACTS, ...D4.PHYS_FACTS2, ...D7.PHYS3, ...D8.MIXED4]
    .map((f) => build('Physics', f.d, f.q, f.a, f.pool, rng, 'curated'))
    .filter(Boolean) as Question[];
  const allUnits = D.SI_UNITS.map((u) => u.unit);
  const allQuantities = D.SI_UNITS.map((u) => u.quantity);
  const allSymbols = D.SI_UNITS.map((u) => u.symbol);

  const BASIC = new Set([
    'length', 'mass', 'time', 'force', 'energy', 'power', 'temperature',
    'frequency', 'pressure', 'electric current', 'voltage',
    'electrical resistance',
  ]);

  for (const u of D.SI_UNITS) {
    out.push(
      build('Physics', BASIC.has(u.quantity) ? 'easy' : 'medium',
        `What is the SI unit of ${u.quantity}?`, u.unit,
        allUnits.filter((x) => x !== u.unit), rng)!,
    );
    out.push(
      build('Physics', BASIC.has(u.quantity) ? 'easy' : 'medium',
        `The ${u.unit} is the SI unit of what?`, u.quantity,
        allQuantities.filter((q) => q !== u.quantity), rng)!,
    );
    if (!BASIC.has(u.quantity)) {
      out.push(
        build('Physics', 'hard', `Which quantity is measured in units with the symbol ${u.symbol}?`,
          u.quantity, allQuantities.filter((q) => q !== u.quantity), rng)!,
      );
    }
  }

  const allLaws = D.PHYSICS_LAWS.map((l) => l.law);
  for (const l of D.PHYSICS_LAWS) {
    out.push(
      build('Physics', 'medium', `Which law describes ${l.describes}?`, l.law,
        allLaws.filter((x) => x !== l.law), rng)!,
    );
  }

  const physicists = D.SCIENTISTS.filter((s) => s.field === 'physics');
  const allPeople = D.SCIENTISTS.map((s) => s.person);
  for (const s of physicists) {
    out.push(
      build('Physics', 'medium', `Who is known for ${s.forWhat}?`, s.person,
        allPeople.filter((p) => p !== s.person), rng)!,
    );
  }

  // Planet ordering — arithmetic on a fixed list, so always correct.
  D.PLANETS.forEach((planet, i) => {
    out.push(
      build('Physics', i < 2 ? 'easy' : i < 5 ? 'medium' : 'hard',
        `Which planet is ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][i]} from the Sun?`,
        planet, D.PLANETS.filter((p) => p !== planet), rng)!,
    );
  });

  return out.filter(Boolean);
}

// ── Cross-category science people (for General Knowledge) ───────────────────

export function scientistQuestions(category: string, rng: () => number): Question[] {
  const allPeople = D.SCIENTISTS.map((s) => s.person);
  return D.SCIENTISTS.map((s) =>
    build(category, 'medium', `Who is known for ${s.forWhat}?`, s.person,
      allPeople.filter((p) => p !== s.person), rng),
  ).filter(Boolean) as Question[];
}

export function geographyForGeneral(category: string, rng: () => number): Question[] {
  const allCapitals = D.COUNTRIES.map((c) => c.capital);
  return pick(D.COUNTRIES.filter((c) => EASY_COUNTRIES.has(c.country)), 25, rng)
    .map((row) =>
      build(category, 'easy', `What is the capital of ${row.country}?`, row.capital,
        allCapitals.filter((c) => c !== row.capital), rng),
    )
    .filter(Boolean) as Question[];
}
