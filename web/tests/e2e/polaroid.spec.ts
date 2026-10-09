/**
 * 拍立得相框產生器（建置產物 next/polaroid/）的端對端測試（規格 docs/refactor/specs/polaroid.md）：
 * - 開頁沒有錯誤、空白預覽（點一下選照片）、裝飾分頁鎖住、頁尾只有靈感來源；
 * - 照片：鋪滿、放大不改位移、拖曳取景夾值、滾輪放大、重設位置；
 * - 載入：全視窗拖放、貼上、不是圖片、壞檔；一批檔案的結果合成一則通知；換照片保留筆畫與貼紙；
 * - 尺寸：三種相框與輸出尺寸；有筆畫時先確認（取消不換、確定清掉筆畫、貼紙保留、可以復原）；
 * - 文字：40 字、自動縮小、字型、顏色、字級；相框顏色；
 * - 筆與橡皮擦：線寬（粗細 × 1.045）、亮線、顏色與粗細的預設鈕、點一下畫點、拖出相框夾回、橡皮擦只擦目前的圖層；
 * - 圖層：上層在前、名稱依位置、顯示／隱藏、上下、清除這個圖層、全部清除（都先確認）；
 * - 貼紙：加入（大小、位置、選取、切到移動）、白邊、筆畫在上面、拖曳（中心夾在相框內）、縮放、旋轉、方向鍵、Delete、Esc、
 *   清單（點列切到移動、上下、刪除）、上限 5（一則通知列出沒有加入的）；
 * - 下載 PNG：檔名、尺寸（3 倍）、像素與預覽一致；沒有照片也能存（不畫「加入照片」）；
 * - 自動儲存與還原、照片讀不到的提醒；復原／重做；專案檔 ZIP；快捷鍵 B／E／V；觸控；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('polaroid') ?? { id: 'polaroid', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:polaroid';
const PREVIEW_KEY = 'trpg-toolkit:polaroid:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 40, 40, 255];
const BLUE: Rgba = [40, 80, 200, 255];
const GREEN: Rgba = [40, 160, 60, 255];
const YELLOW: Rgba = [230, 200, 40, 255];
const TEAL = [0x14, 0xb8, 0xa6];
const CARD = [0xfb, 0xfb, 0xfa];
const EMPTY = [0xe7, 0xe5, 0xe2];

interface StoredStroke {
  color: string;
  size: number;
  pressure: number;
  eraser: boolean;
  points: number[];
}
interface StoredSticker {
  id: string;
  asset: string;
  name: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}
interface Stored {
  aspect: string;
  photo: { id: string; name: string; width: number; height: number } | null;
  view: { zoom: number; ox: number; oy: number };
  cardBg: string;
  caption: { text: string; font: string; color: string; size: number };
  stickers: StoredSticker[];
  layers: { id: string; visible: boolean; strokes: StoredStroke[] }[];
}

/* ---------- 共用 ---------- */

async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? (y < h / 2 ? RED : GREEN) : y < h / 2 ? BLUE : YELLOW;
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

/** 貼紙：120 × 80，中間一個橘色橢圓（左右半徑 50、上下 30），其餘透明 */
async function stickerPng(rgb: [number, number, number] = [240, 120, 20]): Promise<Buffer> {
  const w = 120;
  const h = 80;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - 60) / 50;
      const dy = (y + 0.5 - 40) / 30;
      if (dx * dx + dy * dy <= 1) px.set([...rgb, 255], (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '拍立得相框產生器' })).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('polaroid-canvas');
const downloadBtn = (page: Page) => page.getByRole('button', { name: '下載 PNG' });
const photoInput = (page: Page) =>
  page.getByRole('group', { name: '照片載入區' }).locator('input[type=file]');
const stickerInput = (page: Page) =>
  page.getByRole('group', { name: '把貼紙圖片拖到這裡' }).locator('input[type=file]');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const toasts = (page: Page) => page.getByRole('region', { name: /^通知/ }).locator('li');
const radio = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole('radio', { name, exact: typeof name === 'string' });
const tab = (page: Page, name: '編輯' | '裝飾') => page.getByRole('tab', { name });
const layerList = (page: Page) => page.getByRole('list', { name: '筆畫圖層（上層在前）' });
const stickerList = (page: Page) => page.getByRole('list', { name: '貼紙清單（上層在前）' });
const dialog = (page: Page) => page.getByRole('alertdialog');

async function state(page: Page): Promise<Stored> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

async function pen(
  page: Page,
): Promise<{ tool: string; color: string; size: number; layer: string }> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREVIEW_KEY,
  );
}

async function loadPhoto(page: Page, buffer?: Buffer, name = 'quad.png') {
  await tab(page, '編輯').click();
  await photoInput(page).setInputFiles(file(name, buffer ?? (await quadPng())));
  await expect(page.getByTestId('photo-name')).toContainText(name);
  await expect(page.getByTestId('empty-pick')).toHaveCount(0);
}

async function cardSize(page: Page): Promise<[number, number]> {
  const [w, h] = ((await canvas(page).getAttribute('data-size')) ?? '1x1').split('x').map(Number);
  return [w, h];
}

/** 相框單位 → 螢幕座標 */
async function at(page: Page, x: number, y: number) {
  const b = await canvas(page).boundingBox();
  const [w, h] = await cardSize(page);
  if (!b) throw new Error('找不到畫布');
  return { x: b.x + (x / w) * b.width, y: b.y + (y / h) * b.height };
}

async function drag(page: Page, pts: [number, number][], steps = 4) {
  const p = await at(page, pts[0][0], pts[0][1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) {
    const q = await at(page, x, y);
    await page.mouse.move(q.x, q.y, { steps });
  }
  await page.mouse.up();
}

async function useTool(page: Page, name: '筆' | '橡皮擦' | '移動') {
  await radio(page.getByTestId('tool-bar'), name).click();
  await expect(radio(page.getByTestId('tool-bar'), name)).toHaveAttribute('aria-checked', 'true');
}

/** 預覽畫布（2 倍）上一點的顏色；座標是相框單位 */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const s = Number(c.dataset.scale ?? '2');
      const d = c.getContext('2d')?.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ];
    },
    [x, y],
  );
}

/** 預覽畫布某一欄（相框單位 x）在 y0～y1 之間和 base 顏色差很多的像素數（畫布 px） */
async function inkRun(page: Page, x: number, y0: number, y1: number, base: number[]) {
  return canvas(page).evaluate(
    (el, { x, y0, y1, base }) => {
      const c = el as HTMLCanvasElement;
      const s = Number(c.dataset.scale ?? '2');
      const h = Math.round((y1 - y0) * s);
      const d = c.getContext('2d')?.getImageData(Math.round(x * s), Math.round(y0 * s), 1, h).data;
      if (!d) return -1;
      let n = 0;
      for (let i = 0; i < h; i++) {
        const k = i * 4;
        if (Math.max(...[0, 1, 2].map((j) => Math.abs(d[k + j] - base[j]))) > 40) n++;
      }
      return n;
    },
    { x, y0, y1, base },
  );
}

const near = (a: number[], b: number[], tol = 8) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

interface Png {
  width: number;
  height: number;
  at: (x: number, y: number) => Rgba;
}

function readPng(bytes: Uint8Array): Png {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const all = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function downloadPng(page: Page): Promise<{ name: string; png: Png }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), downloadBtn(page).click()]);
  return { name: dl.suggestedFilename(), png: readPng(readFileSync((await dl.path()) as string)) };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function addSticker(page: Page, name = 'star.png', buffer?: Buffer) {
  await tab(page, '裝飾').click();
  const before = (await state(page))?.stickers.length ?? 0;
  await stickerInput(page).setInputFiles(file(name, buffer ?? (await stickerPng())));
  await expect.poll(async () => (await state(page)).stickers.length).toBe(before + 1);
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、空白預覽（點一下選照片）、裝飾分頁鎖住、頁尾只有靈感來源（F04、F05、F07、F08、F20、F40）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-size', '688x844');
  await expect(page.getByTestId('export-size')).toHaveText('2064 × 2532 px');
  await expect(tab(page, '編輯')).toHaveAttribute('aria-selected', 'true');
  /* 沒有照片也能存（D7） */
  await expect(downloadBtn(page)).toBeEnabled();
  await expect(page.getByRole('spinbutton', { name: '放大' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重設位置' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '選擇照片' })).toBeVisible();
  /* 工具列停用；預設是移動 */
  await expect(radio(page.getByTestId('tool-bar'), '移動')).toHaveAttribute('aria-checked', 'true');
  await expect(radio(page.getByTestId('tool-bar'), '筆')).toBeDisabled();
  await expect(page.getByTestId('tool-hint')).toHaveText(
    '先放進照片才能裝飾（筆、橡皮擦、貼紙）。',
  );
  /* 裝飾分頁鎖住 */
  await tab(page, '裝飾').click();
  await expect(page.getByTestId('decorate-lock')).toBeVisible();
  await expect(page.getByRole('button', { name: '筆的顏色 #FFD400' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '粗細 22' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '＋ 加入貼紙圖片' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '全部清除' })).toBeDisabled();
  /* 空白的照片範圍：灰底；相框底色；圓角外透明 */
  expect(near(await pixel(page, 344, 300), EMPTY)).toBe(true);
  expect(near(await pixel(page, 344, 800), CARD)).toBe(true);
  expect((await pixel(page, 0.5, 0.5))[3]).toBeLessThan(80);
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/swoonqx/sw-polaroid',
  );
  await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
  /* 點空白預覽：開啟選檔 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('empty-pick').click(),
  ]);
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(file('貓.png', await quadPng()));
  await expect(page.getByTestId('empty-pick')).toHaveCount(0);
  await expect(page.getByTestId('decorate-lock')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '筆的顏色 #FFD400' })).toBeEnabled();
  await tab(page, '編輯').click();
  await expect(page.getByTestId('photo-name')).toContainText('貓.png');
  await expect(page.getByRole('button', { name: '更換照片' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '放大' })).toBeEnabled();
  /* 鋪滿：400 × 300 的照片放進 620 × 620 → 826.667 × 620、置中 */
  await expect(canvas(page)).toHaveAttribute('data-photo-rect', '-69.333,34,826.667,620');
  expect(near(await pixel(page, 100, 100), RED)).toBe(true);
  expect(near(await pixel(page, 600, 100), BLUE)).toBe(true);
  expect(near(await pixel(page, 100, 600), GREEN)).toBe(true);
  expect(near(await pixel(page, 600, 600), YELLOW)).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 照片 ---------- */

test('照片：放大不改位移、拖曳取景夾在蓋滿的範圍、滾輪放大、重設位置（F08～F12）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  const zoom = page.getByRole('spinbutton', { name: '放大' });
  /* 移動工具拖曳：位移跟著指標（相框單位） */
  await drag(page, [
    [300, 300],
    [360, 340],
  ]);
  let v = (await state(page)).view;
  expect(v.ox).toBeCloseTo(60, 0);
  expect(v.oy).toBeCloseTo(0, 5);
  /* 拖到底：夾在 ±103.333 */
  await drag(page, [
    [300, 300],
    [650, 300],
  ]);
  expect((await state(page)).view.ox).toBeCloseTo(103.333, 2);
  /* 放大 2.5：位移不變 */
  await zoom.fill('2.5');
  await zoom.press('Enter');
  v = (await state(page)).view;
  expect(v.zoom).toBe(2.5);
  expect(v.ox).toBeCloseTo(103.333, 2);
  await expect(canvas(page)).toHaveAttribute('data-photo-rect', '-586,-431,2066.667,1550');
  /* 往上拖到底：上下夾在 ±465 */
  await drag(page, [
    [300, 100],
    [300, 600],
  ]);
  expect((await state(page)).view.oy).toBeCloseTo(465, 2);
  /* 縮小回 1：夾成 0（永久） */
  await zoom.fill('1');
  await zoom.press('Enter');
  expect((await state(page)).view).toMatchObject({ zoom: 1 });
  expect((await state(page)).view.oy).toBeCloseTo(0, 5);
  /* 滾輪：×e^(0.15)，頁面不捲動 */
  const p = await at(page, 344, 300);
  await page.mouse.move(p.x, p.y);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state(page)).view.zoom).toBeCloseTo(Math.exp(0.15), 3);
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  await expect(zoom).toHaveValue('1.16');
  /* 筆的時候滾輪不放大 */
  await useTool(page, '筆');
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  expect((await state(page)).view.zoom).toBeCloseTo(Math.exp(0.15), 3);
  /* 重設位置 */
  await page.getByRole('button', { name: '重設位置' }).click();
  expect((await state(page)).view).toEqual({ zoom: 1, ox: 0, oy: 0 });
  expect(errors).toEqual([]);
});

test('載入：全視窗拖放、貼上、不是圖片、壞檔；一批檔案一則通知；換照片保留筆畫與貼紙（F06、F07）', async ({
  page,
}) => {
  const errors = await open(page);
  const tall = await quadPng(300, 500);
  /* 一次拖兩個檔案到視窗：第一張圖片換上，文字檔列在同一則通知裡 */
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'a.txt', { type: 'text/plain' }));
    dt.items.add(new File([bytes], 'tall.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, tall.toString('base64'));
  await expect(page.getByTestId('photo-name')).toContainText('tall.png');
  await expect(toast(page, '已換上照片「tall.png」')).toBeVisible();
  await expect(toast(page, '「a.txt」不是圖片檔')).toBeVisible();
  await expect(toasts(page)).toHaveCount(1);
  /* 畫一筆、加一張貼紙 */
  await useTool(page, '筆');
  await drag(page, [
    [100, 100],
    [300, 120],
  ]);
  await addSticker(page);
  await expect(page.getByTestId('sticker-count')).toHaveText('1 / 5');
  /* 貼上：換照片，筆畫、貼紙保留 */
  const wide = await quadPng(400, 300);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, wide.toString('base64'));
  await expect.poll(async () => (await state(page)).photo?.name).toBe('pasted.png');
  let s = await state(page);
  expect(s.layers[0].strokes).toHaveLength(1);
  expect(s.stickers).toHaveLength(1);
  expect(s.view).toEqual({ zoom: 1, ox: 0, oy: 0 });
  /* 復原：回到上一張照片 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).photo?.name).toBe('tall.png');
  /* 不是圖片、壞檔：通知，照片不變 */
  await tab(page, '編輯').click();
  await photoInput(page).setInputFiles(file('notes.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, '沒有換照片').first()).toBeVisible();
  await expect(toast(page, '「notes.txt」不是圖片檔')).toBeVisible();
  await photoInput(page).setInputFiles(file('broken.png', Buffer.from('not a png at all')));
  await expect(toast(page, /「broken\.png」無法讀取/)).toBeVisible();
  s = await state(page);
  expect(s.photo?.name).toBe('tall.png');
  expect(s.layers[0].strokes).toHaveLength(1);
  expect(errors).toEqual([]);
});

/* ---------- 尺寸 ---------- */

test('尺寸：三種相框與輸出；有筆畫時先確認，確定才清掉筆畫（貼紙保留、可以復原）；再選一次不做事（F01～F03）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 沒有筆畫：直接換、不確認 */
  await radio(page, /^橫式/).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '688x689');
  await expect(page.getByTestId('export-size')).toHaveText('2064 × 2067 px');
  await expect(page.getByTestId('aspect-hint')).toContainText('輸出 2064 × 2067 px');
  await radio(page, /^直式/).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '688x1050.667');
  await expect(page.getByTestId('export-size')).toHaveText('2064 × 3152 px');
  await expect(dialog(page)).toHaveCount(0);
  await loadPhoto(page);
  await useTool(page, '筆');
  await drag(page, [
    [100, 100],
    [400, 200],
  ]);
  await addSticker(page);
  /* 直式的新貼紙在 y 946.2，換成正方形（高 844）後要拉回相框內（D12） */
  expect((await state(page)).stickers[0].cy).toBeCloseTo(946.167, 2);
  await tab(page, '編輯').click();
  /* 有筆畫：先確認；取消＝不換 */
  await radio(page, '正方形（照片 1:1）').click();
  await expect(dialog(page)).toContainText('換尺寸會清掉所有筆畫');
  await dialog(page).getByRole('button', { name: '取消' }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '688x1050.667');
  expect((await state(page)).layers[0].strokes).toHaveLength(1);
  /* 確定：換尺寸、清掉筆畫；貼紙保留並拉回相框內 */
  await radio(page, '正方形（照片 1:1）').click();
  await dialog(page).getByRole('button', { name: '換尺寸' }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '688x844');
  let s = await state(page);
  expect(s.aspect).toBe('square');
  expect(s.layers.every((l) => l.strokes.length === 0)).toBe(true);
  expect(s.stickers).toHaveLength(1);
  expect(s.stickers[0].cy).toBe(844);
  /* 再選一次目前的尺寸：不做事 */
  await radio(page, '正方形（照片 1:1）').click();
  await expect(dialog(page)).toHaveCount(0);
  /* 復原：尺寸與筆畫一起回來 */
  await page.keyboard.press('Control+z');
  s = await state(page);
  expect(s.aspect).toBe('portrait');
  expect(s.layers[0].strokes).toHaveLength(1);
  expect(errors).toEqual([]);
});

/* ---------- 文字與相框顏色 ---------- */

test('文字：40 字、自動縮小、字型、顏色、字級；相框顏色（F14～F19）', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  const text = page.getByRole('textbox', { name: '文字內容' });
  await text.fill('Hi');
  await text.blur();
  await expect(canvas(page)).toHaveAttribute('data-caption-size', '40');
  expect((await state(page)).caption).toEqual({
    text: 'Hi',
    font: 'bold',
    color: '#1c1c1c',
    size: 40,
  });
  /* 40 字以字元計（emoji 算一個）；太長時自動縮小 */
  await text.fill('😀'.repeat(45));
  await expect(text).toHaveValue('😀'.repeat(40));
  await expect(page.getByText('40／40 字')).toBeVisible();
  await text.fill('W'.repeat(40));
  await text.blur();
  await expect
    .poll(async () => Number(await canvas(page).getAttribute('data-caption-size')))
    .toBeLessThan(40);
  await text.fill('  ');
  await text.blur();
  await expect(canvas(page)).toHaveAttribute('data-caption-size', '');
  /* 顏色與字級：文字畫在白邊的正中央 */
  await text.fill('MMMM');
  await text.blur();
  const color = page.getByRole('textbox', { name: '文字顏色' });
  await color.fill('#ff0000');
  await color.press('Enter');
  await expect.poll(async () => (await state(page)).caption.color).toBe('#ff0000');
  const size = page.getByRole('spinbutton', { name: '字級' });
  await size.fill('60');
  await size.press('Enter');
  await expect(canvas(page)).toHaveAttribute('data-caption-size', '60');
  const bounds = await canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')?.getImageData(0, 654 * 2, c.width, 190 * 2).data;
    if (!d) return null;
    let x0 = 1e9;
    let x1 = -1;
    let y0 = 1e9;
    let y1 = -1;
    for (let y = 0; y < 380; y++)
      for (let x = 0; x < c.width; x++) {
        const k = (y * c.width + x) * 4;
        if (d[k] > 200 && d[k + 1] < 60 && d[k + 2] < 60) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    return { cx: (x0 + x1) / 4, cy: 654 + (y0 + y1) / 4 };
  });
  expect(bounds).not.toBeNull();
  expect(Math.abs((bounds?.cx ?? 0) - 344)).toBeLessThan(3);
  expect(Math.abs((bounds?.cy ?? 0) - 749)).toBeLessThan(12);
  /* 字型 */
  await radio(page, '手寫（Caveat，中文霞鶩文楷）').click();
  expect((await state(page)).caption.font).toBe('cursive');
  /* 相框顏色 */
  const bg = page.getByRole('textbox', { name: '相框顏色' });
  await bg.fill('#336699');
  await bg.press('Enter');
  await expect.poll(async () => (await state(page)).cardBg).toBe('#336699');
  expect(near(await pixel(page, 15, 400), [0x33, 0x66, 0x99])).toBe(true);
  expect(near(await pixel(page, 600, 820), [0x33, 0x66, 0x99])).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 筆與橡皮擦 ---------- */

test('筆與橡皮擦：線寬、亮線、顏色與粗細、點一下畫點、拖出相框夾回、橡皮擦只擦目前的圖層（F21～F26）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await tab(page, '裝飾').click();
  await useTool(page, '筆');
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'pen');
  await drag(page, [
    [100, 200],
    [500, 200],
  ]);
  let s = await state(page);
  expect(s.layers[0].strokes).toHaveLength(1);
  const st = s.layers[0].strokes[0];
  expect(st).toMatchObject({ color: '#14b8a6', size: 14, pressure: 0.55, eraser: false });
  expect(st.points.length).toBeGreaterThanOrEqual(4);
  /* 線寬 14 × 1.045 ≈ 14.6 相框單位（預覽 2 倍 ≈ 29 px）；中心是亮線、邊上是筆的顏色 */
  const run = await inkRun(page, 300, 180, 220, RED);
  expect(run).toBeGreaterThanOrEqual(27);
  expect(run).toBeLessThanOrEqual(32);
  expect(near(await pixel(page, 300, 205), TEAL)).toBe(true);
  const mid = await pixel(page, 300, 200);
  expect(near(mid, [95, 207, 195], 12)).toBe(true);
  /* 顏色、粗細的預設鈕 */
  await page.getByRole('button', { name: '筆的顏色 #FF4D6D' }).click();
  await expect(page.getByRole('button', { name: '筆的顏色 #FF4D6D' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '粗細 34' }).click();
  await expect(page.getByRole('spinbutton', { name: '粗細' })).toHaveValue('34');
  /* 點一下：一點的筆畫（實心圓點） */
  const p = await at(page, 500, 500);
  await page.mouse.click(p.x, p.y);
  s = await state(page);
  expect(s.layers[0].strokes[1]).toMatchObject({ color: '#ff4d6d', size: 34 });
  expect(s.layers[0].strokes[1].points).toHaveLength(2);
  expect(near(await pixel(page, 500, 500), [0xff, 0x4d, 0x6d])).toBe(true);
  /* 自訂顏色 */
  const custom = page.getByRole('textbox', { name: '自訂顏色' });
  await custom.fill('#123456');
  await custom.press('Enter');
  await expect.poll(async () => (await pen(page)).color).toBe('#123456');
  await expect(page.getByTestId('custom-pen')).toHaveAttribute('data-active', 'true');
  /* 拖出相框：點夾回相框邊上 */
  await page.getByRole('button', { name: '粗細 8' }).click();
  await drag(page, [
    [600, 700],
    [760, 900],
  ]);
  s = await state(page);
  const out = s.layers[0].strokes[2].points;
  expect(Math.max(...out.filter((_, i) => i % 2 === 0))).toBeLessThanOrEqual(688);
  expect(Math.max(...out.filter((_, i) => i % 2 === 1))).toBeLessThanOrEqual(844);
  /* 橡皮擦在圖層 2：圖層 1 的線不受影響 */
  await layerList(page).locator('[data-layer-row="l2"]').click();
  await expect.poll(async () => (await pen(page)).layer).toBe('l2');
  await page.getByRole('button', { name: '粗細 34' }).click();
  await useTool(page, '橡皮擦');
  await drag(page, [
    [300, 170],
    [300, 230],
  ]);
  s = await state(page);
  expect(s.layers[1].strokes[0]).toMatchObject({ eraser: true, size: 34 });
  expect(near(await pixel(page, 300, 205), TEAL)).toBe(true);
  /* 在圖層 1 擦：線不見、露出照片 */
  await layerList(page).locator('[data-layer-row="l1"]').click();
  await drag(page, [
    [300, 170],
    [300, 230],
  ]);
  expect(near(await pixel(page, 300, 205), RED)).toBe(true);
  expect(near(await pixel(page, 200, 205), TEAL)).toBe(true);
  /* 之後在同一圖層畫的線蓋在擦過的地方上面 */
  await useTool(page, '筆');
  await page.getByRole('button', { name: '筆的顏色 #FFFFFF' }).click();
  await drag(page, [
    [280, 205],
    [320, 205],
  ]);
  expect(near(await pixel(page, 300, 212), [255, 255, 255])).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 圖層 ---------- */

test('圖層：上層在前、名稱依位置、顯示／隱藏、上下、清除這個圖層、全部清除（F27～F32）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await tab(page, '裝飾').click();
  const rows = layerList(page).locator('[data-layer-row]');
  await expect(rows).toHaveText([/圖層 3/, /圖層 2/, /圖層 1/]);
  await expect(layerList(page).locator('li[aria-current="true"]')).toContainText('圖層 1');
  await expect(page.getByRole('button', { name: '清除這個圖層' })).toBeDisabled();
  await useTool(page, '筆');
  await drag(page, [
    [100, 200],
    [500, 200],
  ]);
  await expect(rows.nth(2)).toContainText('1 筆 · 畫在這層');
  /* 隱藏：預覽不畫；再顯示 */
  await page.getByRole('button', { name: '隱藏「圖層 1」' }).click();
  expect((await state(page)).layers[0].visible).toBe(false);
  expect(near(await pixel(page, 300, 205), RED)).toBe(true);
  await page.getByRole('button', { name: '顯示「圖層 1」' }).click();
  expect(near(await pixel(page, 300, 205), TEAL)).toBe(true);
  /* 圖層 3 畫白線、蓋在圖層 1 上；把圖層 1 移到最上面：名稱跟著位置變 */
  await layerList(page).locator('[data-layer-row="l3"]').click();
  await page.getByRole('button', { name: '筆的顏色 #FFFFFF' }).click();
  await drag(page, [
    [300, 150],
    [300, 250],
  ]);
  expect(near(await pixel(page, 300, 205), [255, 255, 255])).toBe(true);
  await page.getByRole('button', { name: '往上一層：圖層 1' }).click();
  await page.getByRole('button', { name: '往上一層：圖層 2' }).click();
  expect((await state(page)).layers.map((l) => l.id)).toEqual(['l2', 'l3', 'l1']);
  await expect(rows.first()).toContainText('圖層 3');
  await expect(rows.first()).toHaveAttribute('data-layer-row', 'l1');
  expect(near(await pixel(page, 300, 205), TEAL)).toBe(true);
  /* 清除這個圖層（目前是 l3，位置 2）：先確認 */
  await page.getByRole('button', { name: '清除這個圖層' }).click();
  await expect(dialog(page)).toContainText('清除圖層 2？');
  await dialog(page).getByRole('button', { name: '取消' }).click();
  expect((await state(page)).layers[1].strokes).toHaveLength(1);
  await page.getByRole('button', { name: '清除這個圖層' }).click();
  await dialog(page).getByRole('button', { name: '清除' }).click();
  expect((await state(page)).layers[1].strokes).toEqual([]);
  /* 全部清除 */
  await page.getByRole('button', { name: '全部清除' }).click();
  await expect(dialog(page)).toContainText('清除所有圖層？');
  await dialog(page).getByRole('button', { name: '清除' }).click();
  expect((await state(page)).layers.every((l) => !l.strokes.length)).toBe(true);
  await expect(page.getByRole('button', { name: '全部清除' })).toBeDisabled();
  expect(near(await pixel(page, 300, 205), RED)).toBe(true);
  /* 復原 */
  await page.keyboard.press('Control+z');
  expect((await state(page)).layers[2].strokes).toHaveLength(1);
  expect(errors).toEqual([]);
});

/* ---------- 貼紙 ---------- */

test('貼紙：加入、白邊、筆畫在上面、拖曳（中心夾在相框內）、縮放、旋轉、鍵盤、清單（F33～F39、F54）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  /* 深色相框，看得出白邊 */
  const bg = page.getByRole('textbox', { name: '相框顏色' });
  await bg.fill('#333333');
  await bg.press('Enter');
  await tab(page, '裝飾').click();
  await useTool(page, '筆');
  await addSticker(page);
  await expect(toast(page, '已加入 1 張貼紙')).toBeVisible();
  let s = await state(page);
  expect(s.stickers[0]).toMatchObject({
    id: 's1',
    name: 'star.png',
    cx: 344,
    cy: 739.5,
    width: 120,
    height: 80,
    rotation: 0,
  });
  /* 自動選取、切到移動 */
  await expect(radio(page.getByTestId('tool-bar'), '移動')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', 's1');
  await expect(page.getByTestId('sticker-frame')).toBeVisible();
  await expect(stickerList(page).locator('li[aria-current="true"]')).toContainText(
    '貼紙 A · star.png',
  );
  /* 白邊：橢圓左緣（x 294）往外 3 單位是白色、往外 9 單位是相框 */
  expect(near(await pixel(page, 344, 739.5), [240, 120, 20])).toBe(true);
  expect(near(await pixel(page, 291, 739.5), [255, 255, 255], 12)).toBe(true);
  expect(near(await pixel(page, 285, 739.5), [0x33, 0x33, 0x33], 12)).toBe(true);
  /* 筆畫在貼紙上面 */
  await useTool(page, '筆');
  await expect(page.locator('[data-sticker]')).toHaveCount(0);
  await drag(page, [
    [300, 745],
    [390, 745],
  ]);
  expect(near(await pixel(page, 344, 750), TEAL)).toBe(true);
  /* 拖曳移動 */
  await useTool(page, '移動');
  const sticker = page.locator('[data-sticker="s1"]');
  const b0 = await sticker.boundingBox();
  if (!b0) throw new Error('找不到貼紙');
  const k = b0.width / 120;
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 - 100 * k, b0.y + b0.height / 2 - 200 * k, {
    steps: 5,
  });
  await page.mouse.up();
  s = await state(page);
  expect(s.stickers[0].cx).toBeCloseTo(244, 0);
  expect(s.stickers[0].cy).toBeCloseTo(539.5, 0);
  /* 拖到相框外：中心夾在相框內 */
  const b1 = await sticker.boundingBox();
  if (!b1) throw new Error('找不到貼紙');
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 - 600 * k, b1.y + b1.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await state(page)).stickers[0].cx).toBe(0);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await state(page)).stickers[0].cx).toBe(11);
  expect((await state(page)).stickers[0].cy).toBeCloseTo(540.5, 0);
  /* 縮放（維持比例）、旋轉（Shift 每 15°） */
  const corner = page.locator('[data-sticker-corner="se"]');
  const c = await corner.boundingBox();
  if (!c) throw new Error('找不到控點');
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 60 * k, c.y + c.height / 2 + 40 * k, { steps: 5 });
  await page.mouse.up();
  s = await state(page);
  expect(s.stickers[0].width).toBeGreaterThan(150);
  expect(s.stickers[0].width / s.stickers[0].height).toBeCloseTo(1.5, 3);
  const rot = page.locator('[data-sticker-rotate="s1"]');
  const r = await rot.boundingBox();
  const sb = await sticker.boundingBox();
  if (!r || !sb) throw new Error('找不到控點');
  await page.keyboard.down('Shift');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width + 80, sb.y + sb.height / 2 - 20, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const deg = (await state(page)).stickers[0].rotation;
  expect(deg).not.toBe(0);
  expect(Math.abs(deg % 15)).toBe(0);
  /* Esc 取消選取；點空白處也取消（並開始拖曳取景） */
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', '');
  /* 清單：在筆的時候點列 → 選取並切到移動 */
  await useTool(page, '筆');
  await stickerList(page).locator('[data-layer-row="s1"]').click();
  await expect(radio(page.getByTestId('tool-bar'), '移動')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', 's1');
  const p = await at(page, 600, 100);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', '');
  /* 上限 5：一次選 7 個檔案（含一個文字檔）→ 加到 5 張，沒加入的列在同一則通知 */
  const many = [
    file('b.png', await stickerPng([200, 0, 0])),
    file('c.png', await stickerPng([0, 200, 0])),
    file('note.txt', Buffer.from('x'), 'text/plain'),
    file('d.png', await stickerPng([0, 0, 200])),
    file('e.png', await stickerPng([200, 200, 0])),
    file('f.png', await stickerPng([0, 200, 200])),
  ];
  await stickerInput(page).setInputFiles(many);
  await expect(toast(page, '已加入 4 張貼紙')).toBeVisible();
  await expect(
    toast(page, /「note\.txt」不是圖片檔.*超過 5 張的上限，沒有加入「f\.png」/),
  ).toBeVisible();
  await expect(toasts(page).filter({ hasText: '張貼紙' })).toHaveCount(1);
  await expect(page.getByTestId('sticker-count')).toHaveText('5 / 5');
  await expect(page.getByRole('button', { name: '＋ 加入貼紙圖片' })).toBeDisabled();
  await expect(page.getByText('已經有 5 張貼紙（上限），刪掉一張才能再加。')).toBeVisible();
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', 's5');
  /* 清單上層在前、字母依位置；上下、刪除 */
  const rows = stickerList(page).locator('[data-layer-row]');
  await expect(rows).toHaveText([
    /貼紙 E · e\.png/,
    /貼紙 D/,
    /貼紙 C/,
    /貼紙 B/,
    /貼紙 A · star\.png/,
  ]);
  await page.getByRole('button', { name: '往下一層：貼紙 E · e.png' }).click();
  expect((await state(page)).stickers.map((x) => x.name)).toEqual([
    'star.png',
    'b.png',
    'c.png',
    'e.png',
    'd.png',
  ]);
  /* Delete 刪除選取的（s5＝e.png）→ 改選最上面的 */
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('sticker-count')).toHaveText('4 / 5');
  await expect(page.getByTestId('move-layer')).toHaveAttribute('data-selected', 's4');
  await page.getByRole('button', { name: '刪除：貼紙 A · star.png' }).click();
  expect((await state(page)).stickers.map((x) => x.name)).toEqual(['b.png', 'c.png', 'd.png']);
  await expect(page.getByRole('button', { name: '＋ 加入貼紙圖片' })).toBeEnabled();
  /* 復原：一批加入算一步 */
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await state(page)).stickers.map((x) => x.name)).toEqual(['star.png']);
  expect(errors).toEqual([]);
});

/* ---------- 輸出 ---------- */

test('下載 PNG：檔名、3 倍尺寸、像素與預覽一致（不含選取框）；沒有照片也能存（F44、F45、D7）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 沒有照片：灰底、沒有「加入照片」的字樣 */
  let { name, png } = await downloadPng(page);
  expect(name).toBe('polaroid.png');
  expect([png.width, png.height]).toEqual([2064, 2532]);
  expect(near(png.at(344 * 3, 300 * 3), EMPTY, 2)).toBe(true);
  expect(near(png.at(344 * 3, 250 * 3), EMPTY, 2)).toBe(true);
  await loadPhoto(page);
  await page.getByRole('textbox', { name: '文字內容' }).fill('Hello');
  await page.getByRole('textbox', { name: '文字內容' }).blur();
  await useTool(page, '筆');
  await drag(page, [
    [100, 200],
    [500, 200],
  ]);
  await addSticker(page);
  await expect(page.getByTestId('sticker-frame')).toBeVisible();
  ({ name, png } = await downloadPng(page));
  expect([png.width, png.height]).toEqual([2064, 2532]);
  await expect(toast(page, '已下載 polaroid.png').first()).toBeVisible();
  /* 與預覽（2 倍）相同的位置抽樣 */
  const points: [number, number][] = [
    [100, 100],
    [600, 100],
    [100, 600],
    [600, 600],
    [300, 205],
    [300, 200],
    [344, 739.5],
    [291, 739.5],
    [20, 400],
    [344, 820],
    [600, 700],
  ];
  for (const [x, y] of points) {
    const a = png.at(Math.round(x * 3), Math.round(y * 3));
    const b = await pixel(page, x, y);
    expect(near(a, b, 14), `(${x}, ${y}) 輸出 ${a} 預覽 ${b}`).toBe(true);
  }
  /* 圓角外透明、相框外框線、照片細線 */
  expect(png.at(0, 0)[3]).toBeLessThan(60);
  expect(png.at(1032, 1)[3]).toBe(255);
  const edge = png.at(1032, 1);
  expect(edge[0]).toBeLessThan(0xfb - 8);
  const line = png.at(34 * 3, 300 * 3);
  const inside = png.at(34 * 3 + 6, 300 * 3);
  expect(line[0]).toBeLessThan(inside[0]);
  /* 橫式：2064 × 2067 */
  await tab(page, '編輯').click();
  await radio(page, /^橫式/).click();
  await dialog(page).getByRole('button', { name: '換尺寸' }).click();
  ({ png } = await downloadPng(page));
  expect([png.width, png.height]).toEqual([2064, 2067]);
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原、照片讀不到的提醒；復原／重做（按鈕與快捷鍵，拖曳算一步）（F51、F52）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  const text = page.getByRole('textbox', { name: '文字內容' });
  await text.fill('');
  await text.pressSequentially('abc');
  await text.blur();
  /* 文字欄：從聚焦到離開算一步 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).caption.text).toBe('');
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).caption.text).toBe('abc');
  /* 一筆一步；拖曳取景一步 */
  await useTool(page, '筆');
  await drag(page, [
    [100, 200],
    [300, 200],
    [500, 220],
  ]);
  await useTool(page, '移動');
  await drag(page, [
    [300, 300],
    [320, 300],
    [360, 300],
  ]);
  expect((await state(page)).view.ox).toBeCloseTo(60, 0);
  await page.keyboard.press('Control+z');
  expect((await state(page)).view.ox).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await state(page)).layers[0].strokes).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).layers[0].strokes).toHaveLength(1);
  await page.keyboard.press('Control+y');
  expect((await state(page)).view.ox).toBeCloseTo(60, 0);
  /* 筆的設定、分頁（不列入復原）也記住 */
  await tab(page, '裝飾').click();
  await page.getByRole('button', { name: '筆的顏色 #FFD400' }).click();
  await page.getByRole('button', { name: '粗細 22' }).click();
  await useTool(page, '橡皮擦');
  await addSticker(page);
  await useTool(page, '橡皮擦');
  const before = await state(page);
  await page.reload();
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'eraser');
  expect(await state(page)).toEqual(before);
  expect(await pen(page)).toMatchObject({
    tool: 'eraser',
    color: '#ffd400',
    size: 22,
    tab: 'decorate',
  });
  await expect(tab(page, '裝飾')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  await expect.poll(async () => near(await pixel(page, 100, 100), RED)).toBe(true);
  await expect.poll(async () => near(await pixel(page, 344, 739.5), [240, 120, 20])).toBe(true);
  /* 照片讀不到：提醒重新選擇 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.photo.id = 'amissingphoto0';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('上次的照片讀不到了')).toBeVisible();
  expect(near(await pixel(page, 100, 100), EMPTY)).toBe(true);
  await loadPhoto(page);
  await expect(page.getByText('上次的照片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋照片＋貼紙）、重設、開啟還原；缺圖片的不套用（F53）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await page.getByRole('textbox', { name: '文字內容' }).fill('Memory');
  await useTool(page, '筆');
  await drag(page, [
    [100, 200],
    [500, 200],
  ]);
  await addSticker(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^polaroid_\d{8}.*\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('polaroid');
  expect(project.data.caption.text).toBe('Memory');
  expect(project.data.layers).toHaveLength(3);
  expect(project.data.layers[0].strokes[0]).toMatchObject({ color: '#14b8a6', size: 14 });
  expect(project.data.stickers[0]).toMatchObject({ name: 'star.png', width: 120, height: 80 });
  const ids = [project.data.photo.id, project.data.stickers[0].asset];
  for (const id of ids) expect(Object.keys(entries)).toContain(`files/${id}.png`);

  /* 重設 */
  await openProjectItem(page, '重設…');
  await dialog(page).getByRole('button', { name: '重設' }).click();
  await expect(page.getByTestId('empty-pick')).toBeVisible();
  let s = await state(page);
  expect(s.stickers).toEqual([]);
  expect(s.caption.text).toBe('');
  expect((await pen(page)).tool).toBe('move');

  const openZip = async (name: string, bytes: Uint8Array) => {
    await openProjectItem(page, '開啟專案檔…');
    await expect(dialog(page)).toContainText('開啟專案檔？');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dialog(page).getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser.setFiles(file(name, Buffer.from(bytes), 'application/zip'));
  };
  await openZip('back.zip', zipBytes);
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  s = await state(page);
  expect(s.caption.text).toBe('Memory');
  expect(s.layers[0].strokes).toHaveLength(1);
  expect(s.stickers).toHaveLength(1);
  await expect.poll(async () => near(await pixel(page, 100, 100), RED)).toBe(true);

  /* 缺貼紙的圖：不套用 */
  const missing = {
    ...project,
    data: {
      ...project.data,
      caption: { ...project.data.caption, text: 'nope' },
      stickers: [{ ...project.data.stickers[0], asset: 'amissingsticker' }],
    },
  };
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(
    page.getByText('專案檔裡少了照片或貼紙的圖片，或圖片無法讀取。').first(),
  ).toBeVisible();
  expect((await state(page)).caption.text).toBe('Memory');
  expect(errors).toEqual([]);
});

/* ---------- 快捷鍵、觸控 ---------- */

test('快捷鍵：B 筆、E 橡皮擦、V 移動（有照片時；文字欄裡不作用）（F55）', async ({ page }) => {
  const errors = await open(page);
  await page.locator('body').press('b');
  expect((await pen(page))?.tool ?? 'move').toBe('move');
  await loadPhoto(page);
  await page.locator('body').press('b');
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'pen');
  await page.locator('body').press('e');
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'eraser');
  await page.locator('body').press('v');
  await expect(page.getByTestId('move-layer')).toBeVisible();
  const text = page.getByRole('textbox', { name: '文字內容' });
  await text.focus();
  await page.keyboard.type('be');
  await expect(text).toHaveValue('be');
  await expect(page.getByTestId('move-layer')).toBeVisible();
  expect(errors).toEqual([]);
});

test('觸控：手指畫線（壓力 0.6）、拖曳取景、拖曳貼紙（F56）', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  await loadPhoto(page);
  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (a: [number, number], b: [number, number]) => {
    const p = await at(page, a[0], a[1]);
    const q = await at(page, b[0], b[1]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: p.x + ((q.x - p.x) * i) / 5, y: p.y + ((q.y - p.y) * i) / 5 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await radio(page.getByTestId('tool-bar'), '筆').tap();
  await touchDrag([100, 200], [500, 200]);
  const s = await state(page);
  expect(s.layers[0].strokes[0]).toMatchObject({ pressure: 0.6, eraser: false });
  /* 拖曳後馬上點的一下可能被瀏覽器當成手勢的一部分：換工具用快捷鍵 */
  await page.locator('body').press('v');
  await expect(page.getByTestId('move-layer')).toBeVisible();
  await touchDrag([300, 300], [360, 300]);
  expect((await state(page)).view.ox).toBeCloseTo(60, 0);
  await addSticker(page);
  await touchDrag([344, 739.5], [244, 639.5]);
  const st = (await state(page)).stickers[0];
  expect(st.cx).toBeCloseTo(244, 0);
  expect(st.cy).toBeCloseTo(639.5, 0);
  expect(errors).toEqual([]);
  await ctx.close();
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));
  const errors = await open(page);
  await noHorizontalScroll(page);
  await loadPhoto(page);
  await page.getByRole('textbox', { name: '文字內容' }).fill('Hello Polaroid!');
  await page.getByRole('textbox', { name: '文字內容' }).blur();
  await useTool(page, '筆');
  await drag(page, [
    [100, 200],
    [300, 260],
    [500, 200],
  ]);
  await addSticker(page);
  /* 通知會自己消失（時間不一定），截圖前先關掉 */
  await expect(toast(page, '已加入 1 張貼紙')).toBeVisible();
  for (const b of await page.getByRole('button', { name: '關閉通知' }).all()) await b.click();
  await expect(toasts(page)).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('polaroid-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('polaroid-390.png', { fullPage: true });
  await tab(page, '編輯').click();
  await noHorizontalScroll(page);
  await page.goto(URL);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後的修正（7.1） ---------- */

/** IndexedDB 的寫入（readwrite 交易的完成通知）延後 delay 毫秒：模擬慢的儲存空間 */
function slowIdb(delay: number) {
  const desc = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  if (!desc?.set || !desc.get) return;
  const { get, set } = desc;
  Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
    configurable: true,
    get() {
      return get.call(this);
    },
    set(fn) {
      if (this.mode !== 'readwrite' || typeof fn !== 'function') {
        set.call(this, fn);
        return;
      }
      set.call(this, (e: Event) => setTimeout(() => fn.call(this, e), delay));
    },
  });
}

/** 新的瀏覽器環境（自己的儲存空間）；init 在每次開頁前執行 */
async function freshPage(
  browser: Browser,
  init?: { fn: (arg: number) => void; arg: number } | { fn: () => void },
) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (init && 'arg' in init) await page.addInitScript(init.fn, init.arg);
  else if (init) await page.addInitScript(init.fn as () => void);
  const errors = await open(page);
  return { ctx, page, errors };
}

/** 專案檔 ZIP：照片＋兩張貼紙（在另一個瀏覽器環境裡做） */
async function projectZip(browser: Browser): Promise<Buffer> {
  const { ctx, page } = await freshPage(browser);
  await loadPhoto(page);
  await addSticker(page, 'a.png', await stickerPng([200, 0, 0]));
  await addSticker(page, 'b.png', await stickerPng([0, 0, 200]));
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const bytes = readFileSync((await dl.path()) as string);
  await ctx.close();
  return bytes;
}

async function openZipFile(page: Page, bytes: Buffer) {
  await openProjectItem(page, '開啟專案檔…');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog(page).getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('memory.zip', bytes, 'application/zip'));
}

const sinceLoad = (page: Page) => page.evaluate(() => performance.now());

test('7.1 F51：開頁的圖片整理不刪正在寫進 IndexedDB 的照片（寫入很慢時也不會誤報「無法讀取」）', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const { ctx, page, errors } = await freshPage(browser, { fn: slowIdb, arg: 3000 });
  /* 開頁約 2.5 秒時放照片：寫進 IndexedDB 要 3 秒，開頁 5 秒的整理剛好在寫入途中 */
  await page.waitForTimeout(Math.max(0, 2500 - (await sinceLoad(page))));
  await photoInput(page).setInputFiles(file('slow.png', await quadPng()));
  await expect
    .poll(async () => (await state(page))?.photo?.name, { timeout: 15_000 })
    .toBe('slow.png');
  await expect(toast(page, /無法讀取/)).toHaveCount(0);
  /* 等整理與寫入都結束，重新整理：照片還在 */
  await page.waitForTimeout(Math.max(0, 9000 - (await sinceLoad(page))));
  await page.reload();
  await expect
    .poll(async () => near(await pixel(page, 100, 100), RED), { timeout: 10_000 })
    .toBe(true);
  await expect(page.getByText('上次的照片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('7.1 F51：開啟專案檔時圖片寫得很慢，開頁的圖片整理也不刪已經寫好、還沒換上的圖', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const zip = await projectZip(browser);
  const { ctx, page, errors } = await freshPage(browser, { fn: slowIdb, arg: 2500 });
  /* 三張圖依序寫入，每張 2.5 秒：開頁 5 秒的整理時第一張已經寫好、整個專案還沒換上 */
  await openZipFile(page, zip);
  await expect(toast(page, '已開啟專案檔。')).toBeVisible({ timeout: 20_000 });
  const s = await state(page);
  expect(s.photo?.name).toBe('quad.png');
  expect(s.stickers).toHaveLength(2);
  await page.waitForTimeout(Math.max(0, 12_000 - (await sinceLoad(page))));
  await page.reload();
  await expect
    .poll(async () => near(await pixel(page, 100, 100), RED), { timeout: 10_000 })
    .toBe(true);
  await expect(page.getByText(/讀不到了/)).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('7.1 F51：IndexedDB 不能用時開啟專案檔，同一則通知提醒圖片重新整理後會不見', async ({
  browser,
}) => {
  const zip = await projectZip(browser);
  const { ctx, page, errors } = await freshPage(browser, {
    fn: () => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
    },
  });
  await openZipFile(page, zip);
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  await expect(toast(page, /重新整理之後就不見了/)).toBeVisible();
  await expect(toasts(page)).toHaveCount(1);
  expect((await state(page)).stickers).toHaveLength(2);
  expect(errors).toEqual([]);
  await ctx.close();
});

/** 在某個元素上模擬拖著檔案經過（dragenter＋dragover） */
async function dragOverWith(target: Locator, name: string, b64: string) {
  await target.evaluate(
    (el, { name, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: 'image/png' }));
      (window as unknown as { __dt: DataTransfer }).__dt = dt;
      for (const type of ['dragenter', 'dragover'])
        el.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
    },
    { name, b64 },
  );
}

/** 在某個元素上放開（用 dragOverWith 準備好的檔案） */
async function dropOn(target: Locator) {
  await target.evaluate((el) => {
    const dt = (window as unknown as { __dt: DataTransfer }).__dt;
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
}

test('7.1 F33：拖到貼紙區時提示「加入貼紙」；已滿 5 張時拖到貼紙區說明已滿、不換照片', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await tab(page, '裝飾').click();
  const zone = page.getByRole('group', { name: '把貼紙圖片拖到這裡' });
  const png = (await stickerPng([0, 160, 0])).toString('base64');
  /* 拖到貼紙區：覆蓋層說加入貼紙；拖到別的地方：說換照片 */
  await dragOverWith(zone, 'x.png', png);
  await expect(page.getByTestId('window-drop')).toContainText('放開即可加入貼紙');
  await dragOverWith(page.locator('footer'), 'x.png', png);
  await expect(page.getByTestId('window-drop')).toContainText('放開即可換成這張照片');
  await dragOverWith(zone, 'x.png', png);
  await dropOn(zone);
  await expect.poll(async () => (await state(page)).stickers.length).toBe(1);
  await expect(page.getByTestId('window-drop')).toHaveCount(0);
  /* 加到滿 5 張 */
  await stickerInput(page).setInputFiles([
    file('b.png', await stickerPng([200, 0, 0])),
    file('c.png', await stickerPng([0, 0, 200])),
    file('d.png', await stickerPng([200, 200, 0])),
    file('e.png', await stickerPng([0, 200, 200])),
  ]);
  await expect(page.getByTestId('sticker-count')).toHaveText('5 / 5');
  const before = await state(page);
  /* 已滿：覆蓋層說已滿；放開不換照片，通知說超過上限 */
  await dragOverWith(zone, 'sixth.png', png);
  await expect(page.getByTestId('window-drop')).toContainText('貼紙已經有 5 張');
  await dropOn(zone);
  await expect(toast(page, /超過 5 張的上限，沒有加入「sixth\.png」/)).toBeVisible();
  const after = await state(page);
  expect(after.photo?.name).toBe(before.photo?.name);
  expect(after.stickers).toHaveLength(5);
  expect(errors).toEqual([]);
});

test('7.1 F15：開頁時就載入字型按鈕用到的字（「手寫」以霞鶩文楷顯示）', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('fonts.googleapis.com')) fonts.push(decodeURIComponent(r.url()));
  });
  const errors = await open(page);
  await expect.poll(() => fonts.some((u) => /LXGW\+WenKai\+TC|LXGW WenKai TC/.test(u))).toBe(true);
  /* 文字是空白、還沒選過手寫 */
  expect((await state(page))?.caption?.text ?? '').toBe('');
  expect(errors).toEqual([]);
});
