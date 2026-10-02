/**
 * 元件展示頁「文字演出」分頁（G1 共用層）的端對端測試：
 * - 分頁、三種示範動畫、縮圖選項、各區塊都沒有 pageerror／console error；
 * - PathPad：滑鼠與觸控畫線（最小點距、離開繪製區就結束）、預設形狀；
 * - 影格表匯出：鎖定 FPS、每格延遲與停留格（解析 APNG／GIF）、多檔結果（全部下載、打包成 ZIP）；
 * - 循環加工：色數、用途上限與自動縮小、GIF 底色合成（整張不透明）；
 * - 390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('_gallery') ?? { id: '_gallery', status: 'next' })}/`;

async function openG1(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await page.getByRole('tab', { name: '文字演出' }).click();
  await expect(page.getByRole('tab', { name: '文字演出' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('g1-canvas')).toBeVisible();
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const mode = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: '示範動畫' }).getByRole('radio', { name }).click();

async function exportAndDownload(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click();
  const card = page.getByTestId('export-result').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: readFileSync(await download.path()),
    card,
  };
}

test.describe('文字演出分頁', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('三種示範動畫、縮圖選項與各區塊都沒有錯誤', async ({ page }) => {
    const errors = await openG1(page);
    for (const m of ['循環加工', '卡拉 OK', '打字（影格表）']) {
      await mode(page, m);
      await expect(page.getByTestId('g1-canvas')).toBeVisible();
    }
    /* 文字樣式縮圖：每一種都選一次（停留時播放） */
    const styles = page.getByRole('radiogroup', { name: '文字樣式' });
    for (const name of ['立體擠出', '霓虹發光', '硬陰影', '貼紙', '色差', '斜紋填色', '挖空']) {
      const item = styles.getByRole('radio', { name });
      await item.hover();
      await item.click();
      await expect(item).toHaveAttribute('aria-checked', 'true');
    }
    const fx = page.getByRole('radiogroup', { name: '特效' });
    for (const name of ['閃亮星星', '彩色碎紙', '擴散圓環', '無']) {
      await fx.getByRole('radio', { name }).click();
    }
    /* 用途檢查：Discord 伺服器貼圖時文字太多 → 警告 */
    await page.getByRole('radio', { name: 'Discord 伺服器貼圖' }).click();
    await page
      .getByRole('textbox', { name: '文字', exact: true })
      .nth(1)
      .fill('這段文字比建議字數還要長');
    await expect(page.getByRole('status', { name: '用途檢查' })).toContainText('字數超過');
    /* 進階設定開關記在瀏覽器裡 */
    await page.getByRole('switch', { name: '顯示進階設定（記在瀏覽器）' }).click();
    await expect(page.getByRole('slider', { name: '影格數' })).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: '文字演出' }).click();
    await expect(page.getByRole('switch', { name: '顯示進階設定（記在瀏覽器）' })).toBeChecked();
    /* 配色對：新增與刪除 */
    await page.getByRole('button', { name: '新增配色' }).click();
    await expect(page.getByRole('button', { name: '刪除配色「自訂」' })).toBeVisible();
    await page.getByRole('button', { name: '刪除配色「自訂」' }).click();
    await expect(page.getByRole('button', { name: '刪除配色「自訂」' })).toHaveCount(0);
    /* 分享連結來回 */
    await page.getByRole('button', { name: '產生分享連結' }).click();
    await expect(page.getByRole('textbox', { name: '分享連結' })).toHaveValue(/#s=/);
    await page.getByRole('button', { name: '從連結還原' }).click();
    expect(errors).toEqual([]);
  });

  test('PathPad：滑鼠畫線、離開繪製區就結束；預設形狀', async ({ page }) => {
    const errors = await openG1(page);
    const pad = page.getByTestId('path-pad');
    await pad.scrollIntoViewIfNeeded();
    await expect(pad).toHaveAttribute('data-points', '126');
    await page.getByRole('radio', { name: '自由繪製' }).click();
    await page.getByRole('button', { name: '清除' }).click();
    await expect(page.getByTestId('path-pad-hint')).toHaveText('請在這裡畫線');
    const box = (await pad.boundingBox())!;
    const at = (fx: number, fy: number) =>
      [box.x + box.width * fx, box.y + box.height * fy] as const;
    await page.mouse.move(...at(0.2, 0.5));
    await page.mouse.down();
    for (let i = 1; i <= 20; i++)
      await page.mouse.move(...at(0.2 + i * 0.03, 0.5 + Math.sin(i / 3) * 0.2));
    /* 很小的移動（< 2 邏輯 px）不加點 */
    await page.mouse.move(...at(0.8 + 0.0005, 0.5 + Math.sin(20 / 3) * 0.2));
    await page.mouse.up();
    await expect(pad).toHaveAttribute('data-points', '21');
    await expect(page.getByTestId('path-pad-hint')).toHaveCount(0);
    /* 起訖對調後點數不變 */
    await page.getByRole('button', { name: '起訖對調' }).click();
    await expect(pad).toHaveAttribute('data-points', '21');
    /* 按著拖出繪製區：離開時就結束，再進來不會接續 */
    await page.mouse.move(...at(0.5, 0.5));
    await page.mouse.down();
    await page.mouse.move(...at(0.6, 0.5));
    await page.mouse.move(box.x + box.width + 30, box.y + box.height / 2);
    await page.mouse.move(...at(0.9, 0.9));
    await page.mouse.up();
    await expect(pad).toHaveAttribute('data-points', '2');
    /* 預設形狀 */
    await page.getByRole('radio', { name: '螺旋' }).click();
    await expect(pad).toHaveAttribute('data-points', '377');
    await expect(page.getByTestId('path-info')).toContainText('377 點');
    expect(errors).toEqual([]);
  });

  test('影格表匯出：鎖定 FPS，每格延遲與停留格照表', async ({ page }) => {
    const errors = await openG1(page);
    await expect(page.getByTestId('export-fixed-fps')).toHaveText('12 fps');
    const text = page.getByRole('textbox', { name: '文字', exact: true }).first();
    await text.fill('早安\n한');
    /* 早、安、換行、ㅎ、하、한 → 6 格 */
    const apng = await exportAndDownload(page, '匯出 APNG');
    expect(apng.name).toBe('打字示範.png');
    const info = parseApng(new Uint8Array(apng.bytes));
    const delays = info.frames.map((f) => (f.delayNum / f.delayDen) * 1000);
    const total = delays.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(5 * (1000 / 12) + 1500, 0);
    expect(delays.at(-1)).toBeGreaterThanOrEqual(1500);
    for (const d of delays.slice(0, -1)) expect([83, 84, 167]).toContain(Math.round(d));
    await page.getByRole('radio', { name: 'GIF', exact: true }).click();
    const gif = await exportAndDownload(page, '匯出 GIF');
    const g = parseGif(new Uint8Array(gif.bytes));
    expect(g.frames.reduce((a, f) => a + f.delayCs, 0)).toBe(
      Math.round((5 * 1000) / 12 / 10 + 150),
    );
    expect(g.frames.at(-1)?.delayCs).toBeGreaterThanOrEqual(150);
    expect(errors).toEqual([]);
  });

  test('多檔結果：分段匯出兩個檔案，全部下載與打包成 ZIP', async ({ page }) => {
    const errors = await openG1(page);
    await page.getByRole('switch', { name: '分段匯出（多檔）' }).click();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    const batch = page.getByTestId('export-batch');
    await expect(batch).toBeVisible({ timeout: 60_000 });
    await expect(batch).toContainText('共 2 個檔案');
    await expect(batch.getByTestId('export-result')).toHaveCount(2);
    const names: string[] = [];
    page.on('download', (d) => names.push(d.suggestedFilename()));
    await batch.getByRole('button', { name: '全部下載' }).click();
    await expect.poll(() => names.length, { timeout: 10_000 }).toBe(2);
    expect(names[0]).toMatch(/^1_早安，\.png$/);
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      batch.getByRole('button', { name: '打包成 ZIP' }).click(),
    ]);
    expect(zip.suggestedFilename()).toBe('打字示範_分段.zip');
    const entries = Object.keys(unzipSync(new Uint8Array(readFileSync(await zip.path()))));
    expect(entries).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test('循環加工：用途上限與自動縮小、GIF 底色合成', async ({ page }) => {
    const errors = await openG1(page);
    await mode(page, '循環加工');
    await page.getByRole('switch', { name: '顯示進階設定（記在瀏覽器）' }).click();
    /* Discord 伺服器貼圖（上限 512,000 位元組）、60 格、無損 → 超過上限 */
    await page.getByRole('radio', { name: 'Discord 伺服器貼圖' }).click();
    await page.getByRole('slider', { name: '影格數' }).focus();
    await page.keyboard.press('End');
    await page.getByRole('combobox', { name: '色數' }).click();
    await page.getByRole('option', { name: '無損（全彩）' }).click();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    const card = page.getByTestId('export-result');
    await expect(card).toBeVisible({ timeout: 90_000 });
    const limit = card.getByTestId('export-limit');
    await expect(limit).toContainText('500.0 KB');
    await expect(limit).toHaveAttribute('data-over', '');
    await card.getByRole('button', { name: '自動縮小檔案' }).click();
    await expect(page.getByTestId('export-shrink-note')).toHaveText('已降低：色數 無損 → 256 色');
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('combobox', { name: '色數' })).toHaveText('256 色');

    /* Discord 訊息附件：GIF 預設合成暗色底 → 整張不透明 */
    await page.getByRole('radio', { name: 'Discord 訊息附件' }).click();
    await page.getByRole('radio', { name: 'GIF', exact: true }).click();
    const gif = await exportAndDownload(page, '匯出 GIF');
    const g = parseGif(new Uint8Array(gif.bytes));
    expect(g.width).toBe(720);
    expect(g.frames.every((f) => f.transparentIndex === null)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('390 寬：文字演出分頁沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openG1(page);
    await noHorizontalScroll(page);
    for (const m of ['循環加工', '卡拉 OK']) {
      await mode(page, m);
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });

  test('觸控畫線', async ({ browser }) => {
    const ctx = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    const errors = await openG1(page);
    const pad = page.getByTestId('path-pad');
    await pad.scrollIntoViewIfNeeded();
    const box = (await pad.boundingBox())!;
    /* 以 CDP 送出觸控事件（拖曳），頁面不應捲動 */
    const cdp = await ctx.newCDPSession(page);
    const y0 = await page.evaluate(() => window.scrollY);
    const pt = (fx: number) => ({ x: box.x + box.width * fx, y: box.y + box.height / 2 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.2)] });
    for (let i = 1; i <= 10; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...pt(0.2 + i * 0.05), y: box.y + box.height / 2 - i * 4 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(pad).toHaveAttribute('data-points', '11');
    expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
