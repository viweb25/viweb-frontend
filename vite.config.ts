import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy: {
      '/api': env.VITE_API_URL || 'http://127.0.0.1:8000',
      '/health': env.VITE_API_URL || 'http://127.0.0.1:8000',
    } },
  };
});
