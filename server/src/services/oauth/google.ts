import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

function getGoogleAudiences() {
  const raw =
    process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyGoogleIdToken(idToken: string) {
  const audiences = getGoogleAudiences();
  if (!audiences.length) throw new Error('Missing GOOGLE_CLIENT_IDS');

  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) throw new Error('Invalid Google token');

  // ✅ reject unverified emails
  if (payload.email_verified === false) throw new Error('Email not verified');

  return {
    providerId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? '',
    picture: payload.picture ?? '',
  };
}
