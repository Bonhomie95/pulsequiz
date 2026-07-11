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

// Unambiguous profanity / slur / abuse stems. Matched against a normalized
// (lowercased, de-leeted, separator-stripped) form, so "F_u-c.k" or "fvck"
// style evasions are caught. Deliberately excludes short ambiguous stems
// ("ass", "cock") to avoid Scunthorpe-style false positives.
const BLOCKED_STEMS: string[] = [
  'fuck', 'fck', 'fuk', 'shit', 'bitch', 'cunt', 'asshole', 'arsehole',
  'dickhead', 'wanker', 'bastard', 'whore', 'slut', 'pussy', 'penis',
  'vagina', 'porn', 'blowjob', 'handjob', 'cumshot', 'jizz',
  'nigger', 'nigga', 'negro', 'faggot', 'fagot', 'dyke', 'tranny',
  'kike', 'spic', 'chink', 'gook', 'wetback', 'raghead', 'paki',
  'retard', 'rapist', 'raper', 'pedo', 'paedo', 'molest',
  'hitler', 'nazi', 'kukluxklan',
];

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's',
  '6': 'g', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '+': 't', '€': 'e', '£': 'l',
};

function normalizeForModeration(input: string): string {
  let s = input.toLowerCase();
  // strip diacritics (é → e)
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  // de-leet
  s = s.replace(/[0-9@$!+€£]/g, (c) => LEET_MAP[c] ?? '');
  // drop separators and anything non-alphabetic
  s = s.replace(/[^a-z]/g, '');
  // collapse repeated letters (fuuuck → fuck) — keep a single copy
  const collapsed = s.replace(/(.)\1+/g, '$1');
  return `${s} ${collapsed}`;
}

/** True if the text contains profanity / abusive content. */
export function isTextOffensive(input: string): boolean {
  const normalized = normalizeForModeration(input);
  return BLOCKED_STEMS.some((stem) => normalized.includes(stem));
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
