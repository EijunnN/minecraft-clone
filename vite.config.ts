import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// WRANGLER_CONFIG elige otra configuración del Worker (p. ej. wrangler.vps.jsonc para open-compute en un VPS).
const configPath = process.env.WRANGLER_CONFIG;

export default defineConfig({
  plugins: [cloudflare(configPath ? { configPath } : {})],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  worker: {
    format: 'es',
  },
});
