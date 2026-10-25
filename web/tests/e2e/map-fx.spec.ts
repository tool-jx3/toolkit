/**
 * 地圖演出產生器（建置產物 next/map-fx/）的端對端測試（規格 docs/refactor/specs/map-fx.md）：
 * - 開頁沒有錯誤、空白狀態、頁尾只有靈感來源、群組 G10；
 * - 地圖：選檔（換圖時框與出處清空）、範例地圖、示範演出（7 個框、7.9 秒）、拿掉；
 * - 畫框：三種工具、預設（路線的種類與形狀、遮罩的效果與房名）、清單的摘要；
 * - 點選建立路線（同一點再點、退回、Enter、Esc 取消、Backspace 不會刪框）、編輯點（拖曳、按兩下加點、Delete 刪點、Esc 結束）、
 *   拖曳框時點跟著動；
 * - 畫面：淡出揭開的進度、掃描揭開、路線長出來；
 * - 匯出：PNG（與畫面相同）、APNG、X 用 MP4（1280×720、30 fps）、房間遮罩 ZIP（檔名、格數、地圖大小的透明遮罩、裁切）、
 *   段階公開與圖層；
 * - 自動儲存與還原、專案檔 ZIP；390 寬沒有橫向捲動；1280／390 的視覺基準圖。
 * 兩次修改之間至少隔 450 ms（0.4 秒內的連續變更會合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('map-fx') ?? { id: 'map-fx', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:map-fx';

test.use({ viewport: { width: 1280, height: 900 } });

interface Frame {
  id: string;
  kind: 'zoom' | 'route' | 'redact';
  x: number;
  y: number;
  w: number;
  h: number;
  points?: { x: number; y: number }[];
  [k: string]: unknown;
}

interface Doc {
  image: { id: string; name: string; width: number; height: number } | null;
  frames: Frame[];
  credit: { text: string; pos: string; size: string };
  [k: string]: unknown;
}

/** 測試地圖：淺灰底、深色的格線（1200 × 840） */
async function mapPng(w = 1200, h = 840): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const line = x % 24 === 0 || y % 24 === 0;
      px[o] = line ? 120 : 230;
      px[o + 1] = line ? 120 : 228;
      px[o + 2] = line ? 120 : 220;
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
  await expect(page.getByRole('heading', { level: 1, name: '地圖演出產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  return errors;
}

type Hook = Record<string, (...a: unknown[]) => unknown>;
async function call<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([n, a]) => {
      const h = (window as unknown as { __mapFx: Hook }).__mapFx;
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
const tab = (page: Page, name: '地圖' | '演出框' | '時間軸') =>
  page.getByRole('tab', { name }).click();
const imageInput = (page: Page) => page.locator('[data-testid=image-load] input[type=file]');
const tool = (page: Page, name: '區域放大' | '路線・地點' | '房間遮罩') =>
  page.getByRole('radiogroup', { name: '拖曳畫出' }).getByRole('radio', { name }).click();

async function loadImage(page: Page, name = 'map.png') {
  await imageInput(page).setInputFiles(file(name, await mapPng()));
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

/** 原圖 px → 螢幕座標（量編輯層或點選層） */
async function screenOf(page: Page, sx: number, sy: number, layer = 'editor') {
  const l = await layout(page);
  const b = (await page.getByTestId(layer).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const cx = l.shot.x + sx * l.shot.f;
  const cy = l.shot.y + sy * l.shot.f;
  return { x: b.x + (cx / l.canvas.width) * b.width, y: b.y + (cy / l.canvas.height) * b.height };
}

async function drag(page: Page, a: [number, number], b: [number, number], layer = 'editor') {
  const p = await screenOf(page, a[0], a[1], layer);
  const q = await screenOf(page, b[0], b[1], layer);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 3 });
  await page.mouse.move(q.x, q.y, { steps: 3 });
  await page.mouse.up();
}

async function clickAt(page: Page, sx: number, sy: number, layer = 'point-layer') {
  const p = await screenOf(page, sx, sy, layer);
  await page.mouse.click(p.x, p.y);
}

type Rgba = [number, number, number, number];
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

async function chooseFormat(page: Page, format: string) {
  await exportPanel(page).getByRole('combobox', { name: '格式' }).click();
  await page.getByRole('option', { name: format, exact: true }).click();
}

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

/** 固定 id 的示範框（視覺基準圖要固定：迷霧與毛邊依 id 決定） */
const fixedFrames = () => {
  const g = (c: number) => c * 24;
  return [
    {
      id: 'z1',
      kind: 'zoom',
      x: g(2),
      y: g(3),
      w: g(10),
      h: g(11),
      scale: 1.3,
      style: 'oldmap',
      border: 4,
    },
    {
      id: 'r1',
      kind: 'route',
      x: g(8),
      y: g(8),
      w: g(17),
      h: g(23),
      style: 'dashed',
      shape: 'points',
      points: [
        { x: g(8), y: g(31) },
        { x: g(8), y: g(16) },
        { x: g(25), y: g(16) },
        { x: g(25), y: g(8) },
      ],
      label: '0:10 潛入',
    },
    {
      id: 'r2',
      kind: 'route',
      x: g(23),
      y: g(4),
      w: g(5),
      h: g(5),
      style: 'pin',
      shape: 'right',
      points: [],
      label: '血跡',
    },
    {
      id: 'm1',
      kind: 'redact',
      x: g(2),
      y: g(3),
      w: g(10),
      h: g(11),
      style: 'dark',
      mode: 'reveal',
      dir: 'fade',
      density: 100,
      grain: 12,
      edge: 'glow',
      glow: 70,
      label: '院長室',
    },
    {
      id: 'm2',
      kind: 'redact',
      x: g(34),
      y: g(18),
      w: g(7),
      h: g(14),
      style: 'fog',
      mode: 'static',
      dir: 'fade',
      density: 100,
      grain: 12,
      edge: 'glow',
      glow: 70,
      label: '儲藏室',
    },
    {
      id: 'm3',
      kind: 'redact',
      x: g(41),
      y: g(18),
      w: g(7),
      h: g(14),
      style: 'keepout',
      mode: 'static',
      dir: 'fade',
      density: 100,
      grain: 12,
      edge: 'glow',
      glow: 70,
      label: '封鎖中',
    },
  ];
};

/* ---------- 開頁、地圖 ---------- */

test('開頁：沒有錯誤、空白狀態、頁尾只有靈感來源、匯出區說明為什麼不能匯出（F15、F73）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('empty-state')).toContainText('放一張地圖開始');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：KIIN／マップ・見取り図 演出スタジオ');
  await expect(footer.getByRole('link')).toHaveAttribute('href', 'https://map-stage.pages.dev/');
  await expect(exportPanel(page)).toContainText('還沒有地圖，無法匯出。');
  await expect(page.getByRole('button', { name: '匯出 PNG' })).toBeDisabled();
  await expect(
    page.getByRole('radiogroup', { name: '拖曳畫出' }).getByRole('radio').first(),
  ).toBeDisabled();
  /* 群組分頁 G10（地圖與網格） */
  await expect(page.getByRole('link', { name: '室內平面圖產生器' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('地圖：選檔、換圖時框與出處清空、範例地圖、示範演出、拿掉（F01～F05）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, 'base.png');
  await expect(page.getByTestId('image-name')).toContainText('目前的地圖：base.png');
  await expect(page.getByTestId('image-size')).toHaveText('1200 × 840 px');
  await pause(page);
  await drag(page, [100, 100], [300, 200]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  await pause(page);
  await call(page, 'set', { credit: { text: '出處：測試', pos: 'below', size: 'md' } });
  await pause(page);
  await imageInput(page).setInputFiles(file('next.png', await mapPng(600, 400)));
  await expect.poll(async () => (await state(page)).image?.name).toBe('next.png');
  expect((await state(page)).frames).toEqual([]);
  expect((await state(page)).credit.text).toBe('');
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).image?.name).toBe('base.png');
  expect((await state(page)).frames).toHaveLength(1);
  /* 範例地圖、示範演出 */
  await tab(page, '地圖');
  await page.getByRole('button', { name: '範例地圖', exact: true }).click();
  await expect.poll(async () => (await state(page)).image?.name).toBe('範例：霧澤療養院一樓');
  expect((await state(page)).image).toMatchObject({ width: 1200, height: 840 });
  await page.getByRole('button', { name: '示範演出' }).click();
  await expect.poll(async () => (await state(page)).frames.length).toBe(7);
  const s = await state(page);
  expect(s.frames.map((f) => f.kind)).toEqual([
    'zoom',
    'route',
    'route',
    'redact',
    'route',
    'redact',
    'redact',
  ]);
  expect(s.credit.text).toBe('霧澤療養院　一樓平面圖（範例）');
  expect((await call<{ total: number }>(page, 'timeline')).total).toBeCloseTo(7.9, 5);
  /* 拿掉 → 空白狀態 */
  await page.getByRole('button', { name: '拿掉地圖' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect((await state(page)).image).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 畫框 ---------- */

test('畫框：三種工具、新畫的框的預設、清單的摘要與個別設定（F15、F16、F24、F28、F31、F32、F38～F41）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  /* 區域放大 */
  await drag(page, [100, 100], [340, 300]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  expect((await frames(page))[0]).toMatchObject({ kind: 'zoom', style: 'plain', scale: 1.25 });
  /* 路線・地點：預設改成 L 字＋標籤 */
  await tab(page, '演出框');
  await tool(page, '路線・地點');
  const defaults = page.getByTestId('defaults');
  await expect(defaults).toHaveAttribute('data-kind', 'route');
  await defaults.getByRole('combobox', { name: '路線的形狀' }).click();
  await page.getByRole('option', { name: 'L 字：先橫後直' }).click();
  await defaults.getByRole('textbox', { name: '標籤' }).fill('23:40 後門');
  await pause(page);
  await drag(page, [400, 400], [700, 600]);
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  const r = (await frames(page))[1];
  expect(r).toMatchObject({ kind: 'route', style: 'dashed', shape: 'hv', label: '23:40 後門' });
  expect(await call(page, 'path', r.id)).toEqual([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
  ]);
  /* 地點：形狀欄藏起來 */
  await defaults.getByRole('combobox', { name: '種類' }).click();
  await page.getByRole('option', { name: '目的地圖釘' }).click();
  await expect(defaults.getByRole('combobox', { name: '路線的形狀' })).toBeHidden();
  /* 房間遮罩：效果改成由左往右掃描、房名 */
  await tool(page, '房間遮罩');
  await defaults.getByRole('combobox', { name: '揭開的效果' }).click();
  await page.getByRole('option', { name: '由左往右掃描' }).click();
  await expect(defaults.getByRole('radiogroup', { name: '邊界演出' })).toBeVisible();
  await defaults.getByRole('textbox', { name: '房名' }).fill('書房');
  await pause(page);
  await drag(page, [800, 100], [1000, 300]);
  await expect.poll(async () => (await frames(page)).length).toBe(3);
  expect((await frames(page))[2]).toMatchObject({
    kind: 'redact',
    style: 'dark',
    mode: 'reveal',
    dir: 'h',
    label: '書房',
  });
  /* 清單的摘要；個別設定：一直蓋著時效果欄藏起來 */
  const list = page.getByTestId('frame-list');
  await expect(list.locator('li').nth(1)).toContainText('移動路線・L 字：先橫後直・23:40 後門');
  await expect(list.locator('li').nth(2)).toContainText('黑暗・揭開・由左往右掃描・書房');
  const editor = page.getByTestId('frame-editor');
  await editor.getByRole('combobox', { name: '動作' }).click();
  await page.getByRole('option', { name: '一直蓋著' }).click();
  await expect(editor.getByRole('combobox', { name: '揭開的效果' })).toBeHidden();
  await expect.poll(async () => (await frames(page))[2].mode).toBe('static');
  /* 樣式的選項：四種框、七種路線、四種遮罩 */
  await list.locator('li').nth(0).getByRole('button').first().click();
  await editor.getByRole('combobox', { name: '框的樣式' }).click();
  await expect(page.getByRole('option')).toHaveText(['白框', '古地圖', '戰術面板', '只有陰影']);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

/* ---------- 點選建立路線、編輯點 ---------- */

test('點選建立路線：同一點再點、退回上一點、Enter 確定、Esc 取消、Backspace 不刪框（F33、F35）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await drag(page, [900, 600], [1100, 800]);
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  await tool(page, '路線・地點');
  await page.getByRole('button', { name: '點選建立路線' }).click();
  await expect(page.getByTestId('point-layer')).toBeVisible();
  await expect(page.getByTestId('editor')).toBeHidden();
  /* U 字：去、回到同一點 */
  await clickAt(page, 100, 100);
  await clickAt(page, 500, 100);
  await clickAt(page, 500, 300);
  await clickAt(page, 500, 100);
  await clickAt(page, 700, 700);
  await expect(page.getByTestId('point-count')).toHaveText('已點 5 個');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('point-count')).toHaveText('已點 4 個');
  expect(await frames(page)).toHaveLength(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('point-layer')).toBeHidden();
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  const f = (await frames(page))[1];
  expect(f).toMatchObject({ kind: 'route', shape: 'points', style: 'dashed' });
  const pts = f.points as { x: number; y: number }[];
  expect(pts).toHaveLength(4);
  for (const [i, [x, y]] of (
    [
      [100, 100],
      [500, 100],
      [500, 300],
      [500, 100],
    ] as const
  ).entries()) {
    expect(Math.abs(pts[i].x - x)).toBeLessThan(2);
    expect(Math.abs(pts[i].y - y)).toBeLessThan(2);
  }
  expect((await call<{ selected: string }>(page, 'live')).selected).toBe(f.id);
  /* 一步復原 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  /* Esc 取消 */
  await page.getByRole('button', { name: '點選建立路線' }).click();
  await clickAt(page, 100, 100);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('point-layer')).toBeHidden();
  expect(await frames(page)).toHaveLength(1);
  /* 地點的預設也建立成移動路線（點選路線只有四種路線） */
  await tab(page, '演出框');
  const defaults = page.getByTestId('defaults');
  await defaults.getByRole('combobox', { name: '種類' }).click();
  await page.getByRole('option', { name: '鎖定準星' }).click();
  await page.getByRole('button', { name: '點選建立路線' }).click();
  await clickAt(page, 200, 200);
  await clickAt(page, 300, 300);
  await page.getByRole('button', { name: '確定（Enter）' }).click();
  await expect.poll(async () => (await frames(page)).length).toBe(2);
  expect((await frames(page))[1]).toMatchObject({ style: 'dashed', shape: 'points' });
  await page.getByTestId('frame-editor').getByRole('combobox', { name: '種類' }).click();
  await expect(page.getByRole('option')).toHaveText(['移動路線', '腳印', '霓虹路線', '行軍箭頭']);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('編輯選取路線的點：拖曳點、按兩下加點、Delete 刪點、Esc 結束；拖曳框時點跟著動（F19、F34）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    frames: [
      {
        id: 'p1',
        kind: 'route',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        style: 'neon',
        shape: 'points',
        points: [
          { x: 200, y: 200 },
          { x: 600, y: 200 },
          { x: 600, y: 500 },
        ],
        label: '',
      },
    ],
  });
  await call(page, 'select', 'p1');
  await tool(page, '路線・地點');
  await page.getByRole('button', { name: '編輯選取路線的點' }).click();
  await expect(page.getByTestId('point-layer')).toHaveAttribute('data-mode', 'edit');
  /* 拖曳第 2 點 */
  await drag(page, [600, 200], [700, 150], 'point-layer');
  await expect
    .poll(async () => {
      const p = (await frames(page))[0].points as { x: number; y: number }[];
      return Math.round(p[1].x / 5) * 5;
    })
    .toBe(700);
  /* 一次拖曳一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => ((await frames(page))[0].points as { x: number }[])[1].x).toBe(600);
  /* 在第一段上按兩下加一點 */
  const p = await screenOf(page, 400, 200, 'point-layer');
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(async () => ((await frames(page))[0].points as unknown[]).length).toBe(4);
  /* 選第 1 點、Delete 刪掉 */
  await clickAt(page, 200, 200);
  await page.keyboard.press('Delete');
  await expect.poll(async () => ((await frames(page))[0].points as unknown[]).length).toBe(3);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('point-layer')).toBeHidden();
  /* 拖曳整條：點跟著動 */
  const before = (await frames(page))[0];
  await drag(
    page,
    [before.x + before.w * 0.3, before.y + before.h * 0.4],
    [before.x + before.w * 0.3 + 50, before.y + before.h * 0.4 + 40],
  );
  await expect.poll(async () => (await frames(page))[0].x).toBe(before.x + 50);
  const after = (await frames(page))[0];
  const pb = before.points as { x: number; y: number }[];
  const pa = after.points as { x: number; y: number }[];
  for (let i = 0; i < pb.length; i++) {
    expect(pa[i].x - pb[i].x).toBeCloseTo(after.x - before.x, 0);
    expect(pa[i].y - pb[i].y).toBeCloseTo(after.y - before.y, 0);
  }
  /* 拖曳畫出的路線也能編輯：換成點選的 */
  await call(page, 'set', {
    frames: [
      {
        id: 'd1',
        kind: 'route',
        x: 100,
        y: 100,
        w: 300,
        h: 200,
        style: 'march',
        shape: 'z',
        points: [],
        label: '',
      },
    ],
  });
  await call(page, 'select', 'd1');
  await page.getByRole('button', { name: '編輯選取路線的點' }).click();
  await expect(page.getByTestId('point-layer')).toHaveAttribute('data-points', '4');
  expect((await frames(page))[0]).toMatchObject({ shape: 'points', style: 'march' });
  await page.getByRole('button', { name: '結束編輯' }).click();
  await expect(page.getByTestId('point-layer')).toBeHidden();
  expect(errors).toEqual([]);
});

/* ---------- 畫面 ---------- */

test('畫面：遮罩淡出揭開、由左往右掃描、路線長出來、區域放大彈出（F30、F37、F39、F40）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    timing: { intro: 0, popup: 0.5, action: 1, outro: 1, order: 'simultaneous', fps: 15 },
    frames: [
      {
        id: 'm1',
        kind: 'redact',
        x: 100,
        y: 100,
        w: 200,
        h: 200,
        style: 'dark',
        mode: 'reveal',
        dir: 'fade',
        density: 100,
        grain: 12,
        edge: 'glow',
        glow: 70,
        label: '',
      },
      {
        id: 'm2',
        kind: 'redact',
        x: 400,
        y: 100,
        w: 200,
        h: 200,
        style: 'dark',
        mode: 'reveal',
        dir: 'h',
        density: 100,
        grain: 12,
        edge: 'none',
        glow: 70,
        label: '',
      },
      {
        id: 'r1',
        kind: 'route',
        x: 100,
        y: 500,
        w: 600,
        h: 40,
        style: 'dashed',
        shape: 'right',
        points: [],
        label: '',
      },
    ],
  });
  const at = (t: number) =>
    srcPixels(page, t, [
      [110, 110],
      [410, 280],
      [590, 280],
    ]);
  const [a0, b0, c0] = await at(0.5);
  expect(a0[0]).toBeLessThan(25);
  expect(b0[0]).toBeLessThan(25);
  expect(c0[0]).toBeLessThan(25);
  /* 一半：淡出的半透明、掃描的左邊露出右邊還蓋著 */
  const [a1, b1, c1] = await at(1.0);
  expect(a1[0]).toBeGreaterThan(60);
  expect(a1[0]).toBeLessThan(200);
  expect(b1[0]).toBeGreaterThan(200);
  expect(c1[0]).toBeLessThan(25);
  const [a2, b2, c2] = await at(3);
  for (const p of [a2, b2, c2]) expect(p[0]).toBeGreaterThan(200);
  /* 路線：結束時終點附近是紅的、開始前沒有 */
  const redAt = async (t: number) => (await srcPixels(page, t, [[690, 520]]))[0];
  expect((await redAt(0.4))[1]).toBeGreaterThan(200);
  const end = await redAt(3);
  expect(end[0]).toBeGreaterThan(180);
  expect(end[1]).toBeLessThan(120);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出：PNG（與畫面相同）、APNG、X 用 MP4（F57、F59、F63、F68）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page);
  await call(page, 'set', {
    frames: fixedFrames(),
    timing: { intro: 0, popup: 0.2, action: 0.4, outro: 0.4, order: 'sequential', fps: 15 },
    credit: { text: '測試地圖', pos: 'below', size: 'md' },
  });
  const png = await exportFile(page, 'PNG');
  expect(png.name).toMatch(/^map-fx-\d{8}-\d{6}\.png$/);
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([1920, 1080]);
  const total = (await call<{ total: number }>(page, 'timeline')).total;
  const ref = readPng(dataUrlBytes(await call<string>(page, 'render', total)));
  let diff = 0;
  for (let i = 0; i < img.data.length; i++) if (img.data[i] !== ref.data[i]) diff++;
  expect(diff).toBe(0);
  const apng = await exportFile(page, 'APNG');
  expect(apng.name).toMatch(/-anim\.png$/);
  const info = parseApng(apng.bytes);
  expect(info.ihdr.width).toBe(1920);
  await expect(apng.result).toContainText(`${Math.ceil(total * 15 - 1e-9)} 格`);
  /* X 用 MP4：1280 × 720、30 fps；FPS 欄鎖在 30 */
  await expectFormatEnabled(page, 'X 用 MP4');
  const x = await exportFile(page, 'X 用 MP4');
  expect(x.name).toMatch(/^map-fx-\d{8}-\d{6}-x\.(mp4|webm)$/);
  expect(x.bytes.length).toBeGreaterThan(1000);
  await expect(x.result).toContainText('1280×720');
  await expect(x.result).toContainText('30 fps');
  /* 畫面的設定沒有變 */
  expect((await call<{ canvas: { width: number } }>(page, 'layout')).canvas.width).toBe(1920);
  expect(errors).toEqual([]);
});

test('匯出：房間遮罩 ZIP（地圖、同尺寸的透明遮罩、裁切、格數）、段階公開與圖層（F64～F66）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page);
  /* 沒有房間遮罩時停用 */
  await exportPanel(page).getByRole('combobox', { name: '格式' }).click();
  await expect(page.getByRole('option', { name: '房間遮罩 ZIP' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await call(page, 'set', { frames: fixedFrames() });
  const rooms = await exportFile(page, '房間遮罩 ZIP');
  expect(rooms.name).toMatch(/-rooms\.zip$/);
  const z = unzipSync(rooms.bytes);
  expect(Object.keys(z).sort()).toEqual(
    [
      'map_50x35.png',
      '01_院長室_full.png',
      '01_院長室_10x11.png',
      '02_儲藏室_full.png',
      '02_儲藏室_7x14.png',
      '03_封鎖中_full.png',
      '03_封鎖中_7x14.png',
    ].sort(),
  );
  const map = readPng(z['map_50x35.png']);
  expect([map.width, map.height]).toEqual([1200, 840]);
  const full = readPng(z['01_院長室_full.png']);
  expect([full.width, full.height]).toEqual([1200, 840]);
  const alphaAt = (im: Img, x: number, y: number) => im.data[(y * im.width + x) * 4 + 3];
  expect(alphaAt(full, 20, 20)).toBe(0);
  expect(alphaAt(full, 600, 600)).toBe(0);
  expect(alphaAt(full, 60, 80)).toBe(255);
  const crop = readPng(z['01_院長室_10x11.png']);
  expect([crop.width, crop.height]).toEqual([240, 264]);
  expect(alphaAt(crop, 5, 5)).toBe(255);
  await expect(rooms.result).toContainText('房間 3 個');
  /* 1 格＝48 px：格數跟著變 */
  await page.getByRole('spinbutton', { name: '1 格幾 px' }).fill('48');
  await page.getByRole('spinbutton', { name: '1 格幾 px' }).press('Enter');
  await expect.poll(async () => (await call<{ grid: number }>(page, 'prefs')).grid).toBe(48);
  const rooms48 = await exportFile(page, '房間遮罩 ZIP');
  expect(Object.keys(unzipSync(rooms48.bytes))).toContain('01_院長室_5x5.5.png');
  /* 段階公開：演出前＋區域放大＋3 個會動的框（一直蓋著的兩個不算） */
  const steps = await exportFile(page, '段階公開 ZIP');
  expect(Object.keys(unzipSync(steps.bytes))).toEqual([
    'step_00.png',
    'step_01.png',
    'step_02.png',
    'step_03.png',
    'step_04.png',
  ]);
  const layers = await exportFile(page, '圖層 ZIP');
  expect(Object.keys(unzipSync(layers.bytes))).toEqual([
    '1_background.png',
    '2_cutouts.png',
    '3_markers.png',
    '4_final.png',
  ]);
  await expect(layers.result).toContainText('背景、區域放大、路線與地點、完成');
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原、專案檔 ZIP、快捷鍵說明（F69～F71）', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, 'room.png');
  await call(page, 'set', { frames: fixedFrames() });
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await doc(page)).image?.name).toBe('room.png');
  expect((await doc(page)).frames).toHaveLength(6);
  expect(((await doc(page)).frames[1].points as unknown[]).length).toBe(4);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('map-fx');
  expect(project.data.frames).toHaveLength(6);
  expect(project.data.camera).toBeUndefined();
  expect(Object.keys(entries)).toContain(`files/${project.data.image.id}.png`);
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await state(page)).image).toBeNull();
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', Buffer.from(zipBytes), 'application/zip'));
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  await expect.poll(async () => (await state(page)).frames?.length).toBe(6);
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog')).toContainText('點選建立路線：確定');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；視覺基準圖 1280／390', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範例地圖' }).first().click();
  await expect.poll(async () => (await state(page))?.image?.name).toBe('範例：霧澤療養院一樓');
  await call(page, 'set', {
    frames: fixedFrames(),
    credit: { text: '霧澤療養院　一樓平面圖（範例）', pos: 'below', size: 'md' },
  });
  await page.waitForTimeout(400);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('map-fx-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  for (const t of ['演出框', '時間軸', '地圖'] as const) {
    await tab(page, t);
    await noHorizontalScroll(page);
  }
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('map-fx-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
