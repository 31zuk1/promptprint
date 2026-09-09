import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { morphologyAssets } from './morphology-assets.mjs';

// Separate entry/bundle: the ordinary Web build never imports private transport/storage.
await build({
  configFile: false,
  base: './',
  plugins: [react(), morphologyAssets()],
  worker: { format: 'es' },
  build: { outDir: 'dist-private', emptyOutDir: false, rollupOptions: { input: resolve('private.html') } },
});
await mkdir('dist-private', { recursive: true });
for (const name of ['manifest.json', 'background.js']) {
  await copyFile(`private-extension/${name}`, `dist-private/${name}`);
}
console.log('Local-only unpacked extension: dist-private (not published).');
