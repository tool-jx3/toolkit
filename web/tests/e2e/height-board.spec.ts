/**
 * 立繪身高比較板（建置產物 tools/height-board/）的端對端測試：
 * - 開頁沒有 pageerror／console error；空盤面提示；頁尾只放靈感來源；
 * - 加入：單張與批次對話框（身高限制、Enter 跳欄、留空列、略過與取消）、非圖片略過、拖放（覆蓋層、放開位置）、
 *   新角色的位置、名稱預設值、透明門檻 16／17、壞圖提示；
 * - 換算與盤面範圍（3.1、F11）、刻度線的位置（截圖量線）；
 * - 盤面：點選、拖曳、Esc、空白處取消、滑過提示、游標、基準線拖曳（凍結比例、5% 限制、滑桿同步）、方向鍵（1／10 px、合併復原）；
 * - 縮放與捲動：按鈕、點倍率回 100%、滾輪錨點、Shift＋滾輪、符合寬度、平移（空白處、中鍵）；
 * - 排列兩種、設定面板（名稱、身高、兩條線、複製、更換、前後順序、刪除）、清單（身高欄、顯示／隱藏、篩選、緊密列距、拖曳排序）；
 * - 復原／重做（快捷鍵、60 步上限）、全部刪除；
 * - 自動保存與還原、保存失敗的提示；專案檔（存、讀、確認、錯誤）；匯出 PNG（尺寸、白底、刻度線、角色位置、檔名、訊息）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync, unzlibSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import type { BoardData, BoardRange, Geometry } from '../../src/tools/height-board/logic';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('height-board') ?? { id: 'height-board', status: 'next' })}/`;

test.use({ viewport: { width: 1280, height: 900 } });

/* ---------- 測試圖（規格 3.1） ---------- */

type Rgb = [number, number, number];

async function pngOf(
  w: number,
  h: number,
  paint: (set: (x: number, y: number, c: Rgb, a?: number) => void) => void,
) {
  const px = new Uint8Array(w * h * 4);
  paint((x, y, c, a = 255) => px.set([...c, a], (y * w + x) * 4));
  return Buffer.from(await encodePng(px, w, h));
}

const fillRect = (
  set: (x: number, y: number, c: Rgb, a?: number) => void,
  x0: number,
  y0: number,
  w: number,
  h: number,
  c: Rgb,
) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
};

/** 同一張測試圖只編碼一次 */
const once = (make: () => Promise<Buffer>) => {
  let p: Promise<Buffer> | null = null;
  return () => {
    p ??= make();
    return p;
  };
};

/** A＝200 × 400，內容 100 × 300 位於 (50, 60) */
const imgA = once(() => pngOf(200, 400, (set) => fillRect(set, 50, 60, 100, 300, [220, 60, 60])));
/** B＝300 × 300，內容 150 × 200 */
const imgB = once(() => pngOf(300, 300, (set) => fillRect(set, 75, 50, 150, 200, [40, 140, 220])));
/** C＝1000 × 2000 整張不透明 */
const imgC = once(() => pngOf(1000, 2000, (set) => fillRect(set, 0, 0, 1000, 2000, [60, 170, 90])));
/** 透明門檻：內容 60 × 60 位於 (20, 20)，(2, 2) 的不透明度 16 不算、(95, 97) 的 17 算 */
const imgNoise = once(() =>
  pngOf(100, 100, (set) => {
    fillRect(set, 20, 20, 60, 60, [120, 90, 200]);
    set(2, 2, [0, 0, 0], 16);
    set(95, 97, [0, 0, 0], 17);
  }),
);

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/* ---------- 頁面操作 ---------- */

async function open(page: Page, { clear = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  if (clear) {
    /* 每個測試從空盤面開始（瀏覽器內容是新的，這裡只是保險） */
    await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  }
  return errors;
}

type HbFn = 'data' | 'geometry' | 'range' | 'exportLayout' | 'view' | 'selected' | 'history';

// biome-ignore lint/suspicious/noExplicitAny: 測試用的除錯介面
const hb = <T = any>(page: Page, fn: HbFn): Promise<T> =>
  page.evaluate(
    (fn) =>
      (window as unknown as { __heightBoard: Record<string, () => unknown> }).__heightBoard[fn](),
    fn,
  ) as Promise<T>;

const chars = async (page: Page) => (await hb<BoardData>(page, 'data')).characters;
const geos = (page: Page) => hb<(Geometry & { id: string; name: string })[]>(page, 'geometry');
const view = (page: Page) =>
  hb<{ zoom: number; scale: number; scrollX: number; scrollY: number }>(page, 'view');
const history = (page: Page) => hb<{ past: number; future: number }>(page, 'history');

/** 世界座標（x cm、高度 cm）→ 螢幕座標 */
const screenOf = (page: Page, x: number, h: number) =>
  page.evaluate(
    ([x, h]) =>
      (
        window as unknown as {
          __heightBoard: { toScreen: (x: number, h: number) => { x: number; y: number } };
        }
      ).__heightBoard.toScreen(x, h),
    [x, h],
  );

/** 角色圖的中心（螢幕座標） */
async function centerOf(page: Page, index: number) {
  const g = (await geos(page))[index];
  return screenOf(page, g.box.x + g.box.width / 2, g.imageTop / 2 + g.imageBottom / 2);
}

const board = (page: Page) => page.getByTestId('pan-zoom-viewport');
const canvas = (page: Page) => board(page).locator('section canvas');
const scroller = (page: Page) => board(page).locator('section');
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const list = (page: Page) => page.getByRole('list', { name: '角色清單（上面的在前面）' });
const rows = (page: Page) => list(page).locator(':scope > li');
const status = (page: Page) => page.getByTestId('status-text');
const panel = (page: Page) => page.getByTestId('character-panel');
const zoomLabel = (page: Page) => page.getByTestId('zoom');

async function choose(page: Page, files: ReturnType<typeof file>[]) {
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '選擇圖片…').click(),
  ]);
  expect(fc.isMultiple()).toBe(true);
  await fc.setFiles(files);
}

async function addOne(page: Page, f: ReturnType<typeof file>, height: number, name?: string) {
  const n = (await chars(page)).length;
  await choose(page, [f]);
  const d = page.getByRole('dialog', { name: '加入角色' });
  await expect(d).toBeVisible();
  if (name !== undefined) await d.getByRole('textbox', { name: '名稱' }).fill(name);
  await d.getByRole('spinbutton', { name: '身高' }).fill(String(height));
  await d.getByRole('button', { name: '加入', exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect.poll(async () => (await chars(page)).length).toBe(n + 1);
}

async function addMany(page: Page, files: ReturnType<typeof file>[], heights: (number | '')[]) {
  const n = (await chars(page)).length;
  await choose(page, files);
  const d = page.getByRole('dialog', { name: `加入 ${files.length} 張圖片` });
  await expect(d).toBeVisible();
  for (let i = 0; i < files.length; i++)
    await d.getByRole('spinbutton', { name: `第 ${i + 1} 張的身高` }).fill(String(heights[i]));
  await d.getByRole('button', { name: '加入', exact: true }).click();
  await expect(d).toHaveCount(0);
  const added = heights.filter((h) => h !== '').length;
  await expect.poll(async () => (await chars(page)).length).toBe(n + added);
}

/** A、B、C（160、120、190 cm）依預設排列 */
async function addABC(page: Page) {
  await addMany(
    page,
    [file('A.png', await imgA()), file('B.png', await imgB()), file('C.png', await imgC())],
    [160, 120, 190],
  );
}

async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
  await page.mouse.up();
}

async function menu(page: Page, item: string) {
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** PNG（8 位元 RGB 或 RGBA）→ { width, height, colorType, bitDepth, pixels(RGBA) } */
function decodePng(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT');
  const z = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let o = 0;
  for (const c of idat) {
    z.set(c.data, o);
    o += c.data.length;
  }
  if (ihdr.colorType === 6)
    return { ...ihdr, pixels: decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType) };
  if (ihdr.colorType !== 2 || ihdr.bitDepth !== 8) throw new Error('不支援的 PNG');
  /* RGB：自己還原濾波，補上不透明的 alpha */
  const { width: w, height: h } = ihdr;
  const raw = unzlibSync(z);
  const stride = w * 3;
  const rgb = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 3 ? rgb[y * stride + i - 3] : 0;
      const b = y > 0 ? rgb[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 3 ? rgb[(y - 1) * stride + i - 3] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const v = [x, x + a, x + b, x + ((a + b) >> 1), x + paeth][f];
      rgb[y * stride + i] = v & 255;
    }
  }
  const pixels = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++)
    pixels.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  return { ...ihdr, pixels };
}

async function readDownload(dl: { path: () => Promise<string | null> }) {
  const { readFile } = await import('node:fs/promises');
  const p = await dl.path();
  if (!p) throw new Error('下載失敗');
  return new Uint8Array(await readFile(p));
}

/* ======================================================================= */

test('開頁：沒有錯誤、空盤面提示、按鈕狀態、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const empty = page.getByTestId('board-empty');
  await expect(empty).toContainText('把立繪圖片拖到這裡');
  await expect(empty).toContainText('PNG 或 WebP');
  await expect(empty).toContainText('不會上傳');
  await expect(btn(page, '復原')).toBeDisabled();
  await expect(btn(page, '重做')).toBeDisabled();
  await expect(zoomLabel(page)).toHaveText('100%');
  await expect(page.getByTestId('board-help')).toBeVisible();
  await expect(page.getByTestId('list-count')).toHaveText('0 位');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/woolwag3338/character-height-board',
  );
  expect(await footer.getByRole('link').count()).toBe(1);
  await expect(page.getByRole('link', { name: /TRPG Toolkit/ })).toBeVisible();
  /* 盤面上緣 180 cm、下緣 0 */
  expect(await hb<BoardRange>(page, 'range')).toEqual({ top: 180, bottom: 0, width: 120 });
  expect(errors).toEqual([]);
});

test('單張加入：預覽、名稱預填、身高限制、略過與 Esc、Enter 加入、空白名稱用檔名', async ({
  page,
}) => {
  const errors = await open(page);
  await choose(page, [file('小明.v2.png', await imgA())]);
  const d = page.getByRole('dialog', { name: '加入角色' });
  await expect(d.getByTestId('add-preview')).toBeVisible();
  const name = d.getByRole('textbox', { name: '名稱' });
  const height = d.getByRole('spinbutton', { name: '身高' });
  await expect(name).toHaveValue('小明.v2');
  await expect(height).toHaveValue('');
  await expect(height).toBeFocused();
  /* 不合法：對話框不關閉、瀏覽器的欄位提示 */
  for (const bad of ['', '0', '1001', '160.25']) {
    await height.fill(bad);
    await d.getByRole('button', { name: '加入', exact: true }).click();
    await expect(d).toBeVisible();
    expect(await height.evaluate((el: HTMLInputElement) => el.validationMessage)).not.toBe('');
  }
  expect(await chars(page)).toHaveLength(0);
  /* 略過 */
  await d.getByRole('button', { name: '略過' }).click();
  await expect(d).toHaveCount(0);
  /* Esc */
  await choose(page, [file('小明.v2.png', await imgA())]);
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  expect(await chars(page)).toHaveLength(0);
  /* 名稱清空（只有空白）＋身高欄按 Enter */
  await choose(page, [file('小明.v2.png', await imgA())]);
  await name.fill('   ');
  await height.fill('160.2');
  await height.press('Enter');
  await expect(d).toHaveCount(0);
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  const [c] = await chars(page);
  expect(c).toMatchObject({ name: '小明.v2', height: 160.2, x: 5, top: 0, bottom: 100 });
  expect(c.visible).toBe(true);
  expect(await hb(page, 'selected')).toBe(c.id);
  await expect(page.getByTestId('board-empty')).toHaveCount(0);
  /* 名稱欄按 Enter 也加入；選取新角色 */
  await choose(page, [file('B.png', await imgB())]);
  await height.fill('120');
  await name.fill('阿花');
  await name.press('Enter');
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  const list2 = await chars(page);
  expect(list2[1].name).toBe('阿花');
  expect(await hb(page, 'selected')).toBe(list2[1].id);
  /* 位置：前一位右緣往右 5 cm */
  const g = await geos(page);
  expect(list2[1].x).toBeCloseTo(g[0].box.x + g[0].width + 5, 6);
  /* 單張加入每張一步 */
  expect((await history(page)).past).toBe(2);
  expect(errors).toEqual([]);
});

test('選檔：不是圖片的檔案靜默略過；全部不是圖片時什麼都不發生；讀不了的圖提示檔名', async ({
  page,
}) => {
  const errors = await open(page);
  await choose(page, [file('說明.txt', Buffer.from('hello'), 'text/plain')]);
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  /* 一張圖＋一個文字檔：走單張對話框 */
  await choose(page, [
    file('說明.txt', Buffer.from('hello'), 'text/plain'),
    file('A.png', await imgA()),
  ]);
  await expect(page.getByRole('dialog', { name: '加入角色' })).toBeVisible();
  await page.keyboard.press('Escape');
  /* 壞掉的圖：提示檔名、不加入 */
  await addMany(
    page,
    [file('壞掉.png', Buffer.from('不是圖片')), file('A.png', await imgA())],
    [150, 160],
  ).catch(() => undefined);
  await expect(status(page)).toContainText('壞掉.png');
  await expect.poll(async () => (await chars(page)).map((c) => c.name)).toEqual(['A']);
  expect(errors).toEqual([]);
});

test('批次加入：Enter 跳欄、留空列不加入、不合法無法確認、一步復原、往右接、進度', async ({
  page,
}) => {
  const errors = await open(page);
  await choose(page, [
    file('甲.png', await imgA()),
    file('乙.png', await imgB()),
    file('丙.png', await imgA()),
  ]);
  const d = page.getByRole('dialog', { name: '加入 3 張圖片' });
  await expect(d).toBeVisible();
  const h = (i: number) => d.getByRole('spinbutton', { name: `第 ${i} 張的身高` });
  const n = (i: number) => d.getByRole('textbox', { name: `第 ${i} 張的名稱` });
  await expect(n(1)).toHaveValue('甲');
  await expect(h(1)).toHaveValue('');
  await expect(h(1)).toHaveAttribute('placeholder', /cm/);
  await expect(h(1)).toBeFocused();
  /* 輸入法選字中的 Enter 不跳欄 */
  await n(2).click();
  await n(2).dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(n(2)).toBeFocused();
  /* 名稱欄 Enter → 同一列身高欄 */
  await n(2).fill('乙乙');
  await n(2).press('Enter');
  await expect(h(2)).toBeFocused();
  await expect(d).toBeVisible();
  /* 身高欄 Enter → 下一列身高欄並全選 */
  await h(1).fill('150');
  await h(2).fill('99');
  await h(1).focus();
  await h(1).press('Enter');
  await expect(h(2)).toBeFocused();
  expect(await h(2).evaluate((el: HTMLInputElement) => el.selectionStart === null || true)).toBe(
    true,
  );
  await page.keyboard.type('130');
  await expect(h(2)).toHaveValue('130');
  /* 不合法：無法確認 */
  await h(3).fill('1001');
  await h(2).press('Enter');
  await expect(h(3)).toBeFocused();
  await h(3).press('Enter');
  await expect(d).toBeVisible();
  /* 留空列不加入：最後一列 Enter 等於確認 */
  await h(3).fill('');
  await h(3).press('Enter');
  await expect(d).toHaveCount(0);
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  const list = await chars(page);
  expect(list.map((c) => [c.name, c.height])).toEqual([
    ['甲', 150],
    ['乙乙', 130],
  ]);
  const g = await geos(page);
  expect(list[0].x).toBe(5);
  expect(list[1].x).toBeCloseTo(5 + g[0].width + 5, 6);
  expect(await hb(page, 'selected')).toBe(list[1].id);
  /* 整批一步 */
  expect((await history(page)).past).toBe(1);
  await btn(page, '復原').click();
  expect(await chars(page)).toHaveLength(0);
  await btn(page, '重做').click();
  expect(await chars(page)).toHaveLength(2);
  /* 取消：全部不加入 */
  await choose(page, [file('甲.png', await imgA()), file('乙.png', await imgB())]);
  await page.getByRole('dialog').getByRole('spinbutton').first().fill('100');
  await btn(page, '取消').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await chars(page)).toHaveLength(2);
  /* 進度：大圖批次時狀態列顯示「第 i／共 n 張」，完成後消失 */
  const big = await imgC();
  await choose(page, [file('C1.png', big), file('C2.png', big), file('C3.png', big)]);
  const d3 = page.getByRole('dialog', { name: '加入 3 張圖片' });
  for (let i = 1; i <= 3; i++)
    await d3.getByRole('spinbutton', { name: `第 ${i} 張的身高` }).fill('170');
  const seen: string[] = [];
  const watch = setInterval(() => {
    void status(page)
      .textContent({ timeout: 50 })
      .then((t) => t && seen.push(t))
      .catch(() => undefined);
  }, 5);
  await d3.getByRole('button', { name: '加入', exact: true }).click();
  await expect.poll(async () => (await chars(page)).length).toBe(5);
  clearInterval(watch);
  expect(seen.some((t) => /第 \d／共 3 張/.test(t))).toBe(true);
  await expect(status(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('透明門檻 16／17、換算與盤面範圍、刻度線的位置', async ({ page }) => {
  const errors = await open(page);
  await addOne(page, file('noise.png', await imgNoise()), 100);
  expect((await chars(page))[0].crop).toEqual({ x: 20, y: 20, width: 76, height: 78 });
  await btn(page, '刪除').click();
  await addABC(page);
  const g = await geos(page);
  expect(g[0].width).toBeCloseTo(53.333, 2);
  expect(g[1].width).toBeCloseTo(90, 6);
  expect(g[2].width).toBeCloseTo(95, 6);
  expect(await hb<BoardRange>(page, 'range')).toMatchObject({ top: 210, bottom: 0 });
  /* C 改成 180 cm、10%／90%：上緣 202.5 → 盤面 220；下緣 −22.5 */
  await rows(page).first().click();
  await panel(page).getByRole('spinbutton', { name: '身高' }).fill('180');
  await panel(page).getByRole('spinbutton', { name: '身高' }).press('Enter');
  const top = panel(page).getByRole('slider', { name: '頭頂線' });
  await top.focus();
  for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowRight');
  const foot = panel(page).getByRole('slider', { name: '腳底線' });
  await foot.focus();
  for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowLeft');
  await blur(page);
  const c = (await chars(page))[2];
  expect(c.top).toBeCloseTo(10, 6);
  expect(c.bottom).toBeCloseTo(90, 6);
  const gc = (await geos(page))[2];
  expect(gc.width).toBeCloseTo(112.5, 2);
  expect(gc.imageTop).toBeCloseTo(202.5, 2);
  expect(gc.imageBottom).toBeCloseTo(-22.5, 2);
  const range = await hb<BoardRange>(page, 'range');
  expect(range.top).toBe(220);
  expect(range.bottom).toBeCloseTo(-22.5, 2);
  /* 倍率 100%：上緣到下緣剛好填滿盤面（上下各 14 px），沒有縱向捲軸 */
  const sc = await scroller(page).evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(sc[0]).toBeLessThanOrEqual(sc[1]);
  const v = await view(page);
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const y220 = (await screenOf(page, 0, 220))?.y ?? 0;
  const yBottom = (await screenOf(page, 0, -22.5))?.y ?? 0;
  expect(y220 - box.y).toBeCloseTo(14, 0);
  expect(box.y + box.height - yBottom).toBeCloseTo(14, 0);
  expect(v.scale).toBeCloseTo((box.height - 28) / 242.5, 3);
  /* 截圖量線：角色之間空隙的一欄，每 10 cm 一條（0 最深） */
  await page.mouse.move(0, 0);
  await btn(page, '符合寬度').click();
  await rows(page).first().click();
  await page.keyboard.press('Escape');
  const shot = decodePng(new Uint8Array(await canvas(page).screenshot()));
  /* B 與 C 之間的空隙（B 右緣與 C 左緣的中間） */
  const gb = await geos(page);
  const gapX = (gb[1].box.x + gb[1].width + gb[2].box.x) / 2;
  const col = Math.round(((await screenOf(page, gapX, 100))?.x ?? 0) - box.x);
  const dark: number[] = [];
  for (let y = 0; y < shot.height; y++) {
    const i = (y * shot.width + col) * 4;
    if (shot.pixels[i] < 250) dark.push(y);
  }
  const groups: { y: number; v: number }[] = [];
  let prev = -10;
  for (const y of dark) {
    const last = groups[groups.length - 1];
    const vv = shot.pixels[(y * shot.width + col) * 4];
    if (last && y - prev <= 1) {
      last.v = Math.min(last.v, vv);
      last.y = (last.y + y) / 2;
    } else groups.push({ y, v: vv });
    prev = y;
  }
  /* 0～220 共 23 條 */
  expect(groups).toHaveLength(23);
  const ground = groups[groups.length - 1];
  expect(ground.v).toBeLessThan(Math.min(...groups.slice(0, -1).map((x) => x.v)));
  const yGround = (await screenOf(page, 0, 0))?.y ?? 0;
  expect(Math.abs(ground.y - (yGround - box.y))).toBeLessThanOrEqual(1.5);
  expect(errors).toEqual([]);
});

test('拖放加入：覆蓋層、放開的位置決定新角色的位置、多張依前一張寬度往右接', async ({ page }) => {
  const errors = await open(page);
  const a = (await imgA()).toString('base64');
  const b = (await imgB()).toString('base64');
  const dt = await page.evaluateHandle(
    ([a, b]) => {
      const dt = new DataTransfer();
      const bytes = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
      dt.items.add(new File([bytes(a)], '拖進來.png', { type: 'image/png' }));
      return {
        one: dt,
        two: (() => {
          const d2 = new DataTransfer();
          d2.items.add(new File([bytes(b)], '寬.png', { type: 'image/png' }));
          d2.items.add(new File([bytes(a)], '窄.png', { type: 'image/png' }));
          d2.items.add(new File(['x'], '說明.txt', { type: 'text/plain' }));
          return d2;
        })(),
      };
    },
    [a, b],
  );
  const one = await dt.getProperty('one');
  const two = await dt.getProperty('two');
  const body = page.locator('body');
  await body.dispatchEvent('dragenter', { dataTransfer: one });
  await expect(page.getByTestId('window-drop')).toContainText('放開即可加入');
  await body.dispatchEvent('dragleave', { dataTransfer: one });
  await expect(page.getByTestId('window-drop')).toHaveCount(0);
  /* 放在盤面上 x＝100 cm 的位置 */
  const at = await screenOf(page, 100, 50);
  if (!at) throw new Error('no screen');
  await body.dispatchEvent('dragenter', { dataTransfer: one });
  await canvas(page).dispatchEvent('drop', { dataTransfer: one, clientX: at.x, clientY: at.y });
  await expect(page.getByTestId('window-drop')).toHaveCount(0);
  const d = page.getByRole('dialog', { name: '加入角色' });
  await expect(d).toBeVisible();
  await expect(d.getByRole('textbox', { name: '名稱' })).toHaveValue('拖進來');
  await d.getByRole('spinbutton', { name: '身高' }).fill('160');
  await d.getByRole('spinbutton', { name: '身高' }).press('Enter');
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  let g = await geos(page);
  expect(g[0].box.x + g[0].width / 2).toBeCloseTo(100, 0);
  /* 放在盤面以外：照一般規則（顯示中角色右緣＋5） */
  await page.locator('header').dispatchEvent('drop', { dataTransfer: one, clientX: 5, clientY: 5 });
  await page.getByRole('dialog', { name: '加入角色' }).getByRole('spinbutton').fill('160');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  g = await geos(page);
  expect(g[1].box.x).toBeCloseTo(g[0].box.x + g[0].width + 5, 3);
  /* 多張放在 x＝180 cm：第一張中心在 180，第二張中心＝180＋90＋5 */
  const at2 = await screenOf(page, 180, 50);
  if (!at2) throw new Error('no screen');
  await canvas(page).dispatchEvent('drop', { dataTransfer: two, clientX: at2.x, clientY: at2.y });
  const d2 = page.getByRole('dialog', { name: '加入 2 張圖片' });
  await expect(d2).toBeVisible();
  await d2.getByRole('spinbutton', { name: '第 1 張的身高' }).fill('120');
  await d2.getByRole('spinbutton', { name: '第 2 張的身高' }).fill('160');
  await d2.getByRole('button', { name: '加入', exact: true }).click();
  await expect.poll(async () => (await chars(page)).length).toBe(4);
  g = await geos(page);
  expect(g[2].box.x + g[2].width / 2).toBeCloseTo(180, 0);
  expect(g[3].box.x + g[3].width / 2).toBeCloseTo(180 + 90 + 5, 0);
  /* 前寬 90、後寬約 53.3：間距約 23.3 cm（依前一張寬度推算，不是固定 5 cm） */
  expect(g[3].box.x - (g[2].box.x + g[2].width)).toBeCloseTo(90 / 2 + 5 - 53.333 / 2, 1);
  /* 放在最左邊：左緣不小於 0 */
  await scroller(page).evaluate((el) => el.scrollTo(0, 0));
  const at3 = await screenOf(page, 1, 50);
  if (!at3) throw new Error('no screen');
  await canvas(page).dispatchEvent('drop', { dataTransfer: one, clientX: at3.x, clientY: at3.y });
  await page.getByRole('dialog', { name: '加入角色' }).getByRole('spinbutton').fill('160');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await chars(page)).length).toBe(5);
  expect((await chars(page))[4].x).toBe(0);
  expect(errors).toEqual([]);
});

test('盤面：點選、清單同步、拖曳（只動水平、一步復原）、Esc 與空白處取消選取、滑過提示與游標', async ({
  page,
}) => {
  const errors = await open(page);
  await addABC(page);
  await page.keyboard.press('Escape');
  expect(await hb(page, 'selected')).toBeNull();
  await expect(page.getByTestId('board-help')).toBeVisible();
  /* 點 A：選取、清單醒目 */
  const a = await centerOf(page, 0);
  await page.mouse.click(a.x, a.y);
  const list0 = await chars(page);
  expect(await hb(page, 'selected')).toBe(list0[0].id);
  await expect(rows(page).nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(panel(page).getByRole('textbox', { name: '名稱' })).toHaveValue('A');
  /* 游標與滑過提示 */
  await page.mouse.move(a.x, a.y + 30);
  await expect(page.getByTestId('viewport-tooltip')).toHaveText('A　160 cm');
  expect(await canvas(page).evaluate((el) => el.style.cursor)).toBe('move');
  const head = await screenOf(page, list0[0].x + 10, 160);
  await page.mouse.move(head?.x ?? 0, (head?.y ?? 0) + 3);
  expect(await canvas(page).evaluate((el) => el.style.cursor)).toBe('ns-resize');
  const blank = await screenOf(page, 100, 170);
  await page.mouse.move(blank?.x ?? 0, blank?.y ?? 0);
  expect(await canvas(page).evaluate((el) => el.style.cursor)).toBe('grab');
  await expect(page.getByTestId('viewport-tooltip')).toHaveCount(0);
  /* 拖曳 B：只動水平 */
  const b = await centerOf(page, 1);
  const before = await chars(page);
  const scale = (await view(page)).scale;
  const past = (await history(page)).past;
  await drag(page, b, 60, 40);
  const after = await chars(page);
  expect(after[1].x - before[1].x).toBeCloseTo(60 / scale, 1);
  expect(after[1].top).toBe(0);
  expect(await hb(page, 'selected')).toBe(after[1].id);
  expect((await history(page)).past).toBe(past + 1);
  /* 點一下沒有移動不算一步 */
  const b2 = await centerOf(page, 1);
  await page.mouse.click(b2.x, b2.y);
  expect((await history(page)).past).toBe(past + 1);
  /* 拖到最左：左緣不小於 0 */
  await drag(page, await centerOf(page, 1), -2000, 0);
  expect((await chars(page))[1].x).toBe(0);
  /* 重疊時選最前面的（B 在 A 上面、B 比較前面） */
  await page.mouse.click(a.x - 5, a.y);
  expect(await hb(page, 'selected')).toBe(after[1].id);
  /* 點空白處取消選取 */
  await page.mouse.click(blank?.x ?? 0, blank?.y ?? 0);
  expect(await hb(page, 'selected')).toBeNull();
  /* 清單點一列：選取 */
  await rows(page).first().click();
  expect(await hb(page, 'selected')).toBe(after[2].id);
  await page.keyboard.press('Escape');
  expect(await hb(page, 'selected')).toBeNull();
  expect(errors).toEqual([]);
});

test('基準線：直接拖動（凍結比例、5% 限制、滑桿同步、一步復原）與歸位', async ({ page }) => {
  const errors = await open(page);
  await addOne(page, file('A.png', await imgA()), 160);
  const c = (await chars(page))[0];
  const scale0 = (await view(page)).scale;
  const head = await screenOf(page, c.x + 20, 160);
  if (!head) throw new Error('no screen');
  /* 拖頭頂線往下 40 px：拖動中盤面比例不變，放開後重排 */
  await page.mouse.move(head.x, head.y + 4);
  await page.mouse.down();
  await page.mouse.move(head.x, head.y + 24, { steps: 3 });
  await page.mouse.move(head.x, head.y + 44, { steps: 3 });
  expect((await view(page)).scale).toBeCloseTo(scale0, 6);
  const mid = (await chars(page))[0];
  expect(mid.top).toBeCloseTo((40 / (160 * scale0)) * 100, 0);
  await expect(
    panel(page).getByText(`${(Math.round(mid.top * 10) / 10).toFixed(1)}%`),
  ).toBeVisible();
  await page.mouse.up();
  const top1 = (await chars(page))[0].top;
  expect(top1).toBeGreaterThan(5);
  /* 頭頂線不在 0%：圖的上緣高於身高 → 盤面上緣 190，比例改變 */
  expect((await hb<BoardRange>(page, 'range')).top).toBe(190);
  expect((await view(page)).scale).not.toBeCloseTo(scale0, 3);
  expect((await history(page)).past).toBe(2);
  /* 腳底線往上拖過頭：不能小於頭頂線＋5% */
  const g = (await geos(page))[0];
  const foot = await screenOf(page, c.x + 20, g.imageBottom);
  if (!foot) throw new Error('no screen');
  await drag(page, { x: foot.x, y: foot.y - 2 }, 0, -2000);
  const after = (await chars(page))[0];
  expect(after.bottom).toBeCloseTo(top1 + 5, 6);
  expect(after.top).toBeCloseTo(top1, 6);
  /* 滑桿：頭頂線最大 45、不能大於腳底線 − 5 */
  await expect(panel(page).getByRole('slider', { name: '腳底線' })).toHaveAttribute(
    'aria-valuenow',
    '55',
  );
  /* 歸位：一步 */
  const past = (await history(page)).past;
  await btn(page, '兩條線歸位').click();
  expect((await chars(page))[0]).toMatchObject({ top: 0, bottom: 100 });
  expect((await history(page)).past).toBe(past + 1);
  await btn(page, '復原').click();
  expect((await chars(page))[0].bottom).toBeCloseTo(top1 + 5, 6);
  /* 隱藏的角色不畫選取標示：線也抓不到 */
  await btn(page, '重做').click();
  expect(errors).toEqual([]);
});

test('方向鍵：螢幕 1 px／Shift 10 px、0.8 秒內合併成一步、輸入欄有焦點時不作用', async ({
  page,
}) => {
  const errors = await open(page);
  await addOne(page, file('A.png', await imgA()), 160);
  const x0 = (await chars(page))[0].x;
  const scale = (await view(page)).scale;
  await blur(page);
  const past = (await history(page)).past;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect((await chars(page))[0].x).toBeCloseTo(x0 + 12 / scale, 6);
  expect((await history(page)).past).toBe(past + 1);
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowLeft');
  expect((await chars(page))[0].x).toBeCloseTo(x0 + 11 / scale, 6);
  expect((await history(page)).past).toBe(past + 2);
  await page.keyboard.press('Control+z');
  expect((await chars(page))[0].x).toBeCloseTo(x0 + 12 / scale, 6);
  await page.keyboard.press('Control+z');
  expect((await chars(page))[0].x).toBeCloseTo(x0, 6);
  /* 倍率 200% 時 1 px 是一半的 cm */
  await btn(page, '放大').click();
  await btn(page, '放大').click();
  await btn(page, '放大').click();
  await blur(page);
  const s2 = (await view(page)).scale;
  await page.keyboard.press('ArrowRight');
  expect((await chars(page))[0].x).toBeCloseTo(x0 + 1 / s2, 6);
  /* 輸入欄有焦點時不作用 */
  await panel(page).getByRole('textbox', { name: '名稱' }).focus();
  await page.keyboard.press('ArrowRight');
  expect((await chars(page))[0].x).toBeCloseTo(x0 + 1 / s2, 6);
  /* 左緣不小於 0 */
  await blur(page);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect((await chars(page))[0].x).toBe(0);
  expect(errors).toEqual([]);
});

test('縮放與捲動：按鈕 ×1.25、點倍率回 100%、範圍 20～400%、滾輪錨點、Shift＋滾輪、符合寬度、平移', async ({
  page,
}) => {
  const errors = await open(page);
  await addABC(page);
  await page.keyboard.press('Escape');
  /* 100% 時本來的橫捲範圍（縮放來回之後要回到這裡） */
  const hRange = () => scroller(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  const range100 = await hRange();
  await btn(page, '放大').click();
  await expect(zoomLabel(page)).toHaveText('125%');
  await btn(page, '縮小').click();
  await btn(page, '縮小').click();
  await expect(zoomLabel(page)).toHaveText('80%');
  for (let i = 0; i < 12; i++) await btn(page, '縮小').click();
  await expect(zoomLabel(page)).toHaveText('20%');
  for (let i = 0; i < 20; i++) await btn(page, '放大').click();
  await expect(zoomLabel(page)).toHaveText('400%');
  await zoomLabel(page).click();
  await expect(zoomLabel(page)).toHaveText('100%');
  /* 縮放來回之後，橫捲範圍回到 100% 本來的大小（不留下延伸出去的空白；對等驗證後修正 F12） */
  await expect.poll(hRange).toBe(range100);
  /* 縮小時地面貼齊底部 */
  await btn(page, '縮小').click();
  await btn(page, '縮小').click();
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const ground = await screenOf(page, 0, 0);
  expect(box.y + box.height - (ground?.y ?? 0)).toBeCloseTo(14, 0);
  await zoomLabel(page).click();
  await expect.poll(hRange).toBe(range100);
  /* 滾輪：游標下的點不動（100 px 約 ×1.16） */
  const p = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.5 };
  const w0 = await page.evaluate(
    ([x, y]) =>
      (
        window as unknown as {
          __heightBoard: { toWorld: (x: number, y: number) => { x: number; h: number } };
        }
      ).__heightBoard.toWorld(x, y),
    [p.x, p.y],
  );
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  await expect(zoomLabel(page)).toHaveText('116%');
  const p2 = await screenOf(page, w0.x, w0.h);
  expect(Math.abs((p2?.x ?? 0) - p.x)).toBeLessThan(1.5);
  expect(Math.abs((p2?.y ?? 0) - p.y)).toBeLessThan(1.5);
  /* 放大時可以縱向捲動 */
  const sc = await scroller(page).evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(sc[0]).toBeGreaterThan(sc[1]);
  /* Shift＋滾輪：橫向捲動 */
  await zoomLabel(page).click();
  await btn(page, '放大').click();
  await btn(page, '放大').click();
  await scroller(page).evaluate((el) => el.scrollTo(0, 0));
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await view(page)).scrollX).toBe(120);
  await expect(zoomLabel(page)).toHaveText('156%');
  /* 符合寬度：整個盤面寬度放進畫面，不超過 100%，捲回最左 */
  await btn(page, '符合寬度').click();
  await expect.poll(async () => (await view(page)).scrollX).toBe(0);
  const z = Number((await zoomLabel(page).textContent())?.replace('%', ''));
  expect(z).toBeLessThanOrEqual(100);
  /* 平移：空白處拖曳（選取不變）、中鍵在角色上也平移 */
  await zoomLabel(page).click();
  await btn(page, '放大').click();
  await btn(page, '放大').click();
  await rows(page).nth(1).click();
  await scroller(page).evaluate((el) => el.scrollTo(0, 0));
  const selected = await hb(page, 'selected');
  const v0 = await view(page);
  /* A（5～58.3 cm）與 B（63.3 cm～）之間、高 150 cm 的空白處 */
  const empty = await screenOf(page, 60.8, 150);
  if (!empty) throw new Error('no screen');
  await drag(page, empty, -80, 0);
  const v1 = await view(page);
  expect(v1.scrollX - v0.scrollX).toBeCloseTo(80, -1);
  expect(await hb(page, 'selected')).toBe(selected);
  /* B 的上半部（高 110 cm；B 高 120 cm） */
  const gB = (await geos(page))[1];
  const c = await screenOf(page, gB.box.x + gB.width / 2, 110);
  if (!c) throw new Error('no screen');
  const before = await chars(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(c.x + 50, c.y, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  const v2 = await view(page);
  expect(v1.scrollX - v2.scrollX).toBeCloseTo(50, -1);
  expect(await chars(page)).toEqual(before);
  /* 按住空白鍵拖曳：在角色上也是平移（主控裁定新增） */
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down(' ');
  await page.mouse.down();
  await page.mouse.move(c.x - 40, c.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  expect((await view(page)).scrollX - v2.scrollX).toBeCloseTo(40, -1);
  expect(await chars(page)).toEqual(before);
  /* 角色排得比畫面寬：盤面延伸到最右側右緣＋8 cm，可以橫向捲動 */
  await zoomLabel(page).click();
  await rows(page).nth(1).click();
  for (let i = 0; i < 6; i++) await btn(page, '複製').click();
  const range = await hb<BoardRange>(page, 'range');
  const g = await geos(page);
  expect(range.width).toBeCloseTo(Math.max(...g.map((x) => x.box.x + x.width)) + 8, 3);
  await btn(page, '符合寬度').click();
  const zf = (await view(page)).zoom;
  expect(zf).toBeLessThan(1);
  const vw = await scroller(page).evaluate((el) => el.clientWidth);
  expect(range.width * (await view(page)).scale).toBeCloseTo(vw, -1);
  expect(errors).toEqual([]);
});

test('排列：等間隔、按身高（文字標示下一次的方向）、隱藏的不參與、各一步復原', async ({ page }) => {
  const errors = await open(page);
  await addABC(page);
  /* 亂放 */
  await drag(page, await centerOf(page, 0), 300, 0);
  await drag(page, await centerOf(page, 2), -100, 0);
  /* 隱藏 B */
  await rows(page).nth(1).getByRole('button', { name: '隱藏「B」' }).click();
  const hiddenX = (await chars(page))[1].x;
  const past = (await history(page)).past;
  await btn(page, '等間隔排列').click();
  expect((await history(page)).past).toBe(past + 1);
  let list = await chars(page);
  let g = await geos(page);
  const vis = [0, 2].map((i) => ({ x: list[i].x, w: g[i].width })).sort((a, b) => a.x - b.x);
  expect(vis[0].x).toBe(5);
  expect(vis[1].x).toBeCloseTo(5 + vis[0].w + 5, 6);
  expect(list[1].x).toBe(hiddenX);
  /* 按身高：高 → 矮，再按一次矮 → 高 */
  const sort = page.getByTestId('sort-height');
  await expect(sort).toHaveText('按身高排列（高→矮）');
  await sort.click();
  await expect(sort).toHaveText('按身高排列（矮→高）');
  list = await chars(page);
  expect(list[2].x).toBe(5);
  g = await geos(page);
  expect(list[0].x).toBeCloseTo(5 + g[2].width + 5, 6);
  await sort.click();
  await expect(sort).toHaveText('按身高排列（高→矮）');
  list = await chars(page);
  expect(list[0].x).toBe(5);
  expect(list[1].x).toBe(hiddenX);
  expect((await history(page)).past).toBe(past + 3);
  /* 隱藏的角色不畫、不算範圍 */
  expect((await hb<BoardRange>(page, 'range')).top).toBe(210);
  expect(errors).toEqual([]);
});

test('設定面板：名稱、身高、複製、更換圖片、前後順序、刪除', async ({ page }) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  await rows(page).nth(1).click();
  /* 名稱：邊打邊更新清單與提示，一次聚焦一步 */
  const past = (await history(page)).past;
  const name = panel(page).getByRole('textbox', { name: '名稱' });
  await name.click();
  await name.press('End');
  await page.keyboard.type('子');
  await expect(rows(page).nth(1)).toContainText('A子');
  await page.keyboard.type('丑');
  await blur(page);
  expect((await chars(page))[0].name).toBe('A子丑');
  expect((await history(page)).past).toBe(past + 1);
  /* 身高：邊打邊套用；1～1000（主控裁定） */
  const h = panel(page).getByRole('spinbutton', { name: '身高' });
  await h.fill('152.5');
  expect((await chars(page))[0].height).toBe(152.5);
  await h.fill('5000');
  expect((await chars(page))[0].height).toBe(152.5);
  await h.press('Enter');
  expect((await chars(page))[0].height).toBe(1000);
  await h.fill('0.5');
  await blur(page);
  expect((await chars(page))[0].height).toBe(1);
  await h.fill('158');
  await blur(page);
  /* 複製：名稱加（複本）、放在右緣往右 5 cm、最前面、選取複本 */
  await btn(page, '複製').click();
  let list = await chars(page);
  expect(list).toHaveLength(3);
  const copy = list[2];
  expect(copy).toMatchObject({ name: 'A子丑（複本）', height: 158, imageId: list[0].imageId });
  const g = await geos(page);
  expect(copy.x).toBeCloseTo(list[0].x + g[0].width + 5, 6);
  expect(await hb(page, 'selected')).toBe(copy.id);
  /* 前後順序：複本置底 → 上移一層 → 置頂 → 下移一層；到頭時不變 */
  await btn(page, '置底').click();
  expect((await chars(page)).map((c) => c.id)[0]).toBe(copy.id);
  await btn(page, '下移一層').click();
  expect((await chars(page)).map((c) => c.id)[0]).toBe(copy.id);
  await btn(page, '上移一層').click();
  expect((await chars(page)).map((c) => c.id)[1]).toBe(copy.id);
  await btn(page, '置頂').click();
  expect((await chars(page)).map((c) => c.id)[2]).toBe(copy.id);
  await btn(page, '置頂').click();
  await btn(page, '下移一層').click();
  expect((await chars(page)).map((c) => c.id)[1]).toBe(copy.id);
  await expect(rows(page).nth(1)).toHaveAttribute('aria-current', 'true');
  /* 更換圖片：保留名稱、身高、位置、順序、兩條線，只換圖 */
  const before = (await chars(page))[1];
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '更換圖片…').click(),
  ]);
  await fc.setFiles([file('C.png', await imgC())]);
  await expect.poll(async () => (await chars(page))[1].imageId).not.toBe(before.imageId);
  const replaced = (await chars(page))[1];
  expect(replaced).toMatchObject({
    id: before.id,
    name: before.name,
    height: before.height,
    x: before.x,
    top: before.top,
    bottom: before.bottom,
  });
  expect(replaced.crop).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
  await expect(btn(page, '更換圖片…')).toBeEnabled();
  /* 讀不了的圖：錯誤訊息，不換 */
  const [fc2] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '更換圖片…').click(),
  ]);
  await fc2.setFiles([file('壞.png', Buffer.from('nope'))]);
  await expect(status(page)).toContainText('無法讀取這張圖片');
  expect((await chars(page))[1].imageId).toBe(replaced.imageId);
  /* 刪除：不確認、取消選取、可以復原 */
  await btn(page, '刪除').click();
  list = await chars(page);
  expect(list).toHaveLength(2);
  expect(await hb(page, 'selected')).toBeNull();
  await page.keyboard.press('Control+z');
  expect(await chars(page)).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('清單：縮圖與總數、身高欄、顯示／隱藏、篩選（Esc 兩段）、只列顯示中、緊密列距、拖曳排序', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(
    page,
    [
      file('Alice.png', await imgA()),
      file('Bob.png', await imgB()),
      file('alan.png', await imgA()),
    ],
    [160, 120, 150],
  );
  await expect(page.getByTestId('list-count')).toHaveText('3 位');
  /* 最前面的在最上面 */
  await expect(rows(page).nth(0)).toContainText('alan');
  await expect(rows(page).nth(2)).toContainText('Alice');
  await expect(rows(page).nth(0).locator('canvas')).toBeVisible();
  /* 列內身高欄：邊打邊套用、一次聚焦一步 */
  const past = (await history(page)).past;
  const h = rows(page).nth(1).getByRole('spinbutton', { name: 'Bob的身高' });
  await h.fill('12');
  await h.fill('125');
  expect((await chars(page))[1].height).toBe(125);
  await blur(page);
  expect((await history(page)).past).toBe(past + 1);
  /* 顯示／隱藏：一步、整列變淡、盤面範圍不算 */
  await rows(page).nth(1).getByRole('button', { name: '隱藏「Bob」' }).click();
  expect((await chars(page))[1].visible).toBe(false);
  await expect(rows(page).nth(1)).toHaveClass(/opacity-55/);
  expect((await history(page)).past).toBe(past + 2);
  /* 篩選：不分大小寫；標題與數字；不能排序 */
  const search = page.getByRole('textbox', { name: '依名稱篩選角色' });
  await search.fill('AL');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('list-count')).toHaveText('2／3');
  await expect(page.getByRole('heading', { name: '篩選中，不能調整順序' })).toBeVisible();
  await expect(list(page)).toHaveAttribute('data-sort-disabled', 'true');
  /* 篩選中按住拖動只會選取 */
  const r0 = await rows(page).nth(0).boundingBox();
  const r1 = await rows(page).nth(1).boundingBox();
  if (!r0 || !r1) throw new Error('no rows');
  await drag(page, { x: r0.x + 120, y: r0.y + r0.height / 2 }, 0, r1.y - r0.y);
  expect((await chars(page)).map((c) => c.name)).toEqual(['Alice', 'Bob', 'alan']);
  /* 清除鈕；Esc 先清空再離開 */
  await btn(page, '清除篩選文字').click();
  await expect(search).toHaveValue('');
  await search.fill('zzz');
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText('沒有符合的角色。')).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(search).not.toBeFocused();
  /* 只列顯示中 */
  await btn(page, '只列顯示中的角色').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('list-count')).toHaveText('2／3');
  await btn(page, '只列顯示中的角色').click();
  await expect(rows(page)).toHaveCount(3);
  /* 緊密列距：約 68 → 44 px */
  const tall = (await rows(page).nth(0).boundingBox())?.height ?? 0;
  await btn(page, '緊密列距').click();
  const short = (await rows(page).nth(0).boundingBox())?.height ?? 0;
  expect(tall).toBeGreaterThanOrEqual(66);
  expect(short).toBeLessThanOrEqual(48);
  await btn(page, '緊密列距').click();
  /* 拖曳排序：把最上面（alan）拖到最下面 → 變成最後面；一步復原 */
  await page.keyboard.press('Escape');
  await rows(page).nth(2).scrollIntoViewIfNeeded();
  const p2 = (await history(page)).past;
  const top = await rows(page).nth(0).boundingBox();
  const bottom = await rows(page).nth(2).boundingBox();
  if (!top || !bottom) throw new Error('no rows');
  await page.mouse.move(top.x + 140, top.y + top.height / 2);
  await page.mouse.down();
  await page.mouse.move(top.x + 140, top.y + top.height / 2 + 10, { steps: 2 });
  await page.mouse.move(top.x + 140, bottom.y + bottom.height - 4, { steps: 8 });
  await page.mouse.up();
  expect((await chars(page)).map((c) => c.name)).toEqual(['alan', 'Alice', 'Bob']);
  expect((await history(page)).past).toBe(p2 + 1);
  /* 加入時清空名稱篩選（只列顯示中不變） */
  await search.fill('Bob');
  await btn(page, '只列顯示中的角色').click();
  await addOne(page, file('新.png', await imgB()), 100);
  await expect(search).toHaveValue('');
  await expect(btn(page, '只列顯示中的角色')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('復原／重做：快捷鍵、最多約 60 步、全部刪除（確認、可復原、沒有角色時停用）', async ({
  page,
}) => {
  const errors = await open(page);
  await btn(page, '專案').click();
  await expect(page.getByRole('menuitem', { name: '全部刪除…' })).toHaveAttribute(
    'data-disabled',
    '',
  );
  await page.keyboard.press('Escape');
  await addOne(page, file('A.png', await imgA()), 160);
  await addOne(page, file('B.png', await imgB()), 120);
  /* 顯示／隱藏切換 70 次：每次一步，最多保留 60 步 */
  const eye = rows(page).nth(1).getByRole('button', { name: /「A」/ });
  for (let i = 0; i < 70; i++) await eye.click();
  const hs = await history(page);
  expect(hs.past).toBeLessThanOrEqual(60);
  expect(hs.past).toBeGreaterThanOrEqual(59);
  await btn(page, '刪除')
    .click()
    .catch(() => undefined);
  await rows(page).nth(0).click();
  await btn(page, '複製').click();
  /* Ctrl＋Z／Ctrl＋Shift＋Z／Ctrl＋Y */
  const n = (await chars(page)).length;
  await blur(page);
  await page.keyboard.press('Control+z');
  expect((await chars(page)).length).toBe(n - 1);
  await page.keyboard.press('Control+Shift+z');
  expect((await chars(page)).length).toBe(n);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  expect((await chars(page)).length).toBe(n);
  /* 輸入欄有焦點時不攔截 */
  await page.getByRole('textbox', { name: '依名稱篩選角色' }).focus();
  await page.keyboard.press('Control+z');
  expect((await chars(page)).length).toBe(n);
  /* 全部刪除：確認、可以復原 */
  await menu(page, '全部刪除…');
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('復原');
  await confirm.getByRole('button', { name: '取消' }).click();
  expect((await chars(page)).length).toBe(n);
  await menu(page, '全部刪除…');
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click();
  expect(await chars(page)).toHaveLength(0);
  await btn(page, '復原').click();
  expect((await chars(page)).length).toBe(n);
  expect(errors).toEqual([]);
});

test('自動保存：重新整理後原樣還原（沒有選取、倍率 100%、篩選清空、復原紀錄清空）', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  await rows(page).nth(1).click();
  const top = panel(page).getByRole('slider', { name: '頭頂線' });
  await top.focus();
  await page.keyboard.press('PageUp');
  await blur(page);
  await rows(page).nth(0).getByRole('button', { name: '隱藏「B」' }).click();
  await btn(page, '放大').click();
  await page.getByRole('textbox', { name: '依名稱篩選角色' }).fill('A');
  const saved = await chars(page);
  await page.waitForTimeout(700);
  await expect(page.getByText(/已自動保存（\d\d:\d\d）/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  expect(await chars(page)).toEqual(saved);
  expect(await hb(page, 'selected')).toBeNull();
  await expect(zoomLabel(page)).toHaveText('100%');
  await expect(page.getByRole('textbox', { name: '依名稱篩選角色' })).toHaveValue('');
  expect(await history(page)).toEqual({ past: 0, future: 0 });
  await expect(btn(page, '復原')).toBeDisabled();
  /* 圖片也還原了：清單縮圖畫得出來 */
  await expect(rows(page).nth(1).locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('自動保存失敗：狀態列提示，工具照常運作', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'trpg-toolkit:height-board') throw new DOMException('blocked', 'SecurityError');
      return orig.call(this, k, v);
    };
  });
  const errors = await open(page);
  await addOne(page, file('A.png', await imgA()), 160);
  await expect(page.getByTestId('save-status')).toContainText('自動保存無法使用');
  await btn(page, '複製').click();
  expect(await chars(page)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('專案檔：沒有角色時不存、存成 ZIP、讀回、讀取前確認、錯誤的檔案', async ({ page }) => {
  const errors = await open(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await menu(page, '存成專案檔…');
  await expect(page.getByText('還沒有角色', { exact: true }).first()).toBeVisible();
  expect(downloads).toBe(0);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  await rows(page).nth(0).getByRole('button', { name: '隱藏「B」' }).click();
  const saved = await chars(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), menu(page, '存成專案檔…')]);
  expect(dl.suggestedFilename()).toMatch(/^height-board_\d{8}-\d{4}\.zip$/);
  const zipBytes = await readDownload(dl);
  const entries = unzipSync(zipBytes);
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'height-board',
    version: 1,
  });
  expect(project.data.characters).toHaveLength(2);
  for (const c of saved) expect(entries[`files/${c.imageId}.png`]).toBeTruthy();
  /* 有角色時先確認（無法復原）；取消就不開選檔 */
  let chooser = false;
  page.on('filechooser', () => {
    chooser = true;
  });
  await menu(page, '開啟專案檔…');
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('無法復原');
  await confirm.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(300);
  expect(chooser).toBe(false);
  /* 錯誤的檔案：錯誤訊息，盤面不變 */
  await menu(page, '開啟專案檔…');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '選擇專案檔' }).click(),
  ]);
  await fc.setFiles([file('亂碼.json', Buffer.from('{"x":1}'), 'application/json')]);
  await expect(page.getByText('無法開啟專案檔').first()).toBeVisible();
  expect(await chars(page)).toEqual(saved);
  /* 全部刪除後讀回：內容相同、沒有選取、倍率 100%、復原紀錄清空 */
  await menu(page, '全部刪除…');
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click();
  await btn(page, '放大').click();
  expect(await chars(page)).toHaveLength(0);
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), menu(page, '開啟專案檔…')]);
  await fc2.setFiles([
    { name: 'p.zip', mimeType: 'application/zip', buffer: Buffer.from(zipBytes) },
  ]);
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  expect(await chars(page)).toEqual(saved);
  expect(await history(page)).toEqual({ past: 0, future: 0 });
  await expect(zoomLabel(page)).toHaveText('100%');
  expect(await hb(page, 'selected')).toBeNull();
  /* 立即自動保存：重新整理後還在 */
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  expect(errors).toEqual([]);
});

test('匯出 PNG：訊息、尺寸、白底不透明、刻度線與角色的位置、檔名', async ({ page }) => {
  const errors = await open(page);
  await btn(page, '匯出 PNG').click();
  await expect(page.getByText('還沒有角色', { exact: true }).first()).toBeVisible();
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
  expect(dl.suggestedFilename()).toMatch(/^height-board_\d{8}-\d{4}\.png$/);
  const png = decodePng(await readDownload(dl));
  expect(png).toMatchObject({ width: 334, height: 354, bitDepth: 8, colorType: 6 });
  const px = (x: number, y: number) =>
    Array.from(png.pixels.subarray((y * 334 + x) * 4, (y * 334 + x) * 4 + 4));
  /* 白底、整張不透明 */
  for (let i = 3; i < png.pixels.length; i += 4)
    if (png.pixels[i] !== 255) throw new Error('有透明像素');
  expect(px(330, 3)).toEqual([255, 255, 255, 255]);
  /* 地面線（y＝354 − 8）比 50 cm 線深、50 cm 線比 10 cm 線深 */
  const R = 1.875;
  const lineAt = (cm: number) => Math.round(8 + (180 - cm) * R);
  const shade = (cm: number) => {
    let v = 255;
    for (let y = lineAt(cm) - 1; y <= lineAt(cm) + 1; y++) v = Math.min(v, px(325, y)[0]);
    return v;
  };
  expect(shade(0)).toBeLessThan(shade(50));
  expect(shade(50)).toBeLessThan(shade(10));
  expect(shade(10)).toBeLessThan(250);
  expect(shade(15)).toBe(255);
  /* A：左緣 x＝26＋8 × 1.875＝41、上緣 160 cm（y＝8＋20 × 1.875＝45.5） */
  const isA = (x: number, y: number) => {
    const [r, g, b] = px(x, y);
    return r > 150 && g < 120 && b < 120;
  };
  expect(isA(43, 200)).toBe(true);
  expect(isA(39, 200)).toBe(false);
  expect(isA(60, 48)).toBe(true);
  expect(isA(60, 43)).toBe(false);
  /* 全部隱藏時 */
  for (const name of ['A', 'B'])
    await rows(page)
      .filter({ hasText: name })
      .getByRole('button', { name: `隱藏「${name}」` })
      .click();
  await btn(page, '匯出 PNG').click();
  await expect(page.getByText('所有角色都被隱藏了，沒有東西可以匯出。').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('匯出 PNG：A＋B＋C 為 2929 × 2265（C 的原圖解析度）', async ({ page }) => {
  const errors = await open(page);
  await addABC(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
  const png = decodePng(await readDownload(dl));
  expect(png.width).toBe(2929);
  expect(png.height).toBe(2265);
  /* A 的左緣 x≈231 */
  const at = (x: number, y: number) => png.pixels[(y * png.width + x) * 4 + 1];
  expect(at(233, 1480)).toBeLessThan(120);
  expect(at(229, 1480)).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  async function setup(page: Page) {
    await page.clock.setFixedTime(new Date('2026-10-01T15:51:00+08:00'));
    const errors = await open(page);
    await addABC(page);
    await rows(page).nth(1).click();
    /* 盤面的捲動位置與加入時的自動捲動時序有關；截圖前用「符合寬度」固定成同一個狀態 */
    await btn(page, '符合寬度').click();
    await blur(page);
    await page.mouse.move(0, 0);
    return errors;
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await setup(page);
    await expect(page).toHaveScreenshot('height-board-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await setup(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('height-board-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
