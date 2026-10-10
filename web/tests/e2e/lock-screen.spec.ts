/**
 * 鎖定畫面訊息產生器（建置產物 next/lock-screen/）的端對端測試（規格 docs/refactor/specs/lock-screen.md）：
 * - 開頁沒有錯誤、預設內容（2 則訊息、完整構圖的預覽）、頁尾只有靈感來源；
 * - 訊息：加到 4 則、刪到 1 則、順序、寄件人／收到時間（整理成 HH:MM）／內容（超過 4 行的提醒）、卡片畫在預覽上；
 * - 通知樣式：App 名稱、不透明度、模糊、間隔；
 * - 鎖定畫面：時間（打字整理、不合法時提示並改回）、日期（星期幾）、狀態列；
 * - 桌布：選照片 → 裁切（9：19.5、縮放滑桿、拖曳夾在範圍內、滾輪、鍵盤、兩指捏合、回到初始）→ 套用、重新裁切還原位置、預設桌布、變暗、
 *   不是圖片的通知；
 * - 外框構圖：照片（1：1）、變暗、漸層（開關、顏色、方向、長度）、手機位置、改了就切到完整構圖；
 * - 預覽：靜態畫面、動畫的時間點、點預覽播放、播完回到靜態、改設定時停止、空白鍵；
 * - 匯出：手機畫面／完整構圖的 PNG（尺寸、像素與預覽一致）、GIF（影格表、只寫變化的範圍、播放次數、三種寬度）、取消；
 * - 自動儲存與還原（含照片）、照片讀不到的提醒、專案檔 ZIP、復原／重做；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { gifFrameRgba, parseGif } from '../helpers/gif';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('lock-screen') ?? { id: 'lock-screen', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:lock-screen';
const PREFS_KEY = 'trpg-toolkit:lock-screen:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 40, 40, 255];
const BLUE: Rgba = [40, 80, 200, 255];
const GREEN: Rgba = [40, 160, 60, 255];
const YELLOW: Rgba = [230, 200, 40, 255];

interface Stored {
  time: string;
  date: string;
  showStatus: boolean;
  wallpaper: {
    image: { id: string; name: string; width: number; height: number } | null;
    place: { zoom: number; x: number; y: number; turns: number };
    dim: number;
  };
  appName: string;
  opacity: number;
  blur: number;
  interval: number;
  messages: { id: string; sender: string; body: string; received: string }[];
  outer: {
    image: { id: string; name: string } | null;
    place: { zoom: number; x: number; y: number; turns: number };
    dim: number;
    gradient: { on: boolean; color: string; direction: string; length: number };
    side: string;
  };
}

/* ---------- 共用 ---------- */

/** 四色照片（左上紅、右上藍、左下綠、右下黃） */
async function quadPng(w = 800, h = 600): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? (y < h / 2 ? RED : GREEN) : y < h / 2 ? BLUE : YELLOW;
      px.set(c, (y * w + x) * 4);
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
  await expect(page.getByRole('heading', { level: 1, name: '鎖定畫面訊息產生器' })).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('lock-canvas');
const tab = (page: Page, name: '訊息' | '手機畫面' | '外框構圖') => page.getByRole('tab', { name });
const radio = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole('radio', { name, exact: typeof name === 'string' });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const dialog = (page: Page) => page.getByRole('dialog');
const alertDialog = (page: Page) => page.getByRole('alertdialog');
const previewMode = (page: Page) => page.getByRole('radiogroup', { name: '預覽', exact: true });

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

async function setPreview(page: Page, mode: '手機畫面' | '完整構圖') {
  await radio(previewMode(page), mode).click();
  await expect(canvas(page)).toHaveAttribute('data-mode', mode === '手機畫面' ? 'screen' : 'full');
}

interface TestHook {
  seek: (t: number) => void;
  play: () => { t: number; playing: boolean };
}

/** 播放的狀態（測試入口） */
async function playState(page: Page) {
  return page.evaluate(() => (window as unknown as { __lockScreen: TestHook }).__lockScreen.play());
}

/** 停在某個時間（測試入口）；Infinity 也可以（＝靜態） */
async function seek(page: Page, t: number) {
  await page.evaluate(
    (x) => (window as unknown as { __lockScreen: TestHook }).__lockScreen.seek(x),
    t,
  );
  await page.waitForTimeout(80);
}

/** 預覽畫布上一點的顏色：手機畫面時以畫面單位（390 × 845）計，完整構圖時以輸出 px 計 */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const k = c.dataset.mode === 'screen' ? c.width / 390 : 1;
      const d = c.getContext('2d')?.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y],
  );
}

const near = (a: number[], b: number[], tol = 10) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const dimmed = (c: Rgba, dim: number): number[] => c.slice(0, 3).map((v) => v * (1 - dim / 100));

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

/** 匯出並下載：格式、範圍（GIF 時可以指定寬度） */
async function exportFile(
  page: Page,
  format: 'PNG' | 'GIF',
  target: '手機畫面' | '完整構圖',
  width?: 540 | 720 | 1080,
) {
  const panel = page.getByRole('region', { name: '匯出' });
  await radio(panel, format).click();
  await panel.getByRole('radio', { name: new RegExp(`^${target}（`) }).click();
  if (width) {
    await panel.getByRole('combobox', { name: 'GIF 大小' }).click();
    await page.getByRole('option', { name: new RegExp(`^${width} ×`) }).click();
  }
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

/** 解碼 GIF 的每一格（照位置疊上去） */
function gifFrames(bytes: Uint8Array) {
  const info = parseGif(bytes);
  const canvasPx = new Uint8Array(info.width * info.height * 4);
  const frames = info.frames.map((f) => {
    const px = gifFrameRgba(info, f);
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const s = (y * f.width + x) * 4;
        canvasPx.set(px.subarray(s, s + 4), ((f.y + y) * info.width + f.x + x) * 4);
      }
    return canvasPx.slice();
  });
  const at = (i: number, x: number, y: number): Rgba => {
    const k = (y * info.width + x) * 4;
    return [frames[i][k], frames[i][k + 1], frames[i][k + 2], frames[i][k + 3]];
  };
  return { info, frames, at };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const wallpaperInput = (page: Page) =>
  page.getByRole('group', { name: '桌布照片載入區' }).locator('input[type=file]');
const outerInput = (page: Page) =>
  page.getByRole('group', { name: '外框照片載入區' }).locator('input[type=file]');

/** 選桌布照片 → 裁切對話框（不套用） */
async function chooseWallpaper(page: Page, buffer?: Buffer, name = 'quad.png') {
  await tab(page, '手機畫面').click();
  await wallpaperInput(page).setInputFiles(file(name, buffer ?? (await quadPng())));
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: '裁切桌布' })).toBeVisible();
}

async function applyCrop(page: Page) {
  await dialog(page).getByRole('button', { name: '套用' }).click();
  await expect(dialog(page)).toBeHidden();
}

const placementOf = async (page: Page) =>
  ((await page.getByTestId('frame-view').getAttribute('data-placement')) ?? '')
    .split(',')
    .map(Number);

/** 卡片的標頭（第一張在 y 230～263）與卡片下方的桌布：卡片底色偏白 */
const CARD_POINT: [number, number] = [300, 245];

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設內容（2 則訊息、完整構圖）、頁尾只有靈感來源（F01、F42）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-mode', 'full');
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x1200');
  await expect(radio(previewMode(page), '完整構圖')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('message-count')).toHaveText('2 / 4');
  await expect(page.getByRole('textbox', { name: '第 1 則：寄件人' })).toHaveValue('未知號碼');
  await expect(page.getByRole('textbox', { name: '第 2 則：內容' })).toHaveValue(
    '今晚十二點，一個人來。別告訴任何人。',
  );
  /* 匯出：預設 PNG、手機畫面 1080 × 2340 */
  await expect(page.getByTestId('export-size')).toHaveText('1080 × 2340 px');
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute('href', 'https://textscene.netlify.app/');
  await expect(footer.getByRole('link')).toHaveText('TEXTSCENE');
  /* 完整構圖：手機靠右（右邊的機身邊框是深色，左半邊是外框背景） */
  expect(near(await pixel(page, 1128, 600), [14, 15, 18], 30)).toBe(true);
  const left = await pixel(page, 150, 600);
  expect(left[3]).toBe(255);
  expect(near(left, [0, 0, 0], 30)).toBe(false);
  /* 手機畫面：1080 × 2340，靜態畫面有卡片 */
  await setPreview(page, '手機畫面');
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x2340');
  const card = await pixel(page, ...CARD_POINT);
  expect(card[0]).toBeGreaterThan(150);
  expect((await prefs(page)).preview).toBe('screen');
  expect(errors).toEqual([]);
});

/* ---------- 訊息 ---------- */

test('訊息：加到 4 則、刪到 1 則、順序、寄件人／收到時間／內容、超過 4 行的提醒（F01～F08）', async ({
  page,
}) => {
  const errors = await open(page);
  await setPreview(page, '手機畫面');
  const add = page.getByRole('button', { name: '加一則訊息' });
  await add.click();
  /* 加了之後游標在新訊息的寄件人 */
  await expect(page.getByRole('textbox', { name: '第 3 則：寄件人' })).toBeFocused();
  await page.keyboard.type('學姊');
  await add.click();
  await expect(page.getByTestId('message-count')).toHaveText('4 / 4');
  await expect(add).toBeDisabled();
  await expect(page.getByTestId('messages-full')).toHaveText('最多 4 則。');
  let s = await state(page);
  expect(s.messages.map((m) => m.sender)).toEqual(['未知號碼', '未知號碼', '學姊', '']);
  /* 收到時間：離開時整理成 HH:MM；不合理的照原樣 */
  const received = page.getByRole('textbox', { name: '第 3 則：收到時間' });
  await received.fill('930');
  await received.blur();
  await expect(received).toHaveValue('09:30');
  const received4 = page.getByRole('textbox', { name: '第 4 則：收到時間' });
  await received4.fill('昨天');
  await received4.blur();
  s = await state(page);
  expect(s.messages.map((m) => m.received)).toEqual(['', '', '09:30', '昨天']);
  /* 內容：超過 4 行時提醒 */
  const body4 = page.getByRole('textbox', { name: '第 4 則：內容' });
  await body4.fill('一'.repeat(120));
  await body4.blur();
  await expect(
    page.getByText('超過 4 行，通知裡只顯示到第 4 行（後面以「…」省略）。'),
  ).toBeVisible();
  /* 4 則都在：最上面的卡片在 230 附近（最新的第 4 則有 4 行，卡片高 142） */
  await seek(page, Number.POSITIVE_INFINITY);
  /* 順序：第 4 則往前 */
  await page.getByRole('button', { name: '第 4 則往前（早一點收到）' }).click();
  s = await state(page);
  expect(s.messages.map((m) => m.received)).toEqual(['', '', '昨天', '09:30']);
  await expect(page.getByRole('button', { name: '第 1 則往前（早一點收到）' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '第 4 則往後（晚一點收到）' })).toBeDisabled();
  /* 刪到剩 1 則：最後一則不能刪 */
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '刪除第 1 則' }).click();
  await expect(page.getByTestId('message-count')).toHaveText('1 / 4');
  await expect(page.getByRole('button', { name: '刪除第 1 則' })).toBeDisabled();
  s = await state(page);
  expect(s.messages).toHaveLength(1);
  expect(s.messages[0].received).toBe('09:30');
  /* 只有一則：第二張卡片的位置（y 330 附近）是桌布 */
  await seek(page, Number.POSITIVE_INFINITY);
  expect((await pixel(page, 300, 245))[0]).toBeGreaterThan(150);
  expect((await pixel(page, 300, 400))[0]).toBeLessThan(120);
  /* 寄件人、內容的字數上限（以字元計） */
  const sender = page.getByRole('textbox', { name: '第 1 則：寄件人' });
  await sender.fill('😀'.repeat(70));
  expect(Array.from((await state(page)).messages[0].sender)).toHaveLength(60);
  expect(errors).toEqual([]);
});

test('通知樣式：App 名稱、不透明度、模糊、間隔（F09～F12）', async ({ page }) => {
  const errors = await open(page);
  await setPreview(page, '手機畫面');
  const before = await pixel(page, ...CARD_POINT);
  const app = page.getByRole('textbox', { name: 'App 名稱' });
  await app.fill('LINE 的替身');
  await app.blur();
  expect((await state(page)).appName).toBe('LINE 的替身');
  /* 不透明度 0、模糊 0：卡片底下就是桌布 */
  for (const [name, v] of [
    ['卡片不透明度', '0'],
    ['卡片背景模糊', '0'],
  ] as const) {
    const input = page.getByRole('spinbutton', { name });
    await input.fill(v);
    await input.press('Enter');
  }
  let s = await state(page);
  expect([s.opacity, s.blur]).toEqual([0, 0]);
  const clear = await pixel(page, ...CARD_POINT);
  expect(clear[0]).toBeLessThan(before[0] - 60);
  /* 間隔：0.7～2.5（0.1） */
  const interval = page.getByRole('spinbutton', { name: '訊息間隔' });
  await interval.fill('3');
  await interval.press('Enter');
  s = await state(page);
  expect(s.interval).toBe(2.5);
  await interval.fill('0.84');
  await interval.press('Enter');
  expect((await state(page)).interval).toBe(0.8);
  /* 預覽的長度：0.5 ＋ 0.8 ＋ 0.6 */
  await expect(page.getByTestId('transport-time')).toContainText('1.90');
  expect(errors).toEqual([]);
});

/* ---------- 鎖定畫面 ---------- */

test('鎖定畫面：時間（打字整理、不合法時提示並改回）、日期（星期幾）、狀態列（F20～F22）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '手機畫面').click();
  const time = page.getByRole('textbox', { name: '時間', exact: true });
  await time.click();
  await time.press('Control+a');
  await time.pressSequentially('815');
  await expect(time).toHaveValue('8:15');
  expect((await state(page)).time).toBe('08:15');
  await time.blur();
  await expect(time).toHaveValue('08:15');
  /* 不合法：欄位下方提示；離開時通知並改回最後一個合法的時間（打字途中「256」＝02:56 已經套用，同原作） */
  await time.click();
  await time.press('Control+a');
  await time.pressSequentially('2561');
  await expect(time).toHaveValue('25:61');
  await expect(page.getByText('時間要在 00:00～23:59 之間。')).toBeVisible();
  await time.blur();
  await expect(toast(page, '時間要在 00:00～23:59 之間，已改回 02:56。')).toBeVisible();
  await expect(time).toHaveValue('02:56');
  expect((await state(page)).time).toBe('02:56');
  /* 日期 */
  await expect(page.getByTestId('date-label')).toHaveText('畫面上顯示「10月31日 星期六」。');
  await page.getByRole('textbox', { name: '日期' }).fill('2026-12-25');
  await expect(page.getByTestId('date-label')).toHaveText('畫面上顯示「12月25日 星期五」。');
  expect((await state(page)).date).toBe('2026-12-25');
  /* 狀態列：訊號的第 4 格（x 34～37、y 14～24） */
  await setPreview(page, '手機畫面');
  const bar = await pixel(page, 35.4, 20);
  expect(bar[0]).toBeGreaterThan(200);
  await page.getByRole('switch', { name: '顯示狀態列' }).click();
  expect((await state(page)).showStatus).toBe(false);
  await expect.poll(async () => (await pixel(page, 35.4, 20))[0]).toBeLessThan(120);
  expect(errors).toEqual([]);
});

/* ---------- 桌布與裁切 ---------- */

test('桌布：選照片 → 裁切（9：19.5、滑桿、拖曳夾在範圍內、滾輪、鍵盤、回到初始）→ 套用；重新裁切；預設桌布；變暗（F13～F19）', async ({
  page,
}) => {
  const errors = await open(page);
  await setPreview(page, '手機畫面');
  await chooseWallpaper(page);
  const d = dialog(page);
  await expect(d.getByTestId('frame-output')).toHaveText('1080 × 2340 px');
  await expect(d.getByRole('button', { name: '整張放入' })).toHaveCount(0);
  await expect(placementOf(page)).resolves.toEqual([1, 0, 0, 0]);
  /* 縮放滑桿（100%～400%） */
  const zoom = d.getByRole('spinbutton', { name: '縮放' });
  await expect(zoom).toHaveValue('100');
  await zoom.fill('50');
  await zoom.press('Enter');
  await expect(zoom).toHaveValue('100');
  await zoom.fill('200');
  await zoom.press('Enter');
  expect((await placementOf(page))[0]).toBeCloseTo(2, 2);
  /* 拖曳很遠：夾在照片蓋滿的範圍內（800 × 600 蓋滿 9：19.5、放大 2 倍：左右各最多 (照片寬 − 框寬)／2） */
  const view = d.getByTestId('frame-view');
  const b = (await view.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 2000, b.y + b.height / 2 - 2000, { steps: 4 });
  await page.mouse.up();
  const [, x, y] = await placementOf(page);
  const maxX = (800 * (19.5 / 600) * 2 - 9) / 2 / 9;
  expect(x).toBeCloseTo(maxX, 2);
  expect(y).toBeCloseTo(-0.5, 2);
  /* 回到初始 */
  await d.getByRole('button', { name: '回到初始' }).click();
  await expect(placementOf(page)).resolves.toEqual([1, 0, 0, 0]);
  /* 鍵盤：+ 放大、→ 往右 */
  await view.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('Shift+ArrowRight');
  const [z2, x2] = await placementOf(page);
  expect(z2).toBeCloseTo(1.1, 3);
  expect(x2).toBeGreaterThan(0);
  /* 滾輪：以游標為中心縮放 */
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await placementOf(page))[0]).toBeCloseTo(1.21, 2);
  await d.getByRole('button', { name: '回到初始' }).click();
  await applyCrop(page);
  let s = await state(page);
  expect(s.wallpaper.image).toMatchObject({ name: 'quad.png', width: 800, height: 600 });
  expect(s.wallpaper.place).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
  await expect(page.getByTestId('wallpaper-name')).toContainText('quad.png');
  /* 預覽：照片蓋滿、置中（左上紅、右上藍、左下綠、右下黃），變暗 12% */
  await expect.poll(async () => near(await pixel(page, 40, 205), dimmed(RED, 12))).toBe(true);
  expect(near(await pixel(page, 350, 205), dimmed(BLUE, 12))).toBe(true);
  expect(near(await pixel(page, 40, 700), dimmed(GREEN, 12))).toBe(true);
  expect(near(await pixel(page, 350, 700), dimmed(YELLOW, 12))).toBe(true);
  /* 重新裁切：打開時是目前的位置；拖到右邊（照片往右 → 左邊露出更多紅、綠） */
  await page.getByRole('button', { name: '重新裁切' }).click();
  await expect(placementOf(page)).resolves.toEqual([1, 0, 0, 0]);
  const v2 = (await dialog(page).getByTestId('frame-view').boundingBox())!;
  await page.mouse.move(v2.x + v2.width / 2, v2.y + v2.height / 2);
  await page.mouse.down();
  await page.mouse.move(v2.x + v2.width / 2 + 80, v2.y + v2.height / 2, { steps: 4 });
  await page.mouse.up();
  const moved = await placementOf(page);
  await applyCrop(page);
  s = await state(page);
  expect(s.wallpaper.place.x).toBeCloseTo(moved[1], 3);
  expect(near(await pixel(page, 300, 700), dimmed(GREEN, 12))).toBe(true);
  /* 取消：不換 */
  await page.getByRole('button', { name: '重新裁切' }).click();
  await expect.poll(async () => (await placementOf(page))[1]).toBeCloseTo(moved[1], 3);
  await dialog(page).getByRole('button', { name: '取消' }).click();
  expect((await state(page)).wallpaper.place.x).toBeCloseTo(moved[1], 3);
  /* 變暗 */
  const dim = page.getByRole('spinbutton', { name: '變暗', exact: true });
  await dim.fill('50');
  await dim.press('Enter');
  expect((await state(page)).wallpaper.dim).toBe(50);
  await expect.poll(async () => near(await pixel(page, 40, 700), dimmed(GREEN, 50))).toBe(true);
  /* 預設桌布 */
  await page.getByRole('button', { name: '用預設桌布' }).click();
  s = await state(page);
  expect(s.wallpaper.image).toBeNull();
  await expect(page.getByRole('button', { name: '重新裁切' })).toBeDisabled();
  /* 不是圖片、壞檔：通知、不打開裁切 */
  await wallpaperInput(page).setInputFiles(file('note.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, '「note.txt」不是圖片檔')).toBeVisible();
  await wallpaperInput(page).setInputFiles(file('broken.png', Buffer.from('not a png')));
  await expect(toast(page, '「broken.png」無法讀取，檔案可能已損壞')).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('裁切：兩指捏合以中點縮放、旋轉 90°（F14）', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = await open(page);
  await chooseWallpaper(page);
  const view = dialog(page).getByTestId('frame-view');
  const b = (await view.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
    });
  await touch('touchStart', [
    [cx - 40, cy],
    [cx + 40, cy],
  ]);
  for (const d of [50, 60, 80]) {
    await touch('touchMove', [
      [cx - d, cy],
      [cx + d, cy],
    ]);
  }
  await touch('touchEnd', []);
  /* 兩指距離 80 → 160：放大 2 倍；中點不動所以位移不變 */
  const [z, x, y] = await placementOf(page);
  expect(z).toBeCloseTo(2, 1);
  expect(x).toBeCloseTo(0, 2);
  expect(y).toBeCloseTo(0, 2);
  await dialog(page).getByRole('button', { name: '旋轉 90°' }).click();
  expect((await placementOf(page))[3]).toBe(1);
  await applyCrop(page);
  expect((await state(page)).wallpaper.place.turns).toBe(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('整個視窗拖放、貼上：訊息與手機畫面分頁換桌布、外框構圖分頁換外框；一批檔案的提醒合成一則；說明與快捷鍵（F13、F24、F63）', async ({
  page,
}) => {
  const errors = await open(page);
  const tall = await quadPng(300, 500);
  /* 訊息分頁：拖兩個檔案到視窗 → 第一張圖片打開桌布的裁切；文字檔等套用時一起提醒 */
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
  await expect(dialog(page).getByRole('heading', { name: '裁切桌布' })).toBeVisible();
  await applyCrop(page);
  await expect(toast(page, '已換上照片「tall.png」')).toBeVisible();
  await expect(toast(page, '「a.txt」不是圖片檔')).toBeVisible();
  expect((await state(page)).wallpaper.image?.name).toBe('tall.png');
  /* 外框構圖分頁：貼上 → 外框的裁切 */
  await tab(page, '外框構圖').click();
  const wide = await quadPng(400, 300);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, wide.toString('base64'));
  await expect(dialog(page).getByRole('heading', { name: '裁切外框背景' })).toBeVisible();
  await applyCrop(page);
  let s = await state(page);
  expect(s.outer.image?.name).toBe('pasted.png');
  expect(s.wallpaper.image?.name).toBe('tall.png');
  await expect(canvas(page)).toHaveAttribute('data-mode', 'full');
  /* 復原：外框回到預設背景 */
  await page.getByRole('button', { name: /^復原/ }).click();
  s = await state(page);
  expect(s.outer.image).toBeNull();
  /* ? 打開快捷鍵說明 */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Shift+?');
  await expect(dialog(page)).toContainText('播放／暫停訊息動畫');
  await page.keyboard.press('Escape');
  /* 頁首的說明 */
  await page.getByRole('button', { name: '說明' }).click();
  await expect(dialog(page)).toContainText('匯出 PNG');
  expect(errors).toEqual([]);
});

/* ---------- 外框構圖 ---------- */

test('外框構圖：照片（1：1）、變暗、漸層、手機位置；改了就切到完整構圖（F24～F33）', async ({
  page,
}) => {
  const errors = await open(page);
  await setPreview(page, '手機畫面');
  await tab(page, '外框構圖').click();
  /* 改外框的設定：預覽切到完整構圖 */
  await page.getByRole('switch', { name: '顯示漸層' }).click();
  await expect(canvas(page)).toHaveAttribute('data-mode', 'full');
  expect((await state(page)).outer.gradient.on).toBe(false);
  /* 沒有漸層：右邊緣是預設背景的灰藍色（不是黑色） */
  const edge = await pixel(page, 1190, 600);
  expect(near(edge, [0, 0, 0], 40)).toBe(false);
  await page.getByRole('switch', { name: '顯示漸層' }).click();
  await expect.poll(async () => near(await pixel(page, 1190, 600), [0, 0, 0], 12)).toBe(true);
  /* 方向：從左邊；長度 30% */
  await radio(page, '從左邊往右變淡').click();
  const length = page.getByRole('spinbutton', { name: '漸層長度' });
  await length.fill('30');
  await length.press('Enter');
  let s = await state(page);
  expect(s.outer.gradient).toMatchObject({ direction: 'left', length: 30, on: true });
  await expect.poll(async () => near(await pixel(page, 5, 600), [0, 0, 0], 12)).toBe(true);
  /* 360 以外沒有漸層 */
  expect(near(await pixel(page, 400, 40), [0, 0, 0], 40)).toBe(false);
  /* 顏色 */
  const color = page.getByRole('textbox', { name: '漸層顏色' });
  await color.fill('#ff0000');
  await color.press('Enter');
  expect((await state(page)).outer.gradient.color).toBe('#ff0000');
  await expect.poll(async () => near(await pixel(page, 2, 600), [255, 0, 0], 20)).toBe(true);
  /* 手機位置：靠左（機身在左邊、右邊是背景） */
  await radio(page, '靠左').click();
  expect((await state(page)).outer.side).toBe('left');
  await expect.poll(async () => near(await pixel(page, 73, 600), [14, 15, 18], 30)).toBe(true);
  expect(near(await pixel(page, 1128, 600), [14, 15, 18], 30)).toBe(false);
  /* 外框照片：1：1 裁切、輸出 1200 × 1200 */
  await outerInput(page).setInputFiles(file('outer.png', await quadPng(600, 600)));
  await expect(dialog(page).getByRole('heading', { name: '裁切外框背景' })).toBeVisible();
  await expect(dialog(page).getByTestId('frame-output')).toHaveText('1200 × 1200 px');
  await applyCrop(page);
  s = await state(page);
  expect(s.outer.image).toMatchObject({ name: 'outer.png' });
  /* 右下是黃色（沒有漸層的地方） */
  await expect.poll(async () => near(await pixel(page, 1100, 1100), YELLOW, 12)).toBe(true);
  const dim = page.getByRole('spinbutton', { name: '外框變暗' });
  await dim.fill('40');
  await dim.press('Enter');
  await expect
    .poll(async () => near(await pixel(page, 1100, 1100), dimmed(YELLOW, 40), 12))
    .toBe(true);
  await page.getByRole('button', { name: '用預設背景' }).click();
  expect((await state(page)).outer.image).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 預覽與動畫 ---------- */

test('預覽：靜態畫面、動畫的時間點、點預覽播放、播完回到靜態、改設定時停止、空白鍵（F41～F45）', async ({
  page,
}) => {
  const errors = await open(page);
  await setPreview(page, '手機畫面');
  const still = await pixel(page, ...CARD_POINT);
  expect(still[0]).toBeGreaterThan(150);
  /* 0.5 秒前沒有卡片 */
  await seek(page, 0.2);
  const empty = await pixel(page, ...CARD_POINT);
  expect(empty[0]).toBeLessThan(100);
  /* 第 1 則彈完（1.1 秒）：最上面是第 1 則（寄件人在 y 285 附近），第 2 則還沒出現 */
  await seek(page, 1.6);
  expect((await pixel(page, ...CARD_POINT))[0]).toBeGreaterThan(150);
  expect((await pixel(page, 300, 340))[0]).toBeLessThan(100);
  /* 全部出現 */
  await seek(page, 2.3);
  expect((await pixel(page, 300, 340))[0]).toBeGreaterThan(150);
  /* 點預覽：從頭播放；播完回到靜態 */
  await page.getByRole('button', { name: '播放訊息跳出來的動畫' }).click();
  await expect.poll(async () => (await playState(page)).playing).toBe(true);
  await expect.poll(async () => (await playState(page)).playing, { timeout: 6000 }).toBe(false);
  expect((await playState(page)).t).toBeCloseTo(2.3, 6);
  expect(near(await pixel(page, ...CARD_POINT), still, 4)).toBe(true);
  /* 空白鍵：播放／暫停；播放中改設定 → 停止並顯示靜態畫面 */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playState(page)).playing).toBe(true);
  await tab(page, '手機畫面').click();
  await page.getByRole('switch', { name: '顯示狀態列' }).click();
  await expect.poll(async () => (await playState(page)).playing).toBe(false);
  expect((await playState(page)).t).toBeCloseTo(2.3, 6);
  /* 播放列的時間軸：每則一段 */
  const legend = page.getByRole('group', { name: '播放控制' }).locator('li');
  await expect(legend.filter({ hasText: '第 1 則' })).toContainText('0.50–1.70');
  await expect(legend.filter({ hasText: '第 2 則' })).toContainText('1.70–2.30');
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：手機畫面 1080 × 2340、完整構圖 1200 × 1200，像素與預覽一致（F47、F48、F55）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await chooseWallpaper(page);
  await applyCrop(page);
  await setPreview(page, '手機畫面');
  await seek(page, Number.POSITIVE_INFINITY);
  const screen = await exportFile(page, 'PNG', '手機畫面');
  expect(screen.name).toMatch(/^lockscreen-screen-\d{8}-\d{6}\.png$/);
  const png = readPng(screen.bytes);
  expect([png.width, png.height]).toEqual([1080, 2340]);
  for (const [x, y] of [CARD_POINT, [40, 700], [350, 205], [195, 830]] as [number, number][]) {
    const k = 1080 / 390;
    expect(near(png.at(Math.round(x * k), Math.round(y * k)), await pixel(page, x, y), 3)).toBe(
      true,
    );
  }
  await expect(screen.result).toContainText('1080×2340 px');
  await setPreview(page, '完整構圖');
  const full = await exportFile(page, 'PNG', '完整構圖');
  expect(full.name).toMatch(/^lockscreen-full-\d{8}-\d{6}\.png$/);
  const fpng = readPng(full.bytes);
  expect([fpng.width, fpng.height]).toEqual([1200, 1200]);
  for (const [x, y] of [
    [150, 600],
    [884, 600],
    [700, 200],
    [1150, 1150],
  ] as [number, number][])
    expect(near(fpng.at(x, y), await pixel(page, x, y), 3)).toBe(true);
  expect(errors).toEqual([]);
});

test('匯出 GIF：影格表、只寫變化的範圍、播放次數、三種寬度、完整構圖；取消（F49～F53、F57）', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  const gif = await exportFile(page, 'GIF', '手機畫面', 540);
  expect(gif.name).toMatch(/^lockscreen-screen-\d{8}-\d{6}\.gif$/);
  await expect(page.getByTestId('export-frames')).toHaveText(/^25 格、約 4\.\d 秒$/);
  const g = gifFrames(gif.bytes);
  expect([g.info.width, g.info.height]).toEqual([540, 1170]);
  expect(g.info.loopCount).toBe(0);
  expect(g.info.frames.map((f) => f.delayCs)).toEqual([
    50,
    ...Array(11).fill(5),
    65,
    ...Array(11).fill(5),
    180,
  ]);
  /* 第 2 格起只寫變化的範圍（卡片那一帶），寬不超過畫面、上方的時間不在範圍裡 */
  for (const f of g.info.frames.slice(1)) {
    expect(f.width).toBeLessThanOrEqual(540);
    expect(f.y).toBeGreaterThan(80);
  }
  /* 第 0 格沒有卡片；最後一格兩張卡片都在 */
  const k = 540 / 390;
  expect(g.at(0, Math.round(300 * k), Math.round(245 * k))[0]).toBeLessThan(100);
  expect(g.at(24, Math.round(300 * k), Math.round(245 * k))[0]).toBeGreaterThan(150);
  expect(g.at(24, Math.round(300 * k), Math.round(340 * k))[0]).toBeGreaterThan(150);
  await expect(gif.result).toContainText('25 格');
  /* 播放次數 3 */
  const panel = page.getByRole('region', { name: '匯出' });
  await panel.getByRole('switch', { name: '無限循環' }).click();
  await panel.getByRole('spinbutton', { name: '播放次數' }).fill('3');
  await panel.getByRole('spinbutton', { name: '播放次數' }).press('Enter');
  expect((await prefs(page)).plays).toBe(3);
  const g3 = parseGif((await exportFile(page, 'GIF', '手機畫面', 720)).bytes);
  expect([g3.width, g3.height]).toEqual([720, 1560]);
  expect(g3.loopCount).toBe(2);
  /* 完整構圖 1200 × 1200 */
  const full = await exportFile(page, 'GIF', '完整構圖');
  expect(full.name).toMatch(/^lockscreen-full-/);
  const gf = parseGif(full.bytes);
  expect([gf.width, gf.height]).toEqual([1200, 1200]);
  expect(gf.frames).toHaveLength(25);
  /* 取消：1080 寬開始匯出後馬上取消，不會有結果 */
  await panel.getByRole('radio', { name: /^手機畫面（/ }).click();
  await panel.getByRole('combobox', { name: 'GIF 大小' }).click();
  await page.getByRole('option', { name: /^1080 ×/ }).click();
  await expect(page.getByTestId('export-size')).toHaveText('1080 × 2340 px');
  await panel.getByRole('button', { name: '匯出 GIF' }).click();
  await panel.getByRole('button', { name: '取消' }).click();
  await expect(panel.getByRole('button', { name: '匯出 GIF' })).toBeVisible();
  await expect(page.getByTestId('export-result')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含照片）、照片讀不到的提醒；復原／重做（F58、F61）', async ({ page }) => {
  const errors = await open(page);
  await chooseWallpaper(page);
  await applyCrop(page);
  const time = page.getByRole('textbox', { name: '時間', exact: true });
  await time.fill('0300');
  await time.blur();
  await tab(page, '訊息').click();
  const body = page.getByRole('textbox', { name: '第 1 則：內容' });
  await body.fill('abc');
  await body.blur();
  /* 文字欄：從聚焦到離開算一步 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).messages[0].body).toBe('你還記得那棟洋館嗎？');
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).messages[0].body).toBe('abc');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await state(page)).time).toBe('23:47');
  await page.keyboard.press('Control+z');
  expect((await state(page)).wallpaper.image).toBeNull();
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  const before = await state(page);
  expect(before.messages[0].body).toBe('abc');
  expect(before.time).toBe('03:00');
  await setPreview(page, '手機畫面');
  await page.reload();
  expect(await state(page)).toEqual(before);
  await expect(canvas(page)).toHaveAttribute('data-mode', 'screen');
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  await expect.poll(async () => near(await pixel(page, 40, 700), dimmed(GREEN, 12))).toBe(true);
  /* 照片讀不到：提醒重新選擇、用預設桌布畫 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.wallpaper.image.id = 'amissingphoto0';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('上次的桌布照片讀不到了')).toBeVisible();
  expect(near(await pixel(page, 40, 700), dimmed(GREEN, 12))).toBe(false);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋照片）、重設、開啟還原；缺照片的不套用（F62）', async ({ page }) => {
  const errors = await open(page);
  await chooseWallpaper(page);
  await applyCrop(page);
  await page.getByRole('textbox', { name: '時間', exact: true }).fill('1111');
  await page.getByRole('textbox', { name: '時間', exact: true }).blur();
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('lock-screen');
  expect(project.data.time).toBe('11:11');
  expect(Object.keys(entries)).toContain(`files/${project.data.wallpaper.image.id}.png`);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  let s = await state(page);
  expect(s.time).toBe('23:47');
  expect(s.wallpaper.image).toBeNull();
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
  expect(s.time).toBe('11:11');
  expect(s.wallpaper.image?.name).toBe('quad.png');
  /* 缺照片：不套用 */
  const missing = {
    ...project,
    data: {
      ...project.data,
      time: '22:22',
      wallpaper: {
        ...project.data.wallpaper,
        image: { ...project.data.wallpaper.image, id: 'amissingphoto' },
      },
    },
  };
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(
    page.getByText('專案檔裡缺少照片（或照片無法讀取），沒有開啟。').first(),
  ).toBeVisible();
  expect((await state(page)).time).toBe('11:11');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('lock-screen-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('lock-screen-390.png', { fullPage: true });
  for (const t of ['手機畫面', '外框構圖'] as const) {
    await tab(page, t).click();
    await noHorizontalScroll(page);
  }
  await chooseWallpaper(page);
  await noHorizontalScroll(page);
  await applyCrop(page);
  expect(errors).toEqual([]);
});
