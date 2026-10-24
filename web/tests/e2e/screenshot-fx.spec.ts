/**
 * 截圖演出產生器（建置產物 tools/screenshot-fx/）的端對端測試（規格 docs/refactor/specs/screenshot-fx.md）：
 * - 開頁沒有錯誤、空白狀態、頁尾只有靈感來源、匯出區停用並說明；
 * - 圖片：選檔（換圖時框與出處清空）、整個視窗拖放、貼上、不是圖片的通知、範例圖、示範演出、拿掉；
 * - 畫框：三種工具拖曳畫框、Shift 在已有的框上畫、點空白處取消選取、拖曳移動、控點縮放、方向鍵 1／10 px、
 *   Ctrl＋D 複製、Delete 刪除、復原／重做、清單的選取與個別設定、新畫的框的預設、輔助線開關；
 * - 畫面：放大框跟著放大（框裡的螢光筆）、聚光、塗黑揭開／蓋上的進度、螢光筆長出來、背景模糊／透明／單色、出處；
 * - 時間軸：四段、依序／同時、分段色條、空白鍵播放、循環；
 * - 匯出：PNG（完成圖、與畫面相同）、複製圖片、APNG（影格、色數、只播一次）、MP4、透明 WebM；
 * - 自動儲存與還原（含圖片）、專案檔 ZIP；390 寬沒有橫向捲動。
 * 兩次修改之間至少隔 450 ms（0.4 秒內的連續變更會合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('screenshot-fx') ?? { id: 'screenshot-fx', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:screenshot-fx';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Frame {
  id: string;
  kind: 'zoom' | 'marker' | 'redact';
  x: number;
  y: number;
  w: number;
  h: number;
  [k: string]: unknown;
}

interface Doc {
  image: { id: string; name: string; width: number; height: number } | null;
  camera: Record<string, unknown>;
  shot: Record<string, number>;
  frames: Frame[];
  credit: { text: string; pos: string; size: string };
  timing: Record<string, number | string>;
  bg: Record<string, number | string>;
  [k: string]: unknown;
}

/* ---------- 共用 ---------- */

/** 測試圖：左半淺灰、右半藍色（1000 × 500） */
async function shotPng(w = 1000, h = 500): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const left = x < w / 2;
      px[o] = left ? 240 : 60;
      px[o + 1] = left ? 240 : 120;
      px[o + 2] = left ? 240 : 200;
      px[o + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

/** 測試圖：橫向漸層（紅隨 x、綠隨 y），每個位置的顏色都不同 */
async function gradientPng(w = 1000, h = 500): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = Math.round((x / (w - 1)) * 255);
      px[o + 1] = Math.round((y / (h - 1)) * 255);
      px[o + 2] = 128;
      px[o + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

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
  await expect(page.getByRole('heading', { level: 1, name: '截圖演出產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __screenshotFx?: unknown }).__screenshotFx,
  );
  return errors;
}

type Hook = Record<string, (...a: unknown[]) => unknown>;
async function call<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([n, a]) => {
      const h = (window as unknown as { __screenshotFx: Hook }).__screenshotFx;
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
const doc = (page: Page) => call<Doc>(page, 'doc');
const frames = async (page: Page) => (await doc(page)).frames;

const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const tab = (page: Page, name: '圖片' | '演出框' | '時間軸') =>
  page.getByRole('tab', { name }).click();
const imageInput = (page: Page) => page.locator('[data-testid=image-load] input[type=file]');
const tool = (page: Page, name: '放大框' | '螢光筆' | '塗黑') =>
  page.getByRole('radiogroup', { name: '拖曳畫出' }).getByRole('radio', { name }).click();

async function loadImage(page: Page, buffer?: Buffer, name = 'shot.png') {
  await imageInput(page).setInputFiles(file(name, buffer ?? (await shotPng())));
  await expect.poll(async () => (await state(page))?.image?.name).toBe(name);
  await expect(page.getByTestId('editor')).toBeVisible();
}

interface Shot {
  x: number;
  y: number;
  w: number;
  h: number;
  f: number;
}
const layout = async (page: Page) =>
  call<{ canvas: { width: number; height: number }; shot: Shot }>(page, 'layout');

/** 原圖 px → 螢幕座標 */
async function screenOf(page: Page, sx: number, sy: number) {
  const l = await layout(page);
  const b = (await page.getByTestId('editor').boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const cx = l.shot.x + sx * l.shot.f;
  const cy = l.shot.y + sy * l.shot.f;
  return { x: b.x + (cx / l.canvas.width) * b.width, y: b.y + (cy / l.canvas.height) * b.height };
}

/** 在原圖座標 a → b 拖曳（shift：按住 Shift） */
async function drag(
  page: Page,
  a: [number, number],
  b: [number, number],
  { shift = false }: { shift?: boolean } = {},
) {
  const p = await screenOf(page, a[0], a[1]);
  const q = await screenOf(page, b[0], b[1]);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 3 });
  await page.mouse.move(q.x, q.y, { steps: 3 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

/** 原圖座標的點在 t 秒畫面上的顏色 */
async function srcPixels(page: Page, t: number, pts: [number, number][]): Promise<Rgba[]> {
  const l = await layout(page);
  return call<Rgba[]>(
    page,
    'pixels',
    t,
    pts.map(([x, y]) => [l.shot.x + x * l.shot.f, l.shot.y + y * l.shot.f]),
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

/** 匯出並下載 */
/** 匯出區的格式（六種，用下拉選單） */
async function chooseFormat(page: Page, format: string) {
  await exportPanel(page).getByRole('combobox', { name: '格式' }).click();
  await page.getByRole('option', { name: format, exact: true }).click();
}

/** 格式可以選（瀏覽器檢查完能不能編影片） */
async function expectFormatEnabled(page: Page, format: string) {
  await expect
    .poll(
      async () => {
        await exportPanel(page).getByRole('combobox', { name: '格式' }).click();
        const disabled = await page
          .getByRole('option', { name: format, exact: true })
          .getAttribute('aria-disabled');
        await page.keyboard.press('Escape');
        return disabled !== 'true';
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function exportFile(page: Page, format: string) {
  const panel = exportPanel(page);
  await chooseFormat(page, format);
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 180_000 });
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

const pause = (page: Page) => page.waitForTimeout(450);

/* ---------- 開頁、圖片 ---------- */

test('開頁：沒有錯誤、空白狀態、頁尾只有靈感來源、匯出區說明為什麼不能匯出（F15、F56）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('empty-state')).toContainText('放一張截圖開始');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：KIIN／スクショ演出スタジオ');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://screenshot-studio-8n8.pages.dev/',
  );
  await expect(exportPanel(page)).toContainText('還沒有圖片，無法匯出。');
  await expect(page.getByRole('button', { name: '匯出 PNG' })).toBeDisabled();
  await expect(
    page.getByRole('radiogroup', { name: '拖曳畫出' }).getByRole('radio').first(),
  ).toBeDisabled();
  await expect(page.getByTestId('output-size')).toHaveText('輸出 1920 × 1080 px');
  expect(errors).toEqual([]);
});

test('圖片：選檔、換圖時框與出處清空、拖放、貼上、不是圖片、範例圖、示範演出、拿掉（F01～F05）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, undefined, 'clue.png');
  await expect(page.getByTestId('image-name')).toContainText('目前的圖片：clue.png');
  await expect(page.getByTestId('image-size')).toHaveText('1000 × 500 px');
  /* 先畫一個框、寫出處；換圖之後清空 */
  await pause(page);
  await drag(page, [100, 100], [300, 200]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  await pause(page);
  await call(page, 'set', { credit: { text: '出處：測試', pos: 'below', size: 'md' } });
  await pause(page);
  const png = await shotPng(600, 400);
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
  await expect.poll(async () => (await state(page)).image?.name).toBe('drop.png');
  await expect(toast(page, /「notes.txt」不是圖片/)).toBeVisible();
  expect((await state(page)).frames).toEqual([]);
  expect((await state(page)).credit.text).toBe('');
  /* 復原：圖、框、出處一起回來 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).image?.name).toBe('clue.png');
  expect((await state(page)).frames).toHaveLength(1);
  expect((await state(page)).credit.text).toBe('出處：測試');
  /* 貼上（焦點不在文字欄） */
  await page.evaluate(
    ([b64]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bin], 'image.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true }));
    },
    [png.toString('base64')],
  );
  await expect.poll(async () => (await state(page)).image?.name).toBe('貼上的圖片');
  /* 不是圖片 */
  await imageInput(page).setInputFiles(file('a.txt', Buffer.from('x'), 'text/plain'));
  await expect(toast(page, '沒有換圖片')).toBeVisible();
  expect((await state(page)).image?.name).toBe('貼上的圖片');
  /* 範例圖、示範演出 */
  await tab(page, '圖片');
  await page.getByRole('button', { name: '範例圖', exact: true }).click();
  await expect.poll(async () => (await state(page)).image?.name).toBe('範例：調查紀錄');
  expect((await state(page)).image).toMatchObject({ width: 1280, height: 820 });
  expect((await state(page)).frames).toEqual([]);
  await page.getByRole('button', { name: '示範演出' }).click();
  await expect.poll(async () => (await state(page)).frames.length).toBe(5);
  const s = await state(page);
  expect(s.frames.map((f) => f.kind)).toEqual(['zoom', 'redact', 'marker', 'marker', 'redact']);
  expect(s.credit.text).toBe('霧澤町失蹤案卷宗（範例）');
  /* 拿掉 → 空白狀態 */
  await page.getByRole('button', { name: '拿掉圖片' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect((await state(page)).image).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 畫框與編輯 ---------- */

test('畫框：三種工具、Shift 在已有的框上畫、點空白處取消選取、清單與個別設定、預設（F15～F18、F24、F25、F27～F29、F33～F35）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  /* 放大框（預設工具） */
  await drag(page, [100, 100], [400, 250]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  const z = (await frames(page))[0];
  expect(z).toMatchObject({ kind: 'zoom', scale: 1.25, style: 'card', border: 4 });
  expect(Math.abs(z.x - 100)).toBeLessThanOrEqual(2);
  expect(Math.abs(z.y - 100)).toBeLessThanOrEqual(2);
  expect(Math.abs(z.w - 300)).toBeLessThanOrEqual(3);
  expect(Math.abs(z.h - 150)).toBeLessThanOrEqual(3);
  /* 畫好之後選取、設定欄換到「演出框」 */
  await expect(page.getByRole('tab', { name: '演出框' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`[data-frame-id="${z.id}"]`)).toHaveAttribute('data-selected', 'true');
  /* 在放大框裡拖曳＝移動（不是畫新框） */
  await tool(page, '螢光筆');
  await drag(page, [200, 150], [220, 160]);
  await pause(page);
  expect(await frames(page)).toHaveLength(1);
  /* Shift＋拖曳：在已有的框上畫新框（螢光筆） */
  const moved = (await frames(page))[0];
  await drag(page, [moved.x + 20, moved.y + 20], [moved.x + 200, moved.y + 50], { shift: true });
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  expect((await frames(page))[1]).toMatchObject({ kind: 'marker', style: 'yellow', dir: 'h' });
  /* 預設：塗黑換成馬賽克、蓋上、直向 → 新畫的框用它 */
  await tool(page, '塗黑');
  await expect(page.getByTestId('defaults')).toHaveAttribute('data-kind', 'redact');
  const defaults = page.getByTestId('defaults');
  await defaults.getByRole('radio', { name: '馬賽克' }).click();
  await defaults.getByRole('combobox').click();
  await page.getByRole('option', { name: '蓋上', exact: true }).click();
  await defaults.getByRole('radio', { name: '直向', exact: true }).click();
  await drag(page, [600, 300], [800, 400]);
  await expect.poll(async () => (await frames(page)).length).toBe(3);
  expect((await frames(page))[2]).toMatchObject({
    kind: 'redact',
    style: 'mosaic',
    mode: 'conceal',
    dir: 'v',
    grain: 12,
  });
  /* 點空白處（不拖動）＝取消選取 */
  await drag(page, [900, 450], [900, 450]);
  await expect
    .poll(async () => (await call<{ selected: string | null }>(page, 'live')).selected)
    .toBeNull();
  expect(await frames(page)).toHaveLength(3);
  /* 清單：選第一個 → 個別設定（倍率、樣式、邊框） */
  const row = page.locator(`[data-frame-id="${z.id}"]`);
  await row.locator('button[aria-pressed]').click();
  const editor = row.getByTestId('frame-editor');
  await editor.getByRole('combobox').click();
  await page.getByRole('option', { name: '發光螢幕', exact: true }).click();
  await editor.getByRole('radio', { name: /粗/ }).click();
  const slider = editor.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await frames(page))[0])
    .toMatchObject({
      style: 'cyber',
      border: 6,
      scale: 1.3,
    });
  /* 清單的順序：下移 */
  await row.getByRole('button', { name: '下移：放大框 1' }).click();
  await expect
    .poll(async () => (await frames(page)).map((f) => f.kind))
    .toEqual(['marker', 'zoom', 'redact']);
  /* 輔助線開關（不影響畫面） */
  await expect(page.getByTestId('guides')).toBeVisible();
  await page.getByRole('switch', { name: '編輯輔助線' }).click();
  await expect(page.getByTestId('guides')).toHaveCount(0);
  expect((await call<Record<string, unknown>>(page, 'prefs')).guides).toBe(false);
  expect(errors).toEqual([]);
});

test('編輯：拖曳移動、控點縮放、方向鍵 1／10 px、Ctrl＋D 複製、Delete 刪除、復原／重做（F19～F23、F26、F41）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await drag(page, [100, 100], [300, 200]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  const f0 = (await frames(page))[0];
  /* 拖曳移動 +100、+50（原圖 px） */
  await drag(page, [f0.x + 50, f0.y + 50], [f0.x + 150, f0.y + 100]);
  await expect.poll(async () => (await frames(page))[0].x).not.toBe(f0.x);
  const f1 = (await frames(page))[0];
  expect(Math.abs(f1.x - (f0.x + 100))).toBeLessThanOrEqual(2);
  expect(Math.abs(f1.y - (f0.y + 50))).toBeLessThanOrEqual(2);
  expect([f1.w, f1.h]).toEqual([f0.w, f0.h]);
  /* 拖到圖外：夾在圖裡 */
  await drag(page, [f1.x + 50, f1.y + 50], [2000, 2000]);
  await expect.poll(async () => (await frames(page))[0].x).toBe(1000 - f1.w);
  expect((await frames(page))[0].y).toBe(500 - f1.h);
  /* 右下角的控點：變大 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page))[0].x).toBe(f1.x);
  const handle = page.locator('[data-layout-handle="se"]');
  const hb = (await handle.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  const target = await screenOf(page, f1.x + f1.w + 60, f1.y + f1.h + 30);
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await frames(page))[0].w).toBeGreaterThan(f1.w + 50);
  const f2 = (await frames(page))[0];
  expect(f2.x).toBe(f1.x);
  expect(f2.y).toBe(f1.y);
  /* 方向鍵：1 px，Shift 10 px（焦點不在表單控制項） */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await call(page, 'select', f2.id);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await frames(page))[0].x).toBe(f2.x - 1);
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await frames(page))[0].y).toBe(f2.y + 10);
  /* 點了框（焦點在框的按鈕上）之後，空白鍵照樣播放／暫停 */
  const mid = await screenOf(page, f2.x + 10, f2.y + 10);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(true);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(false);
  /* Ctrl＋D 複製（往右下 16 px） */
  await pause(page);
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  const [a, b] = await frames(page);
  expect(b).toMatchObject({ kind: 'zoom', x: a.x + 16, y: a.y + 16, w: a.w, h: a.h });
  expect(b.id).not.toBe(a.id);
  /* Delete 刪除選取的（複製出來的那個） */
  await pause(page);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  /* 復原／重做 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  /* 清單的「全部刪除」（先確認） */
  await tab(page, '演出框');
  await page.getByRole('button', { name: '全部刪除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click();
  await expect.poll(async () => (await frames(page)).length).toBe(0);
  expect(errors).toEqual([]);
});

/* ---------- 畫面 ---------- */

test('畫面：塗黑揭開／蓋上的進度、螢光筆長出來、放大框跟著放大、聚光（F12、F27、F30、F34、F36、F39）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  const z = {
    id: 'z',
    kind: 'zoom',
    x: 100,
    y: 100,
    w: 200,
    h: 100,
    scale: 1.5,
    style: 'card',
    border: 4,
  };
  const m = { id: 'm', kind: 'marker', x: 120, y: 120, w: 100, h: 20, style: 'pink', dir: 'h' };
  const r = {
    id: 'r',
    kind: 'redact',
    x: 600,
    y: 300,
    w: 200,
    h: 60,
    style: 'black',
    mode: 'reveal',
    dir: 'h',
    density: 100,
    grain: 12,
  };
  const c = { ...r, id: 'c', y: 400, mode: 'conceal' };
  await call(page, 'set', {
    frames: [z, m, r, c],
    timing: { intro: 0.5, popup: 0.5, action: 1, outro: 1, order: 'sequential', fps: 15 },
    shot: { scale: 86, radius: 10, shadow: 32, spotlight: 50 },
  });
  const tl = await call<{ total: number; windows: Record<string, { start: number; end: number }> }>(
    page,
    'timeline',
  );
  expect(tl.windows).toEqual({
    m: { start: 1, end: 2 },
    r: { start: 2, end: 3 },
    c: { start: 3, end: 4 },
  });
  expect(tl.total).toBe(5);
  await expect(page.getByTestId('timing-total')).toHaveCount(1);
  /* 揭開：開始前全黑、一半時左半掀開、結束時全部掀開；蓋上相反 */
  const rp: [number, number][] = [
    [610, 330],
    [790, 330],
  ];
  const cp: [number, number][] = [
    [610, 430],
    [790, 430],
  ];
  const dark = (p: Rgba) => p[0] < 40 && p[1] < 40 && p[2] < 40;
  const [r0a, r0b] = await srcPixels(page, 0, rp);
  expect(dark(r0a) && dark(r0b)).toBe(true);
  const [rha, rhb] = await srcPixels(page, 2.5, rp);
  expect(dark(rha)).toBe(false);
  expect(dark(rhb)).toBe(true);
  const [r1a, r1b] = await srcPixels(page, 5, rp);
  expect(dark(r1a) || dark(r1b)).toBe(false);
  const [c0a, c0b] = await srcPixels(page, 0, cp);
  expect(dark(c0a) || dark(c0b)).toBe(false);
  const [cha, chb] = await srcPixels(page, 3.5, cp);
  expect(dark(cha)).toBe(true);
  expect(dark(chb)).toBe(false);
  const [c1a, c1b] = await srcPixels(page, 5, cp);
  expect(dark(c1a) && dark(c1b)).toBe(true);
  /* 開場：畫面就是原圖（淺灰），沒有變暗 */
  const [bg0] = await srcPixels(page, 0, [[400, 300]]);
  expect(bg0[0]).toBeGreaterThan(230);
  /* 結尾：聚光讓周圍變暗 50% */
  const [bg1] = await srcPixels(page, 5, [[400, 300]]);
  expect(bg1[0]).toBeGreaterThan(110);
  expect(bg1[0]).toBeLessThan(130);
  /* 放大框裡的螢光筆跟著放大：結尾時，螢光筆（原圖 120～220）放大 1.5 倍後落在 (210－200)×1.5＋200 附近，
     放大框以 (200, 150) 為中心 */
  const l = await layout(page);
  const at = (sx: number, sy: number): [number, number] => {
    const cx = l.shot.x + 200 * l.shot.f;
    const cy = l.shot.y + 150 * l.shot.f;
    return [cx + (sx - 200) * l.shot.f * 1.5, cy + (sy - 150) * l.shot.f * 1.5];
  };
  const [pinkEnd, plainEnd] = await call<Rgba[]>(page, 'pixels', 5, [at(210, 130), at(210, 160)]);
  expect(pinkEnd[0]).toBeGreaterThan(220);
  expect(pinkEnd[1]).toBeLessThan(200);
  expect(plainEnd[1]).toBeGreaterThan(220);
  /* 螢光筆的動作：開始前沒有、一半時左邊有、右邊還沒 */
  const [p0] = await call<Rgba[]>(page, 'pixels', 0.2, [
    [l.shot.x + 130 * l.shot.f, l.shot.y + 130 * l.shot.f],
  ]);
  expect(p0[1]).toBeGreaterThan(230);
  const [ma, mb] = await call<Rgba[]>(page, 'pixels', 1.5, [at(125, 130), at(215, 130)]);
  expect(ma[1]).toBeLessThan(200);
  expect(mb[1]).toBeGreaterThan(220);
  /* 同時：三個一起動，總長變短 */
  await call(page, 'set', {
    timing: { intro: 0.5, popup: 0.5, action: 1, outro: 1, order: 'simultaneous', fps: 15 },
  });
  expect((await call<{ total: number }>(page, 'timeline')).total).toBe(3);
  expect(errors).toEqual([]);
});

test('畫面：背景模糊／透明／單色、截圖大小、出處三種位置（F06～F09、F13、F14）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  const corner = async () => (await call<Rgba[]>(page, 'pixels', 0, [[5, 5]]))[0];
  /* 模糊：不透明、調暗 */
  const blur = await corner();
  expect(blur[3]).toBe(255);
  expect(blur[0]).toBeLessThan(160);
  /* 透明 */
  await tab(page, '圖片');
  await page
    .getByRole('radiogroup', { name: '背景', exact: true })
    .getByRole('radio', { name: '透明' })
    .click();
  await expect.poll(async () => (await corner())[3]).toBe(0);
  /* 單色 */
  await page
    .getByRole('radiogroup', { name: '背景', exact: true })
    .getByRole('radio', { name: '單色' })
    .click();
  await expect.poll(async () => (await corner()).join()).toBe('16,19,26,255');
  /* 畫面大小：原圖大小 */
  await page.getByRole('combobox', { name: '畫面大小' }).click();
  await page.getByRole('option', { name: /原圖大小/ }).click();
  await expect(page.getByTestId('output-size')).toHaveText('輸出 1000 × 500 px');
  /* 出處：圖下、畫面底部、圖內徽章（文字畫在不同位置） */
  await page.getByRole('textbox', { name: '出處文字' }).fill('出處：測試資料');
  await page.getByRole('textbox', { name: '出處文字' }).blur();
  await expect.poll(async () => (await state(page)).credit.text).toBe('出處：測試資料');
  const l = await layout(page);
  expect(l.shot.h).toBeLessThan(500 * 0.86);
  for (const pos of ['畫面底部', '截圖右下角'] as const) {
    await page.getByRole('combobox', { name: '位置' }).click();
    await page.getByRole('option', { name: pos }).click();
  }
  await expect.poll(async () => (await state(page)).credit.pos).toBe('badge');
  /* 徽章：截圖右下角是深色的底 */
  const l2 = await layout(page);
  const [badge] = await call<Rgba[]>(page, 'pixels', 0, [
    [l2.shot.x + l2.shot.w - 26, l2.shot.y + l2.shot.h - 26],
  ]);
  expect(badge[0]).toBeLessThan(120);
  /* 出處大小：大 */
  await page.getByRole('radiogroup', { name: '大小' }).getByRole('radio', { name: '大' }).click();
  await expect.poll(async () => (await state(page)).credit.size).toBe('lg');
  /* 截圖大小：滑桿到 100% → 截圖寬＝畫面寬 */
  await page.getByRole('combobox', { name: '位置' }).click();
  await page.getByRole('option', { name: '畫面底部' }).click();
  const scale = page.getByRole('slider', { name: '截圖大小' });
  await scale.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await state(page)).shot.scale).toBe(100);
  await expect.poll(async () => (await layout(page)).shot.w).toBe(1000);
  expect(errors).toEqual([]);
});

/* ---------- 時間軸與播放 ---------- */

test('時間軸：四段的秒數、分段色條、空白鍵播放、循環、停在結尾（F38～F43）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page);
  await tab(page, '時間軸');
  await expect(page.getByTestId('timing-total')).toHaveText('總長 4.30 秒');
  /* 停在結尾 */
  await expect
    .poll(async () => (await call<{ time: number }>(page, 'player'))?.time)
    .toBeCloseTo(4.3, 5);
  /* 分段色條的圖例 */
  await expect(page.getByRole('list', { name: '階段' })).toContainText(
    /開場\s*0\.00–0\.50.*彈出\s*0\.50–1\.10.*動作\s*1\.10–2\.30.*結尾\s*2\.30–4\.30/,
  );
  /* 兩個螢光筆、動作的秒數改成 2：依序時各佔 2 秒（總長 7.1）、同時一起（總長 5.1） */
  await call(page, 'set', {
    frames: [
      { id: 'a', kind: 'marker', x: 10, y: 10, w: 50, h: 20, style: 'yellow', dir: 'h' },
      { id: 'b', kind: 'marker', x: 10, y: 40, w: 50, h: 20, style: 'yellow', dir: 'h' },
    ],
  });
  const action = page.getByRole('slider', { name: '動作', exact: true });
  await action.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('timing-total')).toHaveText('總長 7.10 秒');
  await page.getByRole('radio', { name: '同時' }).click();
  await expect(page.getByTestId('timing-total')).toHaveText('總長 5.10 秒');
  await page
    .getByRole('radiogroup', { name: 'APNG 的影格率' })
    .getByRole('radio', { name: '30 fps' })
    .click();
  await expect.poll(async () => (await state(page)).timing.fps).toBe(30);
  /* 空白鍵播放／暫停 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(true);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(false);
  /* 「完成的樣子」跳到結尾 */
  await call(page, 'seek', 1);
  await page.getByRole('button', { name: '完成的樣子' }).click();
  await expect
    .poll(async () => (await call<{ time: number }>(page, 'player'))?.time)
    .toBeCloseTo(5.1, 5);
  /* 循環開關記住 */
  await page.getByRole('button', { name: /循環/ }).click();
  await expect.poll(async () => (await call<{ loop: boolean }>(page, 'prefs')).loop).toBe(false);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出：PNG（完成圖、與畫面相同）、複製圖片、APNG（影格、色數、只播一次）（F45～F49）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await page.getByRole('button', { name: '示範演出' }).first().click();
  await expect.poll(async () => (await state(page))?.frames?.length).toBe(5);
  /* PNG */
  const png = await exportFile(page, 'PNG');
  expect(png.name).toMatch(/^screenshot-fx-\d{8}-\d{6}\.png$/);
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([1920, 1080]);
  const total = (await call<{ total: number }>(page, 'timeline')).total;
  const ref = readPng(dataUrlBytes(await call<string>(page, 'render', total)));
  let diff = 0;
  for (let i = 0; i < img.data.length; i++) if (img.data[i] !== ref.data[i]) diff++;
  expect(diff).toBe(0);
  /* 複製圖片 */
  await page.getByRole('button', { name: '複製圖片' }).click();
  await expect(toast(page, '已複製完成圖')).toBeVisible();
  const types = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((it) => it.types);
  });
  expect(types).toContain('image/png');
  /* APNG：128 色（預設）、15 fps、格數＝總長 × 15 無條件進位 */
  const apng = await exportFile(page, 'APNG');
  expect(apng.name).toMatch(/-anim\.png$/);
  const info = parseApng(apng.bytes);
  expect(info.ihdr.width).toBe(1920);
  expect(info.numPlays).toBe(0);
  const n = Math.ceil(total * 15 - 1e-9);
  await expect(apng.result).toContainText(`${n} 格`);
  await expect(apng.result).toContainText('128 色');
  const ticks = info.frames.reduce((s, f) => s + (f.delayNum / f.delayDen) * 15, 0);
  expect(Math.round(ticks)).toBe(n);
  expect(info.frames.length).toBeLessThan(n);
  /* 全彩、只播一次 */
  const panel = exportPanel(page);
  await panel.getByRole('combobox', { name: '色數' }).click();
  await page.getByRole('option', { name: '無損（全彩）' }).click();
  await panel.getByRole('switch', { name: '無限循環' }).click();
  const once = await exportFile(page, 'APNG');
  expect(parseApng(once.bytes).numPlays).toBe(1);
  await expect(once.result).toContainText('1 次');
  /* 試算大小 */
  await panel.getByRole('button', { name: '試算' }).click();
  await expect(page.getByTestId('apng-estimate')).toHaveText(/KB|MB/, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('匯出：影片（不透明 MP4、透明 WebM）（F50、F51）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    canvas: '1200x900',
    frames: [{ id: 'm', kind: 'marker', x: 10, y: 10, w: 200, h: 40, style: 'yellow', dir: 'h' }],
    timing: { intro: 0, popup: 0, action: 0.5, outro: 0.5, order: 'sequential', fps: 15 },
  });
  await expectFormatEnabled(page, 'MP4');
  const mp4 = await exportFile(page, 'MP4');
  expect(mp4.name).toMatch(/\.(mp4|mov|webm)$/);
  expect(mp4.bytes.length).toBeGreaterThan(1000);
  await expect(mp4.result).toContainText('1200×900');
  await expect(mp4.result).toContainText('30 格');
  /* 背景透明 → 透明的 WebM */
  await tab(page, '圖片');
  await page
    .getByRole('radiogroup', { name: '背景', exact: true })
    .getByRole('radio', { name: '透明' })
    .click();
  await expectFormatEnabled(page, 'WebM（透明）');
  const webm = await exportFile(page, 'WebM（透明）');
  expect(webm.name).toMatch(/\.webm$/);
  expect([...webm.bytes.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含圖片）、專案檔 ZIP（F52～F54）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, undefined, 'room.png');
  await drag(page, [100, 100], [300, 200]);
  await expect.poll(async () => (await state(page)).frames.length).toBe(1);
  /* 重新整理：圖與框都還在 */
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __screenshotFx?: unknown }).__screenshotFx,
  );
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await doc(page)).image?.name).toBe('room.png');
  expect((await doc(page)).frames).toHaveLength(1);
  /* 專案檔 */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('screenshot-fx');
  expect(project.data.frames).toHaveLength(1);
  expect(Object.keys(entries)).toContain(`files/${project.data.image.id}.png`);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await state(page)).image).toBeNull();
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', Buffer.from(zipBytes), 'application/zip'));
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  await expect.poll(async () => (await state(page)).image?.name).toBe('room.png');
  expect((await state(page)).frames).toHaveLength(1);
  /* 快捷鍵說明 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog')).toContainText('複製選取的框');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

/* ---------- 第二批：運鏡 ---------- */

interface TimelineInfo {
  total: number;
  windows: Record<string, { start: number; end: number }>;
  camera: { start: number; end: number; targetId: string } | null;
}
interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const marker = (id: string, x: number, y: number, w = 300, h = 40) => ({
  id,
  kind: 'marker',
  x,
  y,
  w,
  h,
  style: 'yellow',
  dir: 'h',
});
const redact = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'redact',
  x,
  y,
  w: 300,
  h: 60,
  style: 'black',
  mode: 'reveal',
  dir: 'h',
  density: 100,
  grain: 12,
  edge: 'glow',
  glow: 100,
  ...extra,
});

test('運鏡：對象、放慢、拉回的範圍、從頭確認（Esc 回到編輯）、匯出有運鏡（F57～F62）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await gradientPng(), 'grad.png');
  await call(page, 'set', {
    canvas: '1200x900',
    frames: [marker('a', 100, 100), marker('b', 500, 300)],
    timing: { intro: 0.2, popup: 0.2, action: 0.6, outro: 0.4, order: 'sequential', fps: 15 },
  });
  await tab(page, '時間軸');
  await expect(page.getByTestId('camera-status')).toHaveText('固定畫面。');
  await page.getByRole('combobox', { name: '鏡頭的動作' }).click();
  await page.getByRole('option', { name: '由近拉遠', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).camera)
    .toMatchObject({
      mode: 'pullback',
      target: 'auto',
      zoom: 2.4,
      duration: 3.6,
    });
  /* 自動＝第一個會動的框（a）；動作 0.6 秒比拉回 3.6 秒短：a 放慢到 3.6 秒，b 往後 */
  await expect(page.getByTestId('camera-status')).toHaveText(
    '從「螢光筆 1」開始：0.40 秒起用 3.6 秒拉回全圖。',
  );
  let tl = await call<TimelineInfo>(page, 'timeline');
  expect(tl.windows.a).toEqual({ start: 0.4, end: 4 });
  expect(tl.windows.b).toEqual({ start: 4, end: 4.6 });
  expect(tl.total).toBe(5);
  /* 指定對象 b、倍率 2、時間 1 秒 */
  await page.getByRole('combobox', { name: '對象' }).click();
  await page.getByRole('option', { name: '2. 螢光筆 2' }).click();
  await call(page, 'set', {
    camera: { ...(await state(page)).camera, target: 'b', zoom: 2, duration: 1 },
  });
  tl = await call<TimelineInfo>(page, 'timeline');
  expect(tl.camera).toEqual({ start: 1, end: 2, targetId: 'b' });
  /* 拉回前：看到畫面的一半（1200 ÷ 2）；結束後是全圖 */
  const v0 = await call<ViewRect | null>(page, 'cameraView', 0);
  expect(v0?.w).toBeCloseTo(600, 5);
  expect(v0?.h).toBeCloseTo(450, 5);
  expect(await call(page, 'cameraView', 2)).toBeNull();
  /* 畫面：運鏡時畫面上一點看到的是全圖裡「看到的範圍」對應的那一點（漸層的圖，紅隨 x） */
  const corner: [number, number] = [600, 450];
  const [plain] = await call<Rgba[]>(page, 'pixels', 0, [corner]);
  const [zoomed] = await call<Rgba[]>(page, 'pixels', 0, [corner], { camera: true });
  const q: [number, number] = [
    (v0?.x ?? 0) + (corner[0] * (v0?.w ?? 0)) / 1200,
    (v0?.y ?? 0) + (corner[1] * (v0?.h ?? 0)) / 900,
  ];
  const [mapped] = await call<Rgba[]>(page, 'pixels', 0, [q]);
  expect(zoomed.join()).not.toBe(plain.join());
  expect(Math.abs(zoomed[0] - mapped[0])).toBeLessThanOrEqual(3);
  expect(Math.abs(zoomed[1] - mapped[1])).toBeLessThanOrEqual(3);
  /* 從頭確認：預覽套用運鏡、不能編輯、從頭播放；Esc 回到編輯 */
  await page.getByRole('button', { name: '從頭確認運鏡' }).click();
  await expect(page.getByTestId('camera-preview')).toBeVisible();
  await expect(page.getByTestId('fx-canvas')).toHaveAttribute('data-camera', 'true');
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(true);
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('camera-preview')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toBeVisible();
  /* 連番 PNG 的第一格有運鏡（和套用運鏡的畫面相同） */
  const seq = await exportFile(page, '連番 PNG ZIP');
  expect(seq.name).toMatch(/-frames\.zip$/);
  const files = unzipSync(seq.bytes);
  const names = Object.keys(files);
  expect(names).toHaveLength(Math.ceil(tl.total * 15 - 1e-9));
  expect(names[0]).toBe('frame_0001.png');
  const first = readPng(files['frame_0001.png']);
  const k = (Math.round(corner[1]) * first.width + Math.round(corner[0])) * 4;
  expect([...first.data.slice(k, k + 4)].join()).toBe(zoomed.join());
  /* 運鏡關掉時回到全圖 */
  await page.getByRole('combobox', { name: '鏡頭的動作' }).click();
  await page.getByRole('option', { name: '不用', exact: true }).click();
  await expect(page.getByTestId('camera-status')).toHaveText('固定畫面。');
  expect((await call<TimelineInfo>(page, 'timeline')).camera).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 第二批：塗黑的邊界演出 ---------- */

test('塗黑的邊界演出：金光、掃描線、不加；只在動作中；改了之後預覽跳到動作一半（F63）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    frames: [redact('r', 100, 200)],
    timing: { intro: 0, popup: 0, action: 2, outro: 1, order: 'sequential', fps: 15 },
  });
  /* 動作到一半：邊在 x＝250，往左（已經掀開、淺灰的那一側）一點是金色的光 */
  const behind: [number, number] = [235, 230];
  const [glow] = await srcPixels(page, 1, [behind]);
  expect(glow[0]).toBeGreaterThan(glow[2] + 30);
  /* 開始前、結束後沒有光（淺灰 240） */
  const [after] = await srcPixels(page, 3, [behind]);
  expect(after.slice(0, 3)).toEqual([240, 240, 240]);
  /* 掃描線：青色（藍比紅多） */
  await call(page, 'set', { frames: [redact('r', 100, 200, { edge: 'scan' })] });
  const [scan] = await srcPixels(page, 1, [[247, 230]]);
  expect(scan[2]).toBeGreaterThan(scan[0]);
  /* 無 */
  await call(page, 'set', { frames: [redact('r', 100, 200, { edge: 'none' })] });
  const [none] = await srcPixels(page, 1, [behind]);
  expect(none.slice(0, 3)).toEqual([240, 240, 240]);
  /* 清單裡改邊界演出：預覽跳到這個框動作到一半（1 秒）並暫停 */
  await tab(page, '演出框');
  const row = page.locator('[data-frame-id="r"]');
  await row.locator('button[aria-pressed]').click();
  await row.getByRole('radio', { name: '金光', exact: true }).click();
  await expect.poll(async () => (await state(page)).frames[0].edge).toBe('glow');
  await expect
    .poll(async () => (await call<{ time: number }>(page, 'player'))?.time)
    .toBeCloseTo(1, 5);
  expect((await call<{ playing: boolean }>(page, 'player'))?.playing).toBe(false);
  await expect(row.getByRole('slider', { name: '發光強度' })).toBeVisible();
  /* 靜止的塗黑沒有邊界演出的設定 */
  await row.getByRole('combobox', { name: '動作' }).click();
  await page.getByRole('option', { name: '靜止', exact: true }).click();
  await expect(row.getByRole('radio', { name: '金光', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 第二批：ZIP ---------- */

test('ZIP：段階公開（step_00…）、圖層 4 張、連番 PNG（F64～F66）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    canvas: '1200x900',
    frames: [
      {
        id: 'z',
        kind: 'zoom',
        x: 600,
        y: 300,
        w: 300,
        h: 100,
        scale: 1.2,
        style: 'card',
        border: 4,
      },
      redact('r', 100, 100),
      marker('m', 100, 300),
      redact('s', 100, 400, { mode: 'static' }),
    ],
    timing: { intro: 0.1, popup: 0.2, action: 0.3, outro: 0.2, order: 'sequential', fps: 15 },
  });
  const l = await layout(page);
  const px = (img: Img, sx: number, sy: number): Rgba => {
    const x = Math.round(l.shot.x + sx * l.shot.f);
    const y = Math.round(l.shot.y + sy * l.shot.f);
    const k = (y * img.width + x) * 4;
    return [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]];
  };
  const dark = (p: Rgba) => p[0] < 40 && p[1] < 40 && p[2] < 40;
  /* 段階公開：放大框、塗黑、螢光筆＝3 個階段＋演出前＝4 張 */
  const steps = await exportFile(page, '段階公開 ZIP');
  expect(steps.name).toMatch(/-steps\.zip$/);
  const sf = unzipSync(steps.bytes);
  expect(Object.keys(sf)).toEqual(['step_00.png', 'step_01.png', 'step_02.png', 'step_03.png']);
  await expect(steps.result).toContainText('4 張（step_00～step_03）');
  const s0 = readPng(sf['step_00.png']);
  const s2 = readPng(sf['step_02.png']);
  const s3 = readPng(sf['step_03.png']);
  expect(dark(px(s0, 250, 130))).toBe(true);
  expect(dark(px(s2, 250, 130))).toBe(false);
  /* 螢光筆：第 2 張還沒（灰）、第 3 張畫好了（黃：藍比紅少很多）；放大框彈出後周圍變暗 */
  const m2 = px(s2, 250, 320);
  const m3 = px(s3, 250, 320);
  expect(Math.abs(m2[0] - m2[2])).toBeLessThan(5);
  expect(m3[0] - m3[2]).toBeGreaterThan(50);
  /* 靜止的塗黑一直蓋著 */
  expect(dark(px(s0, 250, 430)) && dark(px(s3, 250, 430))).toBe(true);
  /* 圖層 */
  const layers = await exportFile(page, '圖層 ZIP');
  const lf = unzipSync(layers.bytes);
  expect(Object.keys(lf)).toEqual([
    '1_background.png',
    '2_cutouts.png',
    '3_markers.png',
    '4_final.png',
  ]);
  const bg = readPng(lf['1_background.png']);
  const cut = readPng(lf['2_cutouts.png']);
  const mk = readPng(lf['3_markers.png']);
  const fin = readPng(lf['4_final.png']);
  /* 背景：會動的塗黑不在裡面（原本的內容看得到）、靜止的塗黑在；螢光筆不在 */
  expect(px(bg, 250, 130).slice(0, 3)).toEqual([240, 240, 240]);
  expect(dark(px(bg, 250, 430))).toBe(true);
  expect(px(bg, 250, 320)[2]).toBe(240);
  /* 放大框：周圍是半透明的黑（聚光）、框的地方不透明 */
  expect(cut.data[3]).toBeGreaterThan(100);
  expect(cut.data[3]).toBeLessThan(200);
  expect(px(cut, 750, 350)[3]).toBe(255);
  /* 螢光筆：只有螢光筆的地方有顏色，其他透明 */
  expect(px(mk, 250, 320)[3]).toBeGreaterThan(200);
  expect(px(mk, 250, 130)[3]).toBe(0);
  /* 完成＝匯出的 PNG（結尾那一格） */
  const total = (await call<TimelineInfo>(page, 'timeline')).total;
  const ref = readPng(dataUrlBytes(await call<string>(page, 'render', total)));
  let diff = 0;
  for (let i = 0; i < fin.data.length; i++) if (fin.data[i] !== ref.data[i]) diff++;
  expect(diff).toBe(0);
  /* 連番 PNG：格數＝⌈總長 × 15⌉ */
  const seq = await exportFile(page, '連番 PNG ZIP');
  const qf = Object.keys(unzipSync(seq.bytes));
  expect(qf).toHaveLength(Math.ceil(total * 15 - 1e-9));
  expect(qf.at(-1)).toBe(`frame_${String(qf.length).padStart(4, '0')}.png`);
  expect(errors).toEqual([]);
});

/* ---------- 第二批：細部編輯 ---------- */

test('細部編輯：倍率、框選放大、手形與中鍵移動、全圖、到選取的框、放大編輯區（F67～F71）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', { frames: [marker('m', 700, 380, 200, 40)] });
  const live = () =>
    call<{ viewZoom: number; pointer: string; expanded: boolean; selected: string | null }>(
      page,
      'live',
    );
  const bar = page.getByTestId('view-bar');
  const vp = page.getByRole('region', { name: '預覽畫面' });
  const scroll = () => vp.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  /* 倍率選單、＋／− */
  await bar.getByRole('combobox', { name: '倍率', exact: true }).click();
  await page.getByRole('option', { name: '300%' }).click();
  await expect.poll(async () => (await live()).viewZoom).toBe(3);
  await expect(vp).toHaveAttribute('data-zoom', '300');
  await bar.getByRole('button', { name: '放大', exact: true }).click();
  await expect.poll(async () => (await live()).viewZoom).toBe(4);
  await bar.getByRole('button', { name: '縮小', exact: true }).click();
  await expect.poll(async () => (await live()).viewZoom).toBe(3);
  /* 手形：拖曳移動顯示位置（不會畫框） */
  await bar.getByRole('button', { name: '手形', exact: true }).click();
  expect((await live()).pointer).toBe('hand');
  const s0 = await scroll();
  const box = (await vp.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 4 });
  await page.mouse.up();
  const s1 = await scroll();
  expect(s1[0]).toBeGreaterThan(s0[0] + 100);
  expect((await state(page)).frames).toHaveLength(1);
  await bar.getByRole('button', { name: '手形', exact: true }).click();
  expect((await live()).pointer).toBe('edit');
  /* 中鍵：隨時可以移動 */
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  expect((await scroll())[0]).toBeLessThan(s1[0] - 50);
  expect((await state(page)).frames).toHaveLength(1);
  /* 全圖 */
  await bar.getByRole('button', { name: '全圖', exact: true }).click();
  await expect.poll(async () => (await live()).viewZoom).toBe(1);
  /* 框選放大：拖曳框出一塊（不會畫框），放大後回到一般工具 */
  await bar.getByRole('button', { name: '框選放大', exact: true }).click();
  const a = await screenOf(page, 100, 100);
  const b = await screenOf(page, 300, 200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await live()).viewZoom).toBeGreaterThan(3);
  expect((await live()).pointer).toBe('edit');
  expect((await state(page)).frames).toHaveLength(1);
  /* 到選取的框：放大並把框放在編輯區中央 */
  await bar.getByRole('button', { name: '全圖', exact: true }).click();
  await call(page, 'select', 'm');
  await bar.getByRole('button', { name: '到選取的框', exact: true }).click();
  await expect.poll(async () => (await live()).viewZoom).toBeGreaterThan(2);
  const item = page.locator('[data-layout-item="m"]');
  await expect
    .poll(async () => {
      const ib = (await item.boundingBox()) as { x: number; y: number; width: number };
      const vb = (await vp.boundingBox()) as { x: number; y: number; width: number };
      return Math.abs(ib.x + ib.width / 2 - (vb.x + vb.width / 2));
    })
    .toBeLessThan(30);
  /* Ctrl＋滾輪也能縮放 */
  const before = (await live()).viewZoom;
  await vp.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 200);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await live()).viewZoom).toBeLessThan(before);
  /* 放大編輯區：佔滿視窗；Esc 回來 */
  await bar.getByRole('button', { name: '放大編輯區', exact: true }).click();
  const area = page.getByTestId('edit-area');
  await expect(area).toHaveAttribute('data-expanded', 'true');
  const ab = (await area.boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(ab.width).toBeGreaterThanOrEqual(1270);
  expect(ab.height).toBeGreaterThanOrEqual(890);
  await page.locator('body').press('Escape');
  await expect(area).not.toHaveAttribute('data-expanded', 'true');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

/* ---------- 第一批驗證後的修正（規格 §7.1） ---------- */

/** 測試圖：左半透明、右半不透明的紅（400 × 300） */
async function alphaPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = w / 2; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = 255;
      px[o + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

test('透明的截圖：透明處沒有陰影與聚光的黑、匯出的 PNG 也是（R1）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await alphaPng(), 'alpha.png');
  await tab(page, '圖片');
  await page.getByRole('combobox', { name: '畫面大小' }).click();
  await page.getByRole('option', { name: '原圖大小' }).click();
  await page
    .getByRole('radiogroup', { name: '背景', exact: true })
    .getByRole('radio', { name: '透明' })
    .click();
  await expect.poll(async () => (await state(page)).bg.mode).toBe('transparent');
  const l = await layout(page);
  const pts: [number, number][] = [
    [l.shot.x + l.shot.w * 0.25, l.shot.y + l.shot.h * 0.5],
    [l.shot.x + l.shot.w * 0.25, l.shot.y + l.shot.h * 0.05],
    [l.shot.x + l.shot.w * 0.02, l.shot.y + l.shot.h * 0.5],
    [l.shot.x + l.shot.w * 0.75, l.shot.y + l.shot.h + 4],
  ];
  const [mid, top, left, below] = await call<Rgba[]>(page, 'pixels', 0, pts);
  expect([mid[3], top[3], left[3]]).toEqual([0, 0, 0]);
  expect(below[3]).toBeGreaterThan(20);
  /* 「只有陰影」的放大框蓋在透明處、聚光 55%：結尾時卡片中間還是透明 */
  await call(page, 'set', {
    frames: [
      {
        id: 'z',
        kind: 'zoom',
        x: 20,
        y: 60,
        w: 120,
        h: 90,
        scale: 1.25,
        style: 'shadow',
        border: 4,
      },
    ],
  });
  const total = (await call<{ total: number }>(page, 'timeline')).total;
  const [card] = await call<Rgba[]>(page, 'pixels', total, [
    [l.shot.x + 80 * l.shot.f, l.shot.y + 105 * l.shot.f],
  ]);
  expect(card[3]).toBe(0);
  /* 匯出的 PNG（結尾那一格） */
  const png = readPng((await exportFile(page, 'PNG')).bytes);
  const alphaAt = ([x, y]: [number, number]) =>
    png.data[(Math.round(y) * png.width + Math.round(x)) * 4 + 3];
  expect(alphaAt(pts[0])).toBe(0);
  expect(alphaAt(pts[1])).toBe(0);
  expect(errors).toEqual([]);
});

test('點選與 Shift＋點選一致、表單控制項上的 Delete、播放中沒有輔助線、離散操作各一步、載入區（R6、R7、R9～R11）', async ({
  page,
}) => {
  const errors = await open(page);
  /* R9：載入區只說一次「貼上」 */
  const load = page.getByTestId('image-load');
  await expect(load).toContainText('貼上');
  expect(((await load.textContent()) ?? '').match(/貼上/g)?.length).toBe(1);
  await loadImage(page);
  /* 螢光筆 a（清單第 1 個）在放大框 b（第 2 個）裡 */
  await call(page, 'set', {
    frames: [
      { id: 'a', kind: 'marker', x: 150, y: 150, w: 100, h: 40, style: 'yellow', dir: 'h' },
      {
        id: 'b',
        kind: 'zoom',
        x: 100,
        y: 100,
        w: 400,
        h: 200,
        scale: 1.25,
        style: 'card',
        border: 4,
      },
    ],
  });
  const selected = async () => (await call<{ selected: string | null }>(page, 'live')).selected;
  const at = await screenOf(page, 200, 170);
  const empty = await screenOf(page, 900, 450);
  /* R7：一般點一下與 Shift＋點一下都選螢光筆（畫在放大框的卡片上面） */
  await page.mouse.click(at.x, at.y);
  await expect.poll(selected).toBe('a');
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(selected).toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await expect.poll(selected).toBe('a');
  /* 選取中的放大框在最上面：兩種點法都還是放大框 */
  await call(page, 'select', 'b');
  await page.mouse.click(at.x, at.y);
  await expect.poll(selected).toBe('b');
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await expect.poll(selected).toBe('b');
  /* R11：播放中不畫輔助線，暫停後回來 */
  await expect(page.getByTestId('guides')).toBeVisible();
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(true);
  await expect(page.getByTestId('guides')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await call<{ playing: boolean }>(page, 'player'))?.playing)
    .toBe(false);
  await expect(page.getByTestId('guides')).toBeVisible();
  /* R6：焦點在框的滑桿上按 Delete／Backspace 不刪框 */
  const row = page.locator('[data-frame-id="b"]');
  const slider = row.getByTestId('frame-editor').getByRole('slider');
  await slider.focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await pause(page);
  expect(await frames(page)).toHaveLength(2);
  await row.getByTestId('frame-editor').getByRole('combobox').focus();
  await page.keyboard.press('Delete');
  await pause(page);
  expect(await frames(page)).toHaveLength(2);
  /* R10：Ctrl＋D 連按三次（不等）＝三步，復原一次只少一個 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await call(page, 'select', 'b');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await frames(page)).length).toBe(5);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page)).length).toBe(4);
  /* 焦點不在表單控制項：Delete 刪掉選取的框，馬上上移也是另一步 */
  await call(page, 'select', 'a');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await frames(page)).length).toBe(3);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page)).length).toBe(4);
  expect(errors).toEqual([]);
});

/* ---------- 第二批驗證後的修正（規格 §7.2） ---------- */

/** 放大編輯區：畫框的工具列最上層是它自己（沒有被頁首蓋住），而且點得到（換工具） */
async function expectToolbarOnTop(page: Page) {
  const bar = page.getByRole('radiogroup', { name: '拖曳畫出' });
  for (const name of ['螢光筆', '放大框'] as const) {
    const radio = bar.getByRole('radio', { name });
    const onTop = await radio.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(onTop, `「${name}」的中心不應被別的元素蓋住`).toBe(true);
    await radio.click();
    await expect
      .poll(async () => (await call<Record<string, unknown>>(page, 'prefs')).tool)
      .toBe(name === '螢光筆' ? 'marker' : 'zoom');
  }
  const guides = page.getByRole('switch', { name: '編輯輔助線' });
  expect(
    await guides.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    }),
  ).toBe(true);
}

for (const width of [1280, 1024, 390]) {
  test(`放大編輯區蓋在頁首上面、工具列點得到（${width} 寬；R12）`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const errors = await open(page);
    await page.getByRole('button', { name: '示範演出' }).first().click();
    await expect.poll(async () => (await state(page))?.frames?.length).toBe(5);
    /* 先捲一點頁面（寬畫面時預覽欄是 sticky） */
    await page.mouse.wheel(0, 300);
    const bar = page.getByTestId('view-bar');
    await bar.getByRole('button', { name: '放大編輯區', exact: true }).click();
    const area = page.getByTestId('edit-area');
    await expect(area).toHaveAttribute('data-expanded', 'true');
    const ab = (await area.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    expect([Math.round(ab.x), Math.round(ab.y)]).toEqual([0, 0]);
    await expectToolbarOnTop(page);
    /* 編輯區工具列的按鈕也在最上層 */
    expect(
      await bar.getByRole('button', { name: '放大編輯區', exact: true }).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && el.contains(hit);
      }),
    ).toBe(true);
    /* 收起來：預覽欄的樣式還原（寬畫面時回到 sticky） */
    await page.locator('body').press('Escape');
    await expect(area).not.toHaveAttribute('data-expanded', 'true');
    const pos = await page
      .locator('#tool-preview')
      .evaluate((el) => [getComputedStyle(el).position, (el as HTMLElement).style.position]);
    expect(pos).toEqual([width >= 1024 ? 'sticky' : 'static', '']);
    expect(errors).toEqual([]);
  });
}

test('窄版的「從頭確認運鏡」把預覽捲進畫面；連番 PNG 不顯示未壓縮的資料量（R13、R16）', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  await page.getByRole('button', { name: '示範演出' }).first().click();
  await expect.poll(async () => (await state(page))?.frames?.length).toBe(5);
  await tab(page, '時間軸');
  await page.getByRole('combobox', { name: '鏡頭的動作' }).click();
  await page.getByRole('option', { name: '由近拉遠', exact: true }).click();
  const run = page.getByRole('button', { name: '從頭確認運鏡' });
  await run.scrollIntoViewIfNeeded();
  const stage = page.getByRole('region', { name: '預覽畫面' });
  expect(((await stage.boundingBox()) as { y: number }).y).toBeLessThan(0);
  await run.click();
  const banner = page.getByTestId('camera-preview');
  await expect(banner).toBeVisible();
  await expect
    .poll(async () => {
      const b = (await banner.boundingBox()) as { y: number; height: number };
      return b.y >= 0 && b.y + b.height <= 844;
    })
    .toBe(true);
  await expect(stage).toBeInViewport();
  /* R16：連番 PNG 的 ZIP 沒有「未壓縮」那一行；APNG 照舊有 */
  await page.locator('body').press('Escape');
  await chooseFormat(page, '連番 PNG ZIP');
  await expect(exportPanel(page).getByTestId('export-estimate')).toHaveCount(0);
  await expect(exportPanel(page)).not.toContainText('未壓縮');
  await chooseFormat(page, 'APNG');
  await expect(exportPanel(page).getByTestId('export-estimate')).toContainText('未壓縮');
  expect(errors).toEqual([]);
});

test('390 寬沒有橫向捲動、序號圓標縮小（R8）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: '示範演出' }).first().click();
  await expect.poll(async () => (await state(page))?.frames?.length).toBe(5);
  await noHorizontalScroll(page);
  /* R8：舞台很小時序號圓標縮到 12 px；編輯層維持 touch-none（手指拖曳是畫框） */
  await expect(page.getByTestId('guides')).toHaveAttribute('data-badge', '12.0');
  await expect(page.getByTestId('editor')).toHaveClass(/touch-none/);
  for (const t of ['演出框', '時間軸'] as const) {
    await tab(page, t);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
