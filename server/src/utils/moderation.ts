import User from '../models/User';
import FlaggedAccount from '../models/FlaggedAccount';

/**
 * Text/avatar moderation for user-chosen identity (username, custom avatar).
 *
 * Policy: offensive submissions are rejected with a warning. Strikes are
 * tracked per account — at FLAG_THRESHOLD the account is flagged for admin
 * review, at BAN_THRESHOLD it is auto-banned.
 */

export const FLAG_THRESHOLD = 3;
export const BAN_THRESHOLD = 5;

/**
 * Two matching strategies, because one doesn't work for both cases.
 *
 * HARD_STEMS are long enough that any string containing them is offensive, so
 * they match anywhere — which is what catches separator evasion ("f.u-c_k"
 * normalises to "fuck").
 *
 * BOUNDED_STEMS are short enough to appear inside innocent words. They only
 * match a whole token, optionally with a common inflection. The previous
 * implementation matched every stem as a substring and claimed to avoid
 * Scunthorpe-style false positives by omitting the shortest stems — but
 * "cunt" was still in the list, so the town of Scunthorpe (and anyone named
 * after it) was rejected.
 */
const HARD_STEMS: string[] = [
  'fuck', 'motherfucker', 'asshole', 'arsehole', 'dickhead', 'wanker',
  'bastard', 'whore', 'blowjob', 'handjob', 'cumshot', 'jizz',
  'porn', 'penis', 'vagina',
  'nigger', 'nigga', 'faggot', 'fagot', 'tranny', 'wetback', 'raghead',
  'kukluxklan', 'rapist', 'pedophile', 'paedophile', 'molest',
  'hitler', 'nazi',
];

/** Short or embeddable stems — whole-token matches only. */
const BOUNDED_STEMS: string[] = [
  'fck', 'fuk', 'shit', 'bitch', 'cunt', 'slut', 'pussy',
  'dyke', 'kike', 'spic', 'chink', 'gook', 'paki', 'negro',
  'retard', 'raper', 'pedo', 'paedo',
];

/** Inflections a bounded stem may carry and still be the same word. */
const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'ies', 'z', 'a', 'o'];

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's',
  '6': 'g', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '+': 't', '\u20ac': 'e', '\u00a3': 'l',
};

/** Lowercase, strip diacritics, de-leet. Separators are preserved here. */
function normalizeBase(input: string): string {
  let s = input.toLowerCase();
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[0-9@$!+\u20ac\u00a3]/g, (c) => LEET_MAP[c] ?? ' ');
  return s;
}

/** Everything non-alphabetic removed — catches "f.u.c.k". */
function squash(base: string): string {
  return base.replace(/[^a-z]/g, '');
}

/** Repeated letters collapsed — catches "fuuuck". */
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

/** Word-ish tokens, so short stems can be matched with real boundaries. */
function tokenize(base: string): string[] {
  return base.split(/[^a-z]+/).filter(Boolean);
}

function matchesBounded(token: string, stem: string): boolean {
  if (!token.startsWith(stem)) return false;
  return SUFFIXES.includes(token.slice(stem.length));
}

/** True if the text contains profanity / abusive content. */
export function isTextOffensive(input: string): boolean {
  if (!input) return false;

  const base = normalizeBase(input);
  const squashed = squash(base);
  const collapsed = collapse(squashed);

  // Long, unambiguous stems: match anywhere, in either form.
  if (HARD_STEMS.some((stem) => squashed.includes(stem) || collapsed.includes(stem))) {
    return true;
  }

  // Short stems: whole-token matches only, so "scunthorpe" and "cockpit" pass.
  const tokens = [...tokenize(base), ...tokenize(collapse(base))];
  // Also treat the fully squashed string as a token, so "c.u.n.t" is caught
  // while "scunthorpe" (which contains but does not equal the stem) is not.
  tokens.push(squashed, collapsed);

  return BOUNDED_STEMS.some((stem) =>
    tokens.some((token) => matchesBounded(token, stem)),
  );
}

// ── Avatars ──────────────────────────────────────────────────────────────────

const PRESET_AVATAR_RE = /^avatar[0-9]{1,2}$/;

// Emoji explicitly banned as avatars (all skin-tone variants of 🖕 contain
// the base scalar, so a simple includes() covers them).
const BANNED_AVATAR_EMOJI = ['\u{1F595}' /* 🖕 */];

const EMOJI_CHARS_RE =
  /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️]+$/u;

/** True when the string is a single emoji grapheme (incl. ZWJ sequences). */
export function isSingleEmoji(input: string): boolean {
  if (!input || input.length > 16) return false;
  if (!EMOJI_CHARS_RE.test(input)) return false;
  if (!/\p{Extended_Pictographic}/u.test(input)) return false;
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(input)].length === 1;
}

export type AvatarCheck =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'offensive' };

/** An avatar is a preset id (avatar0…) or a single non-banned emoji. */
export function checkAvatar(avatar: string): AvatarCheck {
  if (PRESET_AVATAR_RE.test(avatar)) return { ok: true };
  if (!isSingleEmoji(avatar)) return { ok: false, reason: 'invalid' };
  if (BANNED_AVATAR_EMOJI.some((e) => avatar.includes(e))) {
    return { ok: false, reason: 'offensive' };
  }
  return { ok: true };
}

// ── Strikes ──────────────────────────────────────────────────────────────────

export interface StrikeResult {
  strikes: number;
  banned: boolean;
  message: string;
}

/**
 * Record an offensive-content attempt. Flags the account for admin review at
 * FLAG_THRESHOLD strikes and auto-bans at BAN_THRESHOLD.
 */
export async function registerModerationStrike(
  userId: string,
  offendingText: string,
): Promise<StrikeResult> {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { moderationStrikes: 1 } },
    { returnDocument: 'after' },
  );
  const strikes = user?.moderationStrikes ?? 1;

  if (strikes >= BAN_THRESHOLD) {
    await User.updateOne(
      { _id: userId },
      { $set: { isBanned: true, withdrawalEnabled: false } },
    );
    await FlaggedAccount.create({
      userId,
      reason: `Auto-banned: ${strikes} offensive username/avatar attempts (last: "${offendingText.slice(0, 40)}")`,
      flaggedAt: new Date(),
      resolved: false,
    }).catch(() => {});
    return {
      strikes,
      banned: true,
      message:
        'Your account has been banned for repeated offensive content. Contact support if you believe this is a mistake.',
    };
  }

  if (strikes >= FLAG_THRESHOLD) {
    // Flag once per threshold crossing — skip if an unresolved flag exists
    const existing = await FlaggedAccount.findOne({
      userId,
      resolved: false,
      reason: /offensive username\/avatar/,
    }).lean();
    if (!existing) {
      await FlaggedAccount.create({
        userId,
        reason: `Repeated offensive username/avatar attempts (${strikes} strikes, last: "${offendingText.slice(0, 40)}")`,
        flaggedAt: new Date(),
        resolved: false,
      }).catch(() => {});
    }
  }

  return {
    strikes,
    banned: false,
    message: `That name or avatar isn't allowed. Offensive content is against the rules — warning ${strikes} of ${BAN_THRESHOLD - 1}. Further attempts will get your account banned.`,
  };
}
