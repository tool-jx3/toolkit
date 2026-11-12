/**
 * 錄影帶畫面產生器 2026-11-12 跟進 NTSCRT `352b4dc`（MIT；規格 1.18～1.21，F99～F110）的端對端測試：
 * - 數位攝影：CD-ROM 格式＝方塊色（Video 1）；方塊色時藏起色彩取樣、柔化方塊的邊、Datamosh；壓縮優先的順序；
 *   新的設定（CCD 的反應、彩虹鋸齒、低光雜訊、銳利化的寬度、單場與一行一條的掃描線）；匯出的 PNG 和 DCT 不同、兩次相同；
 * - 新的六組樣子：按了之後按鈕按下、值照規格、一步復原；
 * - Screen Loop 的亮度鍵反過來（亮度鍵大於 0 時出現）；
 * - 第 3 版的自動儲存照讀（新的欄位是「和以前一樣」的值），存回是第 4 版；
 * - 方塊色的 GIF：24 格（@serial）；
 * - 390／360／320 寬沒有橫向捲動、主控台沒有錯誤。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('vhs-frame') ?? { id: 'vhs-frame', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:vhs-frame';

test.use({ viewport: { width: 1280, height: 900 } });

type Doc = Record<string, unknown> & {
  digital: Record<string, unknown>;
  loop: Record<string, unknown>;
  ntsc: Record<string, unknown>;
  effects: Record<string, boolean>;
  wear: number;
};

/** 照片：天空的漸層、一塊膚色、下方細的直條紋（w × h） */
async function photoPng(w = 1280, h = 960): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const skin = (x - w * 0.35) ** 2 + (y - h * 0.45) ** 2 < (h * 0.18) ** 2;
      const stripe = y > h * 0.6 && x > w * 0.6 && x % 3 === 0;
      const sky = y < h * 0.6;
      const c = skin
        ? [224, 162, 122]
        : stripe
          ? [20, 20, 20]
          : sky
            ? [58 + (y / h) * 300, 111 + (y / h) * 160, 216 - (y / h) * 90]
            : [43, 58, 31];
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
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

/** 復原（焦點離開欄位之後按 Ctrl＋Z） */
async function undo(page: Page) {
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
}

/* ---------- 數位攝影 ---------- */

test('數位攝影：CD-ROM 格式是方塊色；方塊色時藏起色彩取樣、柔化方塊的邊與 Datamosh；壓縮在擷取、相機之前', async ({
  page,
}) => {
  const errors = await open(page);
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: '先用數位攝影機拍' }).click();
  /* 壓縮優先：小標的順序 */
  const legends = await page.locator('legend').allTextContents();
  expect(legends.filter((t) => ['壓縮', '擷取', '相機'].includes(t))).toEqual([
    '壓縮',
    '擷取',
    '相機',
  ]);
  await expect(page.getByRole('radio', { name: '方塊雜訊（DCT）' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('slider', { name: 'Datamosh' })).toBeVisible();
  await page.getByRole('radio', { name: 'CD-ROM', exact: true }).click();
  await expect
    .poll(async () => (await doc(page)).digital)
    .toMatchObject({ format: 'cdrom', codec: 'video1', width: 240, fps: 12, quality: 57 });
  await expect(page.getByRole('radio', { name: '方塊色（Video 1）' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText(/4 × 4 的雙色方塊/)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Datamosh' })).toHaveCount(0);
  /* 更多設定：沒有色彩取樣與柔化方塊的邊 */
  await page.getByRole('switch', { name: '更多設定' }).click();
  await expect(page.getByRole('slider', { name: '擷取寬度' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '色彩取樣' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '柔化方塊的邊' })).toHaveCount(0);
  /* 換回 DCT：又出現（存的值不改） */
  await page.getByRole('radio', { name: '方塊雜訊（DCT）' }).click();
  await expect(page.getByRole('slider', { name: 'Datamosh' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '色彩取樣' })).toBeVisible();
  /* 存的值沒有被方塊色改掉（格式 CD-ROM 的 4:4:4；復原的一步一步由「樣子」的測試驗：連續 0.4 秒內的變更會合成一步） */
  expect((await doc(page)).digital).toMatchObject({ codec: 'dct', chroma: 0, format: 'cdrom' });
  expect(errors).toEqual([]);
});

test('數位攝影的新設定：單場的掃描線（一行一條）、銳利化的寬度（有銳利化時）；PNG 和 DCT 不同、兩次相同', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: '先用數位攝影機拍' }).click();
  await page.getByRole('radio', { name: 'CD-ROM', exact: true }).click();
  /* 單場打開才有「掃描線一行一條」，說明寫出行數（240 寬 4:3 → 180 ÷ 2） */
  await expect(page.getByRole('switch', { name: /掃描線一行一條/ })).toHaveCount(0);
  await page.getByRole('switch', { name: /單場/ }).click();
  await expect(page.getByText(/90 行，行數＝擷取的高 ÷ 2/)).toBeVisible();
  await page.getByRole('switch', { name: /掃描線一行一條/ }).click();
  await expect
    .poll(async () => (await doc(page)).digital)
    .toMatchObject({ interlace: true, fieldScan: true });
  /* 銳利化大於 0 才有寬度 */
  await expect(page.getByRole('slider', { name: '銳利化的寬度' })).toHaveCount(0);
  await page.getByRole('slider', { name: '銳利化' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: '銳利化的寬度' })).toBeVisible();
  for (const name of ['CCD 的反應', '彩虹鋸齒', '低光雜訊'])
    await expect(page.getByRole('slider', { name, exact: true })).toBeVisible();
  await seek(page, 1);
  const a = await exportFile(page, 'PNG');
  const b = await exportFile(page, 'PNG');
  expect(same(a, b)).toBe(true);
  expect(readPng(a)).toMatchObject({ width: 1280, height: 960 });
  await page.getByRole('radio', { name: '方塊雜訊（DCT）' }).click();
  await seek(page, 1);
  const dct = await exportFile(page, 'PNG');
  expect(same(a, dct)).toBe(false);
  expect(errors).toEqual([]);
});

test('方塊色的 GIF：24 格、每格 9/100 秒', { tag: '@serial' }, async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await looks(page).getByRole('button', { name: 'CD-ROM（低畫質）' }).click();
  const gif = parseGif(await exportFile(page, 'GIF'));
  expect(gif.frames.length).toBe(24);
  expect(gif.frames.every((f) => f.delayCs === 9)).toBe(true);
  expect([gif.width, gif.height]).toEqual([360, 270]);
  expect(errors).toEqual([]);
});

/* ---------- 樣子 ---------- */

test('新的六組樣子：按了按鈕按下、值照規格、一步復原', async ({ page }) => {
  const errors = await open(page);
  await expect(looks(page).getByRole('button')).toHaveCount(12);
  const press = async (name: string) => {
    const b = looks(page).getByRole('button', { name, exact: true });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
  };
  /* 一步復原（只按一次：0.4 秒內連續的變更會合成一步） */
  await press('Screen Loop（左下角）');
  await undo(page);
  await expect(looks(page).getByRole('button', { name: '原本的錄影帶' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await press('粗方塊的網路攝影機');
  let d = await doc(page);
  expect(d.digital).toMatchObject({ on: true, width: 256, rainbow: 100, ccd: 100, quality: 19 });
  expect(d.wear).toBe(0);
  expect(Object.values(d.effects).some(Boolean)).toBe(false);
  await press('CD-ROM（低畫質）');
  expect((await doc(page)).digital).toMatchObject({ codec: 'video1', width: 240, quality: 64 });
  await press('便宜的攝影機');
  expect((await doc(page)).digital).toMatchObject({ width: 480, lowLight: 64, ccd: 68, halo: 4 });
  await press('輕微的錄影帶');
  d = await doc(page);
  expect(d.digital.on).toBe(false);
  expect(d.ntsc).toMatchObject({ on: true, tape: 'sp', noise: 32, headSwitch: false });
  await press('色彩雜訊');
  expect((await doc(page)).ntsc).toMatchObject({ on: true, tape: 'ep', noise: 100, wave: 46 });
  await press('Screen Loop（左下角）');
  expect((await doc(page)).loop).toMatchObject({ on: true, depth: 10, cx: -45, cy: 45 });
  expect(errors).toEqual([]);
});

/* ---------- Screen Loop ---------- */

test('Screen Loop 的亮度鍵反過來：亮度鍵大於 0 時出現', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await looks(page).getByRole('button', { name: 'Screen Loop', exact: true }).click();
  await openSection(page, 'Screen Loop');
  const sw = page.getByRole('switch', { name: '亮度鍵反過來' });
  await expect(sw).toBeVisible();
  await sw.click();
  await expect.poll(async () => (await doc(page)).loop.keyInvert).toBe(true);
  await page.getByRole('slider', { name: '亮度鍵' }).focus();
  await page.keyboard.press('Home');
  await expect(sw).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 第 3 版 ---------- */

test('第 3 版的自動儲存照讀：新的欄位是「和以前一樣」的值；存回是第 4 版', async ({ page }) => {
  const v3digital = {
    on: true,
    format: 'minidv',
    width: 720,
    fps: 30,
    interlace: true,
    lens: 0,
    alias: 30,
    noise: 20,
    denoise: 25,
    exposure: -20,
    warmth: -25,
    tint: -10,
    saturation: 95,
    black: 0,
    sharpen: 30,
    chroma: 3,
    quality: 90,
    keyframe: 0,
    blockSmooth: 0,
    loss: 6,
    mosh: 0,
  };
  await page.addInitScript(
    ([key, digital]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(
          key as string,
          JSON.stringify({ state: { data: { caption: '第三版', wear: 15, digital } }, version: 3 }),
        );
        sessionStorage.setItem('seeded', '1');
      }
    },
    [STORAGE_KEY, v3digital] as const,
  );
  const errors = await open(page);
  const d = await doc(page);
  expect(d.caption).toBe('第三版');
  expect(d.digital).toMatchObject({
    ...v3digital,
    codec: 'dct',
    fieldScan: false,
    rainbow: 0,
    lowLight: 0,
    ccd: 0,
    halo: 1,
  });
  expect(d.loop.keyInvert).toBe(false);
  /* 改一下讓自動儲存寫出來 */
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: /單場/ }).click();
  await expect
    .poll(() =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').version, STORAGE_KEY),
    )
    .toBe(4);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390／360／320 寬沒有橫向捲動（數位攝影的新設定、十二組樣子都看得到）', async ({ page }) => {
  const errors = await open(page);
  await loadPhoto(page);
  await looks(page).getByRole('button', { name: 'CD-ROM（低畫質）' }).click();
  await openSection(page, '數位攝影');
  await page.getByRole('switch', { name: '更多設定' }).click();
  await page.getByRole('switch', { name: /掃描線一行一條/ }).click();
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalScroll(page);
    await expect(looks(page).getByRole('button', { name: 'Screen Loop（左下角）' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
