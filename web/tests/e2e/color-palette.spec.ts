/**
 * 角色配色條產生器（建置產物 next/color-palette/）的端對端測試：
 * - 開頁沒有 pageerror／console error；初始內容與預設值；頁尾只放靈感來源；
 * - 整體設定邊打邊套用、範圍檢查（主控裁定）；手動畫布；
 * - 整張儲存／裁邊儲存：檔名、尺寸、8-bit RGBA、不透明、像素位置（規格 3.1～3.3）、預覽與輸出相同；
 * - 新增／刪除條與段、24 條上限、新增的條取當下的基準倍率、沒有色條時儲存只顯示訊息；
 * - 每條倍率與段比例確定時才套用、段的顏色、沒有段時畫成淺灰；
 * - 段的拖曳排序（同一條之內；拖到別條上放開不會有反應）；
 * - 畫布把手：拖動 30 px 的比例變化、依預覽倍率換算、0.05 下限、一次拖曳算一步復原；
 * - 預覽倍率：滑桿、Ctrl＋滾輪每 100 px 約 50 個百分點、只影響顯示；
 * - 圖片取色：手動滴管（順序、點滿、拖動、透明是黑色）、自動取色（分割線、容許值、比例）、各種重設時機、
 *   取消／關閉／Esc、對話框縮放；
 * - 自動存檔與復原；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Settings } from '../../src/tools/color-palette/logic';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('color-palette') ?? { id: 'color-palette', status: 'next' })}/`;

/* ---------- 測試圖 ---------- */

type Rgba = [number, number, number, number];

async function pngOf(w: number, h: number, at: (x: number, y: number) => Rgba) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(at(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 100 × 300：上中下三等分紅 #e03030、綠 #30c030、藍 #3050e0；最左邊 10 px 完全透明 */
const bands = () =>
  pngOf(100, 300, (x, y) => {
    if (x < 10) return [0, 0, 0, 0];
    return y < 100 ? [224, 48, 48, 255] : y < 200 ? [48, 192, 48, 255] : [48, 80, 224, 255];
  });

/** 第二張：上 20% 橘 #e0a020、下 80% 灰 #808080 */
const orangeGrey = () =>
  pngOf(100, 100, (_x, y) => (y < 20 ? [224, 160, 32, 255] : [128, 128, 128, 255]));

const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

/* ---------- 頁面操作 ---------- */

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
  await expect(page.getByRole('heading', { level: 1, name: '角色配色條產生器' })).toBeVisible();
  return errors;
}

const state = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __colorPalette: { useSettings: { getState: () => { data: Settings } } };
        }
      ).__colorPalette.useSettings.getState().data,
  );
const ratios = async (page: Page, i = 0) =>
  (await state(page)).bars[i].segments.map((s) => s.ratio);
const colors = async (page: Page, i = 0) =>
  (await state(page)).bars[i].segments.map((s) => s.color);

const sizeText = (page: Page) => page.getByTestId('canvas-size');
const status = (page: Page) => page.getByTestId('status-text');
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const spin = (scope: Page | Locator, name: string) =>
  scope.getByRole('spinbutton', { name, exact: true });
const barCard = (page: Page, n: number) => page.getByRole('region', { name: `第 ${n} 條` });
const segRows = (page: Page, n: number) =>
  barCard(page, n)
    .getByRole('list', { name: `第 ${n} 條的分段` })
    .getByRole('listitem');
const stage = (page: Page) => page.getByRole('region', { name: '配色條預覽' });
const previewCanvas = (page: Page) => page.getByTestId('palette-canvas');
const handle = (page: Page, bar: number, k: number) => page.locator(`[data-handle="${bar}-${k}"]`);
const dialog = (page: Page) => page.getByRole('dialog');

/** 打字後按 Enter 確定 */
async function commit(box: Locator, value: string) {
  await box.fill(value);
  await box.press('Enter');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 直接解出 PNG 檔裡的像素 */
function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, bitDepth, colorType } = readIhdr(chunks);
  expect([bitDepth, colorType], '8-bit RGBA').toEqual([8, 6]);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

const hexAt = (px: PixelBuffer, x: number, y: number) => {
  const i = (y * px.width + x) * 4;
  const d = px.data;
  return `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

function allOpaque(px: PixelBuffer) {
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] !== 255) return false;
  return true;
}

/** 某一列裡不是背景色的 x 範圍（連續的幾段） */
function runsInRow(px: PixelBuffer, y: number, bg: string) {
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= px.width; x++) {
    const on = x < px.width && hexAt(px, x, y) !== bg;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
}

/** 某一欄裡不是背景色的 y 範圍 */
function spanInColumn(px: PixelBuffer, x: number, bg: string): [number, number] | null {
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < px.height; y++) {
    if (hexAt(px, x, y) !== bg) {
      if (y0 < 0) y0 = y;
      y1 = y;
    }
  }
  return y0 < 0 ? null : [y0, y1];
}

async function save(page: Page, name: '整張儲存' | '裁邊儲存') {
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, name).click()]);
  return dl;
}

async function pixelsOf(dl: Download) {
  return pngPixels(readFileSync((await dl.path()) as string));
}

/** 預覽畫布的像素（工具畫在畫面上的） */
async function previewPixels(page: Page): Promise<PixelBuffer> {
  /* base64 傳回來（大畫布用數字陣列傳很慢） */
  const r = await previewCanvas(page).evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let bin = '';
    for (let i = 0; i < data.length; i += 0x8000)
      bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: c.width, height: c.height, b64: btoa(bin) };
  });
  return { width: r.width, height: r.height, data: Buffer.from(r.b64, 'base64') };
}

/** 從左側把手拖一列到另一個位置 */
async function dragRow(
  page: Page,
  from: Locator,
  to: { x: number; y: number },
  hold?: () => Promise<void>,
) {
  const grip = from.locator('[data-drag-handle]');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await hold?.();
  await page.mouse.up();
}

const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/* ---------- 取色視窗 ---------- */

async function openPicker(page: Page, n = 1) {
  await page.getByRole('button', { name: `第 ${n} 條：從圖片取色` }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: `第 ${n} 條：從圖片取色` })).toBeVisible();
}

async function loadPickerImage(page: Page, buffer: Buffer, name = 'bands.png') {
  await dialog(page)
    .locator('input[type=file]')
    .setInputFiles([file(name, buffer)]);
  await expect(samplerCanvas(page)).toBeVisible();
}

const samplerCanvas = (page: Page) => page.getByTestId('image-sampler').locator('canvas');
const progressText = (page: Page) => page.getByTestId('picker-progress-text');
const pickerError = (page: Page) => page.getByTestId('picker-error');

/** 在取色圖上點原圖像素 (x, y) */
async function clickImage(page: Page, x: number, y: number) {
  /* 對話框內容比畫面高時會捲動：先讓取色區整個露出來 */
  await page.getByTestId('image-sampler').scrollIntoViewIfNeeded();
  const b = (await samplerCanvas(page).boundingBox())!;
  const scale = b.width / 100;
  await page.mouse.click(b.x + (x + 0.5) * scale, b.y + (y + 0.5) * scale);
}

/* ---------- 測試 ---------- */

test('開頁：初始內容、預設值、頁尾只放靈感來源、沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(sizeText(page)).toHaveText('畫布 170 × 460 px');
  await expect(page.getByTestId('crop-size')).toHaveText('裁邊 170 × 460 px');
  await expect(page.getByTestId('bar-count')).toHaveText('1／24');
  await expect(segRows(page, 1)).toHaveCount(3);
  await expect(spin(barCard(page, 1), '第 1 條的倍率')).toHaveValue('160');
  await expect(spin(page, '線條粗細')).toHaveValue('10');
  await expect(spin(page, '基準長度')).toHaveValue('300');
  await expect(spin(page, '基準倍率')).toHaveValue('160');
  await expect(spin(page, '留白')).toHaveValue('80');
  await expect(page.getByRole('switch', { name: '自動調整畫布' })).toBeChecked();
  await expect(spin(page, '畫布寬')).toBeDisabled();
  await expect(spin(page, '畫布寬')).toHaveValue('400');
  await expect(spin(page, '畫布高')).toHaveValue('500');
  await expect(page.getByRole('textbox', { name: '背景色' })).toHaveValue('#f3f4f6');
  await expect(page.getByRole('switch', { name: '在畫布上拖動分段交界' })).not.toBeChecked();
  await expect(stage(page)).toHaveAttribute('data-zoom', '100');
  /* 三段等比例的鮮明顏色 */
  const c = await colors(page);
  expect(new Set(c).size).toBe(3);
  expect(await ratios(page)).toEqual([1, 1, 1]);
  /* 頁尾只放靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toHaveText('靈感來源：sotsotssi/CharColorPalette');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/CharColorPalette',
  );
  /* 回首頁連結由共用外框提供 */
  await expect(page.getByRole('link', { name: /TRPG Toolkit/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('整張儲存與裁邊儲存：檔名、尺寸、8-bit RGBA、不透明、色條位置與顏色；預覽與輸出相同', async ({
  page,
}) => {
  const errors = await open(page);
  const [c1, c2, c3] = await colors(page);
  const full = await save(page, '整張儲存');
  expect(full.suggestedFilename()).toBe('palette_full.png');
  const px = await pixelsOf(full);
  expect([px.width, px.height]).toEqual([170, 460]);
  expect(allOpaque(px)).toBe(true);
  const bg = '#f3f4f6';
  expect(hexAt(px, 5, 5)).toBe(bg);
  /* 色條 x 80～90、y 80～380；三段各約 100 px */
  expect(runsInRow(px, 230, bg)).toEqual([[80, 89]]);
  expect(spanInColumn(px, 85, bg)).toEqual([80, 379]);
  expect([hexAt(px, 85, 130), hexAt(px, 85, 230), hexAt(px, 85, 330)]).toEqual([c1, c2, c3]);
  expect([hexAt(px, 85, 178), hexAt(px, 85, 182)]).toEqual([c1, c2]);
  expect([hexAt(px, 85, 278), hexAt(px, 85, 282)]).toEqual([c2, c3]);
  /* 上下兩端是半圓：角落是背景色，中央一直到端點都有顏色 */
  expect([hexAt(px, 80, 80), hexAt(px, 89, 80), hexAt(px, 80, 379), hexAt(px, 89, 379)]).toEqual([
    bg,
    bg,
    bg,
    bg,
  ]);
  expect(spanInColumn(px, 80, bg)?.[0]).toBeGreaterThan(80);
  /* 預覽畫布與輸出逐像素相同（所見即所得） */
  const pv = await previewPixels(page);
  expect([pv.width, pv.height]).toEqual([170, 460]);
  expect(Buffer.from(pv.data).equals(Buffer.from(px.data))).toBe(true);

  const crop = await save(page, '裁邊儲存');
  expect(crop.suggestedFilename()).toBe('palette_crop.png');
  const cp = await pixelsOf(crop);
  expect([cp.width, cp.height]).toEqual([170, 460]);
  expect(Buffer.from(cp.data).equals(Buffer.from(px.data))).toBe(true);
  await expect(status(page)).toHaveText('已儲存「palette_crop.png」。');
  expect(errors).toEqual([]);
});

test('手動畫布 600 × 700、3 條（粗 20，倍率 160／120／160）：整張 600 × 700、裁邊 340 × 460', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('switch', { name: '自動調整畫布' }).click();
  await expect(spin(page, '畫布寬')).toBeEnabled();
  await spin(page, '畫布寬').fill('600');
  await spin(page, '畫布高').fill('700');
  await spin(page, '線條粗細').fill('20');
  await btn(page, '新增一條').click();
  await btn(page, '新增一條').click();
  await commit(spin(barCard(page, 2), '第 2 條的倍率'), '120');
  await expect(sizeText(page)).toHaveText('畫布 600 × 700 px');
  await expect(page.getByTestId('crop-size')).toHaveText('裁邊 340 × 460 px');

  const bg = '#f3f4f6';
  const px = await pixelsOf(await save(page, '整張儲存'));
  expect([px.width, px.height]).toEqual([600, 700]);
  expect(runsInRow(px, 450, bg)).toEqual([
    [210, 229],
    [290, 309],
    [370, 389],
  ]);
  expect(spanInColumn(px, 220, bg)).toEqual([200, 499]);
  /* 第 2 條長 225 px、底部對齊 */
  expect(spanInColumn(px, 300, bg)).toEqual([275, 499]);
  expect(hexAt(px, 300, 400)).toBe('#000000');

  const cp = await pixelsOf(await save(page, '裁邊儲存'));
  expect([cp.width, cp.height]).toEqual([340, 460]);
  expect(allOpaque(cp)).toBe(true);
  expect(runsInRow(cp, 330, bg)).toEqual([
    [80, 99],
    [160, 179],
    [240, 259],
  ]);
  expect(spanInColumn(cp, 90, bg)).toEqual([80, 379]);
  expect(errors).toEqual([]);
});

test('尺寸有小數時捨去（和舊版相同）：第 2 條倍率 172 → 整張與裁邊都是 240 × 482', async ({
  page,
}) => {
  const errors = await open(page);
  await btn(page, '新增一條').click();
  await commit(spin(barCard(page, 2), '第 2 條的倍率'), '172');
  await expect(sizeText(page)).toHaveText('畫布 240 × 482 px');
  await expect(page.getByTestId('crop-size')).toHaveText('裁邊 240 × 482 px');
  const px = await pixelsOf(await save(page, '整張儲存'));
  expect([px.width, px.height]).toEqual([240, 482]);
  expect(errors).toEqual([]);
});

test('整體設定邊打邊套用；數值欄夾在標示的範圍內', async ({ page }) => {
  const errors = await open(page);
  /* 打字中（還沒離開欄位）就套用 */
  await spin(page, '線條粗細').fill('20');
  await expect(sizeText(page)).toHaveText('畫布 180 × 460 px');
  await spin(page, '基準長度').fill('600');
  await expect(sizeText(page)).toHaveText('畫布 180 × 760 px');
  await spin(page, '基準倍率').fill('320');
  await expect(sizeText(page)).toHaveText('畫布 180 × 460 px');
  await spin(page, '留白').fill('10');
  await expect(sizeText(page)).toHaveText('畫布 100 × 320 px');
  /* 超出範圍：確定時夾回範圍 */
  await commit(spin(page, '線條粗細'), '0');
  await expect(spin(page, '線條粗細')).toHaveValue('1');
  await commit(spin(page, '線條粗細'), '500');
  await expect(spin(page, '線條粗細')).toHaveValue('100');
  await commit(spin(page, '基準倍率'), '0');
  await expect(spin(page, '基準倍率')).toHaveValue('1');
  await commit(spin(page, '基準長度'), '5');
  await expect(spin(page, '基準長度')).toHaveValue('10');
  await commit(spin(page, '留白'), '-3');
  await expect(spin(page, '留白')).toHaveValue('0');
  await page.getByRole('switch', { name: '自動調整畫布' }).click();
  await commit(spin(page, '畫布寬'), '50');
  await expect(spin(page, '畫布寬')).toHaveValue('100');
  await commit(spin(page, '畫布高'), '9000');
  await expect(spin(page, '畫布高')).toHaveValue('5000');
  await expect(sizeText(page)).toHaveText('畫布 100 × 5000 px');
  /* 背景色：輸入色碼即時套用 */
  await page.getByRole('textbox', { name: '背景色' }).fill('#102030');
  expect((await state(page)).background).toBe('#102030');
  const pv = await previewPixels(page);
  expect(hexAt(pv, 2, 2)).toBe('#102030');
  expect(errors).toEqual([]);
});

test('新增與刪除色條：新的條取當下的基準倍率、24 條上限、刪除不確認、沒有色條時儲存只顯示訊息', async ({
  page,
}) => {
  const errors = await open(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await spin(page, '基準倍率').fill('170');
  await btn(page, '新增一條').click();
  await expect(page.getByTestId('bar-count')).toHaveText('2／24');
  await expect(spin(barCard(page, 2), '第 2 條的倍率')).toHaveValue('170');
  await expect(segRows(page, 2)).toHaveCount(1);
  expect(await colors(page, 1)).toEqual(['#000000']);
  expect(await ratios(page, 1)).toEqual([1]);
  for (let i = 3; i <= 24; i++) await btn(page, '新增一條').click();
  await expect(page.getByTestId('bar-count')).toHaveText('24／24');
  await expect(btn(page, '新增一條')).toBeDisabled();
  expect((await state(page)).bars).toHaveLength(24);
  /* 24 條、粗 10：24 × 10 ＋ 23 × 60 ＋ 160 */
  await expect(sizeText(page)).toHaveText('畫布 1780 × 460 px');
  await spin(page, '線條粗細').fill('20');
  await expect(sizeText(page)).toHaveText('畫布 2020 × 460 px');

  /* 刪除不確認；序號跟著清單順序 */
  await page.getByRole('button', { name: '刪除第 1 條' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByTestId('bar-count')).toHaveText('23／24');
  await expect(btn(page, '新增一條')).toBeEnabled();
  await expect(spin(barCard(page, 1), '第 1 條的倍率')).toHaveValue('170');
  for (let i = 23; i >= 1; i--) await page.getByRole('button', { name: `刪除第 ${i} 條` }).click();
  await expect(page.getByTestId('bar-count')).toHaveText('0／24');
  await expect(page.getByText('還沒有色條。按「新增一條」開始。')).toBeVisible();
  await expect(sizeText(page)).toHaveText('畫布 160 × 160 px');
  await expect(page.getByTestId('crop-size')).toHaveCount(0);
  const pv = await previewPixels(page);
  expect(new Set(Array.from({ length: 160 }, (_, i) => hexAt(pv, i, i)))).toEqual(
    new Set(['#f3f4f6']),
  );
  /* 兩種儲存都只顯示訊息、不下載 */
  await btn(page, '整張儲存').click();
  await expect(status(page)).toHaveText('沒有可儲存的色條，請先新增一條。');
  await btn(page, '裁邊儲存').click();
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test('每條的倍率與段的比例確定時才套用；新增／刪除段；段的顏色；沒有段時畫成淺灰', async ({
  page,
}) => {
  const errors = await open(page);
  const card = barCard(page, 1);
  /* 倍率：打字中不套用，Enter 才套用 */
  await spin(card, '第 1 條的倍率').fill('80');
  expect((await state(page)).bars[0].scale).toBe(160);
  await spin(card, '第 1 條的倍率').press('Enter');
  expect((await state(page)).bars[0].scale).toBe(80);
  await expect(sizeText(page)).toHaveText('畫布 170 × 310 px');
  await commit(spin(card, '第 1 條的倍率'), '0.5');
  await expect(spin(card, '第 1 條的倍率')).toHaveValue('1');
  await commit(spin(card, '第 1 條的倍率'), '160');

  /* 比例：離開欄位時套用；下限 0.01 */
  await spin(card, '第 1 段的比例').fill('2');
  expect(await ratios(page)).toEqual([1, 1, 1]);
  await spin(card, '第 2 段的比例').focus();
  expect(await ratios(page)).toEqual([2, 1, 1]);
  await commit(spin(card, '第 2 段的比例'), '0');
  expect(await ratios(page)).toEqual([2, 0.01, 1]);
  /* 各段長度依比例分配：第 1 段 300 × 2 ÷ 3.01 */
  const px = await previewPixels(page);
  const [c1, , c3] = await colors(page);
  expect(hexAt(px, 85, 80 + 197)).toBe(c1);
  expect(hexAt(px, 85, 80 + 202)).toBe(c3);

  /* 新增一段：最下面、深灰、比例 1 */
  await btn(card, '新增一段').click();
  await expect(segRows(page, 1)).toHaveCount(4);
  expect((await colors(page)).at(-1)).toBe('#333333');
  expect((await ratios(page)).at(-1)).toBe(1);

  /* 段的顏色：輸入色碼即時套用 */
  await card.getByRole('textbox', { name: '第 4 段色碼' }).fill('#00ff00');
  expect((await colors(page)).at(-1)).toBe('#00ff00');

  /* 刪除段（不確認）；一段都沒有：空白提示、整條淺灰 */
  for (let k = 4; k >= 1; k--) await btn(card, `刪除第 ${k} 段`).click();
  await expect(card.getByText('這一條還沒有分段，會畫成淺灰色。')).toBeVisible();
  const empty = await previewPixels(page);
  expect([hexAt(empty, 85, 100), hexAt(empty, 85, 230), hexAt(empty, 85, 370)]).toEqual([
    '#cccccc',
    '#cccccc',
    '#cccccc',
  ]);
  expect(errors).toEqual([]);
});

test('段的拖曳排序：只在同一條之內；拖到別條上放開不會有反應', async ({ page }) => {
  const errors = await open(page);
  await btn(page, '新增一條').click();
  await btn(barCard(page, 2), '新增一段').click();
  const before1 = await colors(page, 0);
  const before2 = await colors(page, 1);

  /* 第 1 條：第 1 段拖到第 3 段的位置；拖曳中原列半透明、目標列醒目 */
  const rows = segRows(page, 1);
  await dragRow(page, rows.nth(0), await center(rows.nth(2)), async () => {
    await expect(rows.nth(0)).toHaveAttribute('data-dragging', 'true');
    await expect(rows.nth(0)).toHaveClass(/opacity-50/);
    await expect(rows.nth(2)).toHaveAttribute('data-over', 'true');
  });
  expect(await colors(page, 0)).toEqual([before1[1], before1[2], before1[0]]);
  expect(await colors(page, 1)).toEqual(before2);

  /* 拖到第 2 條上放開：兩條都不變 */
  const now1 = await colors(page, 0);
  await dragRow(page, rows.nth(0), await center(segRows(page, 2).nth(0)), async () => {
    await expect(segRows(page, 1).locator('[data-over]')).toHaveCount(0);
    await expect(segRows(page, 2).locator('[data-over]')).toHaveCount(0);
  });
  expect(await colors(page, 0)).toEqual(now1);
  expect(await colors(page, 1)).toEqual(before2);
  expect(errors).toEqual([]);
});

test('畫布把手：拖動 30 px 的比例變化、依預覽倍率換算、0.05 下限、一次拖曳算一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(handle(page, 0, 0)).toHaveCount(0);
  await page.getByRole('switch', { name: '在畫布上拖動分段交界' }).click();
  await expect(barCard(page, 1)).toHaveAttribute('data-highlight', 'true');
  /* 三段 → 兩個把手；末端沒有把手 */
  await expect(page.locator('[data-handle]')).toHaveCount(2);
  const box = (await handle(page, 0, 0).boundingBox())!;
  expect(Math.round(box.width)).toBe(22);
  expect(Math.round(box.height)).toBe(10);

  const dragHandle = async (k: number, dy: number) => {
    await handle(page, 0, k).scrollIntoViewIfNeeded();
    const c = await center(handle(page, 0, k));
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y + dy / 2, { steps: 3 });
    await page.mouse.move(c.x, c.y + dy, { steps: 3 });
    await page.mouse.up();
  };
  /* 100%：往下 30 px → 1.3／0.7 */
  await dragHandle(0, 30);
  expect(await ratios(page)).toEqual([1.3, 0.7, 1]);
  /* 把手對準交界：畫布 y＝80 ＋ 300 × 1.3 ÷ 3＝210 */
  const cv = (await previewCanvas(page).boundingBox())!;
  expect(Math.abs((await center(handle(page, 0, 0))).y - (cv.y + 210))).toBeLessThan(1.5);

  /* 把手的大小固定在螢幕上（和舊版相同，縮小預覽時也抓得到；對等驗證後修正） */
  for (const zoom of ['50', '10']) {
    await commit(spin(page, '預覽倍率'), zoom);
    await expect(stage(page)).toHaveAttribute('data-zoom', zoom);
    const small = (await handle(page, 0, 0).boundingBox())!;
    expect([Math.round(small.width), Math.round(small.height)], `${zoom}%`).toEqual([22, 10]);
  }
  /* 200%：畫面上 60 px＝畫布 30 px */
  await commit(spin(page, '預覽倍率'), '200');
  await expect(stage(page)).toHaveAttribute('data-zoom', '200');
  const big = (await handle(page, 0, 0).boundingBox())!;
  expect(Math.round(big.width)).toBe(22);
  expect(Math.round(big.height)).toBe(10);
  await dragHandle(0, 60);
  expect(await ratios(page)).toEqual([1.6, 0.4, 1]);
  const cv2 = (await previewCanvas(page).boundingBox())!;
  expect(Math.abs((await center(handle(page, 0, 0))).y - (cv2.y + 240 * 2))).toBeLessThan(1.5);

  /* 下限 0.05；兩段比例和不變；只動交界上下兩段 */
  await commit(spin(page, '預覽倍率'), '100');
  await dragHandle(1, 200);
  expect(await ratios(page)).toEqual([1.6, 1.35, 0.05]);
  /* 一次拖曳算一步復原 */
  await page.getByRole('button', { name: '復原', exact: true }).click();
  expect(await ratios(page)).toEqual([1.6, 0.4, 1]);

  /* 鍵盤：↓ 1 px、Shift＋↓ 10 px */
  await handle(page, 0, 0).focus();
  await page.keyboard.press('Shift+ArrowDown');
  expect(await ratios(page)).toEqual([1.7, 0.3, 1]);

  /* 一段的條、沒有段的條都沒有把手 */
  await btn(page, '新增一條').click();
  await expect(page.locator('[data-handle^="1-"]')).toHaveCount(0);
  await page.getByRole('switch', { name: '在畫布上拖動分段交界' }).click();
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await expect(barCard(page, 1)).not.toHaveAttribute('data-highlight', 'true');
  expect(errors).toEqual([]);
});

test('預覽倍率：滑桿 10%～300%、Ctrl＋滾輪每 100 px 約 50 個百分點，只影響顯示', async ({
  page,
}) => {
  const errors = await open(page);
  const zoomBox = spin(page, '預覽倍率');
  const c = await center(stage(page));
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(stage(page)).toHaveAttribute('data-zoom', '150');
  await expect(zoomBox).toHaveValue('150');
  const cv = (await previewCanvas(page).boundingBox())!;
  expect(Math.round(cv.width)).toBe(255);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect(stage(page)).toHaveAttribute('data-zoom', '100');
  /* 範圍 10%～300% */
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -1000);
  await page.keyboard.up('Control');
  await expect(stage(page)).toHaveAttribute('data-zoom', '300');
  await commit(zoomBox, '5');
  await expect(stage(page)).toHaveAttribute('data-zoom', '10');
  await commit(zoomBox, '250');
  await expect(stage(page)).toHaveAttribute('data-zoom', '250');
  /* 只改顯示：輸出仍是 170 × 460 */
  const px = await pixelsOf(await save(page, '整張儲存'));
  expect([px.width, px.height]).toEqual([170, 460]);
  expect(errors).toEqual([]);
});

test('圖片取色・手動滴管：點選順序、進度、點滿、拖動微調、透明處是黑色、取代整條', async ({
  page,
}) => {
  const errors = await open(page);
  await openPicker(page);
  const d = dialog(page);
  await expect(d.getByRole('tab', { name: '手動滴管' })).toHaveAttribute('aria-selected', 'true');
  await expect(d.getByText('尚未選擇圖片。')).toBeVisible();
  await expect(spin(d, '相近色容許值')).toHaveCount(0);
  /* 沒有圖片：提示、不關閉 */
  await btn(d, '套用').click();
  await expect(pickerError(page)).toHaveText('請先選擇圖片。');
  await expect(d).toBeVisible();

  await loadPickerImage(page, await bands());
  await commit(spin(d, '要取幾個顏色'), '3');
  await expect(progressText(page)).toHaveText('已取 0／共 3 個顏色');
  await expect(page.getByTestId('picker-progress').locator('li')).toHaveCount(3);
  /* 依點選順序：藍、紅 */
  await clickImage(page, 50, 250);
  await clickImage(page, 50, 50);
  await expect(progressText(page)).toHaveText('已取 2／共 3 個顏色');
  await expect(page.getByTestId('picker-progress').locator('li').nth(0)).toHaveAttribute(
    'data-color',
    '#3050e0',
  );
  await btn(d, '套用').click();
  await expect(pickerError(page)).toHaveText('請點滿 3 個顏色。');
  /* 透明的像素是黑色 */
  await clickImage(page, 3, 150);
  await expect(progressText(page)).toHaveText('已取滿，可以拖動圓點微調位置。');
  await expect(progressText(page)).toHaveAttribute('data-done', 'true');
  await expect(d.getByRole('button', { name: '取色點 3：#000000' })).toBeVisible();
  /* 點滿後再點不會再取 */
  await clickImage(page, 50, 150);
  await expect(d.locator('[data-point]')).toHaveCount(3);
  /* 拖動第 3 點到綠色區：即時改取那裡的顏色；拖出圖片時夾在邊緣 */
  const p3 = await center(d.locator('[data-point="2"]'));
  const img = (await samplerCanvas(page).boundingBox())!;
  await page.mouse.move(p3.x, p3.y);
  await page.mouse.down();
  await page.mouse.move(img.x + 60, img.y + 150, { steps: 4 });
  await expect(d.getByRole('button', { name: '取色點 3：#30c030' })).toBeVisible();
  await expect(page.getByTestId('picker-progress').locator('li').nth(2)).toHaveAttribute(
    'data-color',
    '#30c030',
  );
  await page.mouse.move(img.x + 500, img.y - 200, { steps: 4 });
  await page.mouse.up();
  const clamped = (await d.locator('[data-point="2"]').boundingBox())!;
  expect(Math.abs(clamped.x + clamped.width / 2 - (img.x + 99.5))).toBeLessThan(1.5);
  expect(Math.abs(clamped.y + clamped.height / 2 - (img.y + 0.5))).toBeLessThan(1.5);
  await expect(d.getByRole('button', { name: '取色點 3：#e03030' })).toBeVisible();
  await btn(d, '套用').click();
  await expect(d).toHaveCount(0);
  expect(await colors(page)).toEqual(['#3050e0', '#e03030', '#e03030']);
  expect(await ratios(page)).toEqual([1, 1, 1]);
  await expect(status(page)).toHaveText('已把取色結果套用到第 1 條（3 段）。');
  expect(errors).toEqual([]);
});

test('圖片取色・自動取色：分割線、比例、容許值；沿用模式與段數、每次開啟清掉圖片與縮放；各種重設時機', async ({
  page,
}) => {
  const errors = await open(page);
  await openPicker(page);
  const d = dialog(page);
  await d.getByRole('tab', { name: '自動取色' }).click();
  await expect(spin(d, '相近色容許值')).toHaveValue('20');
  await loadPickerImage(page, await bands());
  /* 預設 5 段 → 4 條等分的分割線 */
  await expect(d.locator('[data-split]')).toHaveCount(4);
  await commit(spin(d, '要分成幾段'), '3');
  await expect(d.locator('[data-split]')).toHaveCount(2);
  await expect(d.locator('[data-split="0"]')).toHaveAttribute('aria-valuenow', '33.3');
  await btn(d, '套用').click();
  await expect(d).toHaveCount(0);
  expect(await colors(page)).toEqual(['#e03030', '#30c030', '#3050e0']);
  expect(await ratios(page)).toEqual([0.333, 0.333, 0.333]);

  /* 再開：模式與段數沿用；圖片清掉；縮放回 100% */
  await btn(page, '新增一條').click();
  await openPicker(page, 2);
  await expect(d.getByRole('tab', { name: '自動取色' })).toHaveAttribute('aria-selected', 'true');
  await expect(spin(d, '要分成幾段')).toHaveValue('3');
  await expect(d.getByText('尚未選擇圖片。')).toBeVisible();
  await expect(spin(d, '縮放')).toHaveValue('100');
  await loadPickerImage(page, await bands());
  await commit(spin(d, '要分成幾段'), '2');
  /* 唯一一條分割線拖到最上方：夾在 2% */
  const split = d.locator('[data-split="0"]');
  const s0 = await center(split);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(s0.x, s0.y - 400, { steps: 5 });
  await page.mouse.up();
  await expect(split).toHaveAttribute('aria-valuenow', '2');
  /* 切換分頁：清掉並重設分割線 */
  await d.getByRole('tab', { name: '手動滴管' }).click();
  await d.getByRole('tab', { name: '自動取色' }).click();
  await expect(split).toHaveAttribute('aria-valuenow', '50');
  /* 換一張圖：重設分割線 */
  const s1 = await center(split);
  await page.mouse.move(s1.x, s1.y);
  await page.mouse.down();
  await page.mouse.move(s1.x, s1.y - 400, { steps: 5 });
  await page.mouse.up();
  await expect(split).toHaveAttribute('aria-valuenow', '2');
  await loadPickerImage(page, await bands(), 'again.png');
  await expect(split).toHaveAttribute('aria-valuenow', '50');
  /* 「重設」鈕 */
  const s2 = await center(split);
  await page.mouse.move(s2.x, s2.y);
  await page.mouse.down();
  await page.mouse.move(s2.x, s2.y - 400, { steps: 5 });
  await page.mouse.up();
  await expect(split).toHaveAttribute('aria-valuenow', '2');
  await btn(d, '重設').click();
  await expect(split).toHaveAttribute('aria-valuenow', '50');
  await page.mouse.move(s2.x, s2.y);
  await page.mouse.down();
  await page.mouse.move(s2.x, s2.y - 400, { steps: 5 });
  await page.mouse.up();
  await btn(d, '套用').click();
  expect(await colors(page, 1)).toEqual(['#e03030', '#3050e0']);
  expect(await ratios(page, 1)).toEqual([0.02, 0.98]);
  /* 第 1 條不受影響 */
  expect(await ratios(page, 0)).toEqual([0.333, 0.333, 0.333]);

  /* 灰色幾乎不加分：上 20% 橘勝出 */
  await openPicker(page, 2);
  await loadPickerImage(page, await orangeGrey(), 'orange.png');
  await commit(spin(d, '要分成幾段'), '1');
  await expect(d.locator('[data-split]')).toHaveCount(0);
  await btn(d, '套用').click();
  expect(await colors(page, 1)).toEqual(['#e0a020']);
  expect(await ratios(page, 1)).toEqual([1]);

  /* 手動：改數量（確定時）清掉取色點；重設鈕也是 */
  await openPicker(page, 1);
  await d.getByRole('tab', { name: '手動滴管' }).click();
  await loadPickerImage(page, await bands());
  await clickImage(page, 50, 50);
  /* 數量沿用上一次的 1 */
  await expect(progressText(page)).toHaveText('已取滿，可以拖動圓點微調位置。');
  await commit(spin(d, '要取幾個顏色'), '4');
  await expect(progressText(page)).toHaveText('已取 0／共 4 個顏色');
  await clickImage(page, 50, 50);
  await clickImage(page, 50, 150);
  await expect(progressText(page)).toHaveText('已取 2／共 4 個顏色');
  await btn(d, '重設').click();
  await expect(progressText(page)).toHaveText('已取 0／共 4 個顏色');
  await commit(spin(d, '要取幾個顏色'), '30');
  await expect(spin(d, '要取幾個顏色')).toHaveValue('20');
  expect(errors).toEqual([]);
});

test('取色視窗：取消、關閉鈕、Esc 都不改變分段；對話框縮放（滑桿、Ctrl＋滾輪）以原圖像素取色', async ({
  page,
}) => {
  const errors = await open(page);
  const before = await colors(page);
  const d = dialog(page);

  await openPicker(page);
  await d.getByRole('tab', { name: '手動滴管' }).click();
  await loadPickerImage(page, await bands());
  await commit(spin(d, '要取幾個顏色'), '1');
  await clickImage(page, 50, 50);
  await btn(d, '取消').click();
  await expect(d).toHaveCount(0);
  expect(await colors(page)).toEqual(before);

  /* 點對話框外面不關（和舊版相同，誤點不會丟掉載入的圖；對等驗證後修正） */
  await openPicker(page);
  await page.mouse.click(5, 5);
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(d).toHaveCount(0);
  await openPicker(page);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  expect(await colors(page)).toEqual(before);

  /* 縮放：滑桿 200% → 圖片放大兩倍，點選位置仍以原圖像素計 */
  await openPicker(page);
  await loadPickerImage(page, await bands());
  await commit(spin(d, '縮放'), '200');
  await expect
    .poll(async () => Math.round((await samplerCanvas(page).boundingBox())!.width))
    .toBe(200);
  await clickImage(page, 50, 150);
  await expect(d.getByRole('button', { name: '取色點 1：#30c030' })).toBeVisible();
  /* 取色點跟著圖片縮放 */
  const dot = await center(d.locator('[data-point="0"]'));
  const img = (await samplerCanvas(page).boundingBox())!;
  expect(Math.abs(dot.x - (img.x + 50.5 * 2))).toBeLessThan(1.5);
  expect(Math.abs(dot.y - (img.y + 150.5 * 2))).toBeLessThan(1.5);
  /* Ctrl＋滾輪：每 100 px 50 個百分點 */
  const area = await center(page.getByTestId('image-sampler'));
  await page.mouse.move(area.x, area.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(spin(d, '縮放')).toHaveValue('250');
  await commit(spin(d, '縮放'), '1000');
  await expect(spin(d, '縮放')).toHaveValue('500');
  await commit(spin(d, '縮放'), '1');
  await expect(spin(d, '縮放')).toHaveValue('20');
  await btn(d, '套用').click();
  expect(await colors(page)).toEqual(['#30c030']);
  expect(errors).toEqual([]);
});

test('自動存檔與復原／重做', async ({ page }) => {
  const errors = await open(page);
  await spin(page, '線條粗細').fill('20');
  await spin(page, '線條粗細').blur();
  await btn(page, '新增一條').click();
  await expect(sizeText(page)).toHaveText('畫布 260 × 460 px');
  await page.reload();
  await expect(sizeText(page)).toHaveText('畫布 260 × 460 px');
  await expect(page.getByTestId('bar-count')).toHaveText('2／24');
  /* 復原：刪除的條回來 */
  await page.getByRole('button', { name: '刪除第 2 條' }).click();
  await expect(page.getByTestId('bar-count')).toHaveText('1／24');
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.getByTestId('bar-count')).toHaveText('2／24');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('bar-count')).toHaveText('1／24');
  /* Ctrl＋Z */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('bar-count')).toHaveText('2／24');
  expect(errors).toEqual([]);
});

test('畫布或裁邊範圍大到瀏覽器處理不了時：提示並停用對應的儲存（新版的保護）', async ({ page }) => {
  const errors = await open(page);
  /* 基準倍率 1、倍率 160：色條長 48000 px */
  await spin(page, '基準倍率').fill('1');
  await expect(page.getByTestId('too-large')).toContainText('畫布太大（170 × 48160 px）');
  await expect(stage(page)).toHaveCount(0);
  await expect(btn(page, '整張儲存')).toBeDisabled();
  await expect(btn(page, '裁邊儲存')).toBeDisabled();
  /* 手動的小畫布：預覽與整張儲存照常，只有裁邊儲存停用 */
  await page.getByRole('switch', { name: '自動調整畫布' }).click();
  await expect(page.getByTestId('too-large')).toContainText('裁邊範圍太大（170 × 48160 px）');
  await expect(stage(page)).toBeVisible();
  await expect(btn(page, '整張儲存')).toBeEnabled();
  await expect(btn(page, '裁邊儲存')).toBeDisabled();
  const px = await pixelsOf(await save(page, '整張儲存'));
  expect([px.width, px.height]).toEqual([400, 500]);
  await spin(page, '基準倍率').fill('160');
  await expect(page.getByTestId('too-large')).toHaveCount(0);
  await expect(btn(page, '裁邊儲存')).toBeEnabled();
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  /* 「已自動儲存（時間）」每次不同，截圖時遮住 */
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await btn(page, '新增一條').click();
    await commit(spin(barCard(page, 2), '第 2 條的倍率'), '120');
    await btn(barCard(page, 2), '新增一段').click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('color-palette-1280.png', {
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
    await page.getByRole('switch', { name: '在畫布上拖動分段交界' }).click();
    await btn(page, '新增一條').click();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('color-palette-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    /* 取色視窗也不會讓頁面橫向捲動 */
    await openPicker(page);
    await loadPickerImage(page, await bands());
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
