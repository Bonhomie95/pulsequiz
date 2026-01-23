import axios from 'axios';
import jwt from 'jsonwebtoken';

const APPLE_ISSUER_ID = process.env.APPLE_ISSUER_ID!;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID!;
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY!; // PEM
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID!;

function makeAppleJWT() {
  return jwt.sign(
    {
      iss: APPLE_ISSUER_ID,
      aud: 'appstoreconnect-v1',
      exp: Math.floor(Date.now() / 1000) + 60 * 5,
      bid: APPLE_BUNDLE_ID,
    },
    APPLE_PRIVATE_KEY,
    {
      algorithm: 'ES256',
      keyid: APPLE_KEY_ID,
    },
  );
}

export async function verifyAppleTransaction(
  transactionId: string,
  expectedSku: string,
) {
  const token = makeAppleJWT();

  const res = await axios.get(
    `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${transactionId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const t = res.data;

  const valid =
    t.bundleId === APPLE_BUNDLE_ID &&
    t.productId === expectedSku &&
    t.revocationDate === null &&
    t.inAppOwnershipType === 'PURCHASED';

  return {
    valid,
    productId: t.productId,
    environment: t.environment, // Sandbox | Production
    data: t,
  };
}
