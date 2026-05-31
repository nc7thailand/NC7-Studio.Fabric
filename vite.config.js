import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3010,
    host: true,
  },
  optimizeDeps: {
    exclude: ['esm-potrace-wasm'],
  },
  assetsInclude: ['**/*.wasm'],
});
