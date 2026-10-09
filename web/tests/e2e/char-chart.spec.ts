/**
 * 角色分析圖產生器（建置產物 next/char-chart/）的端對端測試（規格 docs/refactor/specs/char-chart.md）：
 * - 開頁沒有錯誤、預設內容（三頁、800 × 800、圖表切換、關係圖 1000 × 800）、頁尾只有靈感來源；
 * - 新增角色：名字必填、Enter、放在目前這一頁的中央、顏色依序、圖片標記、讀不了的圖、在關係圖加入不放到四象限；
 * - 一次加入多張圖片（選檔、整個視窗拖放、貼上）、名字取自檔名、不是圖片；人數上限；
 * - 四象限：拖曳（保持位置差、夾在畫布、上層優先）、點空白取消、方向鍵、Delete、Esc、放到這一頁、選取面板（名字、顏色、標記、刪除）；
 * - 按兩下改標題與軸名（Enter、Esc）、這一頁的欄位；頁面（新增、換頁、刪除）；
 * - 契合度（兩個角色、全體平均、訊息）；座標碼（複製、加入、錯誤、與原作格式相容）；
 * - 關係圖：連線規則、箭頭方向、線的種類（新增、改、排序、刪除）、連線清單、隨機連線、清除、顯示名字、放進關係圖、13 人以上、Esc；
 * - 下載 PNG（檔名、尺寸、2 倍、像素、與預覽相同、不含選取標示）；
 * - 自動儲存與還原（含圖片）、復原／重做；專案檔 ZIP（內容、重設、開啟、缺圖片）；觸控；
 * - 原作的檔案：原作 R 的專案 JSON（開啟專案檔）、原作 Q 的全部備份碼（貼上原作的備份碼…）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('char-chart') ?? { id: 'char-chart', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:char-chart';
const PREFS_KEY = 'trpg-toolkit:char-chart:preview';
const PALETTE = ['#e5484d', '#f2711c', '#f5b700', '#7cb518', '#2bb673', '#12a4b4'];

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Stored {
  characters: {
    id: string;
    name: string;
    color: string;
    image: { id: string; name: string; width: number; height: number } | null;
    marker: string;
    inMap: boolean;
  }[];
  pages: {
    id: string;
    title: string;
    labels: Record<'top' | 'bottom' | 'left' | 'right', string>;
    positions: Record<string, { x: number; y: number }>;
  }[];
  relation: {
    title: string;
    showNames: boolean;
    legends: { id: string; label: string; color: string; style: string }[];
    links: { from: string; to: string; legend: string }[];
  };
}

/* ---------- 共用 ---------- */

const hex = (c: string): Rgba => [
  Number.parseInt(c.slice(1, 3), 16),
  Number.parseInt(c.slice(3, 5), 16),
  Number.parseInt(c.slice(5, 7), 16),
  255,
];

/** 單色（中央一塊白）的測試圖片 */
async function solidPng(color: string, w = 120, h = 120): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  const c = hex(color);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const white = Math.abs(x - w / 2) < 6 && Math.abs(y - h / 2) < 6;
      px.set(white ? [255, 255, 255, 255] : c, (y * w + x) * 4);
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
  await expect(page.getByRole('heading', { level: 1, name: '角色分析圖產生器' })).toBeVisible();
  return errors;
}

const quad = (page: Page) => page.getByTestId('quad-canvas');
const rel = (page: Page) => page.getByTestId('rel-canvas');
const quadLayer = (page: Page) => page.getByTestId('quad-layer');
const relLayer = (page: Page) => page.getByTestId('relation-layer');
const addForm = (page: Page) => page.getByTestId('add-form');
const panel = (page: Page) => page.getByTestId('selected-panel');
const list = (page: Page) => page.getByRole('list', { name: '角色清單' });
const row = (page: Page, id: string) => list(page).locator(`[data-character-row="${id}"]`);
const downloadBtn = (page: Page) => page.getByRole('button', { name: '下載 PNG' });
const batchInput = (page: Page) =>
  page.getByRole('group', { name: '從圖片加入角色' }).locator('input[type=file]');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });
const node = (page: Page, id: string) => relLayer(page).locator(`[data-node="${id}"]`);

/** 自動儲存的內容（還沒有任何變更、還沒寫過時是空的預設） */
async function state(page: Page): Promise<Stored> {
  const d = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
  return (
    d ?? {
      characters: [],
      pages: [],
      relation: { title: '', showNames: true, legends: [], links: [] },
    }
  );
}

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

async function addChar(page: Page, name: string) {
  const input = addForm(page).getByRole('textbox', { name: '名字' });
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

async function toRelation(page: Page) {
  await radio(page, '角色關係圖').click();
  await expect(rel(page)).toBeVisible();
}

async function toQuadrant(page: Page) {
  await radio(page, '性格四象限').click();
  await expect(quad(page)).toBeVisible();
}

/** 畫布座標 → 螢幕座標 */
async function at(target: Locator, x: number, y: number) {
  const b = await target.boundingBox();
  const [w, h] = ((await target.getAttribute('data-size')) ?? '1x1').split('x').map(Number);
  if (!b) throw new Error('找不到畫布');
  return { x: b.x + (x / w) * b.width, y: b.y + (y / h) * b.height };
}

/** 四象限上的位置（相對於中心）→ 螢幕座標 */
const atQ = (page: Page, x: number, y: number) => at(quad(page), 400 + x, 400 + y);

async function dragQ(page: Page, a: [number, number], b: [number, number], steps = 6) {
  const p = await atQ(page, a[0], a[1]);
  const q = await atQ(page, b[0], b[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps });
  await page.mouse.up();
}

/** 畫布上一點的顏色 */
async function pixel(target: Locator, x: number, y: number): Promise<Rgba> {
  return target.evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ];
    },
    [x, y],
  );
}

const near = (a: number[], b: number[], tol = 6) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

interface Png {
  width: number;
  height: number;
  px: Uint8Array;
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
    px,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function downloadPng(page: Page): Promise<{ name: string; png: Png }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), downloadBtn(page).click()]);
  return { name: dl.suggestedFilename(), png: readPng(readFileSync((await dl.path()) as string)) };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** 直接寫入自動儲存的狀態再重新整理（大量資料用） */
async function seed(page: Page, data: Partial<Stored>) {
  await page.evaluate(
    ({ key, data }) => {
      const cur = JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data ?? {};
      localStorage.setItem(
        key,
        JSON.stringify({ state: { data: { ...cur, ...data } }, version: 1 }),
      );
    },
    { key: STORAGE_KEY, data },
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '角色分析圖產生器' })).toBeVisible();
}

const chars = (n: number, over: Partial<Stored['characters'][number]> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    name: `角色${i + 1}`,
    color: PALETTE[i % PALETTE.length],
    image: null,
    marker: 'dot',
    inMap: true,
    ...over,
  }));

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設的三頁與五種線、800 × 800、圖表切換、頁尾只有靈感來源（F18、F34、F47、F65、F69、F70）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(quad(page)).toHaveAttribute('data-size', '800x800');
  await expect(page.getByTestId('export-size')).toHaveText('800 × 800 px');
  await expect(page.getByTestId('page-indicator')).toHaveText('第 1／3 頁');
  await expect(page.getByRole('button', { name: '上一頁' })).toBeDisabled();
  await expect(page.getByText('還沒有角色。')).toBeVisible();
  await expect(page.getByTestId('character-count')).toHaveText('0 個');
  /* 預設內容：加一頁再復原，讓自動儲存寫出目前的狀態 */
  await page.getByRole('button', { name: '新增一頁' }).click();
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(page.getByTestId('page-indicator')).toHaveText('第 3／3 頁');
  await page.getByRole('button', { name: '上一頁' }).click();
  await page.getByRole('button', { name: '上一頁' }).click();
  const s = await state(page);
  expect(s.pages.map((p) => [p.title, p.labels])).toEqual([
    ['角色性格分布', { top: '外向', bottom: '內向', left: '感性', right: '理性' }],
    ['調查員的行動風格', { top: '謹慎', bottom: '衝動', left: '單獨行動', right: '團隊合作' }],
    [
      '面對神話的態度',
      { top: '好奇心旺盛', bottom: '明哲保身', left: '理智堅定', right: '瀕臨瘋狂' },
    ],
  ]);
  expect(s.relation).toMatchObject({ title: '角色關係圖', showNames: true, links: [] });
  expect(s.relation.legends.map((l) => [l.label, l.style])).toEqual([
    ['戀愛', 'solid'],
    ['單箭頭', 'arrow'],
    ['宿敵', 'dash'],
    ['搭檔', 'solid'],
    ['家人', 'solid'],
  ]);
  /* 四象限的底：白底、軸的深灰、中心的格線 */
  expect(near(await pixel(quad(page), 210, 210), [255, 255, 255])).toBe(true);
  expect(near(await pixel(quad(page), 300, 400), [0x37, 0x41, 0x51], 12)).toBe(true);
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/char-quadrant',
  );
  await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
  /* 關係圖：1000 × 800、沒有人時的提示；設定欄跟著換 */
  await toRelation(page);
  await expect(rel(page)).toHaveAttribute('data-size', '1000x800');
  await expect(page.getByTestId('relation-empty')).toBeVisible();
  await expect(page.getByTestId('export-size')).toHaveText('1000 × 800 px');
  await expect(page.getByRole('button', { name: '線的種類', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '這一頁', exact: true })).toHaveCount(0);
  expect((await prefs(page)).chart).toBe('relation');
  await page.reload();
  await expect(rel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 角色 ---------- */

test('新增角色：名字必填、Enter、放在中央並選取、顏色依序、通知；在關係圖加入不放到四象限（F01～F04、F07）', async ({
  page,
}) => {
  const errors = await open(page);
  await addForm(page).getByRole('button', { name: '加入角色' }).click();
  await expect(addForm(page).getByText('請輸入名字。')).toBeVisible();
  await expect(addForm(page).getByRole('textbox', { name: '名字' })).toBeFocused();
  expect((await state(page)).characters).toEqual([]);
  await addChar(page, '  艾琳  ');
  await expect(addForm(page).getByText('請輸入名字。')).toHaveCount(0);
  await expect(toast(page, '已加入「艾琳」。')).toBeVisible();
  await addChar(page, '布魯斯');
  let s = await state(page);
  expect(s.characters.map((c) => [c.id, c.name, c.color, c.marker, c.inMap])).toEqual([
    ['c1', '艾琳', PALETTE[0], 'dot', true],
    ['c2', '布魯斯', PALETTE[1], 'dot', true],
  ]);
  expect(s.pages[0].positions).toEqual({ c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 } });
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c2');
  await expect(page.getByTestId('selection')).toHaveAttribute('data-character', 'c2');
  await expect(page.getByTestId('character-count')).toHaveText('2 個');
  await expect(row(page, 'c1')).toContainText('在這一頁');
  /* 下一個預設顏色 */
  await expect(addForm(page).getByRole('textbox', { name: '顏色' })).toHaveValue(PALETTE[2]);
  /* 中央畫的是後加的角色的顏色 */
  expect(near(await pixel(quad(page), 400, 400), hex(PALETTE[1]))).toBe(true);
  /* 手動選的顏色 */
  const color = addForm(page).getByRole('textbox', { name: '顏色' });
  await color.fill('#123456');
  await color.press('Enter');
  /* 關係圖：加入的角色不放到四象限 */
  await toRelation(page);
  await addChar(page, '凱特');
  s = await state(page);
  expect(s.characters[2]).toMatchObject({ name: '凱特', color: '#123456', inMap: true });
  expect(s.pages[0].positions.c3).toBeUndefined();
  await expect(node(page, 'c3')).toBeVisible();
  await expect(row(page, 'c3')).toContainText('#3');
  await toQuadrant(page);
  await expect(row(page, 'c3')).toContainText('不在這一頁');
  /* 放到這一頁 */
  await row(page, 'c3').getByRole('button', { name: '放到這一頁：凱特' }).click();
  await expect(toast(page, '已把「凱特」放到這一頁的中央。')).toBeVisible();
  expect((await state(page)).pages[0].positions.c3).toEqual({ x: 0, y: 0 });
  await expect(row(page, 'c3')).toContainText('在這一頁');
  expect(errors).toEqual([]);
});

test('角色的圖片：選填、圖片標記、讀不了的檔案；一次加入多張（選檔、拖放、貼上）、名字取自檔名（F05、F06、F14、F15）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 新增區的圖片 */
  await addForm(page).getByRole('textbox', { name: '名字' }).fill('紅');
  await addForm(page)
    .getByRole('group', { name: '角色圖片' })
    .locator('input[type=file]')
    .setInputFiles(file('red.png', await solidPng('#cc2222', 100, 200)));
  await expect(addForm(page).getByTestId('add-image')).toContainText('red.png');
  await addForm(page).getByRole('button', { name: '加入角色' }).click();
  let s = await state(page);
  expect(s.characters[0]).toMatchObject({ name: '紅', marker: 'image' });
  expect(s.characters[0].image).toMatchObject({ name: 'red.png', width: 100, height: 200 });
  /* 圖片標記：寬 50、高 100，以中心對齊 */
  await expect
    .poll(async () => near(await pixel(quad(page), 400, 440), [0xcc, 0x22, 0x22]))
    .toBe(true);
  expect(near(await pixel(quad(page), 380, 360), [0xcc, 0x22, 0x22])).toBe(true);
  expect(near(await pixel(quad(page), 420, 520), [0xcc, 0x22, 0x22])).toBe(false);
  /* 標記改成圓點 */
  await radio(panel(page), '圓點').click();
  expect((await state(page)).characters[0].marker).toBe('dot');
  expect(near(await pixel(quad(page), 400, 440), [0xcc, 0x22, 0x22])).toBe(false);
  await radio(panel(page), '圖片').click();
  /* 拿掉圖片：一律圓點，圖片選項停用 */
  await panel(page).getByRole('button', { name: '拿掉圖片' }).click();
  s = await state(page);
  expect(s.characters[0]).toMatchObject({ image: null, marker: 'dot' });
  await expect(radio(panel(page), '圖片')).toBeDisabled();
  /* 讀不了的圖片 */
  await batchInput(page).setInputFiles(file('broken.png', Buffer.from('not a png')));
  await expect(toast(page, /無法讀取「broken\.png」/)).toBeVisible();
  await batchInput(page).setInputFiles(file('notes.txt', Buffer.from('hi'), 'text/plain'));
  await expect(toast(page, '「notes.txt」不是圖片檔。')).toBeVisible();
  expect((await state(page)).characters).toHaveLength(1);
  /* 一次加入多張：名字取自檔名（去掉最後的副檔名） */
  await batchInput(page).setInputFiles([
    file('藍.png', await solidPng('#2244cc')),
    file('my.green.png', await solidPng('#22aa44')),
  ]);
  await expect(toast(page, '已加入 2 個角色。')).toBeVisible();
  s = await state(page);
  expect(s.characters.map((c) => [c.name, c.marker])).toEqual([
    ['紅', 'dot'],
    ['藍', 'image'],
    ['my.green', 'image'],
  ]);
  expect(s.pages[0].positions.c3).toEqual({ x: 0, y: 0 });
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c3');
  /* 拖到視窗任何地方 */
  const gold = (await solidPng('#ddaa22')).toString('base64');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'gold.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, gold);
  await expect.poll(async () => (await state(page)).characters.length).toBe(4);
  /* 貼上 */
  const pink = (await solidPng('#ee66aa')).toString('base64');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pink.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, pink);
  await expect.poll(async () => (await state(page)).characters.length).toBe(5);
  expect((await state(page)).characters.map((c) => c.name).slice(3)).toEqual(['gold', 'pink']);
  /* 選取面板換圖片 */
  await list(page).locator('[data-character-row="c1"]').click();
  await panel(page)
    .getByRole('group', { name: '角色圖片' })
    .locator('input[type=file]')
    .setInputFiles(file('red2.png', await solidPng('#cc2222', 60, 60)));
  await expect.poll(async () => (await state(page)).characters[0].marker).toBe('image');
  /* 關係圖：圓形頭像取圖片中央 */
  await toRelation(page);
  const L = await relLayer(page)
    .locator('[data-node]')
    .evaluateAll((els) =>
      els.map((e) => {
        const s = (e as HTMLElement).style;
        return [Number.parseFloat(s.left) + 60, Number.parseFloat(s.top) + 60];
      }),
    );
  /* 第二個人（藍）：中央是白、旁邊是藍 */
  await expect
    .poll(async () => near(await pixel(rel(page), L[1][0] + 30, L[1][1]), [0x22, 0x44, 0xcc]))
    .toBe(true);
  expect(near(await pixel(rel(page), L[1][0], L[1][1]), [255, 255, 255])).toBe(true);
  expect(errors).toEqual([]);
});

test('人數上限 50：新增區停用、一次加入只加到上限（F17）', async ({ page }) => {
  const errors = await open(page);
  await seed(page, { characters: chars(49) });
  await batchInput(page).setInputFiles([
    file('a.png', await solidPng('#cc2222')),
    file('b.png', await solidPng('#2244cc')),
  ]);
  await expect.poll(async () => (await state(page)).characters.length).toBe(50);
  await expect(toast(page, '角色最多 50 個。')).toBeVisible();
  await expect(addForm(page).getByRole('button', { name: '加入角色' })).toBeDisabled();
  await expect(addForm(page).getByRole('textbox', { name: '名字' })).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 四象限 ---------- */

test('四象限：拖曳（保持位置差、夾在畫布、後面的優先）、點空白取消、方向鍵、Delete、Esc（F27、F28、F31～F33）', async ({
  page,
}) => {
  const errors = await open(page);
  await addChar(page, '甲');
  await addChar(page, '乙');
  /* 兩個都在中央：按下的是後面的（乙）；從離中心 5 px 的地方拖，位置差保留 */
  await dragQ(page, [5, 0], [105, 50]);
  let s = await state(page);
  expect(s.pages[0].positions.c2.x).toBeCloseTo(100, 0);
  expect(s.pages[0].positions.c2.y).toBeCloseTo(50, 0);
  expect(s.pages[0].positions.c1).toEqual({ x: 0, y: 0 });
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c2');
  /* 拖到畫布外：夾在畫布裡 */
  await dragQ(page, [100, 50], [460, 50]);
  s = await state(page);
  expect(s.pages[0].positions.c2.x).toBe(400);
  /* 點空白：取消選取 */
  const empty = await atQ(page, -200, -200);
  await page.mouse.click(empty.x, empty.y);
  await expect(quadLayer(page)).toHaveAttribute('data-selected', '');
  await expect(page.getByTestId('selection')).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  /* 點甲：選取；方向鍵 1／10 px */
  const c = await atQ(page, 0, 0);
  await page.mouse.click(c.x, c.y);
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c1');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await state(page)).pages[0].positions.c1).toEqual({ x: 2, y: 10 });
  /* 一次復原＝連按的方向鍵 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).pages[0].positions.c1).toEqual({ x: 0, y: 0 });
  /* Delete：從這一頁拿掉（角色留著） */
  await page.keyboard.press('Delete');
  s = await state(page);
  expect(s.pages[0].positions.c1).toBeUndefined();
  expect(s.characters).toHaveLength(2);
  await expect(panel(page).getByRole('button', { name: '放到這一頁' })).toBeVisible();
  await panel(page).getByRole('button', { name: '放到這一頁' }).click();
  expect((await state(page)).pages[0].positions.c1).toEqual({ x: 0, y: 0 });
  await panel(page).getByRole('button', { name: '從這一頁拿掉' }).click();
  expect((await state(page)).pages[0].positions.c1).toBeUndefined();
  /* Esc：取消選取 */
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  /* 清單的 ↑／↓ 只換選取，不移動角色 */
  await row(page, 'c2').click();
  await page.keyboard.press('ArrowUp');
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c1');
  expect((await state(page)).pages[0].positions.c2.x).toBe(400);
  expect(errors).toEqual([]);
});

test('選取的角色：改名字（一步復原）、顏色、放進關係圖、刪除角色（所有頁、連線）、刪除所有角色、排序（F09～F13、F16）', async ({
  page,
}) => {
  const errors = await open(page);
  for (const n of ['甲', '乙', '丙']) await addChar(page, n);
  /* 第二頁也放甲 */
  await page.getByRole('button', { name: '下一頁' }).click();
  await row(page, 'c1').getByRole('button', { name: '放到這一頁：甲' }).click();
  await page.getByRole('button', { name: '上一頁' }).click();
  /* 改名字 */
  await row(page, 'c1').click();
  const name = panel(page).getByRole('textbox', { name: '名字' });
  await name.fill('艾琳');
  await name.blur();
  expect((await state(page)).characters[0].name).toBe('艾琳');
  await expect(row(page, 'c1')).toContainText('艾琳');
  await page.keyboard.press('Control+z');
  expect((await state(page)).characters[0].name).toBe('甲');
  await page.keyboard.press('Control+Shift+z');
  /* 顏色 */
  const color = panel(page).getByRole('textbox', { name: '顏色' });
  await color.fill('#00aa00');
  await color.press('Enter');
  expect((await state(page)).characters[0].color).toBe('#00aa00');
  /* 排序（Alt＋↓）：甲移到最後、畫在最上面 */
  await row(page, 'c1').click();
  await list(page).locator('li').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  expect((await state(page)).characters.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  expect(near(await pixel(quad(page), 400, 400), [0, 0xaa, 0])).toBe(true);
  /* 關係圖：連線，拿出關係圖時連線一起刪 */
  await toRelation(page);
  await node(page, 'c1').click();
  await node(page, 'c2').click();
  expect((await state(page)).relation.links).toHaveLength(1);
  await row(page, 'c1').getByRole('checkbox', { name: '放進關係圖：艾琳' }).click();
  let s = await state(page);
  expect(s.characters.find((c) => c.id === 'c1')?.inMap).toBe(false);
  expect(s.relation.links).toEqual([]);
  await expect(node(page, 'c1')).toHaveCount(0);
  await expect(row(page, 'c1')).toContainText('—');
  await page.keyboard.press('Control+z');
  expect((await state(page)).relation.links).toHaveLength(1);
  /* 刪除角色：所有頁的位置與連線 */
  await row(page, 'c1').getByRole('button', { name: '刪除：艾琳' }).click();
  s = await state(page);
  expect(s.characters.map((c) => c.id)).toEqual(['c2', 'c3']);
  expect(s.pages[1].positions).toEqual({});
  expect(s.relation.links).toEqual([]);
  await expect(panel(page)).toHaveCount(0);
  /* 刪除所有角色：確認 */
  await page.getByRole('button', { name: '刪除所有角色' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click();
  s = await state(page);
  expect(s.characters).toEqual([]);
  expect(s.pages).toHaveLength(3);
  await page.keyboard.press('Control+z');
  expect((await state(page)).characters).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('改字：按兩下標題與軸名（Enter 套用、Esc 取消）、這一頁的欄位（F29、F30）', async ({
  page,
}) => {
  const errors = await open(page);
  const title = await atQ(page, 0, 35 - 400);
  await page.mouse.dblclick(title.x, title.y);
  const editor = page.getByTestId('label-editor').getByRole('textbox');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('角色性格分布');
  await editor.fill('冒險者的性格');
  await editor.press('Enter');
  await expect(page.getByTestId('label-editor')).toHaveCount(0);
  expect((await state(page)).pages[0].title).toBe('冒險者的性格');
  await expect(page.getByRole('textbox', { name: '標題' })).toHaveValue('冒險者的性格');
  /* 左方的軸名：Esc 取消 */
  const left = await atQ(page, 115 - 400, -20);
  await page.mouse.dblclick(left.x, left.y);
  await expect(editor).toHaveValue('感性');
  await editor.fill('不要');
  await editor.press('Escape');
  expect((await state(page)).pages[0].labels.left).toBe('感性');
  /* 離開欄位也套用 */
  const right = await atQ(page, 285, -20);
  await page.mouse.dblclick(right.x, right.y);
  await editor.fill('邏輯');
  await page.getByTestId('character-count').click();
  expect((await state(page)).pages[0].labels.right).toBe('邏輯');
  /* 不在字上按兩下：不出現 */
  const blank = await atQ(page, 200, 200);
  await page.mouse.dblclick(blank.x, blank.y);
  await expect(page.getByTestId('label-editor')).toHaveCount(0);
  /* 設定欄：從聚焦到離開算一步 */
  const top = page.getByRole('textbox', { name: '上方的軸名' });
  await top.fill('');
  await top.pressSequentially('熱情');
  await top.blur();
  expect((await state(page)).pages[0].labels.top).toBe('熱情');
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).pages[0].labels.top).toBe('外向');
  /* 畫在圖上：標題那一帶有深色的字 */
  const dark = await quad(page).evaluate((el) => {
    const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(250, 20, 300, 30).data;
    let n = 0;
    for (let i = 0; d && i < d.length; i += 4) if (d[i] < 100) n++;
    return n;
  });
  expect(dark).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('頁面：新增（切過去、通知）、換頁（清單狀態跟著頁）、刪除（確認、至少一頁）（F35～F37）', async ({
  page,
}) => {
  const errors = await open(page);
  await addChar(page, '甲');
  await page.getByRole('button', { name: '新增一頁' }).click();
  await expect(toast(page, '已新增一頁。')).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText('第 4／4 頁');
  await expect(page.getByRole('button', { name: '下一頁' })).toBeDisabled();
  let s = await state(page);
  expect(s.pages[3]).toMatchObject({
    title: '新頁面 4',
    labels: { top: '上', bottom: '下', left: '左', right: '右' },
    positions: {},
  });
  await expect(row(page, 'c1')).toContainText('不在這一頁');
  await expect(page.getByRole('textbox', { name: '標題' })).toHaveValue('新頁面 4');
  /* 刪除：確認後停在同一個位置（最後一頁時往前） */
  await page.getByRole('button', { name: '刪除這一頁' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('刪除這一頁？');
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(toast(page, '已刪除這一頁。')).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText('第 3／3 頁');
  await page.getByRole('button', { name: '上一頁' }).click();
  await page.getByRole('button', { name: '上一頁' }).click();
  await expect(page.getByTestId('page-indicator')).toHaveText('第 1／3 頁');
  await expect(row(page, 'c1')).toContainText('在這一頁');
  /* 刪到只剩一頁 */
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '刪除這一頁' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  }
  s = await state(page);
  expect(s.pages.map((p) => p.title)).toEqual(['面對神話的態度']);
  await page.getByRole('button', { name: '刪除這一頁' }).click();
  await expect(toast(page, '至少要留一頁。')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  /* 復原刪頁 */
  await page.keyboard.press('Control+z');
  expect((await state(page)).pages).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('契合度：兩個角色（每頁、平均、不在那一頁）、全體平均、訊息（F38～F41）', async ({ page }) => {
  const errors = await open(page);
  await seed(page, {
    characters: chars(3),
    pages: [
      {
        id: 'p1',
        title: '一',
        labels: { top: '', bottom: '', left: '', right: '' },
        positions: { c1: { x: 0, y: 0 }, c2: { x: 88, y: -44 }, c3: { x: 0, y: 176 } },
      },
      {
        id: 'p2',
        title: '二',
        labels: { top: '', bottom: '', left: '', right: '' },
        positions: { c1: { x: 0, y: 0 } },
      },
      {
        id: 'p3',
        title: '三',
        labels: { top: '', bottom: '', left: '', right: '' },
        positions: { c1: { x: -400, y: -400 }, c2: { x: 400, y: 400 } },
      },
    ],
  });
  const score = page.getByTestId('score-panel');
  await expect(score.getByTestId('score-message')).toHaveText('請選兩個角色。');
  await score.getByRole('combobox', { name: '第一個角色' }).click();
  await page.getByRole('option', { name: '角色1' }).click();
  await score.getByRole('combobox', { name: '第二個角色' }).click();
  await page.getByRole('option', { name: '角色1' }).click();
  await expect(score.getByTestId('score-message')).toHaveText('請選兩個不同的角色。');
  await score.getByRole('combobox', { name: '第二個角色' }).click();
  await page.getByRole('option', { name: '角色2' }).click();
  const table = score.getByTestId('score-table');
  await expect(table.locator('tbody tr')).toHaveText(['一85.0%', '二—', '三-81.8%']);
  await expect(table.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveClass(/text-accent/);
  await expect(table.locator('tbody tr').nth(2).locator('td').nth(1)).toHaveClass(/text-warning/);
  await expect(score.getByTestId('score-average')).toHaveText('1.6%');
  /* 全體平均：第一頁 (85 + 80 + 65) ÷ 3、第三頁只有一組 */
  await radio(score, '全體平均').click();
  await expect(table.locator('tbody tr')).toHaveText(['一76.7%', '二—', '三-81.8%']);
  await expect(score.getByTestId('score-average')).toHaveText('-2.6%');
  expect(await prefs(page)).toMatchObject({ compare: 'group', pairA: 'c1', pairB: 'c2' });
  /* 拖曳後即時更新 */
  await radio(score, '兩個角色').click();
  await dragQ(page, [88, -44], [0, 0]);
  await expect(table.locator('tbody tr').nth(0)).toHaveText(/^一(99\.\d|100\.0)%$/);
  /* 少於兩個角色 */
  await seed(page, { characters: chars(1) });
  await radio(page.getByTestId('score-panel'), '全體平均').click();
  await expect(page.getByTestId('score-message')).toHaveText('至少要有兩個角色。');
  expect(errors).toEqual([]);
});

test('座標碼：複製（格式與原作相同）、加入（同名更新、新增、夾在畫布）、空白、格式錯誤（F44、F45）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await addChar(page, '艾琳');
  await addChar(page, '布魯斯');
  await dragQ(page, [0, 0], [120, -80]);
  await page.getByRole('button', { name: '座標碼', exact: true }).click();
  const area = page.getByRole('textbox', { name: '這一頁的座標碼' });
  await page.getByRole('button', { name: '複製座標碼' }).click();
  await expect(toast(page, '已複製這一頁的座標碼。')).toBeVisible();
  const code = await area.inputValue();
  expect(JSON.parse(code)).toEqual([
    { n: '艾琳', c: PALETTE[0], x: 0, y: 0 },
    { n: '布魯斯', c: PALETTE[1], x: 120, y: -80 },
  ]);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  /* 空白、格式錯誤 */
  await area.fill('');
  await page.getByRole('button', { name: '加入座標' }).click();
  await expect(toast(page, '請先貼上座標碼。')).toBeVisible();
  await area.fill('{"n":"x"}');
  await page.getByRole('button', { name: '加入座標' }).click();
  await expect(toast(page, '座標碼的格式不對。')).toBeVisible();
  /* 貼到第二頁：同名更新、新增圓點角色 */
  await page.getByRole('button', { name: '下一頁' }).click();
  await area.fill(
    '[{"n":"布魯斯","c":"#000000","x":-50,"y":60},{"n":"凱特","c":"#8b5cf6","x":999,"y":10}]',
  );
  await page.getByRole('button', { name: '加入座標' }).click();
  await expect(toast(page, '已加入 1 個角色、更新 1 個角色的位置。')).toBeVisible();
  await expect(area).toHaveValue('');
  const s = await state(page);
  expect(s.characters.map((c) => [c.name, c.color, c.marker])).toEqual([
    ['艾琳', PALETTE[0], 'dot'],
    ['布魯斯', PALETTE[1], 'dot'],
    ['凱特', '#8b5cf6', 'dot'],
  ]);
  expect(s.pages[1].positions).toEqual({ c2: { x: -50, y: 60 }, c3: { x: 400, y: 10 } });
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  expect((await state(page)).characters).toHaveLength(2);
  /* 看不懂的項目略過 */
  await area.fill('[{"n":"","x":1,"y":1},{"n":"艾琳","x":"a","y":1},{"n":"艾琳","x":3,"y":4}]');
  await page.getByRole('button', { name: '加入座標' }).click();
  await expect(toast(page, '已更新 1 個角色的位置。')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 關係圖 ---------- */

test('關係圖：點兩個人連線、同一對刪線、點同一人取消、空白處取消（標題範圍除外）、Esc；箭頭在後點的那一端（F48、F51、F55、F64）', async ({
  page,
}) => {
  const errors = await open(page);
  await toRelation(page);
  for (const n of ['甲', '乙', '丙', '丁']) await addChar(page, n);
  await expect(relLayer(page).locator('[data-node]')).toHaveCount(4);
  /* 4 人：第一個在正上方 (500, 120)、第二個在右 (780, 400) */
  const box = await node(page, 'c1').evaluate((e) => [
    Number.parseFloat((e as HTMLElement).style.left),
    Number.parseFloat((e as HTMLElement).style.top),
  ]);
  expect(box[0]).toBeCloseTo(440, 3);
  expect(box[1]).toBeCloseTo(60, 3);
  /* 點一個人：外圈與說明 */
  await node(page, 'c1').click();
  await expect(relLayer(page)).toHaveAttribute('data-link-from', 'c1');
  await expect(page.getByTestId('link-from')).toHaveAttribute('data-character', 'c1');
  await expect(node(page, 'c1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('preview-hint')).toHaveText(
    '已選「甲」，再點另一個人連線（點同一個人取消）。',
  );
  /* 再點同一人：取消 */
  await node(page, 'c1').click();
  await expect(relLayer(page)).toHaveAttribute('data-link-from', '');
  /* 用「單箭頭」連 乙 → 甲 */
  await page
    .getByRole('list', { name: /^線的種類/ })
    .locator('[data-legend-row="l2"]')
    .click();
  await expect(page.getByTestId('preview-hint')).toContainText('用「單箭頭」連起來');
  await node(page, 'c2').click();
  await node(page, 'c1').click();
  let s = await state(page);
  expect(s.relation.links).toEqual([{ from: 'c2', to: 'c1', legend: 'l2' }]);
  await expect(relLayer(page)).toHaveAttribute('data-link-from', '');
  /* 箭頭在甲那一端（端點 (500, 180)），往上指：箭頭下方有橘色、乙那一端沒有 */
  const orange = [0xf0, 0x8c, 0x00];
  expect(near(await pixel(rel(page), 504, 184), orange, 30)).toBe(true);
  /* 線的中段 */
  expect(near(await pixel(rel(page), 610, 290), orange, 40)).toBe(true);
  /* 同一對再連一次（不論方向、種類）：刪掉 */
  await node(page, 'c1').click();
  await node(page, 'c2').click();
  expect((await state(page)).relation.links).toEqual([]);
  /* 空白處取消；標題範圍不取消 */
  await node(page, 'c3').click();
  const t = await at(rel(page), 100, 40);
  await page.mouse.click(t.x, t.y);
  await expect(relLayer(page)).toHaveAttribute('data-link-from', 'c3');
  const e = await at(rel(page), 900, 700);
  await page.mouse.click(e.x, e.y);
  await expect(relLayer(page)).toHaveAttribute('data-link-from', '');
  /* Esc */
  await node(page, 'c3').click();
  await page.keyboard.press('Escape');
  await expect(relLayer(page)).toHaveAttribute('data-link-from', '');
  /* 鍵盤：Tab 到人、Enter */
  await node(page, 'c3').focus();
  await page.keyboard.press('Enter');
  await node(page, 'c4').focus();
  await page.keyboard.press('Enter');
  s = await state(page);
  expect(s.relation.links).toEqual([{ from: 'c3', to: 'c4', legend: 'l2' }]);
  expect(errors).toEqual([]);
});

test('線的種類：新增、改名稱／顏色／樣式、排序、刪除（連線一起刪、最後一種不能刪）（F50、F57～F60）', async ({
  page,
}) => {
  const errors = await open(page);
  await toRelation(page);
  for (const n of ['甲', '乙']) await addChar(page, n);
  const legends = page.getByRole('list', { name: /^線的種類/ });
  const editor = page.getByTestId('legend-editor');
  await page.getByRole('button', { name: '新增一種線' }).click();
  let s = await state(page);
  expect(s.relation.legends[5]).toMatchObject({ id: 'l6', label: '關係 6', style: 'solid' });
  await expect(editor).toHaveAttribute('data-legend', 'l6');
  await editor.getByRole('textbox', { name: '名稱' }).fill('師徒');
  await editor.getByRole('textbox', { name: '名稱' }).blur();
  const color = editor.getByRole('textbox', { name: '顏色' });
  await color.fill('#00aa99');
  await color.press('Enter');
  await radio(editor, '虛線').click();
  s = await state(page);
  expect(s.relation.legends[5]).toEqual({
    id: 'l6',
    label: '師徒',
    color: '#00aa99',
    style: 'dash',
  });
  /* 用這種線連線；圖例畫在第 6 列（y 130 + 150） */
  await node(page, 'c1').click();
  await node(page, 'c2').click();
  expect((await state(page)).relation.links).toEqual([{ from: 'c1', to: 'c2', legend: 'l6' }]);
  expect(near(await pixel(rel(page), 32, 280), [0, 0xaa, 0x99], 20)).toBe(true);
  await expect(legends.locator('[data-legend-row="l6"]')).toContainText('1 條');
  /* 排序：拖曳把手移到最上面 → 圖例第一列 */
  const handle = legends.locator('[data-legend-row="l6"] [data-drag-handle]');
  const first = legends.locator('[data-legend-row="l1"]');
  const hb = await handle.boundingBox();
  const fb = await first.boundingBox();
  if (!hb || !fb) throw new Error('找不到清單');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, fb.y + 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await state(page)).relation.legends.map((l) => l.id)[0])
    .toBe('l6');
  expect(near(await pixel(rel(page), 32, 130), [0, 0xaa, 0x99], 20)).toBe(true);
  /* 刪除：連線一起刪，目前的線換成第一種 */
  await legends.getByRole('button', { name: '刪除這種線：師徒' }).click();
  s = await state(page);
  expect(s.relation.legends.map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  expect(s.relation.links).toEqual([]);
  expect((await prefs(page)).legend).toBe('l1');
  for (const n of ['戀愛', '單箭頭', '宿敵', '搭檔'])
    await legends.getByRole('button', { name: `刪除這種線：${n}` }).click();
  await expect(legends.getByRole('button', { name: '刪除這種線：家人' })).toBeDisabled();
  await page.keyboard.press('Control+z');
  expect((await state(page)).relation.legends).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('連線清單（換種類、反轉、刪除）、隨機連線、刪除所有連線、顯示名字、13 人以上變大（F47、F53、F54、F61～F63）', async ({
  page,
}) => {
  const errors = await open(page);
  await toRelation(page);
  await expect(page.getByRole('button', { name: '隨機連線' })).toBeDisabled();
  await seed(page, { characters: chars(4) });
  await node(page, 'c1').click();
  await node(page, 'c3').click();
  const links = page.getByRole('list', { name: '連線清單' });
  await expect(links.locator('li')).toHaveText([/角色1 — 角色3/]);
  /* 換成箭頭、反轉 */
  await links.getByRole('combobox').click();
  await page.getByRole('option', { name: '單箭頭' }).click();
  await expect(links.locator('li')).toHaveText([/角色1 → 角色3/]);
  await links.getByRole('button', { name: /^反轉箭頭/ }).click();
  expect((await state(page)).relation.links).toEqual([{ from: 'c3', to: 'c1', legend: 'l2' }]);
  await links.getByRole('button', { name: /^刪除連線/ }).click();
  await expect(page.getByText('還沒有連線。')).toBeVisible();
  /* 隨機連線：人數 − 1 條、不重複 */
  await page.getByRole('button', { name: '隨機連線' }).click();
  await expect(toast(page, '已隨機加上 3 條線。')).toBeVisible();
  let s = await state(page);
  expect(s.relation.links).toHaveLength(3);
  expect(new Set(s.relation.links.map((l) => [l.from, l.to].sort().join())).size).toBe(3);
  await page.getByRole('button', { name: '隨機連線' }).click();
  expect((await state(page)).relation.links).toHaveLength(6);
  await page.getByRole('button', { name: '隨機連線' }).click();
  await expect(toast(page, '已經沒有可以加的線了。')).toBeVisible();
  /* 刪除所有連線 */
  await page.getByRole('button', { name: '刪除所有連線' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click();
  expect((await state(page)).relation.links).toEqual([]);
  /* 顯示名字：關掉時名字底下的白底不見（頭像下方 y＝中心 + 82） */
  const nameBox = async () => pixel(rel(page), 500, 120 + 82 - 10);
  const withName = await nameBox();
  await page.getByRole('switch', { name: '顯示名字' }).click();
  expect((await state(page)).relation.showNames).toBe(false);
  await expect.poll(async () => (await nameBox()).join()).not.toBe(withName.join());
  /* 沒有圖片的人：角色顏色的圓 */
  expect(near(await pixel(rel(page), 500 + 40, 120), hex(PALETTE[0]))).toBe(true);
  /* 13 人以上 */
  await seed(page, { characters: chars(13) });
  await expect(rel(page)).toHaveAttribute('data-size', '1062x850');
  await expect(page.getByTestId('export-size')).toHaveText('1062 × 850 px');
  s = await state(page);
  expect(s.characters).toHaveLength(13);
  expect(errors).toEqual([]);
});

/* ---------- 下載 ---------- */

test('下載 PNG：四象限（目前這一頁、檔名、像素、不含選取標示、2 倍）、關係圖（檔名、尺寸）（F66～F68）', async ({
  page,
}) => {
  const errors = await open(page);
  await addChar(page, '甲');
  await dragQ(page, [0, 0], [120, -80]);
  await expect(quadLayer(page)).toHaveAttribute('data-selected', 'c1');
  const [dl] = await Promise.all([page.waitForEvent('download'), downloadBtn(page).click()]);
  await expect(toast(page, '已下載 角色性格分布.png')).toBeVisible();
  const bytes = readFileSync((await dl.path()) as string);
  let name = dl.suggestedFilename();
  let png = readPng(bytes);
  expect(name).toBe('角色性格分布.png');
  expect([png.width, png.height]).toEqual([800, 800]);
  expect(near(png.at(520, 320), hex(PALETTE[0]))).toBe(true);
  /* 選取標示不在輸出裡（虛線圓約半徑 17） */
  expect(near(png.at(520 + 17, 320), [255, 255, 255], 30)).toBe(true);
  /* 與預覽逐像素相同（在頁面裡解碼、比對） */
  const diff = await quad(page).evaluate(async (el, b64) => {
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
      type: 'image/png',
    });
    const bmp = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext('2d');
    x?.drawImage(bmp, 0, 0);
    const a = x?.getImageData(0, 0, 800, 800).data ?? new Uint8ClampedArray();
    const b =
      (el as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, 800, 800).data ??
      new Uint8ClampedArray();
    let m = a.length === b.length ? 0 : 999;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  }, bytes.toString('base64'));
  expect(diff).toBe(0);
  /* 2 倍：1600 × 1600，位置 × 2 */
  await radio(page, '2 倍').click();
  await expect(page.getByTestId('export-size')).toHaveText('1600 × 1600 px');
  ({ png } = await downloadPng(page));
  expect([png.width, png.height]).toEqual([1600, 1600]);
  expect(near(png.at(1040, 640), hex(PALETTE[0]))).toBe(true);
  /* 第二頁的標題當檔名；標題空白時用預設 */
  await page.getByRole('button', { name: '下一頁' }).click();
  await page.getByRole('textbox', { name: '標題' }).fill('a/b:c');
  ({ name } = await downloadPng(page));
  expect(name).toBe('a_b_c.png');
  await page.getByRole('textbox', { name: '標題' }).fill('  ');
  ({ name } = await downloadPng(page));
  expect(name).toBe('角色四象限.png');
  /* 關係圖 */
  await toRelation(page);
  await radio(page, '1 倍').click();
  ({ name, png } = await downloadPng(page));
  expect(name).toBe('角色關係圖.png');
  expect([png.width, png.height]).toEqual([1000, 800]);
  expect(near(png.at(500 + 40, 400), hex(PALETTE[0]))).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 儲存、復原、專案檔 ---------- */

test('自動儲存與還原（含圖片、畫面狀態）、圖片讀不到的提醒；復原／重做（F72、F73、F77）', async ({
  page,
}) => {
  const errors = await open(page);
  await batchInput(page).setInputFiles([file('紅.png', await solidPng('#cc2222', 80, 160))]);
  await expect.poll(async () => (await state(page)).characters.length).toBe(1);
  await dragQ(page, [0, 0], [-100, 100]);
  await page.getByRole('button', { name: '下一頁' }).click();
  await toRelation(page);
  await radio(page, '2 倍').click();
  const before = await state(page);
  await page.reload();
  await expect(rel(page)).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await prefs(page)).toMatchObject({ chart: 'relation', page: 1, scale: 2 });
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  await toQuadrant(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('第 2／3 頁');
  await page.getByRole('button', { name: '上一頁' }).click();
  /* 圖片還原：(300, 500) 一帶是紅色 */
  await expect
    .poll(async () => near(await pixel(quad(page), 300, 510), [0xcc, 0x22, 0x22]))
    .toBe(true);
  /* 拖曳整次一步：復原、重做（按鈕與快捷鍵） */
  await dragQ(page, [-100, 100], [0, 0], 10);
  await page.keyboard.press('Control+z');
  expect((await state(page)).pages[0].positions.c1).toEqual({ x: -100, y: 100 });
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).pages[0].positions.c1.x).toBeCloseTo(0, 0);
  await page.getByRole('button', { name: /^復原/ }).click();
  await page.keyboard.press('Control+y');
  expect((await state(page)).pages[0].positions.c1.x).toBeCloseTo(0, 0);
  /* 圖片讀不到：提醒，畫成圓點 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.characters[0].image.id = 'amissing00000';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('有些角色的圖片讀不到了')).toBeVisible();
  expect(near(await pixel(quad(page), 400, 400), hex(PALETTE[0]))).toBe(true);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋圖片）、重設、開啟還原；缺圖片的不套用（F74）', async ({ page }) => {
  const errors = await open(page);
  await batchInput(page).setInputFiles([file('藍.png', await solidPng('#2244cc'))]);
  await expect.poll(async () => (await state(page)).characters.length).toBe(1);
  await addChar(page, '甲');
  await toRelation(page);
  await node(page, 'c1').click();
  await node(page, 'c2').click();
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^char-chart_\d{8}.*\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('char-chart');
  expect(project.version).toBe(1);
  expect(project.data.characters.map((c: { name: string }) => c.name)).toEqual(['藍', '甲']);
  expect(project.data.relation.links).toEqual([{ from: 'c1', to: 'c2', legend: 'l1' }]);
  const imageId = project.data.characters[0].image.id;
  expect(Object.keys(entries)).toContain(`files/${imageId}.png`);

  /* 重設 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  expect((await state(page)).characters).toEqual([]);
  await expect(page.getByTestId('relation-empty')).toBeVisible();

  const openZip = async (name: string, bytes: Uint8Array) => {
    await openProjectItem(page, '開啟專案檔…');
    await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser.setFiles(file(name, Buffer.from(bytes), 'application/zip'));
  };
  await openZip('back.zip', zipBytes);
  await expect(toast(page, '已開啟專案檔。')).toBeVisible();
  expect((await state(page)).relation.links).toHaveLength(1);
  await expect(node(page, 'c1')).toBeVisible();
  /* 缺圖片：不套用 */
  const missing = {
    ...project,
    data: {
      ...project.data,
      characters: [
        {
          ...project.data.characters[0],
          image: { ...project.data.characters[0].image, id: 'anotherimg1' },
        },
      ],
    },
  };
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(page.getByText('專案檔裡少了角色的圖片，或圖片無法讀取。').first()).toBeVisible();
  expect((await state(page)).characters).toHaveLength(2);
  expect(errors).toEqual([]);
});

/* ---------- 原作的檔案 ---------- */

/** 原作存的檔（用原作的頁面產生；內容是自己的測試資料） */
const originalFile = (name: string) =>
  readFileSync(new globalThis.URL(`../unit/fixtures/${name}`, import.meta.url));

async function openProjectFile(page: Page, name: string, bytes: Buffer, mimeType: string) {
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file(name, bytes, mimeType));
}

test('原作 R 的專案 JSON：「開啟專案檔」讀進來（人與圖片、線的種類、連線、標題、顯示名字），可以復原；不認得的 JSON 不套用（F74、D14）', async ({
  page,
}) => {
  const errors = await open(page);
  await addChar(page, '原本的人');
  /* 不認得的 JSON：共用的錯誤，內容不變 */
  await openProjectFile(page, 'other.json', Buffer.from('{"foo":1}'), 'application/json');
  await expect(toast(page, '無法開啟專案檔')).toBeVisible();
  expect((await state(page)).characters.map((c) => c.name)).toEqual(['原本的人']);
  /* 原作存的檔 */
  await openProjectFile(
    page,
    '測試關係圖_project.json',
    originalFile('char-chart-original-relation.json'),
    'application/json',
  );
  await expect(toast(page, '已讀入原作的關係圖：3 個人、3 條連線。')).toBeVisible();
  await expect(rel(page)).toBeVisible();
  const s = await state(page);
  expect(s.characters.map((c) => [c.name, c.marker, c.inMap, !!c.image])).toEqual([
    ['紅色', 'image', true, true],
    ['藍色', 'image', true, true],
    ['綠色', 'image', true, true],
  ]);
  expect(s.characters.map((c) => [c.image?.width, c.image?.height])).toEqual([
    [120, 90],
    [80, 120],
    [100, 100],
  ]);
  expect(s.relation).toMatchObject({ title: '測試關係圖', showNames: false });
  expect(s.relation.legends.map((l) => [l.label, l.style])).toEqual([
    ['同伴', 'solid'],
    ['敵視', 'dash'],
    ['在意', 'arrow'],
  ]);
  expect(s.relation.links).toEqual([
    { from: 'c1', to: 'c2', legend: 'l1' },
    { from: 'c3', to: 'c1', legend: 'l3' },
    { from: 'c2', to: 'c3', legend: 'l2' },
  ]);
  expect(s.pages.every((p) => Object.keys(p.positions).length === 0)).toBe(true);
  /* 頭像：3 人，第一個在正上方 (500, 120)；中央白、旁邊是圖片的顏色 */
  await expect
    .poll(async () => near(await pixel(rel(page), 530, 120), [0xcc, 0x22, 0x22]))
    .toBe(true);
  expect(near(await pixel(rel(page), 500, 120), [255, 255, 255])).toBe(true);
  /* 一步復原：回到原本的內容 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).characters.map((c) => c.name)).toEqual(['原本的人']);
  expect(errors).toEqual([]);
});

test('原作 Q 的全部備份碼：「貼上原作的備份碼…」讀進來（頁、角色、位置、圖片、目前的頁），錯誤時內容不變；貼到座標碼欄時提醒（F46、D14）', async ({
  page,
}) => {
  const errors = await open(page);
  await toRelation(page);
  await page.getByTestId('legend-editor').getByRole('textbox', { name: '名稱' }).fill('自己的線');
  await page.getByTestId('legend-editor').getByRole('textbox', { name: '名稱' }).blur();
  await addChar(page, '原本的人');
  const code = originalFile('char-chart-original-backup.txt').toString('utf8');
  const dialog = page.getByRole('dialog', { name: '貼上原作的備份碼' });
  await openProjectItem(page, '貼上原作的備份碼…');
  await expect(dialog).toBeVisible();
  /* 空白、不是備份碼：說明，內容不變 */
  await dialog.getByRole('button', { name: '讀入' }).click();
  await expect(dialog.getByText('請先貼上備份碼。')).toBeVisible();
  await dialog.getByRole('textbox', { name: '備份碼' }).fill(code.slice(0, 200));
  await dialog.getByRole('button', { name: '讀入' }).click();
  await expect(dialog.getByText('這不是原作的備份碼（可能少複製了一段）。')).toBeVisible();
  expect((await state(page)).characters.map((c) => c.name)).toEqual(['原本的人']);
  /* 原作複製的碼 */
  await dialog.getByRole('textbox', { name: '備份碼' }).fill(code);
  await dialog.getByRole('button', { name: '讀入' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, '已讀入原作的備份碼：3 個角色、2 頁。')).toBeVisible();
  await expect(quad(page)).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText('第 2／2 頁');
  const s = await state(page);
  expect(s.pages.map((p) => p.title)).toEqual(['冒險者的性格', '戰鬥風格']);
  expect(s.characters.map((c) => [c.name, c.color, c.marker, !!c.image])).toEqual([
    ['艾琳', '#ef4444', 'dot', false],
    ['布魯斯', '#3b82f6', 'dot', false],
    ['凱特', '#ef4444', 'image', true],
  ]);
  expect(s.pages[1].positions).toEqual({ c1: { x: 40.5, y: 60 }, c3: { x: -200, y: -100 } });
  /* 關係圖的線的種類留著、連線清掉 */
  expect(s.relation.legends[0].label).toBe('自己的線');
  expect(s.relation.links).toEqual([]);
  /* 第 2 頁：凱特的圖片標記（原作縮成 50 × 75）在 (200, 300) */
  await expect
    .poll(async () => near(await pixel(quad(page), 200, 280), [0x22, 0x44, 0xcc]))
    .toBe(true);
  expect(near(await pixel(quad(page), 440, 460), hex('#ef4444'))).toBe(true);
  /* 貼到座標碼欄：提醒改用備份碼的選項 */
  await page.getByRole('button', { name: '座標碼', exact: true }).click();
  await page.getByRole('textbox', { name: '這一頁的座標碼' }).fill(code);
  await page.getByRole('button', { name: '加入座標' }).click();
  await expect(toast(page, /這是原作的全部備份碼/)).toBeVisible();
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  expect((await state(page)).characters.map((c) => c.name)).toEqual(['原本的人']);
  expect(errors).toEqual([]);
});

/* ---------- 觸控 ---------- */

test('觸控：拖曳角色、點兩下改字、點人連線（F76）', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  await addChar(page, '甲');
  const cdp = await ctx.newCDPSession(page);
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    p?: { x: number; y: number },
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
  const p = await atQ(page, 0, 0);
  const q = await atQ(page, 150, 100);
  await touch('touchStart', p);
  for (let i = 1; i <= 5; i++)
    await touch('touchMove', { x: p.x + ((q.x - p.x) * i) / 5, y: p.y + ((q.y - p.y) * i) / 5 });
  await touch('touchEnd');
  const pos = (await state(page)).pages[0].positions.c1;
  expect(pos.x).toBeCloseTo(150, 0);
  expect(pos.y).toBeCloseTo(100, 0);
  /* 點兩下標題 */
  const t = await atQ(page, 0, -365);
  await touch('touchStart', t);
  await touch('touchEnd');
  await touch('touchStart', t);
  await touch('touchEnd');
  await expect(page.getByTestId('label-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  /* 關係圖：點人連線 */
  await addChar(page, '乙');
  await radio(page, '角色關係圖').tap();
  await node(page, 'c1').tap();
  await node(page, 'c2').tap();
  expect((await state(page)).relation.links).toEqual([{ from: 'c1', to: 'c2', legend: 'l1' }]);
  expect(errors).toEqual([]);
  await ctx.close();
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));
  const errors = await open(page);
  await noHorizontalScroll(page);
  await seed(page, {
    characters: chars(4),
    pages: [
      {
        id: 'p1',
        title: '角色性格分布',
        labels: { top: '外向', bottom: '內向', left: '感性', right: '理性' },
        positions: {
          c1: { x: -150, y: -120 },
          c2: { x: 120, y: -60 },
          c3: { x: -60, y: 160 },
          c4: { x: 200, y: 180 },
        },
      },
    ],
  });
  await row(page, 'c2').click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('char-chart-1280.png', { fullPage: true });
  await toRelation(page);
  await node(page, 'c1').click();
  await node(page, 'c3').click();
  await node(page, 'c2').click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('char-chart-relation-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('char-chart-relation-390.png', { fullPage: true });
  await toQuadrant(page);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('char-chart-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
