import axios from 'axios';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.19:5000/api',
  timeout: 10000,
});

// ── Response interceptor: log errors ─────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    console.log('❌ API ERROR:', {
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      status: error.response?.status,
    });
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
