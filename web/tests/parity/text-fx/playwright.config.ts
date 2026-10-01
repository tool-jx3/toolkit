/**
 * text-fx 對等驗證（舊版 tools/text-fx/ ↔ 新版 next/text-fx/）。
 *
 *   cd web && npm run build && E2E_PORT=8133 npx playwright test -c tests/parity/text-fx/playwright.config.ts
 *
 * 結果寫到 tests/parity/text-fx/out/（results.json、report.md、差異圖；不提交）。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../..');
const PORT = Number(process.env.E2E_PORT ?? 8133);

export default defineConfig({
  testDir: here,
  testMatch: /parity\.spec\.ts$/,
  outputDir: path.join(webDir, 'test-results', 'parity-text-fx'),
  timeout: 30 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
  },
  webServer: {
    command: `npx http-server .. -p ${PORT} -c-1 -s`,
    cwd: webDir,
    url: `http://127.0.0.1:${PORT}/next/text-fx/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
