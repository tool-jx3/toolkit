/**
 * 元件展示頁「轉場與動態」分頁（G2 共用層）的端對端測試：
 * - 分頁、三個預覽（轉場、圖片動態、版面吸附）、濾鏡與動態切換都沒有 pageerror／console error；
 * - 效果卡片：←→／Home／End 選取、可取消選取（再點一次、空白鍵）；
 * - Transport：預覽速度、影格表逐格；Stage 的示意場景背景；
 * - 匯出：影格表（每格 1 ÷ FPS、停留加在最後一格）的 APNG 與動態 WebP，拖回「動畫圖檔解碼」拆格；
 *   預估列與處理量上限；
 * - 節點表：新增、刪除、整理；
 * - 版面吸附：拖曳時出現吸附參考線、中心吸到畫布中線；
 * - 390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('_gallery') ?? { id: '_gallery', status: 'next' })}/`;

async function openG2(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + query);
  await page.getByRole('tab', { name: '轉場與動態' }).click();
  await expect(page.getByRole('tab', { name: '轉場與動態' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('g2-transition-canvas')).toBeVisible();
  return errors;
}

const view = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: '轉場與動態預覽' })
    .getByRole('radio', { name, exact: true })
    .click();

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function exportAndDownload(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click();
  const card = page.getByTestId('export-result').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return { name: download.suggestedFilename(), path: await download.path() };
}

/** 畫布有沒有畫東西（不是全透明） */
const canvasPainted = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) return true;
    return false;
  });

test.describe('元件展示頁：轉場與動態', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('三個預覽、濾鏡與動態切換都沒有錯誤', async ({ page }) => {
    const errors = await openG2(page);
    await expect(page.getByRole('radio', { name: '示意場景（只供預覽）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect.poll(() => canvasPainted(page, 'g2-transition-canvas')).toBe(true);
    /* 換形狀與曲線 */
    await page.getByRole('radio', { name: /^六角格/ }).click();
    await page.getByRole('radio', { name: '心跳' }).click();
    await expect(page.getByTestId('g2-frame-info')).toContainText('格');
    /* 濾鏡 → 預覽換到圖片動態 */
    await page
      .getByRole('radiogroup', { name: '濾鏡' })
      .getByRole('radio', { name: '黃昏' })
      .click();
    await expect(page.getByTestId('g2-motion-canvas')).toBeVisible();
    await expect.poll(() => canvasPainted(page, 'g2-motion-canvas')).toBe(true);
    for (const m of ['震動', '水波', '交叉溶接', '擦除', '硬切', '推近轉黑']) {
      await page
        .getByRole('radiogroup', { name: '圖片動態' })
        .getByRole('radio', { name: new RegExp(`^${m}`) })
        .click();
    }
    await page
      .getByRole('radiogroup', { name: '濾鏡' })
      .getByRole('radio', { name: '粗顆粒' })
      .click();
    await view(page, '版面吸附');
    await expect(page.getByTestId('layout-editor')).toBeVisible();
    await view(page, '轉場');
    await expect(page.getByTestId('g2-transition-canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('效果卡片：鍵盤選取、可取消選取', async ({ page }) => {
    const errors = await openG2(page);
    const shapes = page.getByRole('radiogroup', { name: '轉場形狀' });
    const circle = shapes.getByRole('radio', { name: /^圓形/ });
    await expect(circle).toHaveAttribute('aria-checked', 'true');
    await circle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(shapes.getByRole('radio', { name: /^圖形/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(shapes.getByRole('radio', { name: /^圖形/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(shapes.getByRole('radio', { name: /^方塊雨/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Home');
    await expect(shapes.getByRole('radio', { name: /^整片/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 只有一張可 Tab 聚焦 */
    await expect(shapes.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
    /* 濾鏡可以取消 */
    const filters = page.getByRole('radiogroup', { name: '濾鏡' });
    const mono = filters.getByRole('radio', { name: '黑白' });
    await mono.click();
    await expect(page.getByTestId('g2-filter-current')).toHaveText('目前：黑白');
    await mono.click();
    await expect(page.getByTestId('g2-filter-current')).toHaveText('目前：無濾鏡');
    await mono.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('g2-filter-current')).toHaveText('目前：暖褐');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('g2-filter-current')).toHaveText('目前：無濾鏡');
    expect(errors).toEqual([]);
  });

  test('預覽速度、影格表逐格、停在指定時間', async ({ page }) => {
    const errors = await openG2(page, '?g2pause=0.3');
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    const info = page.getByTestId('g2-frame-info');
    /* 0.8 秒 × 24 FPS：0.3 秒在第 8 格（每格 1/24 秒） */
    await expect(info).toContainText('第 8／');
    const slider = page.getByRole('slider', { name: '時間軸' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(info).toContainText('第 9／');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(info).toContainText('第 7／');
    const rate = page.getByRole('spinbutton', { name: '預覽速度' });
    await expect(rate).toHaveValue('1');
    await rate.fill('2.5');
    await rate.press('Enter');
    await expect(rate).toHaveValue('2.5');
    expect(errors).toEqual([]);
  });

  test('匯出 APNG 與動態 WebP（影格表），再拖回解碼', async ({ page }) => {
    const errors = await openG2(page);
    const estimate = page.getByTestId('export-estimate');
    /* 0.8 秒 × 24 FPS → 19 格（第 1 格 0%、最後一格 100%），每格 1/24 秒，最後一格加停留 0.5 秒 */
    await expect(estimate).toContainText('1.29 秒 · 19 格');
    await page.getByRole('radio', { name: 'APNG', exact: true }).click();
    const apng = await exportAndDownload(page, '匯出 APNG');
    expect(apng.name).toBe('轉場示範.png');
    const info = parseApng(new Uint8Array(readFileSync(apng.path)));
    expect(info.frames.length).toBeGreaterThan(1);
    expect(info.frames.length).toBeLessThanOrEqual(19);
    const delays = info.frames.map((f) => (f.delayNum / f.delayDen) * 1000);
    expect(Math.abs(delays.reduce((a, b) => a + b, 0) - (19 * 1000) / 24 - 500)).toBeLessThan(2);
    expect(delays.at(-1)).toBeGreaterThanOrEqual(500);
    /* 拖回解碼 */
    const input = page.getByRole('group', { name: '動畫圖檔' }).locator('input[type="file"]');
    await input.setInputFiles({
      name: apng.name,
      mimeType: 'image/png',
      buffer: readFileSync(apng.path),
    });
    await expect(page.getByTestId('g2-decode-meta').first()).toContainText(
      `APNG・480×270・${info.frames.length} 格・1.29 秒`,
    );
    await page.getByRole('radio', { name: 'WebP', exact: true }).click();
    const webp = await exportAndDownload(page, '匯出 WebP');
    expect(webp.name).toBe('轉場示範.webp');
    await input.setInputFiles({
      name: webp.name,
      mimeType: 'image/webp',
      buffer: readFileSync(webp.path),
    });
    await expect(page.getByTestId('g2-decode-summary')).toContainText('2 個檔案');
    await expect(page.getByTestId('g2-decode-meta').nth(1)).toContainText('WebP・480×270・');
    await expect(page.getByTestId('g2-decode-meta').nth(1)).toContainText('1.29 秒');
    expect(errors).toEqual([]);
  });

  test('預估列與處理量上限', async ({ page }) => {
    const errors = await openG2(page);
    await page.getByRole('radio', { name: '1920 × 1080' }).click();
    await expect(page.getByTestId('export-over-budget')).toHaveCount(0);
    /* 5 秒、30 FPS、來回 → 299 格 × 1920 × 1080 > 2 億 2 千萬 */
    const duration = page.getByRole('slider', { name: '轉場時間' });
    await duration.focus();
    await page.keyboard.press('End');
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '30 FPS' }).click();
    await page.getByRole('switch', { name: '來回' }).click();
    await expect(page.getByTestId('export-estimate')).toContainText('299 格');
    await expect(page.getByTestId('export-over-budget')).toBeVisible();
    await expect(page.getByRole('button', { name: /^匯出 / })).toBeDisabled();
    await page.getByRole('radio', { name: '480 × 270' }).click();
    await expect(page.getByTestId('export-over-budget')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('節點表：新增、刪除、整理', async ({ page }) => {
    const errors = await openG2(page);
    const count = page.getByTestId('keyframe-count');
    await expect(count).toHaveText('4／16 個節點');
    await page.getByRole('button', { name: '新增節點' }).click();
    await expect(count).toHaveText('5／16 個節點');
    await page.getByRole('button', { name: '刪除第 2 個節點' }).click();
    await expect(count).toHaveText('4／16 個節點');
    /* 第 2 個節點的時間打成比第 3 個大，離開欄位後重新排序 */
    const t2 = page.getByRole('spinbutton', { name: '第 2 個節點的時間（秒）' });
    await t2.fill('2.6');
    await t2.press('Tab');
    await expect(page.getByRole('spinbutton', { name: '第 3 個節點的時間（秒）' })).toHaveValue(
      '2.6',
    );
    await expect(page.getByTestId('keyframe-summary')).toContainText('0 秒 0%');
    await page.getByRole('button', { name: '恢復預設節點' }).click();
    await expect(page.getByTestId('keyframe-summary')).toContainText('1 秒 30%');
    expect(errors).toEqual([]);
  });

  test('版面吸附：拖曳時出現參考線、中心吸到畫布中線', async ({ page }) => {
    const errors = await openG2(page);
    await view(page, '版面吸附');
    const editor = page.getByTestId('layout-editor');
    await expect(editor).toBeVisible();
    const summary = page.getByTestId('g2-snap-summary');
    await expect(summary).toContainText('選取：進度條');
    /* 角色（中心 320,152）往右拖 40 px（畫面座標）再拖回接近中線 → 吸到 320 */
    const box = await editor.boundingBox();
    if (!box) throw new Error('找不到版面編輯層');
    const k = box.width / 640;
    const sx = box.x + 320 * k;
    const sy = box.y + 152 * k;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 60, sy, { steps: 6 });
    await page.mouse.move(sx + 5, sy, { steps: 6 });
    await expect(page.getByTestId('layout-snap')).toBeVisible();
    await page.mouse.up();
    await expect(summary).toContainText('選取：角色｜中心 (320,');
    /* 關掉吸附：同樣的拖曳停在偏離中線的位置 */
    await page.getByRole('switch', { name: '吸附畫布' }).click();
    await page.getByRole('switch', { name: '吸附其他元素' }).click();
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 60, sy, { steps: 6 });
    await page.mouse.move(sx + 5, sy, { steps: 6 });
    await page.mouse.up();
    await expect(summary).not.toContainText('中心 (320,');
    expect(errors).toEqual([]);
  });
});

test('轉場與動態：390 寬沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openG2(page);
  await noHorizontalScroll(page);
  for (const v of ['圖片動態', '版面吸附', '轉場']) {
    await view(page, v);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
