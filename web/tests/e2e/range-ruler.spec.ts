/**
 * 距離量尺產生器（建置產物 next/range-ruler/）的端對端測試：
 * - 開頁沒有錯誤；頁尾只放靈感來源；方格的預設、尺寸、檔名、配色；
 * - 範圍、算法、大小、配色（重建各距離的顏色）、各距離的顏色、不透明度、文字、描邊；
 * - 點格子開編輯面板：文字、顏色、大小、還原這一格、清除全部自訂、自訂格數；方向鍵與 Esc；
 * - 匯出：檔名、尺寸、與預覽逐像素相同、不含編輯中的醒目框、像素抽查；
 * - 六角格：預設使用網格、方向、直線、點擊判定；自訂格依形狀分開；
 * - 自動保存（含自訂格）、復原；1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Settings } from '../../src/tools/range-ruler/settings';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('range-ruler') ?? { id: 'range-ruler', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '距離量尺產生器' })).toBeVisible();
  return errors;
}

const state = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __rangeRuler: { useSettings: { getState: () => { data: Settings } } };
        }
      ).__rangeRuler.useSettings.getState().data,
  );
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const spin = (scope: Page | Locator, name: string) =>
  scope.getByRole('spinbutton', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const toggle = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const sizeText = (page: Page) => page.getByTestId('canvas-size');
const fileText = (page: Page) => page.getByTestId('file-name');
const canvas = (page: Page) => page.getByTestId('ruler-canvas');
const editor = (page: Page) => page.getByTestId('cell-editor');

async function commit(box: Locator, value: string) {
  await box.fill(value);
  await box.press('Enter');
}

async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
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

/** 點畫布上的某個畫布座標 */
async function clickCanvas(page: Page, x: number, y: number) {
  const c = canvas(page);
  const box = await c.boundingBox();
  const size = await c.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
  if (!box) throw new Error('沒有畫布');
  await page.mouse.click(box.x + (x * box.width) / size[0], box.y + (y * box.height) / size[1]);
}

/** 方格量尺（範圍 5、48 px）上 (dx, dy) 那一格的中心 */
const sq = (dx: number, dy: number, range = 5, cs = 48) =>
  [(dx + range) * cs + cs / 2, (dy + range) * cs + cs / 2] as const;

test('開頁：方格的預設、配色、頁尾只放靈感來源、舊版沒有存檔', async ({ page }) => {
  const errors = await open(page);
  await expect(radio(page, '方格')).toHaveAttribute('aria-checked', 'true');
  await expect(sizeText(page)).toHaveText('528 × 528 px');
  await expect(fileText(page)).toHaveText('檔名：grid_ruler_11x11.png');
  await expect(spin(page, '範圍')).toHaveValue('5');
  await expect(spin(page, '文字大小')).toHaveValue('24');
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');
  const s = (await state(page)).square;
  expect(s.distColors).toEqual(['#ffffff', '#ff6666', '#ecff66', '#66ff8c', '#66c6ff', '#b366ff']);
  /* 中心格是白色、距離 1 是 #ff6666、範圍外透明 */
  const px = await canvasPixels(page);
  expect(at(px, 250, 250)).toEqual([255, 255, 255, 255]);
  expect(at(px, 300, 250)).toEqual([255, 102, 102, 255]);
  expect(at(px, 10, 10)).toEqual([0, 0, 0, 0]);
  await expect(page.locator('footer').getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/ihoukentiku/ihoukentiku.github.io',
  );
  expect(errors).toEqual([]);
});

test('方格：範圍、算法、大小、配色與各距離的顏色、不透明度、文字與描邊', async ({ page }) => {
  const errors = await open(page);
  await commit(spin(page, '範圍'), '3');
  await expect(sizeText(page)).toHaveText('336 × 336 px');
  await expect(fileText(page)).toHaveText('檔名：grid_ruler_7x7.png');
  await pick(page, '距離計算', '切比雪夫');
  /* 切比雪夫：角落 (−3, −3) 也畫 */
  let px = await canvasPixels(page);
  expect(at(px, 10, 10)[3]).toBe(255);
  await commit(spin(page, '格子大小'), '30');
  await expect(sizeText(page)).toHaveText('210 × 210 px');

  /* 配色：暖色重建；自訂全部灰色 */
  await pick(page, '配色', '暖色（紅→黃）');
  expect((await state(page)).square.distColors).toEqual([
    '#ffffff',
    '#ff4040',
    '#ff9740',
    '#ffee40',
  ]);
  await pick(page, '配色', '自訂');
  expect((await state(page)).square.distColors).toEqual([
    '#aaaaaa',
    '#aaaaaa',
    '#aaaaaa',
    '#aaaaaa',
  ]);
  /* 改一個距離的顏色 */
  const field = page.getByRole('textbox', { name: '距離 2色碼' });
  await field.fill('#ff0000');
  await field.press('Enter');
  expect((await state(page)).square.distColors[2]).toBe('#ff0000');
  /* 範圍確定同一個值不重建；改了才重建 */
  await commit(spin(page, '範圍'), '3');
  expect((await state(page)).square.distColors[2]).toBe('#ff0000');
  await commit(spin(page, '範圍'), '4');
  expect((await state(page)).square.distColors).toHaveLength(5);
  expect((await state(page)).square.distColors[2]).toBe('#aaaaaa');

  /* 格子不透明度 50%：填色的 alpha 約一半 */
  await commit(spin(page, '格子不透明度'), '50');
  px = await canvasPixels(page);
  const c = 4 * 30 + 15;
  expect(at(px, c - 10, c - 10)[3]).toBeGreaterThan(120);
  expect(at(px, c - 10, c - 10)[3]).toBeLessThan(135);
  /* 描邊關閉時描邊顏色停用 */
  await toggle(page, '描邊').click();
  await expect(page.getByRole('textbox', { name: '描邊顏色' })).toBeDisabled();
  await commit(spin(page, '文字不透明度'), '0');
  await commit(spin(page, '文字大小'), '40');
  const s = (await state(page)).square;
  expect([s.cellOpacity, s.textOpacity, s.fontSize, s.stroke, s.size]).toEqual([
    50,
    0,
    40,
    false,
    30,
  ]);
  expect(errors).toEqual([]);
});

test('點格子編輯：文字、顏色、大小、還原、清除全部自訂、方向鍵與 Esc；匯出不含醒目框', async ({
  page,
}) => {
  const errors = await open(page);
  /* 點 (1, 1) */
  await clickCanvas(page, ...sq(1, 1));
  await expect(editor(page)).toBeVisible();
  await expect(page.getByTestId('editor-title')).toHaveText('格子 (1, 1)／預設距離：2');
  await expect(editor(page).getByRole('textbox', { name: '文字', exact: true })).toHaveValue('2');
  await expect(page.getByTestId('edit-highlight')).toHaveCount(1);
  /* 匯出不含醒目框：與關閉後的畫布相同 */
  const withBox = await exportPng(page);
  expect(Buffer.from(withBox.px.data).equals(Buffer.from((await canvasPixels(page)).data))).toBe(
    true,
  );

  await editor(page).getByRole('textbox', { name: '文字', exact: true }).fill('牆');
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：1');
  const cellColor = editor(page).getByRole('textbox', { name: '格子顏色' });
  await cellColor.fill('#282828');
  await cellColor.press('Enter');
  await commit(spin(editor(page), '文字大小'), '30');
  const custom = (await state(page)).square.customs['1,1'];
  expect(custom).toEqual({ text: '牆', color: '#282828', textColor: '#000000', fontSize: 30 });
  let px = await canvasPixels(page);
  expect(at(px, 6 * 48 + 3, 6 * 48 + 3)).toEqual([40, 40, 40, 255]);
  /* 換配色不影響自訂格 */
  await pick(page, '配色', '灰階');
  px = await canvasPixels(page);
  expect(at(px, 6 * 48 + 3, 6 * 48 + 3)).toEqual([40, 40, 40, 255]);

  /* 方向鍵：往左一格（(0, 1)），Esc 關閉 */
  await canvas(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('editor-title')).toHaveText('格子 (0, 1)／預設距離：1');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  /* 點範圍外：不開 */
  await clickCanvas(page, 5, 5);
  await expect(editor(page)).toHaveCount(0);

  /* 還原這一格 */
  await clickCanvas(page, ...sq(1, 1));
  await expect(btn(editor(page), '還原這一格')).toBeEnabled();
  await btn(editor(page), '還原這一格').click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');

  /* 清除全部自訂 */
  await clickCanvas(page, ...sq(-2, 0));
  await commit(spin(editor(page), '文字大小'), '40');
  await clickCanvas(page, ...sq(0, -3));
  await editor(page).getByRole('textbox', { name: '文字', exact: true }).fill('');
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：2');
  /* 文字空白時顯示距離（自訂文字是空字串） */
  expect((await state(page)).square.customs['0,-3'].text).toBe('');
  await btn(page, '清除全部自訂').click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');
  await expect(editor(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('六角格：預設使用網格、方向、直線、點擊判定；自訂格依形狀分開', async ({ page }) => {
  const errors = await open(page);
  await clickCanvas(page, ...sq(1, 0));
  await editor(page).getByRole('textbox', { name: '文字', exact: true }).fill('A');
  await radio(page, '六角格').click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');
  await expect(sizeText(page)).toHaveText('576 × 528 px');
  await expect(fileText(page)).toHaveText('檔名：hex_ruler_24x22.png');
  await expect(toggle(page, '使用網格（CCFOLIA 等）')).toBeChecked();
  await expect(spin(page, '文字大小')).toHaveValue('20');

  /* 點 (1, 1)：中心 x＝(1 ＋ 5 ＋ 1/6 ＋ 0.5) × 48 ＋ 16、y＝(1 ＋ 5 ＋ 0.5) × 48 ＋ 24 */
  await clickCanvas(page, (1 + 5 + 1 / 6 + 0.5) * 48 + 16, (1 + 5 + 0.5) * 48 + 24);
  await expect(page.getByTestId('editor-title')).toHaveText('六角格 (1, 1)／預設距離：2');
  /* 直向：同一格的中心 x、y 對調 */
  await radio(page, '直向（尖頂）').click();
  await expect(sizeText(page)).toHaveText('528 × 576 px');
  await expect(fileText(page)).toHaveText('檔名：hex_ruler_22x24.png');
  await clickCanvas(page, (0 + 5) * 48 + 24, (-2 + 5 + 1 / 6 + 0.5) * 48 + 16);
  await expect(page.getByTestId('editor-title')).toHaveText('六角格 (-2, 0)／預設距離：2');
  await radio(page, '橫向（平頂）').click();
  await radio(page, '直線').click();
  await expect(sizeText(page)).toHaveText('672 × 528 px');
  await toggle(page, '使用網格（CCFOLIA 等）').click();
  await expect(sizeText(page)).toHaveText('554 × 528 px');
  await expect(fileText(page)).toHaveText('檔名：hex_ruler.png');
  const out = await exportPng(page);
  expect(out.name).toBe('hex_ruler.png');
  expect([out.px.width, out.px.height]).toEqual([554, 528]);

  /* 方格的自訂格還在 */
  await radio(page, '方格').click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：1');
  expect(errors).toEqual([]);
});

test('自動保存（含自訂格）與復原', async ({ page }) => {
  const errors = await open(page);
  await clickCanvas(page, ...sq(2, 0));
  await editor(page).getByRole('textbox', { name: '文字', exact: true }).fill('X');
  await page.waitForTimeout(450);
  await commit(spin(page, '範圍'), '6');
  await expect(sizeText(page)).toHaveText('624 × 624 px');
  await page.reload();
  await expect(sizeText(page)).toHaveText('624 × 624 px');
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：1');
  expect((await state(page)).square.customs['2,0'].text).toBe('X');
  await page.waitForTimeout(450);
  await btn(page, '清除全部自訂').click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：1');

  /* 全部重設之後也能復原（對等驗證後修正） */
  await page.waitForTimeout(450);
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：0');
  await expect(sizeText(page)).not.toHaveText('624 × 624 px');
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect(page.getByTestId('custom-count')).toHaveText('自訂格數：1');
  await expect(sizeText(page)).toHaveText('624 × 624 px');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('d');
    })(),
  ]);
  expect(dl.suggestedFilename()).toBe('grid_ruler_13x13.png');
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬（編輯中）', async ({ page }) => {
    const errors = await open(page);
    await clickCanvas(page, ...sq(1, 1));
    await expect(editor(page)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('range-ruler-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await radio(page, '六角格').click();
    await clickCanvas(page, (5 + 1 / 6 + 0.5) * 48 + 16, 5 * 48 + 24);
    await expect(editor(page)).toBeVisible();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('range-ruler-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
