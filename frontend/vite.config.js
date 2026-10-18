import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget =
    process.env.VITE_PROXY_TARGET || env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';
  const useHttps = (process.env.VITE_DEV_HTTPS || env.VITE_DEV_HTTPS) === 'true';

  return {
    plugins: useHttps ? [basicSsl()] : [],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      headers: {
        'Permissions-Policy': 'camera=(self), microphone=()',
      },
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/health': { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
