import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  worker: {
    format: 'es',
  },
});
