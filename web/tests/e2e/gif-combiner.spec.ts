/**
 * GIF 接合器（建置產物 tools/gif-combiner/）的端對端測試：
 * - 開頁：沒有 console error、空白提示（F41）。
 * - 加入：選檔、讀檔失敗、新動圖在正中央、自動總長、清單資訊、刪除（F01～F09、F05、F48）。
 * - 預覽就是輸出畫面：背景色、依影格率取格、透明背景（F11、F41、F42、3.1）。
 * - 拖曳與吸附、點選移到最上層、調整大小與吸附、最小 20、復原／重做、Delete、畫布上的刪除鈕（F12～F16、F46、F47）。
 * - 上下移與疊放順序、格線排列（排列、正方格、去掉留白）（F07、F21～F23）。
 * - 匯出 GIF 並解析：尺寸與倍率、延遲（累計換算）、每個時間點的畫面、無限循環、檔名；透明背景；APNG；
 *   沒有動圖時的訊息（F25～F33、F42～F44、3.1～3.4）。
 * - 自動保存（重新整理後還原）、專案檔（存成 ZIP、重設、開啟）（F45）。
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { type GifInfo, parseGif } from '../helpers/gif';
import { writeGif } from '../helpers/gifWriter';
import { composeApng, parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('gif-combiner') ?? { id: 'gif-combiner', status: 'next' })}/`;

/* ---------- 測試用的 GIF（自己寫的產生器，不依賴被測的編解碼器） ---------- */

const PAL = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255, 255, 0];
const RGB = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  white: [255, 255, 255],
  black: [0, 0, 0],
  yellow: [255, 255, 0],
};
const solid = (w: number, h: number, colors: number[], delays: (number | null)[]) =>
  Buffer.from(
    writeGif({
      width: w,
      height: h,
      palette: PAL,
      loop: 0,
      frames: colors.map((c, i) => ({
        indices: new Uint8Array(w * h).fill(c),
        delayCs: delays[i],
      })),
    }),
  );
/** A：120 × 80，紅／藍／黃 100／200／300 ms */
const GIF_A = {
  name: 'a.gif',
  mimeType: 'image/gif',
  buffer: solid(120, 80, [0, 2, 5], [10, 20, 30]),
};
/** B：64 × 96，白／黑 各 500 ms */
const GIF_B = { name: 'b.gif', mimeType: 'image/gif', buffer: solid(64, 96, [3, 4], [50, 50]) };
/** C：50 × 200，藍一格（延遲 0 → 100 ms） */
const GIF_C = { name: 'c.gif', mimeType: 'image/gif', buffer: solid(50, 200, [2], [0]) };
const BROKEN = { name: 'broken.gif', mimeType: 'image/gif', buffer: Buffer.from('not a gif') };

/* ---------- 共用 ---------- */

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
  await expect(page.getByRole('heading', { level: 1, name: 'GIF 接合器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __gifCombiner?: unknown }).__gifCombiner,
  );
  return errors;
}

interface Item {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  ow: number;
  oh: number;
  totalMs: number;
  frames: number;
}
interface Data {
  canvas: { width: number; height: number };
  grid: { cols: number; rows: number };
  durationMs: number;
  fps: number;
  scale: number;
  items: Item[];
}

const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const gc = (window as any).__gifCombiner;
      return new Function('gc', 'arg', `return (${f})(gc, arg)`)(gc, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;

const data = (page: Page) => hook<Data>(page, '(gc) => gc.data()');
const box = (it: Item) => [it.x, it.y, it.width, it.height];

async function addFiles(page: Page, files: (typeof GIF_A)[], expected: number) {
  await page
    .getByRole('group', { name: '把 GIF 拖到這裡' })
    .locator('input[type="file"]')
    .setInputFiles(files);
  await expect.poll(async () => (await data(page)).items.length).toBe(expected);
  await expect(page.getByTestId('loading')).toHaveCount(0);
}

/** 預覽畫布上一點的顏色（畫布座標） */
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="gc-canvas"]');
      const d = c?.getContext('2d')?.getImageData(px, py, 1, 1).data;
      return d ? Array.from(d) : null;
    },
    [x, y],
  );

/** 停在 t 秒 */
async function pauseAt(page: Page, t: number) {
  await hook(page, '(gc, t) => gc.pauseAt(t)', t);
  await expect.poll(() => hook<number>(page, '(gc) => gc.time')).toBeCloseTo(t, 5);
}

/** 畫布座標 → 螢幕座標 */
async function toScreen(page: Page, x: number, y: number) {
  const r = await page.getByTestId('gc-canvas').boundingBox();
  const w = (await data(page)).canvas.width;
  if (!r) throw new Error('沒有預覽畫布');
  const k = r.width / w;
  return { x: r.x + x * k, y: r.y + y * k, k };
}

/** 在畫布座標 (x, y) 按下，拖曳畫布座標的 (dx, dy) */
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + (dx * p.k) / 2, p.y + (dy * p.k) / 2, { steps: 3 });
  await page.mouse.move(p.x + dx * p.k, p.y + dy * p.k, { steps: 3 });
  await page.mouse.up();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function exportAs(page: Page, format: 'GIF' | 'APNG' | 'WebP') {
  await page.getByRole('radio', { name: format, exact: true }).click();
  await page.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path()) as string)),
  };
}

/** GIF 逐格合成成完整畫面（處理透明色與三種處置方式），附每格開始的時間（1/100 秒） */
function composeGif(info: GifInfo): { rgba: Uint8Array; startCs: number; delayCs: number }[] {
  const W = info.width;
  const H = info.height;
  const canvas = new Uint8Array(W * H * 4);
  const out: { rgba: Uint8Array; startCs: number; delayCs: number }[] = [];
  let t = 0;
  for (const f of info.frames) {
    const saved = f.disposal === 3 ? canvas.slice() : null;
    const pal = f.localPalette ?? info.globalPalette;
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const k = f.indices[y * f.width + x];
        if (f.transparentIndex !== null && k === f.transparentIndex) continue;
        const d = ((f.y + y) * W + f.x + x) * 4;
        canvas.set([pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2], 255], d);
      }
    out.push({ rgba: canvas.slice(), startCs: t, delayCs: f.delayCs });
    t += f.delayCs;
    if (f.disposal === 2)
      for (let y = f.y; y < f.y + f.height; y++)
        canvas.fill(0, (y * W + f.x) * 4, (y * W + f.x + f.width) * 4);
    else if (saved) canvas.set(saved);
  }
  return out;
}

/** 合成後的動畫在 t（1/100 秒）時某一點的顏色 */
function colorAt(
  frames: ReturnType<typeof composeGif>,
  width: number,
  tCs: number,
  x: number,
  y: number,
) {
  const f = frames.findLast((fr) => fr.startCs <= tCs) ?? frames[0];
  const i = (y * width + x) * 4;
  return Array.from(f.rgba.slice(i, i + 4));
}

/* ---------- 測試 ---------- */

test('開頁與加入：讀檔失敗、正中央、自動總長、清單、刪除', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByText('把 GIF 拖進來開始')).toBeVisible();
  await expect(page.getByTestId('canvas-size')).toHaveText('800 × 600 px');
  await addFiles(page, [GIF_A, BROKEN, GIF_B], 2);
  await expect(page.getByText('處理這個檔案時出錯了：broken.gif', { exact: true })).toBeVisible();
  let d = await data(page);
  expect(d.items.map((it) => it.name)).toEqual(['a.gif', 'b.gif']);
  /* F04：原始大小、正中央、不取整；後加的在上層 */
  expect(box(d.items[0])).toEqual([340, 260, 120, 80]);
  expect(box(d.items[1])).toEqual([368, 252, 64, 96]);
  expect(d.items[1].z).toBeGreaterThan(d.items[0].z);
  expect(d.items[0]).toMatchObject({ totalMs: 600, frames: 3 });
  /* F09：總長＝最長那張 */
  expect(d.durationMs).toBe(1000);
  const list = page.getByRole('list', { name: '已加入的動圖' });
  await expect(list).toContainText('120 × 80 · 3 格 · 0.60 秒');
  await expect(list).toContainText('64 × 96 · 2 格 · 1.00 秒');
  await expect(page.getByText('把 GIF 拖進來開始')).toHaveCount(0);
  /* 奇數寬：.5 */
  await addFiles(page, [{ ...GIF_A, name: 'odd.gif', buffer: solid(101, 51, [0], [10]) }], 3);
  d = await data(page);
  expect(box(d.items[2])).toEqual([349.5, 274.5, 101, 51]);
  /* 刪除：總長改成剩下最長的；全部刪掉時不改 */
  await page.getByRole('button', { name: '刪除「b.gif」' }).click();
  await page.getByRole('button', { name: '刪除「odd.gif」' }).click();
  d = await data(page);
  expect(d.items.map((it) => it.name)).toEqual(['a.gif']);
  expect(d.durationMs).toBe(600);
  await page.getByRole('button', { name: '刪除「a.gif」' }).click();
  d = await data(page);
  expect(d.items).toHaveLength(0);
  expect(d.durationMs).toBe(600);
  await expect(page.getByText('還沒有加入動圖。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('貼上、拖放與其他格式（靜態 PNG 一格 100 ms）', async ({ page }) => {
  const errors = await open(page);
  /* 貼上（F39） */
  await page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'pasted.gif', { type: 'image/gif' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, Array.from(GIF_B.buffer));
  await expect
    .poll(async () => (await data(page)).items.map((it) => it.name))
    .toEqual(['pasted.gif']);
  /* 拖放到載入區 */
  const dt = await page.evaluateHandle((bytes) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array(bytes)], 'dropped.gif', { type: 'image/gif' }));
    return d;
  }, Array.from(GIF_C.buffer));
  const zone = page.getByRole('group', { name: '把 GIF 拖到這裡' });
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect.poll(async () => (await data(page)).items.length).toBe(2);
  /* 靜態 PNG（瀏覽器畫出來的）：一格、100 ms（F40） */
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 30;
    c.height = 20;
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 30, 20);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : [];
  });
  await addFiles(page, [{ name: 'still.png', mimeType: 'image/png', buffer: Buffer.from(png) }], 3);
  const d = await data(page);
  expect(d.items[2]).toMatchObject({ name: 'still.png', ow: 30, oh: 20, frames: 1, totalMs: 100 });
  expect(errors).toEqual([]);
});

test('預覽就是輸出畫面：背景色、依影格率取格、透明背景', async ({ page }) => {
  const errors = await open(page);
  await addFiles(page, [GIF_A], 1);
  const bg = [0, 255, 0, 255];
  /* 影格率 20（每 50 ms 一格）：0.15 秒 → 150 ms → 第 2 格（藍） */
  await pauseAt(page, 0.15);
  await expect.poll(() => pixel(page, 400, 300)).toEqual([...RGB.blue, 255]);
  expect(await pixel(page, 5, 5)).toEqual(bg);
  /* 0.099 秒仍在第 2 個取樣（50 ms）→ 紅；0.35 → 黃 */
  await pauseAt(page, 0.099);
  await expect.poll(() => pixel(page, 400, 300)).toEqual([...RGB.red, 255]);
  await pauseAt(page, 0.35);
  await expect.poll(() => pixel(page, 400, 300)).toEqual([...RGB.yellow, 255]);
  /* 背景色 */
  const hex = page.getByRole('textbox', { name: '背景色' });
  await hex.fill('#123456');
  await hex.press('Enter');
  await expect.poll(() => pixel(page, 5, 5)).toEqual([0x12, 0x34, 0x56, 255]);
  /* 透明背景 */
  await page.getByRole('switch', { name: '透明背景' }).click();
  await expect.poll(() => pixel(page, 5, 5)).toEqual([0, 0, 0, 0]);
  /* 播放列 */
  await expect(page.getByText('0.35／0.60 秒')).toBeVisible();
  expect(errors).toEqual([]);
});

test('拖曳與吸附、點選移到最上層、復原、調整大小、刪除', async ({ page }) => {
  const errors = await open(page);
  await addFiles(page, [GIF_A, GIF_B], 2);
  let d = await data(page);
  const [a, b] = d.items;
  expect(b.z).toBeGreaterThan(a.z);
  /* 在 A 露出來的地方（B 的左邊）按下、往左拖 330：x 10 → 吸到 0；上邊 260 吸到 B 的上邊 252 */
  await drag(page, 350, 300, -330, 0);
  d = await data(page);
  expect(box(d.items[0])).toEqual([0, 252, 120, 80]);
  /* 點到的移到最上層，清單順序不變 */
  expect(d.items[0].z).toBeGreaterThan(d.items[1].z);
  expect(d.items.map((it) => it.name)).toEqual(['a.gif', 'b.gif']);
  expect(await hook<{ selected: string }>(page, '(gc) => gc.ui()')).toMatchObject({
    selected: a.id,
  });
  /* 一次拖曳（含移到最上層）是一步復原 */
  await page.keyboard.press('Control+z');
  d = await data(page);
  expect(box(d.items[0])).toEqual([340, 260, 120, 80]);
  expect(d.items[0].z).toBeLessThan(d.items[1].z);
  await page.keyboard.press('Control+Shift+z');
  d = await data(page);
  expect(box(d.items[0])).toEqual([0, 252, 120, 80]);
  /* 左右沒有吸附：跟著滑鼠；上邊 352 離 B 的下邊 348 不到 15 → 348 */
  await drag(page, 60, 290, 100, 100);
  d = await data(page);
  expect(d.items[0].x).toBeCloseTo(100, 0);
  expect(d.items[0].y).toBe(348);
  /* 方向鍵 1 px、Shift 10 px */
  const x0 = d.items[0].x;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  d = await data(page);
  expect(d.items[0].x).toBeCloseTo(x0 + 1, 5);
  /* 調整大小：選 B，拖右下角：右邊吸到畫布右邊 800 */
  await drag(page, 400, 300, 0, 0);
  const handle = page.locator('[data-layout-handle="se"]');
  await expect(handle).toBeVisible();
  const hb = await handle.boundingBox();
  const p = await toScreen(page, 0, 0);
  if (!hb) throw new Error('沒有把手');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 200 * p.k, hb.y + hb.height / 2, { steps: 3 });
  await page.mouse.move(hb.x + hb.width / 2 + 380 * p.k, hb.y + hb.height / 2 + 30 * p.k, {
    steps: 3,
  });
  await page.mouse.up();
  d = await data(page);
  expect(d.items[1].x).toBe(368);
  expect(d.items[1].width).toBe(432);
  expect(d.items[1].height).toBeCloseTo(126, 0);
  /* 拉到很小：至少 20 × 20 */
  const hb2 = await handle.boundingBox();
  if (!hb2) throw new Error('沒有把手');
  await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb2.x - 600 * p.k, hb2.y - 300 * p.k, { steps: 4 });
  await page.mouse.up();
  d = await data(page);
  expect([d.items[1].width, d.items[1].height]).toEqual([20, 20]);
  /* Delete 刪掉選取的；畫布上的刪除鈕 */
  await page.keyboard.press('Delete');
  d = await data(page);
  expect(d.items.map((it) => it.name)).toEqual(['a.gif']);
  await drag(page, d.items[0].x + 20, d.items[0].y + 20, 0, 0);
  await page.getByTestId('item-remove').click();
  expect((await data(page)).items).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('清單上下移與疊放順序、格線排列', async ({ page }) => {
  const errors = await open(page);
  await addFiles(page, [GIF_A, GIF_B, GIF_C], 3);
  /* 點 A 移到最上層，再把 A 下移：清單 B、A、C，疊放照清單 */
  await drag(page, 345, 300, 0, 0);
  let d = await data(page);
  expect(d.items[0].z).toBe(Math.max(...d.items.map((it) => it.z)));
  await page.getByRole('button', { name: '下移：a.gif' }).click();
  d = await data(page);
  expect(d.items.map((it) => it.name)).toEqual(['b.gif', 'a.gif', 'c.gif']);
  expect(d.items.map((it) => it.z)).toEqual([1, 2, 3]);
  await expect(page.getByRole('button', { name: '上移：b.gif' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下移：c.gif' })).toBeDisabled();
  /* 排列（800 × 600、3 × 2） */
  await page.getByRole('button', { name: '排列', exact: true }).click();
  d = await data(page);
  expect(d.items.map(box)).toEqual([
    [33, 0, 200, 300],
    [267, 61, 267, 178],
    [629, 0, 75, 300],
  ]);
  /* 2 × 2 再排列 */
  const cols = page.getByRole('spinbutton', { name: '橫向格數' });
  await cols.fill('2');
  await cols.press('Enter');
  await page.getByRole('button', { name: '排列', exact: true }).click();
  d = await data(page);
  expect(d.items.map(box)).toEqual([
    [100, 0, 200, 300],
    [400, 17, 400, 267],
    [163, 300, 75, 300],
  ]);
  /* 正方格：2 × 2 → 500 × 500 */
  await page.getByRole('button', { name: '正方格' }).click();
  d = await data(page);
  expect(d.canvas).toEqual({ width: 500, height: 500 });
  expect(box(d.items[0])).toEqual([42, 0, 167, 250]);
  await expect(page.getByTestId('canvas-size')).toHaveText('500 × 500 px');
  /* 去掉留白：第一張（B 64 × 96）為一格 */
  await page.getByRole('button', { name: '去掉留白' }).click();
  d = await data(page);
  expect(d.canvas).toEqual({ width: 128, height: 192 });
  expect(d.items.map(box)).toEqual([
    [0, 0, 64, 96],
    [64, 0, 64, 96],
    [0, 96, 64, 96],
  ]);
  /* 復原一步回到正方格 */
  await page.keyboard.press('Control+z');
  expect((await data(page)).canvas).toEqual({ width: 500, height: 500 });
  expect(errors).toEqual([]);
});

test('匯出 GIF：尺寸、延遲、每個時間點的畫面、循環、檔名；倍率', async ({ page }) => {
  const errors = await open(page);
  await addFiles(page, [GIF_A, GIF_B], 2);
  await page.getByRole('button', { name: '排列', exact: true }).click();
  const d = await data(page);
  /* 影格率 30：每格 33 ms，總長 1000 → 31 格 */
  const fps = page.getByRole('spinbutton', { name: 'FPS' });
  await fps.fill('30');
  await fps.press('Enter');
  await expect(page.getByTestId('export-estimate')).toContainText('31 格');
  const out = await exportAs(page, 'GIF');
  expect(out.name).toBe('combined.gif');
  const info = parseGif(out.bytes);
  expect([info.width, info.height]).toEqual([800, 600]);
  expect(info.loopCount).toBe(0);
  /* 延遲以累計時間換算：31 × 33 ＝ 1023 ms → 102／100 秒 */
  expect(info.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(102);
  const frames = composeGif(info);
  /* 每個取樣：第 i 格（i × 33 ms 時）A、B 的顏色與 3.1 相同 */
  const a = d.items[0];
  const b = d.items[1];
  const ax = Math.round(a.x + a.width / 2);
  const ay = Math.round(a.y + a.height / 2);
  const bx = Math.round(b.x + b.width / 2);
  const by = Math.round(b.y + b.height / 2);
  const aColor = (ms: number) =>
    ms % 600 < 100 ? RGB.red : ms % 600 < 300 ? RGB.blue : RGB.yellow;
  const bColor = (ms: number) => (ms % 1000 < 500 ? RGB.white : RGB.black);
  for (let i = 0; i < 31; i++) {
    /* 第 i 格從 round(i × 3.3) 開始 */
    const tCs = Math.round((i * 33) / 10);
    expect(colorAt(frames, 800, tCs, ax, ay), `第 ${i} 格 A`).toEqual([...aColor(i * 33), 255]);
    expect(colorAt(frames, 800, tCs, bx, by), `第 ${i} 格 B`).toEqual([...bColor(i * 33), 255]);
    expect(colorAt(frames, 800, tCs, 2, 2)).toEqual([0, 255, 0, 255]);
  }
  /* 倍率 50%：400 × 300 */
  const scale = page.getByRole('spinbutton', { name: '輸出倍率' });
  await scale.fill('50');
  await scale.press('Enter');
  await expect(page.getByText('輸出 400 × 300 px')).toBeVisible();
  const half = parseGif((await exportAs(page, 'GIF')).bytes);
  expect([half.width, half.height]).toEqual([400, 300]);
  const hf = composeGif(half);
  expect(colorAt(hf, 400, 0, Math.round(ax / 2), Math.round(ay / 2))).toEqual([...RGB.red, 255]);
  expect(errors).toEqual([]);
});

test('匯出：透明背景的 GIF、APNG、沒有動圖時的訊息', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '匯出 GIF' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '匯出失敗' })).toContainText(
    '還沒有加入動圖',
  );
  await addFiles(page, [GIF_A], 1);
  await page.getByRole('switch', { name: '透明背景' }).click();
  const gif = parseGif((await exportAs(page, 'GIF')).bytes);
  const gf = composeGif(gif);
  expect(colorAt(gf, 800, 0, 2, 2)).toEqual([0, 0, 0, 0]);
  expect(colorAt(gf, 800, 0, 400, 300)).toEqual([...RGB.red, 255]);
  /* APNG：每格 50 ms、總長 600 ms、無限循環 */
  const apng = await exportAs(page, 'APNG');
  expect(apng.name).toBe('combined.png');
  const info = parseApng(apng.bytes);
  expect([info.ihdr.width, info.ihdr.height]).toEqual([800, 600]);
  expect(info.numPlays).toBe(0);
  const delays = info.frames.map((f) => (f.delayNum / (f.delayDen || 100)) * 1000);
  expect(delays.reduce((s, v) => s + v, 0)).toBeCloseTo(600, 5);
  const composed = composeApng(info);
  const at = (rgba: Uint8Array, x: number, y: number) =>
    Array.from(rgba.slice((y * 800 + x) * 4, (y * 800 + x) * 4 + 4));
  expect(at(composed[0], 2, 2)).toEqual([0, 0, 0, 0]);
  expect(at(composed[0], 400, 300)).toEqual([...RGB.red, 255]);
  expect(at(composed[composed.length - 1], 400, 300)).toEqual([...RGB.yellow, 255]);
  expect(errors).toEqual([]);
});

test('設定寫不進瀏覽器時提醒、工具照常可用（F45）', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.includes('gif-combiner')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await open(page);
  await addFiles(page, [GIF_A], 1);
  await expect(page.getByText(/排版與設定沒辦法保存在這個瀏覽器/).first()).toBeVisible();
  expect((await data(page)).items).toHaveLength(1);
});

test('自動保存與專案檔', async ({ page }) => {
  const errors = await open(page);
  await addFiles(page, [GIF_A, GIF_B], 2);
  await drag(page, 350, 300, -330, 0);
  const before = await data(page);
  await expect(page.getByText(/已自動儲存/)).toBeVisible();
  /* 重新整理：清單、位置、動圖都還在 */
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __gifCombiner?: unknown }).__gifCombiner,
  );
  await expect.poll(async () => (await data(page)).items.map(box)).toEqual(before.items.map(box));
  await pauseAt(page, 0);
  await expect.poll(() => pixel(page, 60, 290)).toEqual([...RGB.red, 255]);
  /* 存成專案檔（ZIP）→ 重設 → 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(saved.suggestedFilename()).toMatch(/^gif-combiner_\d{8}\.zip$/);
  const zipPath = (await saved.path()) as string;
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await data(page)).items.length).toBe(0);
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(zipPath);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect.poll(async () => (await data(page)).items.map(box)).toEqual(before.items.map(box));
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  async function prepare(page: Page) {
    await addFiles(page, [GIF_A, GIF_B, GIF_C], 3);
    await page.getByRole('button', { name: '排列', exact: true }).click();
    await pauseAt(page, 0.15);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await prepare(page);
    await expect(page).toHaveScreenshot('gif-combiner-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('gif-combiner-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
