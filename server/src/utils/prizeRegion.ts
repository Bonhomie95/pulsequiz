import type { Request } from 'express';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';

const ISO2 = /^[A-Z]{2}$/;

/**
 * The caller's country: the CDN's geo header when there is one (Cloudflare's
 * CF-IPCountry), else the device region the app sends as X-Region. Both are
 * advisory — prize payment still requires the eligibility checks in Official
 * Rules — but they let us simply not offer prizes where they aren't lawful.
 */
export function requestCountry(req: Request): string | null {
  for (const h of ['cf-ipcountry', 'x-region']) {
    const v = String(req.get(h) ?? '').trim().toUpperCase();
    if (ISO2.test(v) && v !== 'XX' && v !== 'T1') return v;
  }
  return null;
}

/** Parse the admin's "US, GB,ca" list into ["US","GB","CA"]. */
export function parseCountryList(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => ISO2.test(c));
}

/**
 * Whether real-money prizes are offered to a player in `country`.
 *
 * `prizes_enabled` false switches prizes off everywhere. An empty
 * `prize_countries` list means everywhere the app is published; otherwise
 * only the listed countries (and a player with no known country is excluded).
 */
export async function prizesAvailableFor(country?: string | null): Promise<boolean> {
  const enabled = await getSetting(SETTINGS_KEYS.PRIZES_ENABLED, true);
  if (enabled === false || enabled === 'false') return false;
  const allow = parseCountryList(await getSetting(SETTINGS_KEYS.PRIZE_COUNTRIES, ''));
  if (!allow.length) return true;
  return !!country && allow.includes(country.toUpperCase());
}
