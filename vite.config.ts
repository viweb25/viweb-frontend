import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      {
        name: 'local-app-origin',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (
              request.headers.host === 'localhost:3000' &&
              request.method === 'GET' &&
              request.headers.accept?.includes('text/html')
            ) {
              response.writeHead(302, {
                Location: `http://127.0.0.1:3000${request.url ?? '/'}`,
              });
              response.end();
              return;
            }
            next();
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy: {
      '/api': env.VITE_API_URL || 'http://127.0.0.1:8000',
      '/health': env.VITE_API_URL || 'http://127.0.0.1:8000',
    } },
  };
});
