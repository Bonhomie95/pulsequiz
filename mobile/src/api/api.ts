import axios from 'axios';

const baseURL = process.env.EXPO_PUBLIC_API_URL;
if (!baseURL) {
  console.error(
    '❌ EXPO_PUBLIC_API_URL is not set — API calls will fail. Add it to mobile/.env',
  );
}

const api = axios.create({
  baseURL,
  timeout: 10000,
});

// ── Session-expiry hook ───────────────────────────────────────────────────────
// The auth store registers its logout handler here. We avoid importing the
// store directly to prevent a circular dependency (store imports this module).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// ── Response interceptor: log errors + handle expired/blocked sessions ────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    console.log('❌ API ERROR:', {
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      status,
    });
    // 401 (expired/invalid token) → drop the session so the app routes back
    // to login instead of failing silently on every request.
    // 403 is only a session-killer when the account is banned — the server
    // also uses 403 for business-rule denials (blocked friend request, IAP
    // ownership mismatch) that must NOT log the user out.
    const message = error.response?.data?.message;
    if (
      status === 401 ||
      (status === 403 && typeof message === 'string' && /banned/i.test(message))
    ) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

// ── Token helpers ─────────────────────────────────────────────────────────────
// NO async request interceptor — it causes a race condition where the token
// hasn't been read from SecureStore yet when the first requests fire.
// Instead, call setAuthToken() immediately after login/restore and it will
// be attached to every subsequent request via api.defaults.headers.

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export { api };
