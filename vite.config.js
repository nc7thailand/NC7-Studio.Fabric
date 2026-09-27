import { defineConfig } from 'vite';

export default defineConfig({
  // Root deploy on canvas.nc7foamart.com (Cloud Run + custom domain)
  base: '/',
  server: {
    port: 3010,
    host: true,
  },
  preview: {
    port: 8080,
    host: true,
  },
});
