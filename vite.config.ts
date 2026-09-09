import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { morphologyAssets } from './scripts/morphology-assets.mjs';

export default defineConfig({
  plugins: [react(), morphologyAssets()],
  worker: { format: 'es' },
});
