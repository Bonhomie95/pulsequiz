import axios from 'axios';
import { useAdminStore } from '../store/adminStore';

// withCredentials sends the httpOnly admin_token cookie on every request.
// No Authorization header / localStorage token anymore — the cookie is the
// credential and JS can't read it (XSS-safe).
export const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
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
