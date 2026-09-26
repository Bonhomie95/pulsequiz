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
    // Cookie expired / invalid → drop local session and bounce to login.
    if (error.response?.status === 401) {
      useAdminStore.getState().clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
