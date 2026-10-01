/**
 * 戰鬥地圖產生器（建置產物 next/battlemap/）的端對端測試：
 * 開頁自動產生、地形切換換種子、G／D 快捷鍵與焦點例外、切換格線／火光不換圖、匯出 PNG、
 * 瀏覽器畫出來的像素與 Node 端的繪製逐像素相同、390 寬沒有橫向捲動、視覺回歸基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzlibSync } from 'fflate';

const URL = '/next/battlemap/';
const FIXED_SEED = 123456789;
/**
 * 這個種子在 Node 端繪製的像素雜湊（tests/unit/battlemap-render.test.ts 的 FIXED_SEED_HASHES）。
 * e2e 不能直接 import 繪圖模組（core/timeline 會帶進只能在打包環境用的相依），所以用同一組數字比對。
 */
const NODE_HASH = { all: 2822147993, gridOnly: 3714156781, rooms: 6 };

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + query);
  await expect(page.getByRole('heading', { level: 1, name: '戰鬥地圖產生器' })).toBeVisible();
  await expect(page.getByTestId('map-seed')).not.toBeEmpty();
  return errors;
}

const seedOf = async (page: Page) => Number(await page.getByTestId('map-seed').textContent());

/** 32 位元 FNV-1a（瀏覽器與 Node 用同一個算法比對像素） */
function fnv(bytes: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return h >>> 0;
}

/** 畫布像素的雜湊（在頁面裡算） */
const canvasHash = (page: Page) =>
  page.getByTestId('battlemap-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return h >>> 0;
  });

/** 讀畫布像素存到 window 上，之後在頁面裡比對 */
const snapshotCanvas = (page: Page, key: string) =>
  page.getByTestId('battlemap-canvas').evaluate((c: HTMLCanvasElement, k) => {
    (window as unknown as Record<string, Uint8ClampedArray>)[k] = c
      .getContext('2d')!
      .getImageData(0, 0, c.width, c.height).data;
  }, key);

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 簡易 PNG 解碼（只支援本工具輸出的 8-bit RGBA） */
function decodePng(bytes: Buffer) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  const idat: Buffer[] = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o);
    const type = bytes.subarray(o + 4, o + 8).toString('latin1');
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = unzlibSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? px[y * stride + i - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 4 ? px[(y - 1) * stride + i - 4] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + i] = v & 255;
    }
  }
  return { width, height, colorType, bitDepth, px };
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁自動產生：預設石砌地城、格線與火光開啟，顯示種子、房間數、地形', async ({ page }) => {
  const errors = await open(page);
  const seed = await seedOf(page);
  expect(Number.isInteger(seed) && seed >= 0 && seed <= 999_999_999).toBe(true);
  await expect(page.getByTestId('map-terrain')).toHaveText('石砌地城');
  await expect(page.getByTestId('map-rooms')).toHaveText(/^[5-8] 間$/);
  await expect(page.getByRole('radio', { name: '石砌地城' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('switch', { name: '格線' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: '火光' })).toHaveAttribute('aria-checked', 'true');
  const size = await page
    .getByTestId('battlemap-canvas')
    .evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size).toEqual([1540, 1120]);
  /* 頁尾只有靈感來源 */
  await expect(page.locator('footer')).toHaveText(
    '靈感來源：usagineko7865-debug/battlemap-generator',
  );
  await expect(page.locator('footer a')).toHaveAttribute(
    'href',
    'https://github.com/usagineko7865-debug/battlemap-generator',
  );
  expect(errors).toEqual([]);
});

test('?seed= 固定種子：瀏覽器畫出來的像素與 Node 端的繪製逐像素相同', async ({ page }) => {
  const errors = await open(page, `?seed=${FIXED_SEED}`);
  expect(await seedOf(page)).toBe(FIXED_SEED);
  await expect(page.getByTestId('map-rooms')).toHaveText(`${NODE_HASH.rooms} 間`);
  expect(await canvasHash(page)).toBe(NODE_HASH.all);
  await page.getByRole('switch', { name: '火光' }).click();
  expect(await canvasHash(page)).toBe(NODE_HASH.gridOnly);
  expect(errors).toEqual([]);
});

test('地形切換（包含再按一次同一種）一定換新種子；重新產生按鈕換種子', async ({ page }) => {
  const errors = await open(page);
  const s0 = await seedOf(page);
  await page.getByRole('radio', { name: '洞穴' }).click();
  await expect(page.getByTestId('map-terrain')).toHaveText('洞穴');
  const s1 = await seedOf(page);
  expect(s1).not.toBe(s0);
  await page.getByRole('radio', { name: '洞穴' }).click();
  await expect(page.getByTestId('map-seed')).not.toHaveText(String(s1));
  await expect(page.getByTestId('map-terrain')).toHaveText('洞穴');
  const s2 = await seedOf(page);
  await page.getByRole('radio', { name: '墓室' }).click();
  await expect(page.getByTestId('map-terrain')).toHaveText('墓室');
  await expect(page.getByTestId('map-seed')).not.toHaveText(String(s2));
  const s3 = await seedOf(page);
  await page.getByRole('button', { name: '重新產生' }).click();
  await expect(page.getByTestId('map-seed')).not.toHaveText(String(s3));
  await expect(page.getByTestId('map-terrain')).toHaveText('墓室');
  expect(errors).toEqual([]);
});

test('切換格線、火光不換圖：種子不變，格線以外／光暈以外的像素逐一相同，切回後完全相同', async ({
  page,
}) => {
  const errors = await open(page, `?seed=${FIXED_SEED}`);
  const h0 = await canvasHash(page);
  await snapshotCanvas(page, '__on');
  await page.getByRole('switch', { name: '格線' }).click();
  await expect(page.getByRole('switch', { name: '格線' })).toHaveAttribute('aria-checked', 'false');
  expect(await seedOf(page)).toBe(FIXED_SEED);
  await snapshotCanvas(page, '__off');
  const changedOffGrid = await page.evaluate(() => {
    const w = window as unknown as Record<string, Uint8ClampedArray>;
    const a = w.__on;
    const b = w.__off;
    const onLine = (v: number, max: number) => v % 70 === 0 || v === max - 1;
    let n = 0;
    for (let y = 0; y < 1120; y++)
      for (let x = 0; x < 1540; x++) {
        if (onLine(x, 1540) || onLine(y, 1120)) continue;
        const i = (y * 1540 + x) * 4;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
      }
    return n;
  });
  expect(changedOffGrid).toBe(0);
  await page.getByRole('switch', { name: '格線' }).click();
  expect(await canvasHash(page)).toBe(h0);
  await page.getByRole('switch', { name: '火光' }).click();
  await page.getByRole('switch', { name: '火光' }).click();
  expect(await canvasHash(page)).toBe(h0);
  expect(await seedOf(page)).toBe(FIXED_SEED);
  expect(errors).toEqual([]);
});

test('快捷鍵 G：大小寫皆可；焦點在開關、地形選項上不觸發；在按鈕上會觸發；Ctrl＋G 不觸發', async ({
  page,
}) => {
  const errors = await open(page);
  const changes = async (press: () => Promise<void>) => {
    const before = await page.getByTestId('map-seed').textContent();
    await press();
    await page.waitForTimeout(150);
    return (await page.getByTestId('map-seed').textContent()) !== before;
  };
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  expect(await changes(() => page.keyboard.press('g'))).toBe(true);
  expect(await changes(() => page.keyboard.press('Shift+G'))).toBe(true);
  expect(await changes(() => page.keyboard.press('Control+g'))).toBe(false);
  expect(await changes(() => page.keyboard.press('Alt+g'))).toBe(false);
  await page.getByRole('switch', { name: '格線' }).focus();
  expect(await changes(() => page.keyboard.press('g'))).toBe(false);
  await page.getByRole('radio', { name: '石砌地城' }).focus();
  expect(await changes(() => page.keyboard.press('g'))).toBe(false);
  await page.getByRole('button', { name: '重新產生' }).focus();
  expect(await changes(() => page.keyboard.press('g'))).toBe(true);
  /* 格線開關沒有被 G 改到 */
  await expect(page.getByRole('switch', { name: '格線' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('匯出 PNG：原尺寸 1540 × 1120 RGBA、檔名含地形與種子、內容與畫面逐像素相同；D 鍵也能匯出', async ({
  page,
}) => {
  const errors = await open(page, `?seed=${FIXED_SEED}`);
  await page.getByRole('radio', { name: '洞穴' }).click();
  await expect(page.getByTestId('map-terrain')).toHaveText('洞穴');
  const seed = await seedOf(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出 PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`battlemap_cave_${seed}.png`);
  const bytes = readFileSync(await download.path());
  const png = decodePng(bytes);
  expect([png.width, png.height, png.bitDepth, png.colorType]).toEqual([1540, 1120, 8, 6]);
  expect(fnv(png.px)).toBe(await canvasHash(page));
  await expect(page.getByRole('status').filter({ hasText: '已匯出' })).toContainText(
    `battlemap_cave_${seed}.png`,
  );

  /* 關掉格線後用 D 鍵匯出（焦點在頁面空白處） */
  await page.getByRole('switch', { name: '格線' }).click();
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  const [d2] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('d')]);
  expect(d2.suggestedFilename()).toBe(`battlemap_cave_${seed}.png`);
  const png2 = decodePng(readFileSync(await d2.path()));
  expect(fnv(png2.px)).toBe(await canvasHash(page));
  expect(fnv(png2.px)).not.toBe(fnv(png.px));

  /* 焦點在開關上時 D 不觸發 */
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.getByRole('switch', { name: '火光' }).focus();
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test('不保留狀態：重新整理後回到預設並換新地圖', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '墓室' }).click();
  await page.getByRole('switch', { name: '火光' }).click();
  const s = await seedOf(page);
  await page.reload();
  await expect(page.getByTestId('map-terrain')).toHaveText('石砌地城');
  await expect(page.getByRole('switch', { name: '火光' })).toHaveAttribute('aria-checked', 'true');
  expect(await seedOf(page)).not.toBe(s);
  expect(errors).toEqual([]);
});

test('視覺回歸：1280 寬', async ({ page }) => {
  const errors = await open(page, `?seed=${FIXED_SEED}`);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('battlemap-1280.png', { fullPage: true });
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, `?seed=${FIXED_SEED}`);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('battlemap-390.png', { fullPage: true });
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
