/**
 * Sign in with Apple.
 *
 * App Store Review Guideline 4.8 requires this whenever an app offers a
 * third-party login (we offer Google and Facebook), so its absence is a hard
 * rejection rather than a nice-to-have.
 *
 * The client sends the identity token from `expo-apple-authentication`; we
 * verify it against Apple's published JWKS.
 */
import crypto from 'crypto';
import axios from 'axios';

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let keyCache: { keys: Map<string, AppleJwk>; fetchedAt: number } | null = null;

async function getAppleKeys(force = false): Promise<Map<string, AppleJwk>> {
  if (!force && keyCache && Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS) {
    return keyCache.keys;
  }
  const res = await axios.get<{ keys: AppleJwk[] }>(APPLE_KEYS_URL, { timeout: 10_000 });
  const keys = new Map((res.data?.keys ?? []).map((k) => [k.kid, k]));
  if (!keys.size) throw new Error('Apple returned an empty key set');
  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function jwkToKey(jwk: AppleJwk): crypto.KeyObject {
  return crypto.createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
}

function b64urlToJson(seg: string): any {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

function getAudiences(): string[] {
  const raw =
    process.env.APPLE_CLIENT_IDS ||
    process.env.APPLE_BUNDLE_ID ||
    '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function verifyAppleIdentityToken(identityToken: string) {
  const audiences = getAudiences();
  if (!audiences.length) {
    throw new Error('APPLE_CLIENT_IDS / APPLE_BUNDLE_ID must be set for Sign in with Apple');
  }

  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Apple identity token');

  const header = b64urlToJson(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unsupported Apple token algorithm');

  let keys = await getAppleKeys();
  let jwk = keys.get(header.kid);
  if (!jwk) {
    // Apple rotated the signing key — refresh once before giving up.
    keys = await getAppleKeys(true);
    jwk = keys.get(header.kid);
  }
  if (!jwk) throw new Error('Unknown Apple signing key');

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    jwkToKey(jwk),
    Buffer.from(parts[2], 'base64url'),
  );
  if (!ok) throw new Error('Invalid Apple token signature');

  const payload = b64urlToJson(parts[1]);

  if (payload.iss !== APPLE_ISSUER) throw new Error('Unexpected Apple token issuer');
  if (!audiences.includes(payload.aud)) throw new Error('Apple token audience mismatch');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    throw new Error('Apple token expired');
  }
  if (!payload.sub) throw new Error('Apple token missing subject');

  // Apple only returns the email on the FIRST authorisation, and may return a
  // private relay address. Both are fine — we key on `sub`.
  const email: string | undefined = payload.email;
  if (email && payload.email_verified === 'false') {
    throw new Error('Apple email not verified');
  }

  return {
    providerId: payload.sub as string,
    // Synthesised when Apple withholds the email on a repeat sign-in. It is
    // never used to contact anyone — `sub` is the identity.
    email: (email ?? `apple_${payload.sub}@privaterelay.pulsequiz.local`).toLowerCase(),
    name: null as string | null,
    isPrivateEmail: payload.is_private_email === true || payload.is_private_email === 'true',
  };
}
