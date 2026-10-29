import type { FileChooser, Page } from '@playwright/test';

/**
 * 觸發選檔視窗並拿到它。
 *
 * page.waitForEvent('filechooser') 要求攔截選檔視窗時不等回覆。緊接著用按鍵或 page.mouse 觸發的話，
 * 少了 locator.click 的可操作性檢查那段時間，攔截可能還沒生效：Chromium 開了原生視窗又立刻取消，
 * 測試就一直等不到（平行跑、機器忙時偶爾發生）。這裡先開始等、和頁面來回一次，再觸發。
 */
export async function waitForFileChooser(
  page: Page,
  trigger: () => Promise<unknown>,
): Promise<FileChooser> {
  const chooser = page.waitForEvent('filechooser');
  await page.evaluate(() => 0);
  await trigger();
  return chooser;
}
