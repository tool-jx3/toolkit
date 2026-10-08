import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assembleSite, collectNotices, toolkitHtml } from './build/plugins.ts';
import { TOOLS } from './src/registry.ts';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(webDir, 'src');
const repoRoot = path.resolve(webDir, '..');
const distDir = path.join(webDir, 'dist');
/** 共用程式與樣式在網站上的位置 */
const ASSETS_DIR = 'assets/build';
/**
 * 還沒重寫成新版、照原樣上線的檔案（相對於 repo 根目錄，網站上的路徑相同）。
 * 舊版工具換成新版後從這裡拿掉（P10 收尾時清空）。
 */
const STATIC_PATHS = ['tools/trpg-lab', 'tools/anime-rig', 'tools/jizura', 'assets/i18n.js'];

export default defineConfig({
  root: srcDir,
  /* 相對路徑：頁面放在 GitHub Pages 子路徑（/toolkit/next/<id>/）也能跑；建置完 dist/ 就是整個網站 */
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
    assembleSite({
      repoRoot,
      distDir,
      assetsDir: ASSETS_DIR,
      tools: TOOLS,
      staticPaths: STATIC_PATHS,
    }),
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
      /*
       * 首頁：web/src/index.html → dist/index.html（發布到 repo 根目錄的 index.html）；
       * 每個工具一頁：web/src/tools/<id>/index.html → dist/tools/<id>/index.html
       */
      input: {
        index: path.join(srcDir, 'index.html'),
        ...Object.fromEntries(
          TOOLS.map((t) => [t.id, path.join(srcDir, 'tools', t.id, 'index.html')]),
        ),
      },
    },
  },
});
