import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/* 使用系統預裝的 Chromium（不執行 playwright install）；@playwright/test 版本鎖在 1.56.1 與之相容 */
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const webDir = path.dirname(fileURLToPath(import.meta.url));
/* 多個工作樹同時跑 e2e 時用 E2E_PORT 錯開（reuseExistingServer 會沿用同一個 port 上別人的伺服器） */
const PORT = Number(process.env.E2E_PORT ?? 8123);

export default defineConfig({
  testDir: 'tests/e2e',
  /* 視覺回歸基準圖：web/tests/__screenshots__/<名稱>.png */
  snapshotPathTemplate: '{testDir}/../__screenshots__/{arg}{ext}',
  outputDir: 'test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    /* 容器沒有設定語系時，Chromium 會把中文下載檔名換成「download」 */
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
  },
  /* 測的是建置產物：dist/（整個網站，與 GitHub Pages 上的路徑相同）用 http-server 開；先 npm run build */
  webServer: {
    command: `npx http-server dist -p ${PORT} -c-1 -s`,
    cwd: webDir,
    url: `http://127.0.0.1:${PORT}/next/_gallery/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
