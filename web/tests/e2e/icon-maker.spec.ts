/**
 * 簡易頭像產生器（建置產物 tools/icon-maker/）的端對端測試：
 * - 開頁沒有 pageerror／console error；預設設定與摘要；頁尾只有靈感來源；重新整理回到預設、不寫入 localStorage；
 * - 載入：選檔（PNG／JPEG／WebP）、非圖片靜默忽略、拖放只取第一個（GIF 也收）、載入後縮成一列、更換圖片；
 *   載入不重設位置與倍率、載入後選取圖片；
 * - 版面：點選、拖曳與夾限、參考線與距離標籤、控點與大小範圍、Esc；方向鍵（0.2%／Shift 2%、不夾範圍）、
 *   Ctrl＋方向鍵也移動（步距相同）、文字欄焦點時不作用、Delete／Backspace 取消選取；放大縮小（±8%、35%～300%）；
 *   重設版面只重設版面；直排／橫排各自的名字牌；
 * - 對等驗證後的追加裁定（規格 7.1）：頁面有反白（Ctrl＋A）時拖曳物件與控點完整作用、不變成原生拖放；
 *   距離標籤一律在預覽看得到的範圍內；名字與 HO 的字級固定（牌子拉大不變大）；
 * - 摘要 8 項即時反映；
 * - 下載：檔名、1024 × 1024 RGBA、四角透明、外框色與粗細、背景（含透明、花紋、漸層）、圖片位置與倍率、
 *   與預覽畫布逐像素相同（所見即所得）；沒有圖片也能下載（佔位圖）；
 * - 複製：剪貼簿的 PNG 與下載相同；失敗時提示改用下載；
 * - 說明與快捷鍵對話框、Esc 關閉；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { percentToBox } from '../../src/core/layout';
import { getTool, outputDir } from '../../src/registry';
import { innerRect, LAYOUT_DEFAULTS, PRESETS } from '../../src/tools/icon-maker/logic';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('icon-maker') ?? { id: 'icon-maker', status: 'next' })}/`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Layout = Record<'image' | 'name' | 'ho', Box>;
type Rgba = [number, number, number, number];

const GREEN: Rgba = [40, 200, 80, 255];
const RED: Rgba = [220, 40, 40, 255];
const hexRgb = (hex: string): Rgba => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
  255,
];
const FIRST = PRESETS[0];

/** 測試圖：左上四分之一綠色、其餘紅色（規格 3.9） */
async function testPng(w = 400, h = 800): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 && y < h / 2 ? GREEN : RED;
      px.set(c, (y * w + x) * 4);
    }
  }
  return Buffer.from(await encodePng(px, w, h));
}
/** 1 × 1 的 GIF */
const GIF_1X1 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
  await expect(page.getByRole('heading', { level: 1, name: '簡易頭像產生器' })).toBeVisible();
  return errors;
}

const dropZone = (page: Page) => page.getByRole('group', { name: '角色圖載入區' });
const fileInput = (page: Page) => dropZone(page).locator('input[type=file]');
const loadArea = (page: Page) => page.getByTestId('load-area');
const summary = (page: Page, key: string) => page.getByTestId(`summary-${key}`);
const item = (page: Page, id: string) => page.locator(`[data-layout-item="${id}"]`);
const handle = (page: Page) => page.locator('[data-layout-handle="se"]');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });
const frameGroup = (page: Page) => page.getByRole('radiogroup', { name: '外框', exact: true });
const presetGroup = (page: Page) => page.getByRole('radiogroup', { name: '配色', exact: true });
const backgroundGroup = (page: Page) => page.getByRole('radiogroup', { name: '背景', exact: true });

async function layout(page: Page): Promise<Layout> {
  return JSON.parse((await page.getByTestId('icon-canvas').getAttribute('data-layout')) ?? '{}');
}

/** 預覽上一個畫布 px 等於幾個螢幕 px */
async function screenScale(page: Page): Promise<number> {
  const b = await page.getByTestId('icon-canvas').boundingBox();
  if (!b) throw new Error('找不到預覽畫布');
  return b.width / 1024;
}

/** 螢幕 px → 內側區域的 % */
async function toPercent(page: Page, screenPx: number, frameWidth = 18): Promise<number> {
  return (screenPx / (await screenScale(page)) / innerRect(frameWidth).width) * 100;
}

async function centerOf(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('找不到元素');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(page: Page, l: Locator, dx: number, dy: number, during?: () => Promise<void>) {
  const c = await centerOf(l);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 });
  await during?.();
  await page.mouse.up();
}

async function dragTo(page: Page, l: Locator, x: number, y: number, during?: () => Promise<void>) {
  const c = await centerOf(l);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await during?.();
  await page.mouse.up();
}

const expectBox = (actual: Box, expected: Box, digits = 2) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.width).toBeCloseTo(expected.width, digits);
  expect(actual.height).toBeCloseTo(expected.height, digits);
};

const imageCenter = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

interface Png {
  name: string;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  px: Uint8Array;
}

function decode(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const parts = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const z = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    z.set(p, o);
    o += p.length;
  }
  return { ...ihdr, px: decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType) };
}

async function download(page: Page): Promise<Png> {
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '下載 PNG').click()]);
  const path = await dl.path();
  if (!path) throw new Error('下載失敗');
  return { name: dl.suggestedFilename(), ...decode(readFileSync(path)) };
}

const at = (png: { px: Uint8Array; width: number }, x: number, y: number): Rgba => {
  const k = (y * png.width + x) * 4;
  return [png.px[k], png.px[k + 1], png.px[k + 2], png.px[k + 3]];
};

const expectColor = (actual: Rgba, expected: Rgba, tol = 3) => {
  for (let i = 0; i < 4; i++) {
    expect(
      Math.abs(actual[i] - expected[i]),
      `${actual.join(',')} ≈ ${expected.join(',')}`,
    ).toBeLessThanOrEqual(tol);
  }
};

/** 預覽畫布的 RGBA */
async function previewPixels(page: Page): Promise<Uint8Array> {
  const b64 = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="icon-canvas"]');
    const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return '';
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000)
      s += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** 兩張 RGBA 不同的像素數（任一通道差 > tol；兩邊都完全透明的不算） */
function diffCount(a: Uint8Array, b: Uint8Array, tol = 3): number {
  expect(a.length).toBe(b.length);
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0 && b[i + 3] === 0) continue;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(a[i + k] - b[i + k]) > tol) {
        n++;
        break;
      }
    }
  }
  return n;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function loadTestImage(page: Page, name = '角色.png') {
  await fileInput(page).setInputFiles({ name, mimeType: 'image/png', buffer: await testPng() });
  await expect(page.getByTestId('loaded-name')).toContainText(name);
}

/** 焦點不在輸入框時按 Ctrl＋A，整頁反白 */
async function selectAll(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+A');
  expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(50);
}

/** 記錄瀏覽器原生的拖放與指標取消（拖曳物件時都不應該出現） */
async function watchNativeDrag(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __nativeDrag: string[] };
    w.__nativeDrag = [];
    for (const type of ['dragstart', 'pointercancel'])
      window.addEventListener(type, () => w.__nativeDrag.push(type), true);
  });
  return () => page.evaluate(() => (window as unknown as { __nativeDrag: string[] }).__nativeDrag);
}

/** 兩個距離標籤都完整落在預覽畫布裡（看得到），而且彼此不重疊 */
async function labelsInsideCanvas(page: Page) {
  const c = await page.getByTestId('icon-canvas').boundingBox();
  if (!c) throw new Error('找不到預覽畫布');
  const boxes: Box[] = [];
  for (const key of ['x', 'y']) {
    const b = await page.getByTestId(`layout-distance-${key}`).boundingBox();
    if (!b) throw new Error(`找不到距離標籤 ${key}`);
    expect(b.x, `${key} 左緣`).toBeGreaterThanOrEqual(c.x - 0.5);
    expect(b.y, `${key} 上緣`).toBeGreaterThanOrEqual(c.y - 0.5);
    expect(b.x + b.width, `${key} 右緣`).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(b.y + b.height, `${key} 下緣`).toBeLessThanOrEqual(c.y + c.height + 0.5);
    boxes.push(b);
  }
  const [a, b] = boxes;
  const overlap =
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5;
  expect(overlap, '兩個標籤不重疊').toBe(false);
}

/** 牌子範圍裡「文字」像素的外接框（1024 畫布 px；左右內縮一個圓角半徑、上下內縮 4 px，避開圓角外的背景） */
function inkBox(png: Png, plate: Box, isInk: (c: Rgba) => boolean) {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const top = Math.max(0, Math.ceil(plate.y + 4));
  const bottom = Math.min(png.height, Math.floor(plate.y + plate.height - 4));
  const left = Math.max(0, Math.ceil(plate.x + 24));
  const right = Math.min(png.width, Math.floor(plate.x + plate.width - 24));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (!isInk(at(png, x, y))) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
/** 名字牌：接近黑的深藍灰字；HO 深色樣式：白字 */
const darkInk = ([r, g, b]: Rgba) => r + g + b < 300;
const whiteInk = ([r, g, b]: Rgba) => r > 200 && g > 200 && b > 200;

test.describe('簡易頭像產生器', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、預設設定與摘要、頁尾只有靈感來源；重新整理回到預設、不保存', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(summary(page, 'preset')).toHaveText(FIRST.name);
    await expect(summary(page, 'frame-kind')).toHaveText('單色');
    await expect(summary(page, 'background')).toHaveText('單色');
    await expect(summary(page, 'frame-width')).toHaveText('18 px');
    await expect(summary(page, 'image-scale')).toHaveText('100%');
    await expect(summary(page, 'name')).toHaveText('葉初晴');
    await expect(summary(page, 'ho')).toHaveText('HO1');
    await expect(summary(page, 'selected')).toHaveText('名字牌');
    await expect(item(page, 'name')).toHaveAttribute('aria-pressed', 'true');
    await expect(radio(presetGroup(page), FIRST.name)).toHaveAttribute('aria-checked', 'true');
    await expect(presetGroup(page).getByRole('radio')).toHaveCount(9);
    await expect(backgroundGroup(page).getByRole('radio')).toHaveCount(6);
    /* 預設版面（內側區域的 %）；佔位圖寬 58% */
    const l = await layout(page);
    expect(imageCenter(l.image)).toEqual({ x: 50, y: 56 });
    expect(l.image.width).toBeCloseTo(58, 3);
    expectBox(l.name, LAYOUT_DEFAULTS.nameV);
    expectBox(l.ho, LAYOUT_DEFAULTS.ho);
    /* 載入區與說明文字 */
    await expect(loadArea(page)).toHaveAttribute('data-state', 'empty');
    await expect(fileInput(page)).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    await expect(page.getByTestId('privacy')).toContainText('不會上傳');
    await expect(page.getByText('這一欄可以填任何字')).toBeVisible();
    /* 頁尾只有靈感來源 */
    const footer = page.locator('footer');
    await expect(footer).toHaveText('靈感來源：くま。／TRPG WEBツール観測所');
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://kumachansteps.github.io/trpg-web-tools/',
    );
    /* 改設定後重新整理：全部回到預設，localStorage 沒有這個工具的資料 */
    await radio(presetGroup(page), '霓虹').click();
    await page.getByRole('textbox', { name: '名字' }).fill('改過的名字');
    await btn(page, '圖片放大').click();
    await expect(summary(page, 'preset')).toHaveText('霓虹');
    await page.reload();
    await expect(summary(page, 'preset')).toHaveText(FIRST.name);
    await expect(summary(page, 'name')).toHaveText('葉初晴');
    await expect(summary(page, 'image-scale')).toHaveText('100%');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter((k) => k.includes('icon-maker'))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('載入：選檔、非圖片忽略、拖放只取第一個、更換圖片；位置與倍率沿用、載入後選取圖片', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 先放大一次、移動名字牌：載入圖片不會重設 */
    await btn(page, '圖片放大').click();
    await expect(summary(page, 'image-scale')).toHaveText('108%');
    await loadTestImage(page, '很長很長很長很長很長很長很長很長很長的角色圖檔名.png');
    await expect(loadArea(page)).toHaveAttribute('data-state', 'loaded');
    await expect(page.getByText('更換圖片', { exact: true })).toBeVisible();
    await expect(summary(page, 'selected')).toHaveText('圖片');
    await expect(item(page, 'image')).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page, 'image-scale')).toHaveText('108%');
    let l = await layout(page);
    expect(imageCenter(l.image)).toEqual({ x: 50, y: 56 });
    expect(l.image.width).toBeCloseTo(58 * 1.08, 3);
    expect(l.image.height).toBeCloseTo(l.image.width * 2, 3);
    /* 檔名過長時省略（不撐開版面） */
    await noHorizontalScroll(page);

    /* 不是圖片的檔案：靜默忽略 */
    await fileInput(page).setInputFiles({
      name: '說明.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('loaded-name')).toContainText('角色圖檔名.png');
    await expect(page.getByRole('alert')).toHaveCount(0);

    /* 拖放：經過時醒目；只取第一個檔案，GIF 也收 */
    const png = (await testPng()).toString('base64');
    const dt = await page.evaluateHandle(
      ({ gif, png }) => {
        const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes(gif)], '小圖.gif', { type: 'image/gif' }));
        dt.items.add(new File([bytes(png)], '第二張.png', { type: 'image/png' }));
        return dt;
      },
      { gif: GIF_1X1, png },
    );
    const zone = dropZone(page);
    await zone.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(zone).toHaveAttribute('data-over', 'true');
    await zone.dispatchEvent('drop', { dataTransfer: dt });
    await expect(zone).not.toHaveAttribute('data-over');
    await expect(page.getByTestId('loaded-name')).toContainText('小圖.gif');
    l = await layout(page);
    expect(l.image.height).toBeCloseTo(l.image.width, 3);

    /* 第一個不是圖片：整批忽略 */
    const dt2 = await page.evaluateHandle((png) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], '筆記.txt', { type: 'text/plain' }));
      dt.items.add(
        new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], '第三張.png', {
          type: 'image/png',
        }),
      );
      return dt;
    }, png);
    await zone.dispatchEvent('drop', { dataTransfer: dt2 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('loaded-name')).toContainText('小圖.gif');

    /* 更換圖片：載入區恢復成大的樣子並開啟選檔；選了新圖再縮成一列 */
    await item(page, 'name').click();
    await expect(summary(page, 'selected')).toHaveText('名字牌');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('更換圖片', { exact: true }).click(),
    ]);
    await expect(loadArea(page)).toHaveAttribute('data-state', 'empty');
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles({ name: '新的.png', mimeType: 'image/png', buffer: await testPng() });
    await expect(loadArea(page)).toHaveAttribute('data-state', 'loaded');
    await expect(page.getByTestId('loaded-name')).toContainText('新的.png');
    await expect(summary(page, 'selected')).toHaveText('圖片');
    expect(errors).toEqual([]);
  });

  test('版面：點選、拖曳與夾限、參考線、控點與大小範圍、Esc', async ({ page }) => {
    const errors = await open(page);
    await loadTestImage(page);
    /* 預覽縮到 25%：一點點滑鼠移動就是很大的百分比，方便測夾限 */
    for (let i = 0; i < 3; i++) await btn(page, '縮小').click();
    await expect(page.getByRole('region', { name: '頭像預覽' })).toHaveAttribute('data-zoom', '25');
    const vw = 1280;
    const vh = 900;
    /* 按下即選取 HO 牌並拖曳：參考線與距離標籤出現，放開消失 */
    const before = (await layout(page)).ho;
    await drag(page, item(page, 'ho'), 100, -60, async () => {
      await expect(page.getByTestId('layout-guides')).toBeVisible();
      await expect(page.getByTestId('layout-guides').locator('line')).toHaveCount(6);
      await expect(page.getByTestId('layout-distance-x')).toHaveText(/^左 -?\d+%｜右 -?\d+%$/);
      await expect(page.getByTestId('layout-distance-y')).toHaveText(/^上 -?\d+%｜下 -?\d+%$/);
    });
    await expect(page.getByTestId('layout-guides')).toHaveCount(0);
    await expect(summary(page, 'selected')).toHaveText('HO 牌');
    await expect(item(page, 'ho')).toHaveAttribute('aria-pressed', 'true');
    let ho = (await layout(page)).ho;
    expect(Math.abs(ho.x - before.x - (await toPercent(page, 100)))).toBeLessThan(0.6);
    expect(Math.abs(before.y - ho.y - (await toPercent(page, 60)))).toBeLessThan(0.6);
    /* 夾限：左上角 −10%～（110% − 自身大小） */
    await dragTo(page, item(page, 'ho'), 5, 5);
    ho = (await layout(page)).ho;
    expect(ho.x).toBeCloseTo(-10, 3);
    expect(ho.y).toBeCloseTo(-10, 3);
    /* 控點：寬 8～80、高 6～80，左上角不動 */
    await dragTo(page, handle(page), vw - 5, vh - 5);
    ho = (await layout(page)).ho;
    expect(ho.width).toBeCloseTo(80, 3);
    expect(ho.height).toBeCloseTo(80, 3);
    expect(ho.x).toBeCloseTo(-10, 3);
    expect(ho.y).toBeCloseTo(-10, 3);
    await dragTo(page, handle(page), 5, 5);
    ho = (await layout(page)).ho;
    expect(ho.width).toBeCloseTo(8, 3);
    expect(ho.height).toBeCloseTo(6, 3);
    expect(ho.x).toBeCloseTo(-10, 3);
    await dragTo(page, item(page, 'ho'), vw - 5, vh - 5);
    ho = (await layout(page)).ho;
    expect(ho.x).toBeCloseTo(110 - 8, 3);
    expect(ho.y).toBeCloseTo(110 - 6, 3);
    /* 名字牌也有控點 */
    await item(page, 'name').click();
    await expect(summary(page, 'selected')).toHaveText('名字牌');
    await expect(handle(page)).toHaveCount(1);
    /* 圖片：沒有控點；中心夾在 −20%～120% */
    await item(page, 'image').click();
    await expect(summary(page, 'selected')).toHaveText('圖片');
    await expect(handle(page)).toHaveCount(0);
    const img0 = imageCenter((await layout(page)).image);
    await drag(page, item(page, 'image'), 40, 20);
    const img1 = imageCenter((await layout(page)).image);
    expect(Math.abs(img1.x - img0.x - (await toPercent(page, 40)))).toBeLessThan(0.6);
    expect(Math.abs(img1.y - img0.y - (await toPercent(page, 20)))).toBeLessThan(0.6);
    await dragTo(page, item(page, 'image'), vw - 5, vh - 5);
    expect(imageCenter((await layout(page)).image)).toEqual({ x: 120, y: 120 });
    await dragTo(page, item(page, 'image'), 5, 5);
    expect(imageCenter((await layout(page)).image)).toEqual({ x: -20, y: -20 });
    /* 圖片的參考線用實際高度：上下邊線的距離 ＝ 圖片高度（400 × 800 → 寬的兩倍） */
    await btn(page, '重設版面').click();
    await item(page, 'image').click();
    const c = await centerOf(item(page, 'image'));
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 5, c.y, { steps: 2 });
    const lines = page.getByTestId('layout-guides').locator('line');
    const coords = await lines.evaluateAll((ls) =>
      ls.map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))),
    );
    const ys = coords.filter(([, y1, , y2]) => y1 === y2).map(([, y]) => y);
    const xs = coords.filter(([x1, , x2]) => x1 === x2).map(([x]) => x);
    expect(ys).toHaveLength(3);
    expect(xs).toHaveLength(3);
    const h = Math.max(...ys) - Math.min(...ys);
    const w = Math.max(...xs) - Math.min(...xs);
    expect(h / w).toBeCloseTo(2, 1);
    /* 拖曳中按 Esc：參考線消失 */
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('layout-guides')).toHaveCount(0);
    await page.mouse.up();
    expect(errors).toEqual([]);
  });

  test('頁面有反白（Ctrl＋A）時：拖曳圖片、名字牌、HO 牌與控點都完整作用，不變成原生拖放', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadTestImage(page);
    const nativeDrag = await watchNativeDrag(page);
    /* 圖片 */
    await selectAll(page);
    const img0 = imageCenter((await layout(page)).image);
    await drag(page, item(page, 'image'), 60, 30);
    const img1 = imageCenter((await layout(page)).image);
    expect(Math.abs(img1.x - img0.x - (await toPercent(page, 60)))).toBeLessThan(0.6);
    expect(Math.abs(img1.y - img0.y - (await toPercent(page, 30)))).toBeLessThan(0.6);
    /* 按下物件時清掉反白（和一般的點擊一樣） */
    expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');
    /* 名字牌 */
    await selectAll(page);
    const name0 = (await layout(page)).name;
    await drag(page, item(page, 'name'), -50, 40);
    const name1 = (await layout(page)).name;
    expect(Math.abs(name0.x - name1.x - (await toPercent(page, 50)))).toBeLessThan(0.6);
    expect(Math.abs(name1.y - name0.y - (await toPercent(page, 40)))).toBeLessThan(0.6);
    /* 控點（名字牌選取中）：左上角不動 */
    await selectAll(page);
    await drag(page, handle(page), 30, 24);
    const name2 = (await layout(page)).name;
    expect(Math.abs(name2.width - name1.width - (await toPercent(page, 30)))).toBeLessThan(0.6);
    expect(Math.abs(name2.height - name1.height - (await toPercent(page, 24)))).toBeLessThan(0.6);
    expect(name2.x).toBeCloseTo(name1.x, 3);
    expect(name2.y).toBeCloseTo(name1.y, 3);
    /* HO 牌 */
    await selectAll(page);
    const ho0 = (await layout(page)).ho;
    await drag(page, item(page, 'ho'), 40, -30);
    const ho1 = (await layout(page)).ho;
    expect(Math.abs(ho1.x - ho0.x - (await toPercent(page, 40)))).toBeLessThan(0.6);
    expect(Math.abs(ho0.y - ho1.y - (await toPercent(page, 30)))).toBeLessThan(0.6);
    /* 從標題按住拖過預覽造成的反白也一樣 */
    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    if (!title) throw new Error('找不到標題');
    await page.mouse.move(title.x + 2, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(900, 700, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
    await drag(page, item(page, 'ho'), -40, 30);
    const ho2 = (await layout(page)).ho;
    expect(Math.abs(ho1.x - ho2.x - (await toPercent(page, 40)))).toBeLessThan(0.6);
    expect(Math.abs(ho2.y - ho1.y - (await toPercent(page, 30)))).toBeLessThan(0.6);
    expect(await nativeDrag()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('參考線的距離標籤一律在預覽裡看得到：物件貼近上緣、右下角、圖片超出上緣時', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadTestImage(page);
    const inside = () => labelsInsideCanvas(page);
    /* 直長的角色圖：上緣在畫布外 */
    await drag(page, item(page, 'image'), 4, -40, inside);
    /* 名字牌拖到最上面 */
    const n = await centerOf(item(page, 'name'));
    await dragTo(page, item(page, 'name'), n.x, 2, inside);
    expect((await layout(page)).name.y).toBeCloseTo(-10, 3);
    /* 名字牌拖到右上角（右緣、上緣都在畫布外） */
    await dragTo(page, item(page, 'name'), 1275, 2, inside);
    expect((await layout(page)).name.x).toBeCloseTo(110 - 11, 3);
    /* 控點拖曳時也一樣 */
    await dragTo(page, handle(page), 1275, 895, inside);
    /* HO 牌拖到右下角（兩個標籤擠在同一角，不重疊） */
    await dragTo(page, item(page, 'ho'), 1275, 895, inside);
    const ho = (await layout(page)).ho;
    expect(ho.x).toBeCloseTo(110 - 20, 3);
    expect(ho.y).toBeCloseTo(110 - 9, 3);
    /* HO 牌拖到左上角 */
    await dragTo(page, item(page, 'ho'), 2, 2, inside);
    expect((await layout(page)).ho.x).toBeCloseTo(-10, 3);
    expect(errors).toEqual([]);
  });

  test('名字與 HO 的字級固定：牌子拉大文字不跟著變大；預設名字直排約 38 px、HO 約 36 px', async ({
    page,
  }) => {
    const errors = await open(page);
    const inner = innerRect(18);
    const nameInk = async () => {
      const png = await download(page);
      return inkBox(png, percentToBox((await layout(page)).name, inner), darkInk);
    };
    const hoInk = async () => {
      const png = await download(page);
      return inkBox(png, percentToBox((await layout(page)).ho, inner), whiteInk);
    };
    /* 直排：三個字一欄，字寬約 38 px（字面比字級略小） */
    const v0 = await nameInk();
    expect(v0.width).toBeGreaterThan(28);
    expect(v0.width).toBeLessThanOrEqual(40);
    expect(v0.height).toBeGreaterThan(2 * 38 * 1.2);
    expect(v0.height).toBeLessThan(3 * 38 * 1.2 + 4);
    /* 名字牌拉大（寬高都變大）：字不變 */
    await item(page, 'name').click();
    await drag(page, handle(page), 60, 60);
    expect((await layout(page)).name.width).toBeGreaterThan(LAYOUT_DEFAULTS.nameV.width + 8);
    const v1 = await nameInk();
    expect(Math.abs(v1.width - v0.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(v1.height - v0.height)).toBeLessThanOrEqual(1);
    /* 橫排：一行，字高約 34 px 的字面；牌子拉高也不變 */
    await radio(page, '橫排').click();
    const h0 = await nameInk();
    expect(h0.height).toBeGreaterThan(24);
    expect(h0.height).toBeLessThanOrEqual(36);
    await item(page, 'name').click();
    await drag(page, handle(page), 0, 40);
    expect((await layout(page)).name.height).toBeGreaterThan(LAYOUT_DEFAULTS.nameH.height + 5);
    const h1 = await nameInk();
    expect(Math.abs(h1.width - h0.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(h1.height - h0.height)).toBeLessThanOrEqual(1);
    /* HO：「HO1」大寫字高約 24 px（字級 36）；牌子拉大也不變 */
    const o0 = await hoInk();
    expect(o0.height).toBeGreaterThanOrEqual(21);
    expect(o0.height).toBeLessThanOrEqual(28);
    await item(page, 'ho').click();
    await drag(page, handle(page), 60, 60);
    expect((await layout(page)).ho.height).toBeGreaterThan(LAYOUT_DEFAULTS.ho.height + 8);
    const o1 = await hoInk();
    expect(Math.abs(o1.width - o0.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(o1.height - o0.height)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('鍵盤與按鈕：方向鍵、文字欄焦點、Delete／Backspace、放大縮小、重設版面、直排與橫排', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadTestImage(page);
    /* 方向鍵 0.2%、Shift 2%；不夾範圍 */
    await item(page, 'name').click();
    await page.keyboard.press('ArrowRight');
    expect((await layout(page)).name.x).toBeCloseTo(78.2, 3);
    await page.keyboard.press('Shift+ArrowDown');
    expect((await layout(page)).name.y).toBeCloseTo(10, 3);
    for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowRight');
    expect((await layout(page)).name.x).toBeCloseTo(118.2, 3);
    await page.keyboard.press('ArrowLeft');
    expect((await layout(page)).name.x).toBeCloseTo(118, 3);
    for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowLeft');
    expect((await layout(page)).name.x).toBeCloseTo(78, 3);
    /* Ctrl＋方向鍵也移動，步距與不按 Ctrl 時相同（0.2%、加 Shift 2%） */
    await page.keyboard.press('Control+ArrowLeft');
    expect((await layout(page)).name.x).toBeCloseTo(77.8, 3);
    await page.keyboard.press('Control+Shift+ArrowUp');
    expect((await layout(page)).name.y).toBeCloseTo(8, 3);
    await page.keyboard.press('Control+ArrowRight');
    expect((await layout(page)).name.x).toBeCloseTo(78, 3);
    /* 文字欄有焦點：方向鍵與 Delete 不作用 */
    const nameInput = page.getByRole('textbox', { name: '名字' });
    await nameInput.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');
    expect((await layout(page)).name.x).toBeCloseTo(78, 3);
    await expect(summary(page, 'selected')).toHaveText('名字牌');
    await expect(nameInput).toHaveValue('葉初晴');
    /* Delete 取消選取，之後方向鍵不作用 */
    await item(page, 'ho').click();
    await page.keyboard.press('Delete');
    await expect(summary(page, 'selected')).toHaveText('（沒有）');
    await expect(item(page, 'ho')).toHaveAttribute('aria-pressed', 'false');
    const ho0 = (await layout(page)).ho;
    await page.keyboard.press('ArrowUp');
    expectBox((await layout(page)).ho, ho0, 6);
    /* Backspace 也取消選取 */
    await item(page, 'image').click();
    await page.keyboard.press('Backspace');
    await expect(summary(page, 'selected')).toHaveText('（沒有）');

    /* 放大縮小：±8%，35%～300%，以中心縮放 */
    const c0 = imageCenter((await layout(page)).image);
    await btn(page, '圖片放大').click();
    await expect(summary(page, 'image-scale')).toHaveText('108%');
    await expect(page.getByTestId('image-scale')).toHaveText('圖片 108%');
    let l = await layout(page);
    expect(l.image.width).toBeCloseTo(58 * 1.08, 3);
    expect(imageCenter(l.image).x).toBeCloseTo(c0.x, 3);
    expect(imageCenter(l.image).y).toBeCloseTo(c0.y, 3);
    await btn(page, '圖片縮小').click();
    await btn(page, '圖片縮小').click();
    await expect(summary(page, 'image-scale')).toHaveText('92%');
    for (let i = 0; i < 8; i++) await btn(page, '圖片縮小').click();
    await expect(summary(page, 'image-scale')).toHaveText('35%');
    await expect(btn(page, '圖片縮小')).toBeDisabled();
    for (let i = 0; i < 34; i++) await btn(page, '圖片放大').click();
    await expect(summary(page, 'image-scale')).toHaveText('300%');
    await expect(btn(page, '圖片放大')).toBeDisabled();

    /* 直排／橫排：各自的名字牌，切回時恢復 */
    await item(page, 'name').click();
    const vertical = (await layout(page)).name;
    await radio(page, '橫排').click();
    l = await layout(page);
    expectBox(l.name, LAYOUT_DEFAULTS.nameH);
    await item(page, 'name').click();
    await page.keyboard.press('Shift+ArrowUp');
    const horizontal = (await layout(page)).name;
    expect(horizontal.y).toBeCloseTo(LAYOUT_DEFAULTS.nameH.y - 2, 3);
    await radio(page, '直排').click();
    expectBox((await layout(page)).name, vertical);
    await radio(page, '橫排').click();
    expectBox((await layout(page)).name, horizontal);

    /* 重設版面：只重設位置、大小與倍率，選取名字牌；樣式、文字、圖片不變 */
    await radio(presetGroup(page), '森林').click();
    await radio(backgroundGroup(page), '斜線').click();
    await nameInput.fill('阿雪');
    await item(page, 'ho').click();
    await btn(page, '重設版面').click();
    l = await layout(page);
    expect(imageCenter(l.image)).toEqual({ x: 50, y: 56 });
    expect(l.image.width).toBeCloseTo(58, 3);
    expect(l.image.height).toBeCloseTo(116, 3);
    expectBox(l.name, LAYOUT_DEFAULTS.nameH);
    expectBox(l.ho, LAYOUT_DEFAULTS.ho);
    await expect(summary(page, 'image-scale')).toHaveText('100%');
    await expect(summary(page, 'selected')).toHaveText('名字牌');
    await expect(summary(page, 'preset')).toHaveText('森林');
    await expect(summary(page, 'background')).toHaveText('斜線');
    await expect(summary(page, 'name')).toHaveText('阿雪');
    await expect(loadArea(page)).toHaveAttribute('data-state', 'loaded');
    await radio(page, '直排').click();
    expectBox((await layout(page)).name, LAYOUT_DEFAULTS.nameV);
    expect(errors).toEqual([]);
  });

  test('摘要：8 項都即時反映；外框粗細改變時物件跟著內側區域等比例移動', async ({ page }) => {
    const errors = await open(page);
    await radio(presetGroup(page), '晴空').click();
    await expect(summary(page, 'preset')).toHaveText('晴空');
    await expect(radio(presetGroup(page), '晴空')).toHaveAttribute('aria-checked', 'true');
    await radio(frameGroup(page), '漸層').click();
    await expect(summary(page, 'frame-kind')).toHaveText('漸層');
    await radio(backgroundGroup(page), '圓點').click();
    await expect(summary(page, 'background')).toHaveText('圓點');
    const before = await layout(page);
    const slider = page.getByRole('slider', { name: '外框粗細' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(summary(page, 'frame-width')).toHaveText('42 px');
    await expect(page.getByText('下載的圖（1024 px）上約 73 px。')).toBeVisible();
    /* 百分比不變（物件跟著內側區域等比例移動） */
    expect(await layout(page)).toEqual(before);
    await page.keyboard.press('Home');
    await expect(summary(page, 'frame-width')).toHaveText('6 px');
    await page.getByRole('textbox', { name: '名字' }).fill('');
    await expect(summary(page, 'name')).toHaveText('（空白）');
    await page.getByRole('textbox', { name: 'HO 文字' }).fill('PC2');
    await expect(summary(page, 'ho')).toHaveText('PC2');
    await item(page, 'image').click();
    await expect(summary(page, 'selected')).toHaveText('圖片');
    expect(errors).toEqual([]);
  });

  test('下載 PNG：檔名、1024 × 1024 RGBA、外框與背景、圖片位置與倍率，與預覽逐像素相同', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 沒有圖片也能下載（佔位圖） */
    let png = await download(page);
    expect(png.name).toBe('character-icon.png');
    expect([png.width, png.height, png.bitDepth, png.colorType]).toEqual([1024, 1024, 8, 6]);
    const bg = hexRgb(FIRST.background);
    expect(at(png, 512, 300)).not.toEqual(bg);
    expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);

    await loadTestImage(page);
    png = await download(page);
    /* 四角外側透明；外框（約 31 px）、內側背景 */
    for (const [x, y] of [
      [0, 0],
      [10, 10],
      [1013, 10],
      [10, 1013],
      [1023, 1023],
    ])
      expect(at(png, x, y)[3]).toBe(0);
    expectColor(at(png, 512, 5), hexRgb(FIRST.frame));
    expectColor(at(png, 28, 512), hexRgb(FIRST.frame));
    expectColor(at(png, 35, 512), bg);
    expectColor(at(png, 100, 200), bg);
    /* 圖片：寬約 558、左緣約 x 233；左上四分之一綠色 */
    expectColor(at(png, 229, 300), bg);
    expectColor(at(png, 237, 300), GREEN);
    expectColor(at(png, 505, 300), GREEN);
    expectColor(at(png, 520, 300), RED);
    expectColor(at(png, 700, 300), RED);
    expectColor(at(png, 787, 700), RED);
    expectColor(at(png, 795, 700), bg);
    /* 名字牌與 HO 牌在圖片上方 */
    expect(at(png, 800, 560)).not.toEqual(RED);
    expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);

    /* 倍率 35%：寬約 195，中心不變 */
    for (let i = 0; i < 9; i++) await btn(page, '圖片縮小').click();
    await expect(summary(page, 'image-scale')).toHaveText('35%');
    png = await download(page);
    expectColor(at(png, 410, 420), bg);
    expectColor(at(png, 420, 420), GREEN);
    expectColor(at(png, 600, 700), RED);
    expectColor(at(png, 614, 700), bg);
    expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);
    expect(errors).toEqual([]);
  });

  test('所見即所得：透明、花紋、漸層背景與漸層外框、外框粗細都照預覽輸出', async ({ page }) => {
    const errors = await open(page);
    /* 透明：內側真的透明，外框與 HO 牌不透明 */
    await radio(backgroundGroup(page), '透明').click();
    let png = await download(page);
    expect(at(png, 100, 200)[3]).toBe(0);
    expectColor(at(png, 512, 5), hexRgb(FIRST.frame));
    expect(Math.abs(at(png, 130, 880)[3] - 191)).toBeLessThanOrEqual(3);
    expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);

    /* 花紋：背景色上有很淡的花紋（不是單一顏色） */
    const colorsIn = (p: Png) => {
      const set = new Set<string>();
      for (let y = 90; y < 230; y += 3)
        for (let x = 90; x < 230; x += 3) set.add(at(p, x, y).join());
      return set.size;
    };
    await radio(backgroundGroup(page), '單色').click();
    expect(colorsIn(await download(page))).toBe(1);
    for (const kind of ['圓點', '斜線', '格紋']) {
      await radio(backgroundGroup(page), kind).click();
      png = await download(page);
      expect(colorsIn(png), kind).toBeGreaterThan(1);
      /* 很淡：每個像素都接近背景色 */
      for (let y = 90; y < 230; y += 7) expectColor(at(png, 120, y), hexRgb(FIRST.background), 45);
      expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);
    }

    /* 漸層背景：左上是背景色、右下接近白色 */
    await radio(backgroundGroup(page), '漸層').click();
    png = await download(page);
    expectColor(at(png, 90, 90), hexRgb(FIRST.background), 6);
    for (const v of at(png, 960, 960).slice(0, 3)) expect(v).toBeGreaterThan(240);

    /* 漸層外框：左上是第一色、右下偏深 */
    await radio(frameGroup(page), '漸層').click();
    png = await download(page);
    expectColor(at(png, 40, 12), hexRgb(FIRST.gradient[0]), 12);
    expect(at(png, 980, 1012)[0]).toBeLessThan(170);
    expect(diffCount(png.px, await previewPixels(page))).toBeLessThanOrEqual(50);

    /* 外框粗細：42 → 約 73 px、6 → 約 10 px（不隨視窗寬度改變） */
    await radio(frameGroup(page), '單色').click();
    await radio(backgroundGroup(page), '單色').click();
    const slider = page.getByRole('slider', { name: '外框粗細' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(summary(page, 'frame-width')).toHaveText('42 px');
    png = await download(page);
    expectColor(at(png, 71, 512), hexRgb(FIRST.frame));
    expectColor(at(png, 75, 512), hexRgb(FIRST.background));
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(summary(page, 'frame-width')).toHaveText('6 px');
    png = await download(page);
    expectColor(at(png, 9, 512), hexRgb(FIRST.frame));
    expectColor(at(png, 12, 512), hexRgb(FIRST.background));
    /* 窄視窗下載的結果相同 */
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await download(page);
    expect(diffCount(narrow.px, png.px, 0)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('複製圖片：剪貼簿的 PNG 與下載相同；失敗時提示改用下載', async ({ page, context }) => {
    const errors = await open(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new globalThis.URL(page.url()).origin,
    });
    await loadTestImage(page);
    const png = await download(page);
    await btn(page, '複製圖片').click();
    await expect(page.getByText('已複製圖片', { exact: true })).toBeVisible();
    const b64 = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const it = items.find((i) => i.types.includes('image/png'));
      if (!it) return '';
      const bmp = await createImageBitmap(await it.getType('image/png'));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000)
        s += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return btoa(s);
    });
    const clip = new Uint8Array(Buffer.from(b64, 'base64'));
    expect(clip.length).toBe(1024 * 1024 * 4);
    expect(diffCount(clip, png.px)).toBeLessThanOrEqual(50);

    /* 失敗：提示改用下載 */
    await page.evaluate(() => {
      navigator.clipboard.write = () => Promise.reject(new DOMException('拒絕', 'NotAllowedError'));
    });
    await btn(page, '複製圖片').click();
    await expect(page.getByText('無法複製圖片', { exact: true })).toBeVisible();
    await expect(page.getByText(/請改用「下載 PNG」/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('說明與快捷鍵：說明對話框、? 快捷鍵說明（照實際移動量）、Esc 關閉', async ({ page }) => {
    const errors = await open(page);
    await btn(page, '說明').click();
    const help = page.getByRole('dialog', { name: '簡易頭像產生器：使用方式' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('控點');
    await expect(help).toContainText('紅色點線');
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await page.locator('body').press('Shift+Slash');
    const keys = page.getByRole('dialog', { name: '快捷鍵' });
    await expect(keys).toBeVisible();
    await expect(keys).toContainText('移動選取的物件 0.2%（約 1 px；同時按住 Ctrl 也一樣）');
    await expect(keys).toContainText('移動選取的物件 2%（同時按住 Ctrl 也一樣）');
    await expect(keys).toContainText('取消選取');
    await page.keyboard.press('Escape');
    await expect(keys).toHaveCount(0);
    /* 對話框開著時方向鍵不移動物件 */
    await item(page, 'name').click();
    await btn(page, '快捷鍵（?）').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    expect((await layout(page)).name.x).toBeCloseTo(78, 3);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await loadTestImage(page, '角色.png');
    await item(page, 'name').click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('icon-maker-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadTestImage(page, '角色.png');
    await item(page, 'name').click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('icon-maker-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    await radio(page, '橫排').click();
    await btn(page, '說明').click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
