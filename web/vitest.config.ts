import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const webDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(webDir, 'src') },
  },
  test: {
    root: webDir,
    include: ['tests/unit/**/*.test.ts', 'tests/components/**/*.test.tsx'],
    /* 核心模組在 Node 跑；元件測試的檔案開頭用 `@vitest-environment jsdom` 切換 */
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    /* 預設會把 CSS 變成空字串；token 測試要讀 tokens.css 的原文 */
    css: { include: [/tokens\.css/] },
    testTimeout: 20000,
  },
});
