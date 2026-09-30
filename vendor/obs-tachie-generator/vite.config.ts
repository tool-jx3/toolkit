/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TRPG Toolkit 收錄版的設定。
// - base: './'   … 合輯放在 GitHub Pages 的子路徑底下，一律用相對路徑
//                  （上游是在 Pages 建置時以 VITE_BASE 覆寫，未指定時為 '/'）。
// - outDir       … 合輯發佈的是 tools/obs-tachie/。emptyOutDir: false，
//                  才不會刪掉放在同一處的 i18n.obs-tachie.js 與 LICENSE。
// - 輸出檔名固定 … 帶雜湊的話每次建置都會多出差異與殘檔。
// - server.fs    … 測試的 setup.ts 以 ?raw 讀取字典
//                  （../../tools/obs-tachie/i18n.obs-tachie.js），因此把 repo 根目錄加進允許清單。
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../tools/obs-tachie',
    emptyOutDir: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: { fs: { allow: ['../..'] } },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
