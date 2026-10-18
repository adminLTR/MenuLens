import axios from 'axios';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

http.interceptors.request.use((config) => {
  const raw = sessionStorage.getItem('menulens.session');
  if (!raw) return config;

  try {
    const user = JSON.parse(raw);
    if (user?.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
  } catch {
    /* sessão local ainda sem token de API */
  }

  return config;
});
