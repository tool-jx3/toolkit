/**
 * RPG 截圖產生器（建置產物 next/rpg-screenshot/）的端對端測試（規格 docs/refactor/specs/rpg-screenshot.md）：
 * - 開頁沒有錯誤、預設內容（空白狀態、範例台詞）、頁尾只有靈感來源、字型只在選到時下載；
 * - 背景圖：選檔、整個視窗拖放、貼上、不是圖片的通知、範例圖、拿掉；頭像；
 * - 位置：拖曳（夾住）、滾輪、方向鍵、＋／－、放大滑桿、重設、鎖定；
 * - 像素化、色調、效果的像素；台詞的分頁、說話者、顏色、游標所在的頁、超出視窗的提醒；選項只在最後一頁；演出文字的常用句；
 * - 播放（空白鍵）、全部顯示、換頁（←／→、→ 自動播放）、打字音效；
 * - 匯出：PNG（1～3 倍、檔名、與預覽同一格逐像素相同）、Ctrl＋S、複製圖片、GIF（影格表、每格延遲、循環、合併）、輕量 GIF、
 *   包含所有頁、APNG、WebP；
 * - 自動儲存與還原（含圖片）、圖讀不到的提醒、復原／重做、專案檔 ZIP；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 * 兩次修改之間至少隔 450 ms（0.4 秒內的連續變更會合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { composeGif, parseGif } from '../helpers/gif';
import { decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('rpg-screenshot') ?? { id: 'rpg-screenshot', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:rpg-screenshot';
const PREFS_KEY = 'trpg-toolkit:rpg-screenshot:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Doc {
  bg: { id: string; name: string; width: number; height: number } | null;
  face: { id: string; name: string } | null;
  view: { zoom: number; x: number; y: number };
  [k: string]: unknown;
}

interface TableRow {
  page: number;
  delay: number;
  clocks: Record<string, number | string | boolean>;
}

/* ---------- 共用 ---------- */

/** 測試圖：左右兩半不同顏色＋漸層 */
async function scenePng(w = 1200, h = 900): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = x < w / 2 ? 230 : 30;
      px[o + 1] = Math.round((y / h) * 220);
      px[o + 2] = x < w / 2 ? 40 : 210;
      px[o + 3] = 255;
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
  await expect(page.getByRole('heading', { level: 1, name: 'RPG 截圖產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __rpgShot?: unknown }).__rpgShot);
  return errors;
}

type Hook = Record<string, (...a: unknown[]) => unknown>;
async function call<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([n, a]) => {
      const h = (window as unknown as { __rpgShot: Hook }).__rpgShot;
      return h[n as string](...(a as unknown[]));
    },
    [name, args] as const,
  ) as Promise<T>;
}

async function state(page: Page): Promise<Doc> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

const canvas = (page: Page) => page.getByTestId('rpg-canvas');
const surface = (page: Page) => page.getByTestId('rpg-screen');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const tab = (page: Page, name: '圖片' | '台詞' | '樣式') => page.getByRole('tab', { name }).click();
const bgInput = (page: Page) => page.locator('[data-testid=bg-load] input[type=file]');

async function loadBg(page: Page, buffer?: Buffer, name = 'scene.png') {
  await bgInput(page).setInputFiles(file(name, buffer ?? (await scenePng())));
  await expect.poll(async () => (await state(page))?.bg?.name).toBe(name);
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
}

/** 換掉部分內容（測試入口） */
async function setDoc(page: Page, patch: Record<string, unknown>) {
  await call(page, 'set', patch);
}

/** 預覽畫布上一點的顏色 */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y],
  );
}

interface Img {
  width: number;
  height: number;
  data: Uint8Array;
}

function readPng(bytes: Uint8Array): Img {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const all = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  return {
    width: ihdr.width,
    height: ihdr.height,
    data: decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType),
  };
}

const dataUrlBytes = (url: string) => new Uint8Array(Buffer.from(url.split(',')[1], 'base64'));
const at = (img: Img, x: number, y: number): Rgba => {
  const k = (y * img.width + x) * 4;
  return [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]];
};

/** 匯出並下載 */
async function exportFile(page: Page, format: 'PNG' | 'GIF' | '輕量 GIF' | 'APNG' | 'WebP') {
  const panel = exportPanel(page);
  await panel.getByRole('radio', { name: format, exact: true }).click();
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
    result,
  };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 畫面 px（W × H）→ 螢幕座標 */
async function screenPoint(page: Page, x: number, y: number, w = 816, h = 624) {
  const b = (await surface(page).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  return { x: b.x + (x / w) * b.width, y: b.y + (y / h) * b.height };
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、空白狀態、範例台詞、頁尾只有靈感來源；字型只下載選到的', async ({ page }) => {
  const fontReqs: string[] = [];
  page.on('request', (r) => {
    if (/\.woff2$/.test(r.url())) fontReqs.push(r.url());
  });
  const errors = await open(page);
  await expect(page.getByTestId('empty-state')).toContainText('放一張圖');
  await expect(page.getByRole('button', { name: '播放' })).toBeDisabled();
  await expect(page.getByTestId('screen-size')).toHaveText('畫面 816 × 624');
  /* 範例台詞：兩頁 */
  await expect(page.getByTestId('page-info')).toContainText('1 / 2');
  const footer = page.locator('footer');
  await expect(footer).toContainText(
    '靈感來源：dearmysn1p3r/DearMySn1p3r_43（RPG Screenshot Maker）',
  );
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://dearmysn1p3r.github.io/DearMySn1p3r_43/',
  );
  /* 匯出區：沒有背景圖時停用並說明 */
  await expect(exportPanel(page)).toContainText('還沒有背景圖，無法匯出。');
  /* 預設的俐方體 11 號：只下載它，不下載縫合像素體 */
  await expect.poll(() => fontReqs.some((u) => /Cubic_11/.test(u))).toBe(true);
  expect(fontReqs.some((u) => /fusion-pixel/.test(u))).toBe(false);
  await expect
    .poll(async () => (await call<{ fontState: string }>(page, 'live')).fontState)
    .toBe('ready');
  /* 換成縫合像素體 10px 才下載 */
  await tab(page, '樣式');
  await page.getByRole('combobox', { name: '字型' }).click();
  await page.getByRole('option', { name: /縫合像素體 10px/ }).click();
  await expect.poll(() => fontReqs.some((u) => /fusion-pixel/.test(u))).toBe(true);
  expect((await state(page)).font).toBe('fusion10');
  expect(errors).toEqual([]);
});

/* ---------- 背景圖 ---------- */

test('背景圖：選檔、名稱、拖放、貼上、不是圖片、範例圖、拿掉（F01～F04、F12、F13）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadBg(page, undefined, 'tavern.png');
  await expect(page.getByTestId('bg-load-name')).toContainText('目前的圖片：tavern.png');
  /* 有畫東西（左半偏紅） */
  const p = await pixel(page, 200, 200);
  expect(p[0]).toBeGreaterThan(p[2]);
  /* 整個視窗拖放：只用第一張、不是圖片的寫在通知裡 */
  const png = await scenePng(600, 400);
  const dt = await page.evaluateHandle(
    ([b64]) => {
      const d = new DataTransfer();
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      d.items.add(new File([bin], 'drop.png', { type: 'image/png' }));
      d.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
      return d;
    },
    [png.toString('base64')],
  );
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
  await page.dispatchEvent('body', 'dragover', { dataTransfer: dt });
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
  await expect.poll(async () => (await state(page)).bg?.name).toBe('drop.png');
  await expect(toast(page, /「notes.txt」不是圖片檔/)).toBeVisible();
  /* 貼上（焦點不在文字欄） */
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.evaluate(
    ([b64]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bin], 'image.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true }));
    },
    [png.toString('base64')],
  );
  await expect.poll(async () => (await state(page)).bg?.name).toBe('貼上的圖片');
  /* 不是圖片 */
  await bgInput(page).setInputFiles(file('a.txt', Buffer.from('x'), 'text/plain'));
  await expect(toast(page, '沒有換背景圖')).toBeVisible();
  expect((await state(page)).bg?.name).toBe('貼上的圖片');
  /* 拿掉 → 空白狀態 → 範例圖 */
  await page.getByRole('button', { name: '拿掉背景圖' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect((await state(page)).bg).toBeNull();
  await page.getByRole('button', { name: '用範例圖試試' }).first().click();
  await expect.poll(async () => (await state(page)).bg?.name).toBe('範例圖（奇幻風景）');
  expect((await state(page)).bg).toMatchObject({ width: 960, height: 540 });
  expect(errors).toEqual([]);
});

test('頭像：放入後畫在訊息視窗裡、可換邊、可拿掉（F31）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await setDoc(page, { dialogue: '', speaker: '' });
  await tab(page, '台詞');
  /* 視窗內左側（頭像的位置）原本是視窗的粉紅色 */
  const before = await pixel(page, 70, 520);
  const face = await scenePng(200, 200);
  await page
    .locator('[data-testid=face-load] input[type=file]')
    .setInputFiles(file('face.png', face));
  await expect.poll(async () => (await state(page)).face?.name).toBe('face.png');
  await expect.poll(async () => (await pixel(page, 70, 520)).join()).not.toBe(before.join());
  await page.getByRole('radio', { name: '右邊' }).click();
  await expect.poll(async () => (await state(page)).faceSide).toBe('right');
  await expect.poll(async () => (await pixel(page, 70, 520)).join()).toBe(before.join());
  await page.getByRole('button', { name: '拿掉頭像' }).click();
  await expect.poll(async () => (await state(page)).face).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 位置 ---------- */

test('位置：拖曳（夾住）、滾輪、方向鍵、＋／－、放大滑桿、重設、鎖定（F05～F11）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadBg(page);
  const view = async () => (await state(page)).view;
  /* 100% 時寬圖只能左右移：往右拖到底（夾在圖的左緣） */
  const a = await screenPoint(page, 400, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 300, a.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await view()).x).toBeLessThan(0);
  const v1 = await view();
  expect(v1.y).toBe(0);
  /* 左緣：x＝−(1200 − 1176.9)／2 */
  expect(v1.x).toBeCloseTo(-(1200 - (900 * 816) / 624) / 2, 3);
  /* 滾輪放大 × 1.12 */
  await page.mouse.move(a.x, a.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await view()).zoom).toBeCloseTo(1.12, 6);
  /* 方向鍵：圖往按的方向移動（16 畫面 px） */
  await surface(page).focus();
  const v2 = await view();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await view()).x).not.toBe(v2.x);
  expect((await view()).x).toBeGreaterThan(v2.x);
  /* ＋／－ */
  await page.waitForTimeout(450);
  await page.keyboard.press('+');
  await expect.poll(async () => (await view()).zoom).toBeCloseTo(1.12 * 1.12, 6);
  await page.keyboard.press('-');
  await expect.poll(async () => (await view()).zoom).toBeCloseTo(1.12, 6);
  /* 放大滑桿 */
  await tab(page, '圖片');
  const slider = page.getByRole('spinbutton', { name: '放大' });
  await slider.fill('300');
  await slider.press('Enter');
  await expect.poll(async () => (await view()).zoom).toBe(3);
  /* 重設 */
  await page.getByRole('button', { name: '重設位置' }).click();
  await expect.poll(view).toEqual({ zoom: 1, x: 0, y: 0 });
  /* 鎖定：拖曳、滾輪沒有作用，滑桿與重設停用 */
  await page.getByRole('button', { name: '鎖定位置' }).click();
  await expect(toast(page, '已鎖定位置：不能拖曳、縮放。')).toBeVisible();
  expect((await prefs(page)).locked).toBe(true);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 200, a.y, { steps: 3 });
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  expect(await view()).toEqual({ zoom: 1, x: 0, y: 0 });
  await expect(page.getByRole('slider', { name: '放大' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重設位置' })).toBeDisabled();
  await page.getByRole('button', { name: '解除鎖定' }).click();
  await expect(page.getByRole('slider', { name: '放大' })).toBeEnabled();
  expect(errors).toEqual([]);
});

/* ---------- 像素化、色調、效果 ---------- */

test('像素化、色階、抖色、色調、掃描線、暗角的像素（F14～F22）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await setDoc(page, {
    showWindow: false,
    scanline: false,
    vignette: false,
    dither: false,
    levels: 2,
  });
  /* 色階 2、不抖色：每個色版只有 0 或 255；像素大小 6：每 6 px 一塊 */
  const img = readPng(dataUrlBytes(await call<string>(page, 'still')));
  for (const [x, y] of [
    [10, 10],
    [700, 500],
    [300, 600],
  ])
    for (const v of at(img, x, y).slice(0, 3)) expect([0, 255]).toContain(v);
  expect(at(img, 12, 100)).toEqual(at(img, 17, 100));
  /* 掌機四色 */
  await setDoc(page, { tone: 'gameboy', levels: 8, dither: true });
  const gb = readPng(dataUrlBytes(await call<string>(page, 'still')));
  const greens = new Set<string>();
  for (let y = 0; y < 624; y += 7)
    for (let x = 0; x < 816; x += 7) greens.add(at(gb, x, y).slice(0, 3).join());
  expect([...greens].sort()).toEqual(
    ['139,172,15', '15,56,15', '155,188,15', '48,98,48'].filter((c) => greens.has(c)).sort(),
  );
  expect(greens.size).toBeGreaterThanOrEqual(2);
  /* 掃描線：每 3 px 一條（暗 18%） */
  await setDoc(page, { tone: 'none', scanline: true });
  const sc = readPng(dataUrlBytes(await call<string>(page, 'still')));
  const r0 = at(sc, 100, 300)[0];
  const r1 = at(sc, 100, 301)[0];
  expect(Math.abs(r0 - r1 * 0.82)).toBeLessThanOrEqual(1);
  /* 暗角：角落比中央暗 */
  await setDoc(page, { scanline: false, vignette: false, levels: 32, tone: 'mono' });
  const nv = readPng(dataUrlBytes(await call<string>(page, 'still')));
  await setDoc(page, { vignette: true });
  const vg = readPng(dataUrlBytes(await call<string>(page, 'still')));
  expect(at(vg, 2, 2)[0]).toBeLessThan(at(nv, 2, 2)[0] * 0.6);
  expect(at(vg, 408, 312)).toEqual(at(nv, 408, 312));
  /* 介面：像素大小、色調的選項 */
  await tab(page, '圖片');
  await page.getByRole('spinbutton', { name: '像素大小' }).fill('12');
  await page.getByRole('spinbutton', { name: '像素大小' }).press('Enter');
  await expect.poll(async () => (await state(page)).pixelSize).toBe(12);
  await page.getByRole('radio', { name: '夜晚' }).click();
  await expect.poll(async () => (await state(page)).tone).toBe('night');
  await page.getByRole('switch', { name: '抖色' }).click();
  await expect.poll(async () => (await state(page)).dither).toBe(false);
  expect(errors).toEqual([]);
});

/* ---------- 台詞 ---------- */

test('台詞：分頁、說話者、顏色、游標所在的頁、超出視窗的提醒、選項只在最後一頁（F23～F32）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadBg(page);
  await tab(page, '台詞');
  const box = page.getByRole('textbox', { name: '台詞' });
  await box.fill('@甲\n第一頁\n---\n@\n第二頁\n---\n第三頁[紅]紅[/]');
  /* 打字時游標在最後（第三頁）→ 預覽換到第三頁；游標移到開頭 → 第一頁 */
  await expect(page.getByTestId('page-info')).toContainText('3 / 3');
  await box.press('Control+Home');
  await expect.poll(async () => (await call<{ page: number }>(page, 'live')).page).toBe(0);
  await expect(page.getByTestId('page-info')).toContainText('1 / 3');
  await box.press('Control+End');
  await expect.poll(async () => (await call<{ page: number }>(page, 'live')).page).toBe(2);
  await box.blur();
  /* 顏色標記：第三頁有紅字 */
  expect(await call<number[]>(page, 'total')).toEqual([3, 3, 4]);
  /* 選項只在最後一頁 */
  await page.getByRole('textbox', { name: '選項' }).fill('是\n否\n三\n四\n五');
  await page.getByRole('textbox', { name: '選項' }).blur();
  await expect(page.getByTestId('choices-too-many')).toContainText('寫了 5 行，只會用前 4 行。');
  const withChoices = await call<string>(page, 'still');
  await call(page, 'goto', 0);
  await expect(page.getByTestId('page-info')).toContainText('1 / 3');
  await setDoc(page, { choices: '' });
  await call(page, 'goto', 2);
  await expect(page.getByTestId('page-info')).toContainText('3 / 3');
  const noChoices = await call<string>(page, 'still');
  expect(withChoices).not.toBe(noChoices);
  /* 超出視窗 */
  await box.fill('一\n二\n三\n四\n五\n---\n短');
  await box.blur();
  await expect(page.getByTestId('overflow-warning')).toContainText('第 1 頁的字超出訊息視窗');
  /* 說話者名字（預設名字） */
  await page.getByRole('textbox', { name: '說話者名字' }).fill('店主');
  await page.getByRole('textbox', { name: '說話者名字' }).blur();
  expect((await state(page)).speaker).toBe('店主');
  /* 名字顏色：關掉「跟著視窗主題」才用自訂色 */
  await page.getByRole('switch', { name: '跟著視窗主題' }).click();
  await expect.poll(async () => (await state(page)).nameColor).toBe('#ffcb47');
  await page.getByRole('switch', { name: '跟著視窗主題' }).click();
  await expect.poll(async () => (await state(page)).nameColor).toBeNull();
  /* 地點 */
  await page.getByRole('textbox', { name: '地點' }).fill('白鹿亭');
  await page.getByRole('textbox', { name: '地點' }).blur();
  expect((await state(page)).location).toBe('白鹿亭');
  /* 改了地點：約 0.35 秒後預覽重播地點的開場動畫（F51） */
  await expect
    .poll(async () => (await call<{ anim: { loc: number | null } }>(page, 'screen')).anim.loc)
    .not.toBeNull();
  expect(errors).toEqual([]);
});

test('演出文字：常用句、位置、時機、每一頁都顯示（F33、F34）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await tab(page, '台詞');
  const presets = page.getByRole('group', { name: '常用句' });
  await presets.getByRole('button', { name: '加上「▶ SAN 值檢定」' }).click();
  await presets.getByRole('button', { name: '加上「★ 獲得道具：」' }).click();
  await expect.poll(async () => (await state(page)).popups).toBe('▶ SAN 值檢定\n★ 獲得道具：');
  await presets.getByRole('button', { name: '加上「♥ 好感度上升」' }).click();
  await presets.getByRole('button', { name: '加上「！ 發現線索」' }).click();
  await expect(presets.getByRole('button', { name: '加上「▶ SAN 值檢定」' })).toBeDisabled();
  await page.getByRole('radio', { name: '畫面中央' }).click();
  await page.getByRole('radio', { name: '和台詞一起' }).click();
  await page.getByRole('switch', { name: '每一頁都顯示' }).click();
  await expect.poll(async () => (await state(page)).popupAll).toBe(true);
  expect(await state(page)).toMatchObject({ popupPos: 'center', popupWhen: 'with' });
  /* 第一頁也有演出文字：GIF 的影格表在第一頁就有演出文字的時間 */
  const table = await call<TableRow[]>(page, 'table', { light: false, allPages: true });
  expect(
    table.some(
      (f) => f.page === 0 && typeof f.clocks.pop === 'number' && (f.clocks.pop as number) > 0,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 樣式 ---------- */

test('樣式：主題、視窗、名字樣式、文字效果、字級、打字機（F36～F47）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await tab(page, '樣式');
  const before = await call<string>(page, 'still');
  await page.getByRole('radio', { name: '經典' }).click();
  await expect.poll(async () => (await state(page)).theme).toBe('classic');
  /* 經典主題：視窗底色偏藍 */
  const win = await pixel(page, 408, 560);
  expect(win[2]).toBeGreaterThan(win[0]);
  await page.getByRole('radio', { name: '上方', exact: true }).click();
  await page.getByRole('radio', { name: /^分頁/ }).click();
  await page.getByRole('radio', { name: '陰影' }).click();
  await page.getByRole('switch', { name: '繼續箭頭（▼）' }).click();
  await page.getByRole('spinbutton', { name: '不透明度' }).fill('50');
  await page.getByRole('spinbutton', { name: '不透明度' }).press('Enter');
  await page.getByRole('spinbutton', { name: '字級' }).fill('36');
  await page.getByRole('spinbutton', { name: '字級' }).press('Enter');
  await page.getByRole('spinbutton', { name: '打字速度（每個字）' }).fill('100');
  await page.getByRole('spinbutton', { name: '打字速度（每個字）' }).press('Enter');
  await expect
    .poll(async () => {
      const s = await state(page);
      return [s.winPos, s.nameStyle, s.textFx, s.showArrow, s.boxOpacity, s.fontSize, s.typeSpeed];
    })
    .toEqual(['top', 'tab', 'shadow', false, 50, 36, 100]);
  expect(await call<string>(page, 'still')).not.toBe(before);
  /* 訊息視窗關掉：只剩背景 */
  await page.getByRole('switch', { name: '顯示訊息視窗' }).click();
  await expect.poll(async () => (await state(page)).showWindow).toBe(false);
  /* 打字音效與音高（不列入復原） */
  await page.getByRole('switch', { name: '打字音效' }).click();
  await expect.poll(async () => (await prefs(page)).sound).toBe(false);
  await expect(page.getByRole('slider', { name: '音效的音高' })).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 播放與換頁 ---------- */

test('播放：空白鍵逐字打出（每字的音效）、全部顯示；換頁：←／→、→ 自動播放（F45～F50）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.evaluate(() => {
    (window as unknown as { __rpgBlips: number[] }).__rpgBlips = [];
  });
  await loadBg(page);
  await setDoc(page, { dialogue: '一二 三\n---\n第二頁', speaker: '', typeSpeed: 60 });
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Space');
  await expect(canvas(page)).toHaveAttribute('data-playing', 'true');
  await expect(canvas(page)).toHaveAttribute('data-playing', 'false', { timeout: 5000 });
  /* 4 個字（含空白），空白不出聲：3 聲，音高在 520 ±6% 內 */
  const blips = await page.evaluate(
    () => (window as unknown as { __rpgBlips: number[] }).__rpgBlips,
  );
  expect(blips).toHaveLength(3);
  for (const hz of blips) {
    expect(hz).toBeGreaterThanOrEqual(520 * 0.94);
    expect(hz).toBeLessThanOrEqual(520 * 1.06);
  }
  /* 全部顯示 */
  await page.getByRole('button', { name: '播放' }).click();
  await expect(canvas(page)).toHaveAttribute('data-playing', 'true');
  await page.getByRole('button', { name: '全部顯示' }).click();
  await expect(canvas(page)).toHaveAttribute('data-playing', 'false');
  /* → 下一頁並自動播放；← 上一頁不播放 */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('page-info')).toContainText('2 / 2');
  await expect(canvas(page)).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('page-info')).toContainText('1 / 2');
  await expect(canvas(page)).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: '上一頁' })).toBeDisabled();
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page.getByRole('button', { name: '下一頁' })).toBeDisabled();
  await expect(canvas(page)).toHaveAttribute('data-playing', 'false', { timeout: 5000 });
  /* 音效關掉：不出聲 */
  await page.evaluate(() => {
    (window as unknown as { __rpgBlips: number[] }).__rpgBlips = [];
  });
  await tab(page, '樣式');
  await page.getByRole('switch', { name: '打字音效' }).click();
  await expect.poll(async () => (await prefs(page)).sound).toBe(false);
  await page.getByRole('button', { name: '播放' }).click();
  await expect(canvas(page)).toHaveAttribute('data-playing', 'false', { timeout: 5000 });
  expect(
    await page.evaluate(() => (window as unknown as { __rpgBlips: number[] }).__rpgBlips),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('PNG：1～3 倍、檔名、與預覽同一格逐像素相同（最近鄰放大）；Ctrl＋S（F56、F61、F70）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadBg(page);
  const still = readPng(dataUrlBytes(await call<string>(page, 'still')));
  const png = await exportFile(page, 'PNG');
  expect(png.name).toMatch(/^rpg-screenshot-\d{8}-\d{6}\.png$/);
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([1632, 1248]);
  for (const [x, y] of [
    [0, 0],
    [123, 77],
    [500, 500],
    [815, 623],
  ])
    expect(at(img, x * 2 + 1, y * 2 + 1)).toEqual(at(still, x, y));
  /* 3 倍、1 倍 */
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^300%/ }).click();
  const p3 = readPng((await exportFile(page, 'PNG')).bytes);
  expect([p3.width, p3.height]).toEqual([2448, 1872]);
  expect(at(p3, 300 * 3 + 2, 200 * 3 + 2)).toEqual(at(still, 300, 200));
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  expect((await prefs(page)).scale).toBe(1);
  /* Ctrl＋S */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('export-result')).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-result').getByRole('link', { name: '下載' }).click(),
  ]);
  const p1 = readPng(new Uint8Array(readFileSync((await dl.path()) as string)));
  expect([p1.width, p1.height]).toEqual([816, 624]);
  expect(Buffer.from(p1.data).equals(Buffer.from(still.data))).toBe(true);
  expect(errors).toEqual([]);
});

test('複製圖片：PNG 放進剪貼簿（F57）', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await loadBg(page);
  await page.getByRole('button', { name: '複製圖片' }).click();
  await expect(toast(page, '已複製圖片')).toBeVisible();
  const size = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items[0].getType('image/png');
    const bmp = await createImageBitmap(blob);
    return [bmp.width, bmp.height];
  });
  expect(size).toEqual([1632, 1248]);
  expect(errors).toEqual([]);
});

test('GIF：影格表與原作的做法相同、每格延遲、無限循環、合併相同影格；包含所有頁（F58、F60）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadBg(page);
  await setDoc(page, { dialogue: '@甲\n你好\n---\n第二頁', speaker: '', location: '' });
  await exportPanel(page).getByRole('radio', { name: 'GIF', exact: true }).click();
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  const table = await call<TableRow[]>(page, 'table', { light: false, allPages: true });
  /* 第 1 頁：有名字的開場 6 格（60 ms）＋打字 3 格（45 ms）＋收尾（520 − 360 − 90 ＝ 70 → 2 格）＋停留＋閃 1 次；第 2 頁：打字 4 格＋收尾…＋閃 3 次 */
  expect(table.filter((f) => f.page === 0).map((f) => f.delay)).toEqual([
    60, 60, 60, 60, 60, 60, 45, 45, 45, 60, 60, 700, 300, 450,
  ]);
  expect(
    table
      .filter((f) => f.page === 1)
      .map((f) => f.delay)
      .slice(-7),
  ).toEqual([700, 300, 450, 300, 450, 300, 450]);
  const gif = await exportFile(page, 'GIF');
  expect(gif.name).toMatch(/^rpg-screenshot-\d{8}-\d{6}\.gif$/);
  const info = parseGif(gif.bytes);
  expect([info.width, info.height]).toEqual([816, 624]);
  expect(info.loopCount).toBe(0);
  const totalCs = table.reduce((s, f) => s + Math.round(f.delay / 10), 0);
  expect(info.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(totalCs);
  expect(info.frames.length).toBeLessThanOrEqual(table.length);
  await expect(gif.result).toContainText(`${table.length} 格（同原作）`);
  /* 第一格（減色前）與解碼後相近 */
  const frames = composeGif(info);
  const pre = readPng(
    dataUrlBytes(await call<string>(page, 'frame', 0, { light: false, allPages: true })),
  );
  let se = 0;
  for (let i = 0; i < pre.data.length; i += 4)
    for (let k = 0; k < 3; k++) se += (pre.data[i + k] - frames[0][i + k]) ** 2;
  expect(10 * Math.log10((255 * 255) / (se / ((pre.data.length / 4) * 3)))).toBeGreaterThan(30);
  /* 只做目前這一頁 */
  await page.getByRole('switch', { name: '動畫包含所有頁' }).click();
  expect((await prefs(page)).gifAll).toBe(false);
  const one = await call<TableRow[]>(page, 'table', { light: false, allPages: false });
  expect(one.every((f) => f.page === 0)).toBe(true);
  /* 2 倍（最近鄰） */
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^200%/ }).click();
  const g2 = parseGif((await exportFile(page, 'GIF')).bytes);
  expect([g2.width, g2.height]).toEqual([1632, 1248]);
  expect(errors).toEqual([]);
});

test('輕量 GIF：寬 560、每格 100 ms、沒有掃描線、檔名 -light（F59）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await setDoc(page, { dialogue: '@甲\n你好', speaker: '' });
  await exportPanel(page).getByRole('radio', { name: '輕量 GIF', exact: true }).click();
  await expect(page.getByTestId('light-size')).toContainText('560 × 428');
  const table = await call<TableRow[]>(page, 'table', { light: true, allPages: true });
  expect(table.slice(0, 4).map((f) => f.delay)).toEqual([100, 100, 100, 100]);
  expect(table.filter((f) => f.delay === 300)).toHaveLength(1);
  const gif = await exportFile(page, '輕量 GIF');
  expect(gif.name).toMatch(/^rpg-screenshot-\d{8}-\d{6}-light\.gif$/);
  const info = parseGif(gif.bytes);
  expect([info.width, info.height]).toEqual([560, 428]);
  /* 減色前的格沒有掃描線（相鄰兩列的亮度差不多） */
  const pre = readPng(
    dataUrlBytes(
      await call<string>(page, 'frame', table.length - 1, { light: true, allPages: true }),
    ),
  );
  expect(Math.abs(at(pre, 100, 300)[0] - at(pre, 100, 301)[0])).toBeLessThan(20);
  /* 9:16：560 × 996 */
  await setDoc(page, { ratio: '9:16' });
  await expect(page.getByTestId('light-size')).toContainText('560 × 996');
  expect(errors).toEqual([]);
});

test('APNG、WebP：同一個影格表（F62）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await setDoc(page, { dialogue: '嗨', speaker: '' });
  await exportPanel(page).getByRole('radio', { name: 'APNG', exact: true }).click();
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  const table = await call<TableRow[]>(page, 'table', { light: false, allPages: true });
  const apng = await exportFile(page, 'APNG');
  expect(apng.name).toMatch(/-anim\.png$/);
  const totalMs = table.reduce((s, f) => s + Math.round(f.delay / 10), 0) * 10;
  const a = parseApng(apng.bytes);
  expect([a.ihdr.width, a.ihdr.height]).toEqual([816, 624]);
  expect(a.numPlays).toBe(0);
  const ms = a.frames.reduce((s, f) => s + (f.delayNum / (f.delayDen || 100)) * 1000, 0);
  expect(Math.round(ms)).toBe(totalMs);
  expect(a.numFrames).toBeLessThanOrEqual(table.length);
  const webp = await exportFile(page, 'WebP');
  expect(webp.name).toMatch(/\.webp$/);
  const anmf = parseWebp(webp.bytes).filter((c) => c.fourcc === 'ANMF');
  expect(anmf.length).toBeLessThanOrEqual(table.length);
  expect(anmf.reduce((s, c) => s + (c.data[12] | (c.data[13] << 8) | (c.data[14] << 16)), 0)).toBe(
    totalMs,
  );
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含圖片）、圖讀不到的提醒、復原／重做（F65、F67）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page);
  await tab(page, '台詞');
  const box = page.getByRole('textbox', { name: '台詞' });
  await box.fill('還原測試');
  await box.blur();
  await page.waitForTimeout(450);
  await tab(page, '樣式');
  await page.getByRole('radio', { name: '霓虹' }).click();
  await page.waitForTimeout(450);
  const before = await state(page);
  expect(before.dialogue).toBe('還原測試');
  expect(before.theme).toBe('neon');
  /* 復原／重做 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect.poll(async () => (await state(page)).theme).toBe('galge');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect.poll(async () => (await state(page)).theme).toBe('neon');
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).theme).toBe('galge');
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await state(page)).theme).toBe('neon');
  /* 重新整理：內容與圖片都還在 */
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __rpgShot?: unknown }).__rpgShot);
  expect(await state(page)).toEqual(before);
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  /* 圖讀不到 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.bg.id = 'amissingimage0';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('上次的背景圖讀不到了')).toBeVisible();
  await expect.poll(async () => (await state(page)).bg).toBeNull();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋圖片）、重設、開啟還原（F66、F68）', async ({ page }) => {
  const errors = await open(page);
  await loadBg(page, undefined, 'room.png');
  await setDoc(page, { dialogue: '專案', location: '房間' });
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('rpg-screenshot');
  expect(project.data.dialogue).toBe('專案');
  expect(Object.keys(entries)).toContain(`files/${project.data.bg.id}.png`);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await state(page)).bg).toBeNull();
  expect((await state(page)).location).toBe('');
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', Buffer.from(zipBytes), 'application/zip'));
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  await expect.poll(async () => (await state(page)).location).toBe('房間');
  expect((await state(page)).bg?.name).toBe('room.png');
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
  /* 說明與快捷鍵 */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog')).toContainText('播放這一頁');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00+08:00'));
  const errors = await open(page);
  await page.getByRole('button', { name: '用範例圖試試' }).first().click();
  await expect.poll(async () => (await state(page))?.bg?.name).toBe('範例圖（奇幻風景）');
  await expect
    .poll(async () => (await call<{ fontState: string }>(page, 'live')).fontState)
    .toBe('ready');
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('rpg-screenshot-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('rpg-screenshot-390.png', { fullPage: true });
  for (const t of ['台詞', '樣式'] as const) {
    await tab(page, t);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
