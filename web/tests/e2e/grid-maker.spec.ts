/**
 * 網格產生器（建置產物 next/grid-maker/）的端對端測試：
 * - 開頁沒有錯誤；頁尾只放靈感來源；方格的預設值、尺寸、檔名；
 * - 方格的控制項：欄列、大小、線寬、線型、發光、縮小、圓角、座標的開關與各選項（停用條件）；
 * - 六角格：預設、方向、網格化（檔名、CCFOLIA 的大小）、錯開、外圈、列的算法（流水號時固定壓縮）；
 * - 形狀切換時各自保留設定；
 * - 匯出：檔名、8-bit RGBA、尺寸、與預覽逐像素相同、像素抽查（線落在格子邊界上、透明背景）；
 * - 自動保存與復原；畫布太大；舊版沒有存檔（不搬移）；
 * - 1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Settings } from '../../src/tools/grid-maker/settings';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('grid-maker') ?? { id: 'grid-maker', status: 'next' })}/`;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '網格產生器' })).toBeVisible();
  return errors;
}

const state = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __gridMaker: { useSettings: { getState: () => { data: Settings } } };
        }
      ).__gridMaker.useSettings.getState().data,
  );
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const spin = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const toggle = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const sizeText = (page: Page) => page.getByTestId('canvas-size');
const fileText = (page: Page) => page.getByTestId('file-name');
const canvas = (page: Page) => page.getByTestId('grid-canvas');

async function commit(box: Locator, value: string) {
  await box.fill(value);
  await box.press('Enter');
}

async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, bitDepth, colorType } = readIhdr(chunks);
  expect([bitDepth, colorType], '8-bit RGBA').toEqual([8, 6]);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

async function exportPng(page: Page): Promise<{ name: string; px: PixelBuffer }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
  return { name: dl.suggestedFilename(), px: pngPixels(readFileSync((await dl.path()) as string)) };
}

async function canvasPixels(page: Page): Promise<PixelBuffer> {
  const r = await canvas(page).evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let bin = '';
    for (let i = 0; i < data.length; i += 0x8000)
      bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: c.width, height: c.height, b64: btoa(bin) };
  });
  return { width: r.width, height: r.height, data: new Uint8Array(Buffer.from(r.b64, 'base64')) };
}

const at = (px: PixelBuffer, x: number, y: number) => {
  const i = (y * px.width + x) * 4;
  return Array.from(px.data.slice(i, i + 4));
};

test('開頁：方格的預設、頁尾只放靈感來源、舊版沒有存檔', async ({ page }) => {
  /* 舊版的頁面不保存設定：開頁前 localStorage 沒有任何舊鍵，新版照預設開 */
  const errors = await open(page);
  await expect(radio(page, '方格')).toHaveAttribute('aria-checked', 'true');
  await expect(sizeText(page)).toHaveText('720 × 720 px');
  await expect(fileText(page)).toHaveText('檔名：grid_15x15_48px.png');
  await expect(spin(page, '欄數（橫）')).toHaveValue('15');
  await expect(spin(page, '列數（縱）')).toHaveValue('15');
  await expect(spin(page, '格子大小')).toHaveValue('48');
  await expect(toggle(page, '顯示座標')).toBeChecked();
  await expect(radio(page, '中')).toHaveAttribute('aria-checked', 'true');
  await expect(spin(page, '邊緣偏移')).toBeDisabled();
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/ihoukentiku/ihoukentiku.github.io',
  );
  expect(errors).toEqual([]);
});

test('方格的控制項與匯出', async ({ page }) => {
  const errors = await open(page);
  /* 欄列、大小 → 畫布尺寸與檔名 */
  await commit(spin(page, '欄數（橫）'), '7');
  await commit(spin(page, '列數（縱）'), '5');
  await commit(spin(page, '格子大小'), '60');
  await expect(sizeText(page)).toHaveText('420 × 300 px');
  await expect(fileText(page)).toHaveText('檔名：grid_7x5_60px.png');
  /* 範圍外夾回（舊版只限下限） */
  await commit(spin(page, '欄數（橫）'), '5000');
  await expect(spin(page, '欄數（橫）')).toHaveValue('1000');
  await commit(spin(page, '欄數（橫）'), '7');

  /* 匯出：與預覽逐像素相同；線落在格子邊界上（線寬 2：x＝59～60 是線）、格子中央以外透明 */
  await toggle(page, '顯示座標').click();
  await expect(spin(page, '文字大小')).toBeDisabled();
  const out = await exportPng(page);
  expect(out.name).toBe('grid_7x5_60px.png');
  expect([out.px.width, out.px.height]).toEqual([420, 300]);
  expect(Buffer.from(out.px.data).equals(Buffer.from((await canvasPixels(page)).data))).toBe(true);
  expect(at(out.px, 59, 30)).toEqual([0, 229, 255, 255]);
  expect(at(out.px, 60, 30)).toEqual([0, 229, 255, 255]);
  expect(at(out.px, 30, 30)).toEqual([0, 0, 0, 0]);
  await expect(page.getByTestId('status-text')).toHaveText('已匯出 grid_7x5_60px.png');

  /* 線寬 1：落在整數座標，是 2 px 寬的半透明線 */
  await commit(spin(page, '線寬'), '1');
  let px = await canvasPixels(page);
  expect(at(px, 59, 30)[3]).toBeGreaterThan(100);
  expect(at(px, 59, 30)[3]).toBeLessThan(140);
  expect(Math.abs(at(px, 60, 30)[3] - at(px, 59, 30)[3])).toBeLessThanOrEqual(1);

  /* 虛線：線上有空隙；發光：線旁邊有光暈 */
  await commit(spin(page, '線寬'), '2');
  await radio(page, '虛線').click();
  px = await canvasPixels(page);
  const column = Array.from({ length: 60 }, (_, y) => at(px, 60, y)[3]);
  expect(column.some((a) => a === 0)).toBe(true);
  expect(at(px, 66, 5)).toEqual([0, 0, 0, 0]);
  await toggle(page, '發光').click();
  px = await canvasPixels(page);
  expect(at(px, 66, 5)[3]).toBeGreaterThan(0);
  await toggle(page, '發光').click();
  await radio(page, '實線').click();

  /* 縮小 80%：格子邊界上沒有線，線在 6 px 內側 */
  await commit(spin(page, '縮小比例'), '80');
  px = await canvasPixels(page);
  expect(at(px, 60, 30)).toEqual([0, 0, 0, 0]);
  expect(at(px, 66, 30)[3]).toBe(255);
  /* 圓角：角落不畫 */
  await commit(spin(page, '縮小比例'), '100');
  await commit(spin(page, '圓角'), '20');
  px = await canvasPixels(page);
  expect(at(px, 60, 60)).toEqual([0, 0, 0, 0]);
  expect(at(px, 60, 90)[3]).toBe(255);
  expect(errors).toEqual([]);
});

test('座標：格式、起點、起始編號、位置與偏移（停用條件）', async ({ page }) => {
  const errors = await open(page);
  await commit(spin(page, '欄數（橫）'), '3');
  await commit(spin(page, '列數（縱）'), '2');
  const blank = async () => {
    const px = await canvasPixels(page);
    let n = 0;
    for (let i = 3; i < px.data.length; i += 4) if (px.data[i]) n++;
    return n;
  };
  const before = await blank();
  await pick(page, '格式', '流水號');
  await expect.poll(async () => (await state(page)).square.coordFormat).toBe('serial');
  await radio(page, '右下').click();
  await radio(page, '從 1').click();
  await radio(page, '上').click();
  await expect(spin(page, '邊緣偏移')).toBeEnabled();
  await commit(spin(page, '邊緣偏移'), '-3');
  await commit(spin(page, '文字大小'), '20');
  const s = (await state(page)).square;
  expect([s.coordOrigin, s.coordStart, s.coordPos, s.coordOffset, s.coordFontSize]).toEqual([
    'br',
    1,
    'top',
    -3,
    20,
  ]);
  expect(await blank()).not.toBe(before);
  /* 關閉座標：文字消失、選項停用 */
  await toggle(page, '顯示座標').click();
  await expect(page.getByRole('combobox', { name: '格式' })).toBeDisabled();
  await expect(radio(page, '右下')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('六角格：預設、方向、網格化、錯開、外圈、列的算法；形狀各自保留設定', async ({ page }) => {
  const errors = await open(page);
  await commit(spin(page, '欄數（橫）'), '9');
  await radio(page, '六角格').click();
  await expect(sizeText(page)).toHaveText('637 × 528 px');
  await expect(fileText(page)).toHaveText('檔名：hex.png');
  await expect(spin(page, '列數（縱）')).toHaveValue('21');
  await expect(radio(page, '下')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ccfolia-size')).toHaveCount(0);

  await radio(page, '直向（尖頂）').click();
  await expect(sizeText(page)).toHaveText('384 × 887 px');
  await toggle(page, '用於 CCFOLIA（網格化）').click();
  await expect(sizeText(page)).toHaveText('384 × 1056 px');
  await expect(fileText(page)).toHaveText('檔名：hex_16x42.png');
  await radio(page, '橫向（平頂）').click();
  await expect(sizeText(page)).toHaveText('768 × 528 px');
  await expect(page.getByTestId('ccfolia-size')).toHaveText('CCFOLIA 的大小：30 × 22');

  /* 錯開、外圈：畫面改變 */
  const a = await canvasPixels(page);
  await toggle(page, '錯開第 1 欄').click();
  const b = await canvasPixels(page);
  expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false);
  /* 外圈：左上角（原本空白）有線 */
  expect(at(b, 2, 2)[3]).toBe(0);
  await toggle(page, '繪製外圈六角格').click();
  const c = await canvasPixels(page);
  let edge = 0;
  for (let y = 0; y < 40; y++) edge += at(c, 1, y)[3] ? 1 : 0;
  expect(edge).toBeGreaterThan(0);

  /* 列的算法：流水號時停用、固定為壓縮 */
  await radio(page, '以半列計').click();
  expect((await state(page)).hex.rowMode).toBe('half');
  await pick(page, '格式', '流水號');
  await expect(radio(page, '壓縮')).toBeDisabled();
  await expect(radio(page, '壓縮')).toHaveAttribute('aria-checked', 'true');
  expect((await state(page)).hex.rowMode).toBe('compress');
  await pick(page, '格式', 'A1');
  await expect(radio(page, '壓縮')).toBeEnabled();
  await expect(radio(page, '壓縮')).toHaveAttribute('aria-checked', 'true');

  /* 匯出檔名 */
  const out = await exportPng(page);
  expect(out.name).toBe('hex_30x22.png');
  expect([out.px.width, out.px.height]).toEqual([768, 528]);

  /* 切回方格：方格的設定還在；再切回六角格也是 */
  await radio(page, '方格').click();
  await expect(spin(page, '欄數（橫）')).toHaveValue('9');
  await expect(radio(page, '中')).toHaveAttribute('aria-checked', 'true');
  await radio(page, '六角格').click();
  await expect(toggle(page, '用於 CCFOLIA（網格化）')).toBeChecked();
  await expect(spin(page, '欄數（橫）')).toHaveValue('15');
  expect(errors).toEqual([]);
});

test('自動保存、復原／重做、快捷鍵 D、畫布太大', async ({ page }) => {
  const errors = await open(page);
  await commit(spin(page, '格子大小'), '30');
  await radio(page, '六角格').click();
  await page.reload();
  await expect(radio(page, '六角格')).toHaveAttribute('aria-checked', 'true');
  await radio(page, '方格').click();
  await expect(sizeText(page)).toHaveText('450 × 450 px');

  await page.waitForTimeout(450);
  await commit(spin(page, '欄數（橫）'), '4');
  await expect(sizeText(page)).toHaveText('120 × 450 px');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(sizeText(page)).toHaveText('450 × 450 px');
  await page.keyboard.press('Control+Shift+z');
  await expect(sizeText(page)).toHaveText('120 × 450 px');
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect(sizeText(page)).toHaveText('450 × 450 px');

  /* 全部重設之後也能復原（對等驗證後修正） */
  await page.waitForTimeout(450);
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect(sizeText(page)).toHaveText('720 × 720 px');
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect(sizeText(page)).toHaveText('450 × 450 px');

  /* D 匯出 */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('d')]);
  expect(dl.suggestedFilename()).toBe('grid_15x15_30px.png');

  /* 畫布太大 */
  await commit(spin(page, '欄數（橫）'), '1000');
  await commit(spin(page, '格子大小'), '48');
  await expect(page.getByTestId('too-large')).toContainText('48000 × 720');
  await expect(btn(page, '匯出 PNG')).toBeDisabled();
  await commit(spin(page, '欄數（橫）'), '15');
  await expect(page.getByTestId('too-large')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('元件展示頁：格子幾何（core/grid）的示範', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto('/next/_gallery/');
  await page.getByRole('tab', { name: '模組' }).click();
  const demo = page.getByRole('img', { name: /格子幾何的示範/ });
  await demo.scrollIntoViewIfNeeded();
  const box = await demo.boundingBox();
  if (!box) throw new Error('沒有示範畫布');
  const info = page.getByTestId('grid-demo-info');
  await expect(info).toContainText('起點 (2, 1)');
  /* 點左上角附近：平頂六角格 (0, 0)；滑過時顯示到起點的距離 */
  await page.mouse.click(box.x + (28 * box.width) / 320, box.y + (16 * box.height) / 200);
  await expect(info).toContainText('起點 (0, 0)');
  await expect(info).toContainText('距離 0 格');
  await page.getByRole('radio', { name: '方格', exact: true }).click();
  await page.mouse.move(box.x + (100 * box.width) / 320, box.y + (40 * box.height) / 200);
  await expect(info).toContainText('滑鼠所在 (3, 1)');
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('grid-maker-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await radio(page, '六角格').click();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('grid-maker-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
