import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function offlineAssetManifest(): Plugin {
  return {
    name: 'offline-asset-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((file) => file.startsWith('assets/'))
        .sort()
        .map((file) => `/${file}`);
      this.emitFile({
        type: 'asset',
        fileName: 'offline-assets.json',
        source: JSON.stringify(assets),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineAssetManifest()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
});
