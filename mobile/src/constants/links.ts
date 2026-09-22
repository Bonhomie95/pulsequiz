// Public-facing URLs. App-store review opens these, so they must resolve.
// The API server hosts all of them (server/public/legal), so by default they
// point at the API's origin; set EXPO_PUBLIC_WEB_URL once a marketing site
// serves the same paths.
const apiOrigin = /^(https?:\/\/[^/]+)/i.exec(process.env.EXPO_PUBLIC_API_URL ?? '')?.[1];
const WEB = (process.env.EXPO_PUBLIC_WEB_URL || apiOrigin || 'https://pulsequiz.app').replace(/\/$/, '');

export const LINKS = {
  TERMS: `${WEB}/terms`,
  PRIVACY: `${WEB}/privacy`,
  SUPPORT: `${WEB}/support`,
  /** Full official contest rules (must match the in-app summary). */
  RULES: `${WEB}/rules`,
  /** Web account-deletion page — Google Play requires one outside the app. */
  DELETE_ACCOUNT: `${WEB}/delete-account`,
  WEBSITE: WEB,
};

/** Web link for an async friend challenge; opens the app or the stores. */
export const duelLink = (code: string) => `${WEB}/d/${code}`;
