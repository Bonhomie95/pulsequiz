import axios from 'axios';
import { storage } from '@/src/utils/storage';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.7:5000/api', // change to prod later
  timeout: 10000,
});

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
  }
);

api.interceptors.request.use(async (config: any) => {
  const token = await storage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export { api };
