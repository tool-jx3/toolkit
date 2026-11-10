/**
 * 錄影帶畫面產生器 2026-11-10 加的功能（規格 1.11～1.17）的端對端測試：
 * - 新的區塊（樣子、映像管、數位攝影、NTSC 訊號、Screen Loop）預設全關，自動儲存是資料版本 3；
 * - 比較原圖：預覽右邊是原圖、分割線可以拖曳與用鍵盤移動、匯出的 PNG 和沒開比較時逐位元組相同、沒有照片時停用；
 * - 樣子：套用後按鈕按下、一步復原；
 * - 螢光粉遮罩：匯出的 PNG 每 3 px 一組紅綠藍；光暈；
 * - 數位攝影、NTSC 訊號：打開後匯出的 PNG 和沒開時不同、兩次匯出逐位元組相同；GIF 照樣 24 格（@serial）；
 * - Screen Loop：綠點拖曳與方向鍵移動消失點（拖曳一次算一步復原）、GIF 24 格（@serial）；
 * - 第 2 版的自動儲存與專案檔照讀（新的設定是預設）；
 * - 390／360／320 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('vhs-frame') ?? { id: 'vhs-frame', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:vhs-frame';

test.use({ viewport: { width: 1280, height: 900 } });

type Doc = Record<string, unknown> & {
  crt: Record<string, unknown>;
  digital: Record<string, unknown>;
  ntsc: Record<string, unknown>;
  loop: { on: boolean; cx: number; cy: number } & Record<string, unknown>;
  wear: number;
};

/** 照片：左半灰、右半上方一塊白、下方細的直條紋（w × h） */
async function photoPng(w = 1280, h = 960): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const white = x > w * 0.6 && x < w * 0.8 && y > h * 0.2 && y < h * 0.4;
      const stripe = y > h * 0.6 && x % 4 < 2;
      const v = white ? 255 : stripe ? 220 : 128;
      px[o] = v;
      px[o + 1] = v;
      px[o + 2] = v;
      px[o + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

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
  await expect(page.getByRole('heading', { level: 1, name: '錄影帶畫面產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __vhsFrame?: unknown }).__vhsFrame);
  return errors;
}

const doc = (page: Page): Promise<Doc> =>
  page.evaluate(() => (window as unknown as { __vhsFrame: { doc: () => Doc } }).__vhsFrame.doc());
const prefs = (page: Page): Promise<Record<string, unknown>> =>
  page.evaluate(() =>
    (
      window as unknown as { __vhsFrame: { prefs: () => Record<string, unknown> } }
    ).__vhsFrame.prefs(),
  );
const canvas = (page: Page) => page.getByTestId('vhs-canvas');
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const looks = (page: Page) => page.getByTestId('look-presets');

async function loadPhoto(page: Page) {
  await page
    .getByRole('group', { name: '照片載入區' })
    .locator('input[type=file]')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await photoPng() });
  await expect.poll(async () => (await doc(page)).photo).not.toBeNull();
}

/** 停在錄影帶的某個時間（暫停），等畫好全尺寸 */
async function seek(page: Page, t: number) {
  await page.evaluate(
    (t) =>
      (
        window as unknown as { __vhsFrame: { seek: (t: number, m: string) => void } }
      ).__vhsFrame.seek(t, 'tape'),
    t,
  );
  await expect(canvas(page)).toHaveAttribute('data-frame', String(Math.floor(t * 24 + 1e-6) / 24));
  await expect(canvas(page)).toHaveAttribute('data-live', 'false');
}

/** 打開一個區塊（預設收起來的） */
async function openSection(page: Page, title: string) {
  const btn = page.getByRole('button', { name: title, exact: true }).last();
  if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
}

async function exportFile(page: Page, format: 'PNG' | 'GIF') {
  const panel = exportPanel(page);
  await panel.getByRole('radio', { name: format, exact: true }).click();
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 180_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  /* 回到 PNG，下一次匯出前先關掉結果卡 */
  await panel.getByRole('radio', { name: 'PNG', exact: true }).click();
  return bytes;
}

function readPng(bytes: Uint8Array) {
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

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 預設 ---------- */

test('新的區塊預設全關；自動儲存是第 3 版', async ({ page }) => {
  const errors = await open(page);
  for (const title of ['樣子', '映像管', '數位攝影', 'NTSC 訊號', 'Screen Loop'])
    await expect(page.getByRole('button', { name: title, exact: true }).last()).toBeVisible();
  const d = await doc(page);
  expect(d.crt).toMatchObject({ mask: 'none', glow: 0 });
  expect([d.digital.on, d.ntsc.on, d.loop.on]).toEqual([false, false, false]);
  await expect(looks(page).getByRole('button', { name: '原本的錄影帶' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  /* 改一下讓自動儲存寫出來 */
  await openSection(page, '映像管');
  await page.getByRole('radio', { name: '光柵（直條）' }).click();
  await expect
    .poll(() =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').version, STORAGE_KEY),
    )
    .toBe(3);
  /* 沒有照片時不能比較 */
  await expect(page.getByRole('switch', { name: /比較原圖/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 比較原圖 ---------- */

test('比較原圖：右邊是原圖、分割線可以拖曳與用鍵盤移動、匯出不受影響', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await seek(page, 1);
  const plain = await exportFile(page, 'PNG');
  await page.getByRole('switch', { name: /比較原圖/ }).click();
  await expect.poll(async () => (await prefs(page)).compare).toBe(true);
  const line = page.getByTestId('compare-line');
  await expect(line).toHaveAttribute('aria-valuenow', '50');
  /* 右邊（原圖）：照片的灰 128 原樣；左邊有效果（調色、掃描線…） */
  const px = (x: number, y: number) =>
    canvas(page).evaluate(
      (el, [x, y]) =>
        Array.from((el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data ?? []),
      [x, y],
    );
  await expect.poll(() => px(700, 100)).toEqual([128, 128, 128, 255]);
  expect(await px(300, 100)).not.toEqual([128, 128, 128, 255]);
  /* 鍵盤：← 2%、Shift＋→ 10%、Home／End 到兩端 */
  await line.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(line).toHaveAttribute('aria-valuenow', '48');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(line).toHaveAttribute('aria-valuenow', '58');
  await page.keyboard.press('Home');
  await expect(line).toHaveAttribute('aria-valuenow', '5');
  await page.keyboard.press('End');
  await expect(line).toHaveAttribute('aria-valuenow', '95');
  /* 拖曳：拖到畫面的 30% */
  const box = await page.getByTestId('vhs-screen').boundingBox();
  const lb = await line.boundingBox();
  if (!box || !lb) throw new Error('no box');
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, lb.y + lb.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(line).toHaveAttribute('aria-valuenow', '30');
  /* 拖分割線不會移動照片 */
  expect((await doc(page)).view).toEqual({ zoom: 1, x: 0, y: 0 });
  /* 匯出的 PNG 和沒開比較時逐位元組相同 */
  await seek(page, 1);
  expect(same(await exportFile(page, 'PNG'), plain)).toBe(true);
  /* 重新整理後還在（記在瀏覽器） */
  await page.reload();
  await expect(page.getByTestId('compare-line')).toHaveAttribute('aria-valuenow', '30');
  expect(errors).toEqual([]);
});

/* ---------- 樣子 ---------- */

test('樣子：套用後按下、一步復原', async ({ page }) => {
  const errors = await open(page);
  await looks(page).getByRole('button', { name: 'NTSC 錄影帶' }).click();
  await expect(looks(page).getByRole('button', { name: 'NTSC 錄影帶' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  let d = await doc(page);
  expect([d.ntsc.on, d.wear]).toEqual([true, 40]);
  await page.waitForTimeout(450);
  await looks(page).getByRole('button', { name: '乾淨的 CRT' }).click();
  await expect.poll(async () => (await doc(page)).crt.mask).toBe('aperture');
  await page.waitForTimeout(450);
  await page.keyboard.press('Control+z');
  d = await doc(page);
  expect([d.ntsc.on, d.crt.mask]).toEqual([true, 'none']);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).ntsc.on).toBe(false);
  expect(errors).toEqual([]);
});

/* ---------- 映像管 ---------- */

test('螢光粉遮罩：PNG 每 3 px 一組紅綠藍；光暈讓亮塊旁邊變亮', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await openSection(page, '映像管');
  await page.getByRole('radio', { name: '光柵（直條）' }).click();
  await seek(page, 1);
  const img = readPng(await exportFile(page, 'PNG'));
  /* 畫面中間偏左（灰色的地方）一列：每 3 px 重複，三欄各自是紅、綠、藍最亮 */
  const y = 300;
  const at = (x: number) =>
    Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
  const lit = [0, 1, 2].map((k) => {
    const c = at(500 + k);
    return c.indexOf(Math.max(...c));
  });
  expect(new Set(lit).size).toBe(3);
  /* 光暈 */
  const before = readPng(await exportFile(page, 'PNG'));
  const glow = page.getByRole('slider', { name: '光暈', exact: true });
  await glow.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('PageUp');
  await expect.poll(async () => (await doc(page)).crt.glow).toBeGreaterThan(50);
  await seek(page, 1);
  const after = readPng(await exportFile(page, 'PNG'));
  const lum = (im: typeof img, x: number, yy: number) => {
    const o = (yy * im.width + x) * 4;
    return im.data[o] + im.data[o + 1] + im.data[o + 2];
  };
  /* 白塊（x 768～1024、y 192～384）左邊外面 */
  expect(lum(after, 740, 290)).toBeGreaterThan(lum(before, 740, 290));
  expect(errors).toEqual([]);
});

/* ---------- 數位攝影、NTSC 訊號 ---------- */

test('數位攝影、NTSC 訊號：打開後 PNG 不同、兩次匯出相同、格式套用預設值', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await seek(page, 1);
  const plain = await exportFile(page, 'PNG');
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: '先用數位攝影機拍' }).click();
  await page.getByRole('radio', { name: 'MiniDV' }).click();
  await expect
    .poll(async () => (await doc(page)).digital)
    .toMatchObject({
      on: true,
      format: 'minidv',
      width: 720,
      interlace: true,
      chroma: 3,
    });
  await seek(page, 1);
  const dig = await exportFile(page, 'PNG');
  expect(same(dig, plain)).toBe(false);
  await openSection(page, 'NTSC 訊號');
  await page.getByRole('switch', { name: '模擬 NTSC 訊號' }).click();
  await page.getByRole('radio', { name: 'EP（3 倍）' }).click();
  await expect.poll(async () => (await doc(page)).ntsc).toMatchObject({ on: true, tape: 'ep' });
  await seek(page, 1);
  const a = await exportFile(page, 'PNG');
  const b = await exportFile(page, 'PNG');
  expect(same(a, dig)).toBe(false);
  expect(same(a, b)).toBe(true);
  expect(readPng(a)).toMatchObject({ width: 1280, height: 960 });
  expect(errors).toEqual([]);
});

test('NTSC 訊號＋datamosh 的 GIF：24 格、每格 9/100 秒', { tag: '@serial' }, async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: '先用數位攝影機拍' }).click();
  await page.getByRole('radio', { name: 'Datamosh' }).click();
  await openSection(page, 'NTSC 訊號');
  await page.getByRole('switch', { name: '模擬 NTSC 訊號' }).click();
  const gif = parseGif(await exportFile(page, 'GIF'));
  expect(gif.frames.length).toBe(24);
  expect(gif.frames.every((f) => f.delayCs === 9)).toBe(true);
  expect([gif.width, gif.height]).toEqual([360, 270]);
  expect(errors).toEqual([]);
});

/* ---------- Screen Loop ---------- */

test('Screen Loop：綠點拖曳與方向鍵移動消失點、拖曳一次算一步復原', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await looks(page).getByRole('button', { name: 'Screen Loop' }).click();
  const dot = page.getByTestId('vanish-dot');
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute('data-at', '-12,-10');
  await page.waitForTimeout(450);
  /* 拖到畫面中心往右 20%、往下 10% */
  const box = await page.getByTestId('vhs-screen').boundingBox();
  const db = await dot.boundingBox();
  if (!box || !db) throw new Error('no box');
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 6 });
  await page.mouse.up();
  await expect(dot).toHaveAttribute('data-at', '10,5');
  /* 拖消失點不會移動照片 */
  expect((await doc(page)).view).toEqual({ zoom: 1, x: 0, y: 0 });
  await page.waitForTimeout(450);
  await dot.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(dot).toHaveAttribute('data-at', '9,0');
  await page.waitForTimeout(450);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(dot).toHaveAttribute('data-at', '10,5');
  await page.keyboard.press('Control+z');
  await expect(dot).toHaveAttribute('data-at', '-12,-10');
  /* 拿掉照片：綠點不見、照常畫 */
  await page.getByRole('button', { name: '拿掉照片' }).click();
  await expect(dot).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Screen Loop 的 GIF：24 格；PNG 和沒有 Screen Loop 時不同', { tag: '@serial' }, async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await seek(page, 1);
  const plain = await exportFile(page, 'PNG');
  await looks(page).getByRole('button', { name: 'Screen Loop' }).click();
  await seek(page, 1);
  expect(same(await exportFile(page, 'PNG'), plain)).toBe(false);
  const gif = parseGif(await exportFile(page, 'GIF'));
  expect(gif.frames.length).toBe(24);
  expect(errors).toEqual([]);
});

/* ---------- 第 2 版 ---------- */

test('第 2 版的自動儲存與專案檔照讀：新的設定是預設', async ({ page }) => {
  const v2 = {
    photo: null,
    view: { zoom: 1, x: 0, y: 0 },
    caption: '第一行',
    osd: 'REC ●',
    wear: 70,
    aspect: '4:3',
    picture: {
      tone: 'mono',
      brightness: 100,
      saturation: 100,
      curve: 28,
      vignette: 72,
      corners: true,
    },
  };
  await page.addInitScript(
    ([key, data]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key as string, JSON.stringify({ state: { data }, version: 2 }));
        sessionStorage.setItem('seeded', '1');
      }
    },
    [STORAGE_KEY, v2] as const,
  );
  const errors = await open(page);
  let d = await doc(page);
  expect([d.caption, d.wear, d.crt.mask, d.digital.on, d.ntsc.on, d.loop.on]).toEqual([
    '第一行',
    70,
    'none',
    false,
    false,
    false,
  ]);
  /* 第 2 版的專案檔 */
  const project = {
    format: 'trpg-toolkit-project',
    tool: 'vhs-frame',
    version: 2,
    savedAt: '2026-11-06T00:00:00.000Z',
    data: { ...v2, caption: '專案的字幕', wear: 20 },
  };
  const zip = zipSync({ 'project.json': strToU8(JSON.stringify(project)) });
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles({
    name: 'old.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  await expect.poll(async () => (await doc(page)).caption).toBe('專案的字幕');
  d = await doc(page);
  expect([d.wear, d.crt.mask, d.ntsc.on]).toEqual([20, 'none', false]);
  /* 存成專案檔：第 3 版，帶著新的欄位 */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const saved = JSON.parse(
    strFromU8(unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)))['project.json']),
  );
  expect(saved.version).toBe(3);
  expect(Object.keys(saved.data)).toEqual(
    expect.arrayContaining(['crt', 'digital', 'ntsc', 'loop']),
  );
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390／360／320 寬沒有橫向捲動（新的區塊都打開）', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await looks(page).getByRole('button', { name: '網路攝影機轉錄' }).click();
  await page.getByRole('switch', { name: /比較原圖/ }).click();
  for (const title of ['映像管', '數位攝影', 'NTSC 訊號', 'Screen Loop'])
    await openSection(page, title);
  await page.getByRole('switch', { name: /攝影機拍電視/ }).click();
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
