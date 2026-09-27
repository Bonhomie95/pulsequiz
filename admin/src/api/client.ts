import axios from 'axios';
import { useAdminStore } from '../store/adminStore';

// withCredentials sends the httpOnly admin_token cookie on every request.
// No Authorization header / localStorage token anymore — the cookie is the
// credential and JS can't read it (XSS-safe).
export const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  // Proves the request came from our own JS: a cross-site page can't set a
  // custom header without a CORS preflight it won't pass. The API requires it
  // on writes when the panel is hosted on a different site than the API
  // (ADMIN_COOKIE_CROSS_SITE).
  headers: { 'X-Admin-Request': '1' },
});

adminApi.interceptors.response.use(
  (res) => res,
  (error) => {
    // Cookie expired / invalid → drop the local session. RequireAdmin is
    // watching that store and renders a redirect to /login, which is a
    // client-side route change: `window.location.href` asked the static host
    // for /login, and without a SPA rewrite that is a 404 rather than the
    // login page. Clearing the store is also what makes this work when the
    // 401 arrives as an opaque CORS failure with no readable status.
    if (error.response?.status === 401 || error.response?.status === 419) {
      useAdminStore.getState().clearSession();
    }
    return Promise.reject(error);
  },
);
