import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { collectNotices, publishToRepo, toolkitHtml } from './build/plugins.ts';
import { TOOLS } from './src/registry.ts';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(webDir, 'src');
const repoRoot = path.resolve(webDir, '..');
const distDir = path.join(webDir, 'dist');
/** 共用程式與樣式在 repo 裡的位置（與 dist 內相同） */
const ASSETS_DIR = 'assets/build';

export default defineConfig({
  root: srcDir,
  /* 相對路徑：頁面放在 GitHub Pages 子路徑（/toolkit/next/<id>/）也能跑 */
  base: './',
  publicDir: false,
  resolve: {
    alias: { '@': srcDir },
  },
  plugins: [
    react(),
    tailwindcss(),
    toolkitHtml(),
    collectNotices(),
    publishToRepo({ repoRoot, distDir, assetsDir: ASSETS_DIR, tools: TOOLS }),
  ],
  worker: {
    format: 'es',
    plugins: () => [collectNotices()],
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    assetsDir: ASSETS_DIR,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      /* 每個工具一頁：web/src/tools/<id>/index.html → dist/tools/<id>/index.html */
      input: Object.fromEntries(
        TOOLS.map((t) => [t.id, path.join(srcDir, 'tools', t.id, 'index.html')]),
      ),
    },
  },
});
