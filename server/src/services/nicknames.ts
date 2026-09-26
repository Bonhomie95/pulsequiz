/**
 * Nicknames for the house accounts that pad out the leaderboards.
 *
 * They have to read like handles real people choose, and the player base is
 * global — so the pools deliberately mix scripts and naming habits rather than
 * leaning on one language. Nothing here says "bot" or "player123"; a board full
 * of obvious filler is worse than an empty one.
 */

/** Short given names from a spread of regions. */
const NAMES = [
  'amara', 'tunde', 'zola', 'kofi', 'nadia', 'imani', 'sade', 'chidi', 'ayo', 'lerato',
  'mateo', 'lucia', 'diego', 'elena', 'joao', 'bianca', 'rafa', 'camila',
  'hana', 'yuki', 'ren', 'mei', 'jin', 'aiko', 'haru', 'sora',
  'arjun', 'priya', 'rohan', 'ananya', 'kiran', 'meera',
  'omar', 'layla', 'yusuf', 'farah', 'karim', 'zara',
  'lukas', 'anna', 'pieter', 'ingrid', 'nikolai', 'sofia', 'mila', 'tomas',
  'grace', 'oliver', 'ruby', 'nathan', 'iris', 'felix', 'nora', 'caleb',
];

/** Adjectives that pair into a handle without sounding generated. */
const ADJECTIVES = [
  'quiet', 'swift', 'clever', 'bright', 'calm', 'bold', 'lucky', 'sharp',
  'wild', 'brave', 'golden', 'silver', 'rapid', 'silent', 'sunny', 'cosmic',
  'humble', 'keen', 'noble', 'rusty', 'amber', 'velvet',
];

const NOUNS = [
  'falcon', 'otter', 'lynx', 'heron', 'raven', 'koi', 'fox', 'ibis',
  'comet', 'ember', 'harbor', 'summit', 'meadow', 'canyon', 'delta', 'atlas',
  'pixel', 'quill', 'lantern', 'compass', 'anchor', 'orbit', 'prism', 'echo',
];

const SUFFIXES = ['', '', '', '_', '.', 'x', 'xo', 'hq'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One handle. Several shapes, because real sign-up lists are not uniform —
 * some people use their name, some a two-word handle, some add digits.
 */
export function generateNickname(): string {
  switch (Math.floor(Math.random() * 6)) {
    case 0:
      return capitalise(pick(ADJECTIVES)) + capitalise(pick(NOUNS));
    case 1:
      return `${pick(NAMES)}_${pick(NOUNS)}`;
    case 2:
      return `${pick(NAMES)}${10 + Math.floor(Math.random() * 89)}`;
    case 3:
      return pick(ADJECTIVES) + pick(NOUNS);
    case 4:
      return capitalise(pick(NAMES)) + capitalise(pick(NOUNS));
    default:
      return `${pick(NAMES)}${pick(SUFFIXES)}${Math.random() < 0.4 ? Math.floor(Math.random() * 99) : ''}`;
  }
}

/**
 * `count` handles that do not collide with each other or with `taken`
 * (compared case-insensitively, matching the username_ci index).
 *
 * Gives up rather than spinning if the pools cannot supply enough — the caller
 * gets fewer accounts, which is harmless, instead of an infinite loop.
 */
export function generateNicknames(count: number, taken: Set<string> = new Set()): string[] {
  const lowerTaken = new Set([...taken].map((t) => t.toLowerCase()));
  const out: string[] = [];
  let attempts = 0;

  while (out.length < count && attempts < count * 40) {
    attempts++;
    const nick = generateNickname();
    if (nick.length < 3 || nick.length > 20) continue;
    const key = nick.toLowerCase();
    if (lowerTaken.has(key)) continue;
    lowerTaken.add(key);
    out.push(nick);
  }

  return out;
}
