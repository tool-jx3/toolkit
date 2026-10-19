/**
 * 錄影帶畫面產生器（建置產物 tools/vhs-frame/）的端對端測試（規格 docs/refactor/specs/vhs-frame.md）：
 * - 開頁沒有錯誤、預設內容（NO SIGNAL、▶ PLAY、0:00:14、播放中）、頁尾只有靈感來源；
 * - 照片：選檔、整個視窗拖放、貼上、不是圖片／壞檔／多張的通知、檔名、拿掉照片；
 * - 照片的位置：拖曳（夾住、拖過頭再拖回）、滾輪（以指標為中心）、方向鍵、＋／－、縮放滑桿（可以縮小到整張放入）、重設位置、兩指捏合；
 * - 字幕：前兩行、第 3 行的提醒、80 字、位置與字級、太長時縮小、GIF 逐字打出；
 * - 左上文字與時間碼：常用文字、紅色的「●」、空白不顯示、播放時間／日期時間／不顯示、起點的錯誤與改回、像素字型；
 * - 畫面：磨損度的描述與效果、16:9；
 * - 預覽：錄影帶的播放／暫停（空白鍵）、PNG 存目前這一格、GIF 動畫模式；
 * - 匯出：PNG（尺寸、檔名、四角透明、與預覽逐像素相同）、GIF（24 格、9/100 秒、無限循環、64 色、四角黑、每一格與減色前相近）、動畫大小、播放次數、APNG、WebP；
 * - 自動儲存與還原（含照片）、照片讀不到的提醒、復原／重做；專案檔 ZIP；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 * 兩次修改之間至少隔 450 ms（0.4 秒內的連續變更會合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { composeGif, parseGif } from '../helpers/gif';
import { decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('vhs-frame') ?? { id: 'vhs-frame', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:vhs-frame';
const PREFS_KEY = 'trpg-toolkit:vhs-frame:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface View {
  zoom: number;
  x: number;
  y: number;
}

interface Stored {
  photo: { id: string; name: string; width: number; height: number } | null;
  view: View;
  caption: string;
  osd: string;
  osdFont: string;
  timecode: { mode: string; tape: number; clock: string };
  wear: number;
  aspect: string;
}

interface TextCall {
  fn: 'fillText' | 'strokeText';
  text: string;
  x: number;
  y: number;
  font: string;
  align: string;
  baseline: string;
  style: string;
  lineWidth?: number;
}

/* ---------- 共用 ---------- */

/** 照片：漸層＋中間一塊白色（寬 w、高 h） */
async function photoPng(w = 1280, h = 960): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const white = Math.abs(x - w / 2) < w * 0.08 && Math.abs(y - h / 2) < h * 0.1;
      px[o] = white ? 255 : Math.round((x / w) * 200);
      px[o + 1] = white ? 255 : 120;
      px[o + 2] = white ? 255 : Math.round((y / h) * 200);
      px[o + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 開頁；fillText／strokeText 掛上紀錄器（window.__textLog，__textOn 時才記） */
async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __textLog: unknown[]; __textOn: boolean };
    w.__textLog = [];
    w.__textOn = false;
    const P = CanvasRenderingContext2D.prototype;
    for (const fn of ['fillText', 'strokeText'] as const) {
      const orig = P[fn];
      P[fn] = function (this: CanvasRenderingContext2D, text: string, x: number, y: number) {
        if (w.__textOn)
          w.__textLog.push({
            fn,
            text,
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            font: this.font,
            align: this.textAlign,
            baseline: this.textBaseline,
            style: fn === 'fillText' ? String(this.fillStyle) : String(this.strokeStyle),
            lineWidth: fn === 'strokeText' ? this.lineWidth : undefined,
          });
        return orig.call(this, text, x, y);
      };
    }
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '錄影帶畫面產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __vhsFrame?: unknown }).__vhsFrame);
  return errors;
}

interface Hook {
  doc: () => Stored;
  prefs: () => Record<string, unknown>;
  screen: () => {
    mode: string;
    t: number;
    playing: boolean;
    drawn: number;
    composed: number;
    live: boolean;
  };
  seek: (t: number, mode?: 'tape' | 'gif') => void;
  frame: (kind: 'png' | 'anim', at: number) => Promise<string>;
}

/** 呼叫測試入口 window.__vhsFrame 的方法 */
function call<K extends keyof Hook>(
  page: Page,
  name: K,
  ...args: Parameters<Hook[K]>
): Promise<Awaited<ReturnType<Hook[K]>>> {
  return page.evaluate(
    ([n, a]) => {
      const h = (window as unknown as { __vhsFrame: Record<string, (...x: unknown[]) => unknown> })
        .__vhsFrame;
      return h[n as string](...(a as unknown[]));
    },
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<Hook[K]>>>;
}

async function state(page: Page): Promise<Stored> {
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

const canvas = (page: Page) => page.getByTestId('vhs-canvas');
const surface = (page: Page) => page.getByTestId('vhs-screen');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const dialog = (page: Page) => page.getByRole('dialog');
const alertDialog = (page: Page) => page.getByRole('alertdialog');
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const photoInput = (page: Page) =>
  page.getByRole('group', { name: '照片載入區' }).locator('input[type=file]');

/** 停在錄影帶的某個時間（暫停），等畫好 */
async function seek(page: Page, t: number, mode: 'tape' | 'gif' = 'tape') {
  await call(page, 'seek', t, mode);
  await expect(canvas(page)).toHaveAttribute(
    'data-frame',
    String(mode === 'tape' ? Math.floor(t * 24 + 1e-6) / 24 : Math.floor(t / 0.09 + 1e-6)),
  );
}

async function loadPhoto(page: Page, buffer?: Buffer, name = 'photo.png') {
  await photoInput(page).setInputFiles(file(name, buffer ?? (await photoPng())));
  await expect.poll(async () => (await state(page))?.photo?.name).toBe(name);
}

/** 預覽畫布上一點的顏色（畫布 px） */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y],
  );
}

/** 用測試入口畫一格、記下文字 */
async function textCalls(page: Page, kind: 'png' | 'anim', at: number): Promise<TextCall[]> {
  return page.evaluate(
    async ([kind, at]) => {
      const w = window as unknown as {
        __textLog: TextCall[];
        __textOn: boolean;
        __vhsFrame: Hook;
      };
      w.__textLog = [];
      w.__textOn = true;
      await w.__vhsFrame.frame(kind as 'png', at as number);
      w.__textOn = false;
      return w.__textLog;
    },
    [kind, at] as const,
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

/** RGB 的 PSNR（只算兩邊都不透明的像素） */
function psnr(a: Uint8Array, b: Uint8Array): number {
  let se = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 255 || b[i + 3] < 255) continue;
    for (let c = 0; c < 3; c++) {
      const d = a[i + c] - b[i + c];
      se += d * d;
      n++;
    }
  }
  return se === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / (se / n));
}

/** 匯出並下載 */
async function exportFile(page: Page, format: 'PNG' | 'GIF' | 'APNG' | 'WebP') {
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

/** 畫面 px（1280 寬）→ 螢幕座標 */
async function screenPoint(page: Page, x: number, y: number, height = 960) {
  const b = (await surface(page).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  return { x: b.x + (x / 1280) * b.width, y: b.y + (y / height) * b.height, box: b };
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設內容（NO SIGNAL、▶ PLAY、0:00:14、播放中）、頁尾只有靈感來源（F23、F25、F38）', async ({
  page,
}) => {
  const errors = await open(page);
  const s = await call(page, 'doc');
  expect(s.photo).toBeNull();
  expect(s.osd).toBe('▶ PLAY');
  expect(s.wear).toBe(55);
  expect(s.aspect).toBe('4:3');
  expect(s.timecode).toEqual({ mode: 'tape', tape: 14, clock: '2026-10-31 03:14:15' });
  await expect(canvas(page)).toHaveAttribute('data-size', '1280x960');
  await expect(canvas(page)).toHaveAttribute('data-mode', 'tape');
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(true);
  await expect(page.getByTestId('wear-word')).toHaveText('看得出年代');
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link', { name: 'dearmysn1p3r/VHS_Maker' })).toHaveAttribute(
    'href',
    'https://dearmysn1p3r.github.io/VHS_Maker/',
  );
  /* 空白鍵暫停；畫面是藍色的無訊號 */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(false);
  await seek(page, 5);
  const c = await pixel(page, 640, 760);
  expect(c[2]).toBeGreaterThan(c[0] + 40);
  /* 文字：NO SIGNAL、▶ PLAY、時間碼 0:00:19（t＝5） */
  const calls = await textCalls(page, 'png', 5);
  expect(calls.map((x) => x.text)).toEqual(['NO SIGNAL', '▶ PLAY', '▶ PLAY', '0:00:19', '0:00:19']);
  expect(calls[0]).toMatchObject({ x: 640, y: 460.8, align: 'center', baseline: 'middle' });
  expect(calls[0].font).toContain('56px');
  expect(errors).toEqual([]);
});

/* ---------- 照片 ---------- */

test('照片：選檔、檔名、整個視窗拖放與貼上、不是圖片／壞檔／多張的通知、拿掉照片（F01～F04、F11、F42）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByRole('button', { name: '重設位置' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '拿掉照片' })).toBeDisabled();
  await loadPhoto(page, await photoPng(800, 600), 'night.png');
  await expect(page.getByTestId('photo-name')).toContainText('night.png');
  await expect(page.getByRole('button', { name: '重設位置' })).toBeEnabled();
  /* 照片畫上去了：中間的白色方塊 */
  await seek(page, 5);
  const mid = await pixel(page, 640, 480);
  expect(Math.min(mid[0], mid[1], mid[2])).toBeGreaterThan(150);
  /* 整個視窗拖放：文字檔＋兩張圖 → 用第一張，提醒合成一則 */
  const second = await photoPng(400, 300);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'a.txt', { type: 'text/plain' }));
    dt.items.add(new File([bytes], 'b.png', { type: 'image/png' }));
    dt.items.add(new File([bytes], 'c.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, second.toString('base64'));
  await expect.poll(async () => (await state(page)).photo?.name).toBe('b.png');
  await expect(toast(page, '已換上照片「b.png」')).toBeVisible();
  await expect(toast(page, /「a\.txt」不是圖片檔.*沒有使用「c\.png」/)).toBeVisible();
  /* 壞檔：照片不變 */
  await photoInput(page).setInputFiles(file('broken.png', Buffer.from('not a png')));
  await expect(toast(page, /「broken\.png」無法讀取/)).toBeVisible();
  expect((await state(page)).photo?.name).toBe('b.png');
  /* 貼上 */
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, second.toString('base64'));
  await expect.poll(async () => (await state(page)).photo?.name).toBe('pasted.png');
  /* 拿掉照片：回到無訊號 */
  await page.getByRole('button', { name: '拿掉照片' }).click();
  await expect.poll(async () => (await state(page)).photo).toBeNull();
  await seek(page, 5);
  const c = await pixel(page, 640, 760);
  expect(c[2]).toBeGreaterThan(c[0] + 40);
  expect(errors).toEqual([]);
});

test('照片的位置：拖曳（夾住、拖過頭再拖回）、滾輪、方向鍵、＋／－、縮放滑桿、重設位置；一次拖曳一步復原（F05～F10、F12）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 1600 × 600：蓋滿時寬 2560，左右各多 640（x 在 ±0.5 之間） */
  await loadPhoto(page, await photoPng(1600, 600), 'wide.png');
  await call(page, 'seek', 0, 'tape');
  const p0 = await screenPoint(page, 640, 480);
  const k = 1280 / p0.box.width;
  /* 拖曳：往右 100 螢幕 px → 照片往右 100 × k 畫面 px */
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 50, p0.y, { steps: 3 });
  await page.mouse.move(p0.x + 100, p0.y + 30, { steps: 3 });
  await page.mouse.up();
  let v = (await state(page)).view;
  expect(v.zoom).toBe(1);
  expect(v.x).toBeCloseTo((100 * k) / 1280, 3);
  expect(v.y).toBe(0);
  /* 拖過頭（往右 1000 螢幕 px）夾在 0.5，再拖回 200：從夾住之前的位置算 */
  await page.waitForTimeout(450);
  const vx = v.x;
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 400, p0.y, { steps: 4 });
  await expect.poll(async () => (await state(page)).view.x).toBe(0.5);
  await page.mouse.move(p0.x + 200, p0.y, { steps: 4 });
  await page.mouse.up();
  v = (await state(page)).view;
  expect(v.x).toBeCloseTo(Math.min(0.5, vx + (200 * k) / 1280), 3);
  /* 復原一步回到第一次拖曳之後 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).view.x).toBeCloseTo(vx, 6);
  await page.getByRole('button', { name: /^重做/ }).click();
  /* 重設位置 */
  await page.getByRole('button', { name: '重設位置' }).click();
  expect((await state(page)).view).toEqual({ zoom: 1, x: 0, y: 0 });
  await expect(surface(page)).toBeFocused();
  /* 方向鍵：照片往按的方向移動 30（Shift 90）；＋／－ ×1.15 */
  await page.waitForTimeout(450);
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).view.x).toBeCloseTo(30 / 1280, 10);
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await state(page)).view.x).toBeCloseTo(-60 / 1280, 10);
  await page.keyboard.press('+');
  expect((await state(page)).view.zoom).toBeCloseTo(1.15, 10);
  await page.keyboard.press('-');
  expect((await state(page)).view.zoom).toBeCloseTo(1, 10);
  await page.keyboard.press('ArrowDown');
  expect((await state(page)).view.y).toBe(0);
  /* 滾輪：以指標為中心放大 e^(0.0016 × 100)；指標下的照片位置不動 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '重設位置' }).click();
  const p1 = await screenPoint(page, 400, 300);
  await page.mouse.move(p1.x, p1.y);
  const before = (await state(page)).view;
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state(page)).view.zoom).toBeCloseTo(Math.exp(0.16), 6);
  const after = (await state(page)).view;
  const imgX = (view: View) => {
    const s = 1.6 * view.zoom;
    const left = 640 + view.x * 1280 - (1600 * s) / 2;
    return (400 - left) / s;
  };
  expect(imgX(after)).toBeCloseTo(imgX(before), 0);
  /* 縮放滑桿：最小 50%＝整張放入（上下置中、上方是黑底） */
  const zoomInput = page.getByRole('spinbutton', { name: '縮放' });
  await zoomInput.fill('10');
  await zoomInput.press('Enter');
  await expect.poll(async () => (await state(page)).view.zoom).toBeCloseTo(0.5, 6);
  expect((await state(page)).view.y).toBeCloseTo(0, 10);
  await seek(page, 0);
  const top = await pixel(page, 640, 150);
  expect(Math.max(top[0], top[1], top[2])).toBeLessThan(60);
  await zoomInput.fill('900');
  await zoomInput.press('Enter');
  await expect.poll(async () => (await state(page)).view.zoom).toBe(8);
  expect(errors).toEqual([]);
});

test('照片的位置：兩指捏合以中點縮放（F07）', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1280, 960), 'p.png');
  const c = await screenPoint(page, 640, 480);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
    });
  await touch('touchStart', [
    [c.x - 40, c.y],
    [c.x + 40, c.y],
  ]);
  for (const d of [50, 60, 80])
    await touch('touchMove', [
      [c.x - d, c.y],
      [c.x + d, c.y],
    ]);
  await touch('touchEnd', []);
  const v = (await state(page)).view;
  expect(v.zoom).toBeCloseTo(2, 1);
  /* 兩指輪流移動，中點有一點點晃（同原作的做法）：位移在 1% 以內 */
  expect(Math.abs(v.x)).toBeLessThan(0.01);
  expect(Math.abs(v.y)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
  await ctx.close();
});

/* ---------- 文字 ---------- */

test('字幕：前兩行、第 3 行的提醒、80 字、位置與字級、太長時縮小、GIF 逐字打出（F13～F15、F46）', async ({
  page,
}) => {
  const errors = await open(page);
  const cap = page.getByRole('textbox', { name: '字幕' });
  await cap.fill('第一行\n第二行\n第三行');
  await cap.blur();
  await expect(page.getByTestId('caption-extra')).toBeVisible();
  await expect(page.getByTestId('caption-count')).toHaveText('11 / 80');
  await page.waitForTimeout(450);
  await cap.fill('一'.repeat(90));
  await cap.blur();
  expect((await state(page)).caption).toHaveLength(80);
  await page.waitForTimeout(450);
  await cap.fill('  第一行  \n第二行');
  await cap.blur();
  /* 位置：最後一行的基線 960 − 96、行距 1.28 × 60 */
  let calls = (await textCalls(page, 'png', 0)).filter((x) => x.baseline === 'alphabetic');
  expect(calls.map((x) => [x.fn, x.text, x.x, x.y])).toEqual([
    ['strokeText', '第一行', 640, 787.2],
    ['fillText', '第一行', 640, 787.2],
    ['strokeText', '第二行', 640, 864],
    ['fillText', '第二行', 640, 864],
  ]);
  expect(calls[0].font).toContain('60px');
  expect(calls[0].lineWidth).toBe(12);
  expect(calls[1].style).toBe('#f2efe4');
  expect(calls[0].style).toBe('rgba(0, 0, 0, 0.88)');
  /* 太長：縮小到寬 90% 以內 */
  await page.waitForTimeout(450);
  await cap.fill('凌晨三點十四分，走廊盡頭的門自己打開了，而且裡面沒有人');
  await cap.blur();
  calls = (await textCalls(page, 'png', 0)).filter((x) => x.fn === 'strokeText');
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(calls[0].font)?.[1]);
  expect(size).toBeLessThan(60);
  const width = await page.evaluate(
    ([font, text]) => {
      const x = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
      x.font = font;
      return x.measureText(text).width;
    },
    [calls[0].font, calls[0].text],
  );
  expect(width).toBeLessThanOrEqual(1280 * 0.9 + 0.5);
  /* GIF 逐字打出：round((f − 3) ÷ 14 × N) 個字 */
  await page.waitForTimeout(450);
  await cap.fill('你好世界\n再見');
  await cap.blur();
  const total = 6;
  for (const f of [0, 3, 4, 6, 10, 12, 16, 17, 23]) {
    const shown = (await textCalls(page, 'anim', f))
      .filter((x) => x.fn === 'fillText' && x.baseline === 'alphabetic')
      .map((x) => x.text);
    const chars = Math.max(0, Math.min(total, Math.round(((f - 3) / 14) * total)));
    expect(shown.join('').length, `第 ${f} 格`).toBe(chars);
  }
  /* 只打出第 1 行時在最後一行的位置（360 × 270：270 − 27） */
  const one = (await textCalls(page, 'anim', 8)).filter(
    (x) => x.fn === 'fillText' && x.baseline === 'alphabetic',
  );
  expect(one.map((x) => [x.text, x.y])).toEqual([['你好', 243]]);
  expect(errors).toEqual([]);
});

test('左上文字與時間碼：常用文字、紅色的「●」、空白不顯示、播放時間／日期時間／不顯示、起點的錯誤與改回、像素字型（F16～F22）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '換成「REC ●」' }).click();
  expect((await state(page)).osd).toBe('REC ●');
  await expect(page.getByRole('button', { name: '換成「REC ●」' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  let calls = await textCalls(page, 'png', 4);
  const osd = calls.filter((x) => x.baseline === 'top');
  expect(osd.map((x) => [x.text, x.style])).toEqual([
    ['REC ', 'rgba(0, 0, 0, 0.75)'],
    ['REC ', '#edede6'],
    ['●', 'rgba(0, 0, 0, 0.75)'],
    ['●', '#e8402f'],
    ['0:00:18', 'rgba(0, 0, 0, 0.75)'],
    ['0:00:18', '#edede6'],
  ]);
  /* 位置：pad 53、影子往右下 3.6；時間碼靠右 */
  expect(osd[1]).toMatchObject({ x: 53, y: 53, align: 'left' });
  expect(osd[0]).toMatchObject({ x: 56.6, y: 56.6 });
  expect(osd[5]).toMatchObject({ x: 1227, y: 53, align: 'right' });
  expect(osd[3].x).toBeGreaterThan(53);
  expect(osd[1].font).toMatch(/^600 40px "Noto Sans Mono"/);
  /* 左上文字空白：時間碼照樣顯示 */
  await page.waitForTimeout(450);
  await page.getByRole('textbox', { name: '左上文字' }).fill('   ');
  await page.getByRole('textbox', { name: '左上文字' }).blur();
  calls = await textCalls(page, 'png', 4);
  expect(calls.map((x) => x.text)).toEqual(['NO SIGNAL', '0:00:18', '0:00:18']);
  /* 日期時間 */
  await page.getByRole('radio', { name: '日期時間' }).click();
  calls = await textCalls(page, 'png', 4.5);
  expect(calls.at(-1)?.text).toBe('2026-10-31 03:14:19');
  const start = page.getByRole('textbox', { name: '起點' });
  await expect(start).toHaveValue('2026-10-31 03:14:15');
  await page.waitForTimeout(450);
  await start.fill('2026-12-31 23:59:59');
  expect((await state(page)).timecode.clock).toBe('2026-12-31 23:59:59');
  calls = await textCalls(page, 'png', 1);
  expect(calls.at(-1)?.text).toBe('2027-01-01 00:00:00');
  await start.fill('2026-02-30 00:00:00');
  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('請寫成「年-月-日 時:分:秒」，而且日期要真的存在。')).toBeVisible();
  await start.blur();
  await expect(toast(page, '起點寫得不對，已改回 2026-12-31 23:59:59。')).toBeVisible();
  await expect(start).toHaveValue('2026-12-31 23:59:59');
  /* 播放時間的起點 */
  await page.getByRole('radio', { name: '播放時間' }).click();
  await expect(start).toHaveValue('0:00:14');
  await page.waitForTimeout(450);
  await start.fill('１：２３：４５');
  expect((await state(page)).timecode.tape).toBe(5025);
  await start.fill('1:23:99');
  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await start.blur();
  await expect(start).toHaveValue('1:23:45');
  calls = await textCalls(page, 'png', 2);
  expect(calls.at(-1)?.text).toBe('1:23:47');
  /* 不顯示 */
  await page.getByRole('radio', { name: '不顯示' }).click();
  await expect(start).toHaveCount(0);
  calls = await textCalls(page, 'png', 2);
  expect(calls.map((x) => x.text)).toEqual(['NO SIGNAL']);
  /* 像素字型：VT323、字級 × 1.3 */
  await page.getByRole('radio', { name: /像素字型/ }).click();
  await page.getByRole('button', { name: '換成「▶ PLAY」' }).click();
  calls = await textCalls(page, 'png', 2);
  expect(calls[1].font).toMatch(/^52px VT323,/);
  expect(calls[0].font).toMatch(/^72px VT323,/);
  expect(errors).toEqual([]);
});

/* ---------- 畫面 ---------- */

test('畫面：磨損度的描述與效果、16:9（尺寸、照片的位置照比例）（F23、F24、F27～F37）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1280, 960), 'p.png');
  const wear = page.getByRole('spinbutton', { name: '磨損度' });
  const frameAtWear = async (w: number) => {
    await wear.fill(String(w));
    await wear.press('Enter');
    await page.waitForTimeout(450);
    return readPng(dataUrlBytes(await call(page, 'frame', 'png', 7.25)));
  };
  const w0 = await frameAtWear(0);
  await expect(page.getByTestId('wear-word')).toHaveText('幾乎全新');
  const w100 = await frameAtWear(100);
  await expect(page.getByTestId('wear-word')).toHaveText('快看不清楚');
  /* 同樣的設定與時間每次相同（雜訊用固定種子） */
  const again = readPng(dataUrlBytes(await call(page, 'frame', 'png', 7.25)));
  expect(Buffer.compare(Buffer.from(again.data), Buffer.from(w100.data))).toBe(0);
  /* 磨損越大越不像原圖 */
  expect(psnr(w0.data, w100.data)).toBeLessThan(30);
  /* 圓角：四角透明、中間不透明 */
  expect(at(w0, 0, 0)[3]).toBe(0);
  expect(at(w0, 1279, 959)[3]).toBe(0);
  expect(at(w0, 640, 480)[3]).toBe(255);
  /* 16:9：1280 × 720；位置照比例、夾回範圍 */
  await page.getByRole('button', { name: '重設位置' }).click();
  await page.waitForTimeout(450);
  await surface(page).focus();
  await page.keyboard.press('ArrowDown');
  const before = (await state(page)).view;
  expect(before.y).toBeCloseTo(0, 10);
  await page.getByRole('radio', { name: /^16:9/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1280x720');
  await expect(page.getByTestId('export-size')).toHaveText('1280 × 720 px');
  const v = (await state(page)).view;
  expect(v.zoom).toBe(1);
  expect(v.x).toBe(0);
  expect(v.y).toBeCloseTo(0, 10);
  await page.waitForTimeout(450);
  await surface(page).focus();
  await page.keyboard.press('ArrowDown');
  expect((await state(page)).view.y).toBeCloseTo(30 / 720, 10);
  const f169 = readPng(dataUrlBytes(await call(page, 'frame', 'png', 0)));
  expect([f169.width, f169.height]).toEqual([1280, 720]);
  await page.getByRole('radio', { name: /^4:3/ }).click();
  expect((await state(page)).view.y).toBeCloseTo(0, 10);
  expect(errors).toEqual([]);
});

/* ---------- 預覽 ---------- */

test('預覽：錄影帶的播放／暫停與時間（記住）、PNG 存目前這一格、GIF 動畫模式（F38～F40、F43）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await expect(page.getByTestId('preview-hint')).toContainText('拖曳移動照片');
  /* 播放中：說明「按下匯出那一刻」 */
  await expect(page.getByTestId('png-frame')).toContainText('播放中');
  await seek(page, 13.5);
  await expect(page.getByTestId('png-frame')).toHaveText('存「錄影帶」13.50 秒 這一格。');
  expect(await prefs(page)).toMatchObject({ tapePaused: true, tapeTime: 13.5 });
  /* 暫停的預覽＝測試入口畫的那一格（逐位元組） */
  const shown = await canvas(page).evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL('image/png'),
  );
  const drawn = await call(page, 'frame', 'png', 13.5);
  expect(shown === drawn).toBe(true);
  /* 重新整理：停在同一個時間 */
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __vhsFrame?: unknown }).__vhsFrame);
  await expect(canvas(page)).toHaveAttribute('data-frame', '13.5');
  expect((await call(page, 'screen')).playing).toBe(false);
  /* 播放列的播放 */
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(true);
  expect((await prefs(page)).tapePaused).toBe(false);
  /* GIF 動畫：360 × 270、播放、逐格 */
  await page.getByRole('radio', { name: /^GIF 動畫/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '360x270');
  await expect(canvas(page)).toHaveAttribute('data-mode', 'gif');
  await expect(page.getByTestId('preview-hint')).toContainText('24 格');
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(true);
  await seek(page, 0.09 * 7, 'gif');
  const gifShown = await canvas(page).evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL('image/png'),
  );
  expect(gifShown === (await call(page, 'frame', 'anim', 7))).toBe(true);
  /* 回到錄影帶：繼續播放（上次是播放中） */
  await page.getByRole('radio', { name: /^錄影帶/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1280x960');
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(true);
  expect(errors).toEqual([]);
});

test('預覽的解析度：播放中與拖曳中以畫面顯示的大小畫、暫停後全尺寸（＝PNG）；照片層快取，切換預覽模式不重新合成（對等驗證 7.1）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1600, 1200), 'big.png');
  const backing = () =>
    canvas(page).evaluate((el) => [
      (el as HTMLCanvasElement).width,
      (el as HTMLCanvasElement).height,
    ]);
  const shown = async () => {
    const b = (await surface(page).boundingBox()) as { width: number };
    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    return Math.ceil(b.width * dpr);
  };
  /* 播放中：不超過畫面顯示的大小（含 devicePixelRatio） */
  await expect.poll(async () => (await call(page, 'screen')).playing).toBe(true);
  await expect.poll(async () => (await backing())[0]).toBeLessThan(1280);
  const [w, h] = await backing();
  expect(w).toBeLessThanOrEqual(await shown());
  expect(h).toBe(Math.round((w * 3) / 4));
  expect((await call(page, 'screen')).live).toBe(true);
  /* 暫停：全尺寸，和 PNG 逐位元組相同 */
  await seek(page, 9.5);
  await expect.poll(backing).toEqual([1280, 960]);
  const paused = await canvas(page).evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL('image/png'),
  );
  expect(paused === (await call(page, 'frame', 'png', 9.5))).toBe(true);
  /* 暫停時拖曳：拖曳中以顯示的大小畫，放開一會兒之後回到全尺寸 */
  const p = await screenPoint(page, 640, 480);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y, { steps: 4 });
  await expect.poll(async () => (await backing())[0]).toBeLessThan(1280);
  await page.mouse.up();
  await expect.poll(backing).toEqual([1280, 960]);
  const moved = await canvas(page).evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL('image/png'),
  );
  expect(moved === (await call(page, 'frame', 'png', 9.5))).toBe(true);
  /* 照片層快取：播放中來回切換預覽模式，不重新合成 */
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(async () => (await backing())[0]).toBeLessThan(1280);
  const c0 = (await call(page, 'screen')).composed;
  await page.getByRole('radio', { name: /^GIF 動畫/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-mode', 'gif');
  await page.getByRole('radio', { name: /^錄影帶/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-mode', 'tape');
  await page.getByRole('radio', { name: /^GIF 動畫/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-mode', 'gif');
  await page.waitForTimeout(300);
  expect((await call(page, 'screen')).composed).toBe(c0);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：1280 × 960、檔名、四角透明、與暫停的預覽逐像素相同（F44、F50）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1600, 1200), 'my.photo.png');
  await seek(page, 7.25);
  const shown = await canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return Array.from(
      (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data,
    );
  });
  const png = await exportFile(page, 'PNG');
  expect(png.name).toBe('my.photo-vhs.png');
  await expect(png.result).toContainText('錄影帶 7.25 秒');
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([1280, 960]);
  expect(at(img, 0, 0)[3]).toBe(0);
  expect(at(img, 640, 480)[3]).toBe(255);
  let diff = 0;
  for (let i = 0; i < shown.length; i += 4) {
    if (shown[i + 3] < 255) continue;
    for (let c = 0; c < 4; c++) if (shown[i + c] !== img.data[i + c]) diff++;
  }
  expect(diff).toBe(0);
  /* 沒有照片：screen-vhs.png */
  await page.getByRole('button', { name: '拿掉照片' }).click();
  const none = await exportFile(page, 'PNG');
  expect(none.name).toBe('screen-vhs.png');
  expect(errors).toEqual([]);
});

test('匯出 GIF：360 × 270、24 格、每格 9/100 秒、無限循環、64 色、四角黑；每一格與減色前相近；動畫大小、播放次數；APNG、WebP（F45～F49）', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1280, 960), 'cam.png');
  await page.getByRole('textbox', { name: '字幕' }).fill('有人在嗎');
  await page.getByRole('textbox', { name: '字幕' }).blur();
  await exportPanel(page).getByRole('radio', { name: 'GIF', exact: true }).click();
  /* 「原作的 GIF 一律無限循環」只在 GIF 顯示（對等驗證 7.1） */
  await expect(exportPanel(page).getByText('原作的 GIF 一律無限循環。')).toBeVisible();
  await exportPanel(page).getByRole('radio', { name: 'APNG', exact: true }).click();
  await expect(exportPanel(page).getByText('原作的 GIF 一律無限循環。')).toHaveCount(0);
  await exportPanel(page).getByRole('radio', { name: 'WebP', exact: true }).click();
  await expect(exportPanel(page).getByText('原作的 GIF 一律無限循環。')).toHaveCount(0);
  await exportPanel(page).getByRole('radio', { name: 'GIF', exact: true }).click();
  await expect(exportPanel(page).getByRole('combobox', { name: '動畫大小' })).toContainText(
    '小 360 × 270（原作）',
  );
  const gif = await exportFile(page, 'GIF');
  expect(gif.name).toBe('cam-vhs.gif');
  const info = parseGif(gif.bytes);
  expect([info.width, info.height]).toEqual([360, 270]);
  expect(info.frames).toHaveLength(24);
  expect(new Set(info.frames.map((f) => f.delayCs))).toEqual(new Set([9]));
  expect(info.loopCount).toBe(0);
  expect(info.globalPalette.length / 3).toBeLessThanOrEqual(64);
  const frames = composeGif(info);
  /* 四角黑色（不透明） */
  const corner = [...frames[0].subarray(0, 4)];
  expect(corner[3]).toBe(255);
  expect(Math.max(corner[0], corner[1], corner[2])).toBeLessThan(16);
  /* 每一格與減色前（四角鋪黑）相近 */
  for (const f of [0, 8, 17, 23]) {
    const ref = await page.evaluate(async (f) => {
      const h = (window as unknown as { __vhsFrame: Hook }).__vhsFrame;
      const img = new Image();
      img.src = await h.frame('anim', f);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 270;
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      x.fillStyle = '#000';
      x.fillRect(0, 0, 360, 270);
      x.drawImage(img, 0, 0);
      return Array.from(x.getImageData(0, 0, 360, 270).data);
    }, f);
    expect(psnr(frames[f], new Uint8Array(ref)), `第 ${f} 格`).toBeGreaterThan(28);
  }
  await expect(gif.result).toContainText('24');
  /* 動畫大小：中 480 × 360 */
  await exportPanel(page).getByRole('combobox', { name: '動畫大小' }).click();
  await page.getByRole('option', { name: /^中 480 × 360/ }).click();
  await expect.poll(async () => (await prefs(page)).animSize).toBe(1);
  /* 播放 1 次（沒有循環） */
  await exportPanel(page).getByRole('switch', { name: '無限循環' }).click();
  await exportPanel(page).getByRole('spinbutton', { name: '播放次數' }).fill('1');
  await exportPanel(page).getByRole('spinbutton', { name: '播放次數' }).press('Enter');
  await expect.poll(async () => (await prefs(page)).plays).toBe(1);
  const g2 = parseGif((await exportFile(page, 'GIF')).bytes);
  expect([g2.width, g2.height]).toEqual([480, 360]);
  expect(g2.loopCount).toBeNull();
  await exportPanel(page).getByRole('switch', { name: '無限循環' }).click();
  /* APNG：24 格、90 ms、四角透明 */
  const apng = await exportFile(page, 'APNG');
  expect(apng.name).toBe('cam-vhs-anim.png');
  const a = parseApng(apng.bytes);
  expect([a.ihdr.width, a.ihdr.height]).toEqual([480, 360]);
  expect(a.numFrames).toBe(24);
  expect(a.numPlays).toBe(0);
  expect(new Set(a.frames.map((f) => (f.delayNum / (f.delayDen || 100)) * 1000))).toEqual(
    new Set([90]),
  );
  /* WebP：24 格、90 ms */
  const webp = await exportFile(page, 'WebP');
  expect(webp.name).toBe('cam-vhs.webp');
  const chunks = parseWebp(webp.bytes);
  const anmf = chunks.filter((c) => c.fourcc === 'ANMF');
  expect(anmf).toHaveLength(24);
  expect(new Set(anmf.map((c) => c.data[12] | (c.data[13] << 8) | (c.data[14] << 16)))).toEqual(
    new Set([90]),
  );
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含照片）、照片讀不到的提醒；復原／重做（F53、F54）', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page, await photoPng(1600, 600), 'wide.png');
  await page.waitForTimeout(450);
  const cap = page.getByRole('textbox', { name: '字幕' });
  await cap.click();
  await cap.pressSequentially('abc');
  await cap.blur();
  expect((await state(page)).caption).toBe('abc');
  /* 文字欄從聚焦到離開算一步 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).caption).toBe('');
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).caption).toBe('abc');
  /* 滾輪連續（0.4 秒內）算一步 */
  await page.waitForTimeout(450);
  const p = await screenPoint(page, 640, 480);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -50);
  await expect.poll(async () => (await state(page)).view.zoom).toBeCloseTo(Math.exp(0.32), 3);
  await page.waitForTimeout(450);
  await page.keyboard.press('Control+z');
  expect((await state(page)).view.zoom).toBe(1);
  await page.keyboard.press('Control+z');
  expect((await state(page)).caption).toBe('');
  await page.keyboard.press('Control+z');
  expect((await state(page)).photo).toBeNull();
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  const before = await state(page);
  expect(before.photo?.name).toBe('wide.png');
  expect(before.caption).toBe('abc');
  expect(before.view.zoom).toBeCloseTo(Math.exp(0.32), 3);
  await page.getByRole('radio', { name: /^GIF 動畫/ }).click();
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __vhsFrame?: unknown }).__vhsFrame);
  expect(await state(page)).toEqual(before);
  await expect(canvas(page)).toHaveAttribute('data-mode', 'gif');
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  /* 照片讀回來了（不是藍色的無訊號） */
  await page.getByRole('radio', { name: /^錄影帶/ }).click();
  await seek(page, 5);
  await expect
    .poll(async () => {
      const c = await pixel(page, 640, 480);
      return c[2] > c[0] + 40 && c[2] > 100;
    })
    .toBe(false);
  /* 照片讀不到：提醒重新選擇 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.photo.id = 'amissingphoto0';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('上次的照片讀不到了')).toBeVisible();
  /* 照片讀不回來：「目前的照片」、位置的按鈕、匯出的檔名一起清掉（對等驗證 7.1） */
  await expect(page.getByTestId('photo-load')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('photo-name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重設位置' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '拿掉照片' })).toBeDisabled();
  await expect.poll(async () => (await state(page)).photo).toBeNull();
  const png = await exportFile(page, 'PNG');
  expect(png.name).toBe('screen-vhs.png');
  /* 提醒留著，直到換上新的照片 */
  await expect(page.getByText('上次的照片讀不到了')).toBeVisible();
  await loadPhoto(page, await photoPng(400, 300), 'new.png');
  await expect(page.getByText('上次的照片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋照片）、重設、開啟還原；缺照片的不開啟（F55）', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page, undefined, 'cam.png');
  await page.getByRole('textbox', { name: '字幕' }).fill('錄影帶');
  await page.getByRole('textbox', { name: '字幕' }).blur();
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('vhs-frame');
  expect(project.data.caption).toBe('錄影帶');
  expect(Object.keys(entries)).toContain(`files/${project.data.photo.id}.png`);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  let s = await state(page);
  expect(s.caption).toBe('');
  expect(s.photo).toBeNull();
  /* 開啟 */
  const openZip = async (name: string, bytes: Uint8Array) => {
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
    await expect(alertDialog(page)).toContainText('開啟專案檔？');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      alertDialog(page).getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser.setFiles(file(name, Buffer.from(bytes), 'application/zip'));
  };
  await openZip('back.zip', zipBytes);
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  s = await state(page);
  expect(s.caption).toBe('錄影帶');
  expect(s.photo?.name).toBe('cam.png');
  /* 缺照片：不開啟 */
  const missing = {
    ...project,
    data: { ...project.data, caption: 'x', photo: { ...project.data.photo, id: 'amissingphoto' } },
  };
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(
    page.getByText('專案檔裡缺少照片（或照片無法讀取），沒有開啟。').first(),
  ).toBeVisible();
  expect((await state(page)).caption).toBe('錄影帶');
  /* 說明與快捷鍵 */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Shift+?');
  await expect(dialog(page)).toContainText('播放／暫停預覽');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '說明' }).click();
  await expect(dialog(page)).toContainText('磨損度');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-19T10:00:00+08:00'));
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-frame', '0');
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('vhs-frame-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('vhs-frame-390.png', { fullPage: true });
  await page.getByRole('radio', { name: /^GIF 動畫/ }).click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
