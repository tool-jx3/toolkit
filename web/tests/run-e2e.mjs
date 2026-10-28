/**
 * 端對端測試分兩段跑（playwright.config.ts 的兩個專案）：
 * 1. main：一般的測試，平行跑；
 * 2. serial：標 @serial 的（量時間、吃重的），main 跑完後一個一個跑，不和其他測試搶 CPU。
 * 額外的參數（檔案、-g、--update-snapshots 等）兩段都用；任何一段失敗就以 1 結束。
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let failed = false;
for (const project of ['main', 'serial']) {
  const { status } = spawnSync(
    'npx',
    ['playwright', 'test', `--project=${project}`, '--pass-with-no-tests', ...args],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
