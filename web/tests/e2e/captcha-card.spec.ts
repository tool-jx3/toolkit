/**
 * 驗證題梗圖產生器（建置產物 next/captcha-card/）的端對端測試（規格 docs/refactor/specs/captcha-card.md）：
 * - 開頁沒有錯誤、預設內容（範例的 9 格、4 格勾選）、頁尾只有靈感來源；
 * - 題目文字、關鍵字（點預覽上的關鍵字跳到欄位）、補充說明、按鈕文字；
 * - 格子：點一下勾選／取消、空格子選檔、換一張、拿掉、調整範圍（共用的圖片放進框）；
 * - 放入圖片（依序放進空格子、沒有位置的提醒、沒有空格）、排列模式（拖曳、方向鍵、Esc）、全選、打亂、清空；
 * - 代表圖（放入、縮放、回到初始、調整範圍、拿掉、拖到預覽的代表圖上）、整個視窗拖放到某一格、貼上；
 * - 外觀：主題色（色票、自訂）、格數（藏起來的格子保留）、底部操作列；
 * - 動畫：結尾的欄位、游標、點選順序（隨機＋換一個順序）、速度（影格表）、小預覽、放大預覽；
 * - 匯出：PNG（尺寸、像素與預覽一致）、GIF（尺寸、格數、延遲、播放次數）、APNG、WebP、沒有圖時不能匯出動畫；
 * - 自動儲存與還原（含圖片）、復原／重做、專案檔 ZIP、重設；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 * 兩次修改之間至少隔 450 ms（自動儲存與復原的步驟分開）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { composeGif, parseGif } from '../helpers/gif';
import { decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('captcha-card') ?? { id: 'captcha-card', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:captcha-card';
const PREFS_KEY = 'trpg-toolkit:captcha-card:preview';
const PS = 2;

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Img {
  kind: 'asset' | 'sample';
  id?: string;
  name?: string;
  key?: string;
}
interface Stored {
  theme: string;
  prompt: string;
  keyword: string;
  note: string;
  verify: string;
  avatar: { image: Img | null; place: { zoom: number; x: number; y: number; turns: number } };
  cols: number;
  showFoot: boolean;
  cells: { image: Img | null; place: { zoom: number; x: number; y: number }; selected: boolean }[];
  ending: string;
  errorText: string;
  popup: { icon: string; title: string; message: string; button: string };
  checkLabel: string;
  cursor: boolean;
  order: string;
  orderSeed: number;
  speed: string;
}

interface Frame {
  ms: number;
  phase: string;
  s: { n: number; press: boolean; cursor: unknown; robot: unknown; err: number; pop: unknown };
}

/* ---------- 共用 ---------- */

const hex = (h: string): Rgba => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
  255,
];

async function solidPng(color: string, w = 120, h = 90): Promise<Buffer> {
  const c = hex(color);
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(c, i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 左半紅、右半藍（調整範圍時看得出位置） */
async function halfPng(w = 200, h = 100): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(x < w / 2 ? [210, 40, 40, 255] : [40, 70, 210, 255], (y * w + x) * 4);
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
  await expect(page.getByRole('heading', { level: 1, name: '驗證題梗圖產生器' })).toBeVisible();
  return errors;
}

const settle = (page: Page) => page.waitForTimeout(450);
const canvas = (page: Page) => page.getByTestId('card-canvas');
const tab = (page: Page, name: '卡片' | '動畫') => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const dialog = (page: Page) => page.getByRole('dialog');
const cell = (page: Page, i: number) => page.locator(`[data-cell="${i}"] > button`).first();
const cellBox = (page: Page, i: number) => page.locator(`[data-cell="${i}"]`);
const toolbar = (page: Page) => page.getByTestId('grid-toolbar');
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const avatarInput = (page: Page) =>
  page.getByRole('group', { name: '代表圖載入區' }).locator('input[type=file]');

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

async function timeline(page: Page): Promise<{ frames: Frame[]; layout: { height: number } }> {
  return page.evaluate(() =>
    (window as unknown as { __captchaCard: { timeline: () => never } }).__captchaCard.timeline(),
  );
}

/** 預覽畫布上一點的顏色（卡片單位） */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y, k]) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')?.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y, PS],
  );
}

const near = (a: number[], b: number[], tol = 10) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

/** 第 i 格（3 × 3）勾勾圓的左上（避開白色的勾）、格子的中心、格子的左上角（卡片單位） */
const C3 = 123.333;
const corner3 = (i: number): [number, number] => [
  3 + (i % 3) * (C3 + 2) + 10,
  121 + Math.floor(i / 3) * (C3 + 2) + 40,
];
const badge3 = (i: number): [number, number] => [
  3 + (i % 3) * (C3 + 2) + 13,
  121 + Math.floor(i / 3) * (C3 + 2) + 13,
];
const center3 = (i: number): [number, number] => [
  3 + (i % 3) * (C3 + 2) + C3 / 2,
  121 + Math.floor(i / 3) * (C3 + 2) + C3 / 2,
];

/** 卡片單位 → 畫面座標 */
async function screenAt(page: Page, x: number, y: number) {
  const b = await canvas(page).boundingBox();
  if (!b) throw new Error('no canvas');
  const h = await canvas(page).evaluate((el) => (el as HTMLCanvasElement).height / 2);
  return { x: b.x + (x / 380) * b.width, y: b.y + (y / h) * b.height };
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
  const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x: number, y: number): Rgba => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

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

/** 以 DataTransfer 在畫面座標 (x, y) 放下檔案（整個視窗的拖放） */
async function dropAt(page: Page, at: { x: number; y: number }, files: [string, Buffer][]) {
  await page.evaluate(
    async ({ files, x, y }) => {
      const dt = new DataTransfer();
      for (const [name, b64] of files) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], name, { type: 'image/png' }));
      }
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    },
    {
      files: files.map(([n, b]) => [n, b.toString('base64')] as [string, string]),
      x: at.x,
      y: at.y,
    },
  );
}

async function paste(page: Page, name: string, buffer: Buffer) {
  await page.evaluate(
    ({ name, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: 'image/png' }));
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { name, b64: buffer.toString('base64') },
  );
}

async function chooseFiles(page: Page, trigger: Locator, files: ReturnType<typeof file>[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger.click()]);
  await chooser.setFiles(files);
}

async function clearGrid(page: Page) {
  await toolbar(page).getByRole('button', { name: '清空' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 0 格・圖片 0／9 格');
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設的範例（9 格、4 格勾選）、頁尾只有靈感來源（F11、F27、F55）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-size', '760x1130');
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 4 格・圖片 9／9 格');
  for (const [i, on] of [
    [0, 'on'],
    [1, 'off'],
    [2, 'on'],
    [4, 'on'],
    [8, 'on'],
  ] as const)
    await expect(cellBox(page, i)).toHaveAttribute('data-state', on);
  await expect(cell(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '關鍵字' })).toHaveValue('探索者');
  /* 色帶是主題色、勾選的格子左上角有主題色的勾勾圓 */
  expect(near(await pixel(page, 10, 60), hex('#5b8def'), 4)).toBe(true);
  expect(near(await pixel(page, ...badge3(0)), hex('#5b8def'), 6)).toBe(true);
  expect(near(await pixel(page, ...badge3(1)), hex('#5b8def'), 30)).toBe(false);
  /* 驗證按鈕（底部操作列）與外框 */
  expect(near(await pixel(page, 340, 530), hex('#5b8def'), 6)).toBe(true);
  expect(near(await pixel(page, 0.5, 300), [227, 228, 232], 6)).toBe(true);
  /* 匯出：預設 GIF、150% */
  await expect(exportPanel(page).getByRole('radio', { name: 'GIF', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(exportPanel(page).getByRole('combobox', { name: '尺寸' })).toContainText('570×848');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://dearmysn1p3r.github.io/DearMySn1p3r_44/',
  );
  await expect(footer.getByRole('link')).toHaveText('dearmysn1p3r/DearMySn1p3r_44');
  await expect(page.getByText('reCAPTCHA')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 題目 ---------- */

test('題目：題目文字、關鍵字（上限 24 字、點預覽上的關鍵字跳到欄位）、補充說明、按鈕文字（F01～F05）', async ({
  page,
}) => {
  const errors = await open(page);
  const keyword = page.getByRole('textbox', { name: '關鍵字' });
  await keyword.fill('深潛者'.repeat(10));
  await keyword.blur();
  expect(Array.from((await state(page)).keyword)).toHaveLength(24);
  await settle(page);
  await page.getByRole('textbox', { name: '題目文字' }).fill('請選出所有\n有觸手的圖片');
  await page.getByRole('textbox', { name: '題目文字' }).blur();
  await settle(page);
  await page.getByRole('textbox', { name: '補充說明' }).fill('全部都是。');
  await page.getByRole('textbox', { name: '補充說明' }).blur();
  await settle(page);
  const s = await state(page);
  expect(s.prompt).toBe('請選出所有 有觸手的圖片');
  expect(s.note).toBe('全部都是。');
  /* 按鈕文字變長，按鈕也變寬（左邊緣往左移） */
  const before = (await timeline(page)).layout as unknown as {
    verify: { x: number; width: number };
  };
  await page.getByRole('textbox', { name: '按鈕文字' }).fill('我確定沒有');
  await page.getByRole('textbox', { name: '按鈕文字' }).blur();
  await settle(page);
  const after = (await timeline(page)).layout as unknown as {
    verify: { x: number; width: number };
  };
  expect(after.verify.width).toBeGreaterThan(before.verify.width + 30);
  expect((await state(page)).verify).toBe('我確定沒有');
  expect(near(await pixel(page, after.verify.x + 4, 515), hex('#5b8def'), 6)).toBe(true);
  /* 點預覽上的關鍵字：關鍵字欄位取得焦點 */
  await keyword.fill('KP');
  await keyword.blur();
  await page.getByRole('button', { name: '關鍵字：按一下修改' }).click();
  await expect(keyword).toBeFocused();
  expect(errors).toEqual([]);
});

/* ---------- 格子 ---------- */

test('格子：點一下勾選／取消、空格子選檔（多張）、換一張、拿掉、調整範圍（F16～F20）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 取消、再勾 */
  await cell(page, 0).click();
  await expect(cellBox(page, 0)).toHaveAttribute('data-state', 'off');
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 3 格・圖片 9／9 格');
  expect(near(await pixel(page, ...badge3(0)), hex('#5b8def'), 6)).toBe(false);
  await settle(page);
  await cell(page, 1).click();
  await expect(cellBox(page, 1)).toHaveAttribute('data-state', 'on');
  expect(near(await pixel(page, ...badge3(1)), hex('#5b8def'), 6)).toBe(true);
  await settle(page);
  /* 拿掉第 2 格（滑過時右上角的按鈕） */
  await cellBox(page, 1).hover();
  await expect(cellBox(page, 1).getByTestId('cell-tools')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '第 2 格：拿掉圖片' }).click();
  await expect(cellBox(page, 1)).toHaveAttribute('data-state', 'empty');
  expect(near(await pixel(page, ...center3(1)), [236, 238, 242], 3)).toBe(true);
  await settle(page);
  /* 點空格子選檔：兩張，第一張放這格、第二張沒有空格（9 格裡只有這一格空） */
  await chooseFiles(page, cell(page, 1), [
    file('red.png', await solidPng('#dd2222')),
    file('green.png', await solidPng('#22aa44')),
  ]);
  await expect(toast(page, '已放入 1 張圖片')).toBeVisible();
  await expect(toast(page, '1 張沒有位置，沒有放入。')).toBeVisible();
  await expect(cellBox(page, 1)).toHaveAttribute('data-state', 'on');
  let s = await state(page);
  expect(s.cells[1].image?.name).toBe('red.png');
  expect(s.cells[1].selected).toBe(true);
  await expect
    .poll(async () => near(await pixel(page, ...center3(1)), [221, 34, 34], 3))
    .toBe(true);
  await settle(page);
  /* 換一張 */
  await cellBox(page, 1).hover();
  await chooseFiles(page, page.getByRole('button', { name: '第 2 格：換一張圖片' }), [
    file('half.png', await halfPng()),
  ]);
  await expect.poll(async () => (await state(page)).cells[1].image?.name).toBe('half.png');
  /* 調整範圍：2：1 的圖蓋滿正方形，中央是紅藍交界；往左拖 → 看到更多藍色 */
  await cellBox(page, 1).hover();
  await page.getByRole('button', { name: '第 2 格：調整範圍' }).click();
  await expect(dialog(page).getByRole('heading', { name: '調整第 2 格的範圍' })).toBeVisible();
  const zoom = dialog(page).getByRole('slider').first();
  await zoom.focus();
  await page.keyboard.press('End');
  const view = page.getByTestId('frame-view');
  await expect
    .poll(async () => Number(((await view.getAttribute('data-placement')) ?? '0').split(',')[0]))
    .toBeCloseTo(4, 1);
  await page.keyboard.press('Home');
  const vb = await view.boundingBox();
  if (!vb) throw new Error('no view');
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.mouse.down();
  await page.mouse.move(vb.x + vb.width / 2 - 60, vb.y + vb.height / 2, { steps: 6 });
  await page.mouse.up();
  await dialog(page).getByRole('button', { name: '套用' }).click();
  await expect(dialog(page)).toBeHidden();
  s = await state(page);
  expect(s.cells[1].place.x).toBeLessThan(-0.05);
  const [cx, cy] = center3(1);
  expect(near(await pixel(page, cx, cy), [40, 70, 210], 6)).toBe(true);
  expect(errors).toEqual([]);
});

test('放入圖片：依序放進空格子、新圖自動勾選、沒有位置與沒有空格的提醒、不是圖片（F22、F55）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 已經滿了 */
  await chooseFiles(page, toolbar(page).getByRole('button', { name: '放入圖片' }), [
    file('a.png', await solidPng('#dd2222')),
  ]);
  await expect(toast(page, '沒有空的格子')).toBeVisible();
  await clearGrid(page);
  await settle(page);
  const colors = ['#dd2222', '#22aa44', '#2244cc'];
  await chooseFiles(
    page,
    toolbar(page).getByRole('button', { name: '放入圖片' }),
    await Promise.all(colors.map(async (c, i) => file(`p${i}.png`, await solidPng(c)))),
  );
  await expect(toast(page, '已放入 3 張圖片')).toBeVisible();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 3 格・圖片 3／9 格');
  const s = await state(page);
  expect(s.cells.slice(0, 4).map((c) => c.image?.name ?? null)).toEqual([
    'p0.png',
    'p1.png',
    'p2.png',
    null,
  ]);
  expect(s.cells.slice(0, 3).every((c) => c.selected)).toBe(true);
  await settle(page);
  /* 8 張放進 6 個空格：2 張沒有位置；不是圖片的檔案另外說明 */
  const many = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => file(`m${i}.png`, await solidPng('#888888'))),
  );
  await chooseFiles(page, toolbar(page).getByRole('button', { name: '放入圖片' }), [
    ...many,
    file('note.txt', Buffer.from('hello'), 'text/plain'),
  ]);
  await expect(toast(page, '已放入 6 張圖片')).toBeVisible();
  await expect(toast(page, /「note\.txt」不是圖片。.*2 張沒有位置/)).toBeVisible();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 9 格・圖片 9／9 格');
  expect(errors).toEqual([]);
});

test('排列模式：拖曳換位置（含空格）、方向鍵、點一下不勾選、Esc 結束（F23）', async ({ page }) => {
  const errors = await open(page);
  await cellBox(page, 1).hover();
  await page.getByRole('button', { name: '第 2 格：拿掉圖片' }).click();
  await settle(page);
  const keys = async () => (await state(page)).cells.slice(0, 9).map((c) => c.image?.key ?? null);
  const k0 = await keys();
  await toolbar(page).getByRole('button', { name: '排列模式' }).click();
  await expect(toolbar(page).getByRole('button', { name: '排列完成' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('arrange-hint')).toBeVisible();
  await expect(page.getByTestId('cell-tools')).toHaveCount(0);
  /* 點一下不會勾選 */
  await cell(page, 3).click();
  await expect(cellBox(page, 3)).toHaveAttribute('data-state', 'off');
  /* 拖第 1 格到第 5 格：交換 */
  const a = await screenAt(page, ...center3(0));
  const b = await screenAt(page, ...center3(4));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  let k = await keys();
  expect([k[0], k[4]]).toEqual([k0[4], k0[0]]);
  await settle(page);
  /* 拖到空格子＝移過去 */
  const c = await screenAt(page, ...center3(2));
  const e = await screenAt(page, ...center3(1));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(e.x, e.y, { steps: 6 });
  await page.mouse.up();
  k = await keys();
  expect([k[1], k[2]]).toEqual([k0[2], null]);
  await settle(page);
  /* 方向鍵：第 4 格往右 → 和第 5 格交換，焦點跟著走 */
  const before = await keys();
  await cell(page, 3).focus();
  await page.keyboard.press('ArrowRight');
  k = await keys();
  expect([k[3], k[4]]).toEqual([before[4], before[3]]);
  await expect(cell(page, 4)).toBeFocused();
  /* Esc 結束 */
  await page.keyboard.press('Escape');
  await expect(toolbar(page).getByRole('button', { name: '排列模式' })).toBeVisible();
  /* 復原一步 */
  await page.keyboard.press('Control+z');
  expect((await keys()).slice(3, 5)).toEqual([before[3], before[4]]);
  expect(errors).toEqual([]);
});

test('全選、打亂、清空（確認、藏起來的格子也清掉）；沒有圖時的提醒（F24～F26）', async ({
  page,
}) => {
  const errors = await open(page);
  const bar = toolbar(page);
  await bar.getByRole('button', { name: '全選' }).click();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 9 格・圖片 9／9 格');
  await settle(page);
  await bar.getByRole('button', { name: '全選' }).click();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 0 格・圖片 9／9 格');
  await settle(page);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 9 格・圖片 9／9 格');
  await settle(page);
  /* 打亂：內容一樣、順序（多半）不同 */
  const sig = async () =>
    (await state(page)).cells
      .slice(0, 9)
      .map((c) => c.image?.key)
      .join(',');
  const s0 = await sig();
  let changed = false;
  for (let i = 0; i < 4 && !changed; i++) {
    await bar.getByRole('button', { name: '打亂' }).click();
    await settle(page);
    changed = (await sig()) !== s0;
  }
  expect(changed).toBe(true);
  expect((await sig()).split(',').sort()).toEqual(s0.split(',').sort());
  /* 4 × 4 放一張到第 10 格，再切回 3 × 3 清空：藏起來的也清掉 */
  await page.getByRole('radio', { name: '4 × 4' }).click();
  await settle(page);
  await chooseFiles(page, cell(page, 9), [file('x.png', await solidPng('#123456'))]);
  await expect.poll(async () => (await state(page)).cells[9].image?.name).toBe('x.png');
  await page.getByRole('radio', { name: '3 × 3' }).click();
  await settle(page);
  /* 取消時不清 */
  await bar.getByRole('button', { name: '清空' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  expect((await state(page)).cells[0].image).not.toBeNull();
  await clearGrid(page);
  expect((await state(page)).cells.every((c) => !c.image)).toBe(true);
  await expect(bar.getByRole('button', { name: '清空' })).toBeDisabled();
  await bar.getByRole('button', { name: '全選' }).click();
  await expect(toast(page, '請先在格子裡放入圖片。')).toBeVisible();
  await bar.getByRole('button', { name: '打亂' }).click();
  await expect(toast(page, '請先在格子裡放入圖片。')).toBeVisible();
  /* 沒有圖：動畫不能匯出、小預覽顯示說明 */
  await expect(exportPanel(page).getByRole('radio', { name: 'GIF', exact: true })).toBeDisabled();
  await expect(exportPanel(page)).toContainText('格子裡還沒有圖片，無法匯出動畫。');
  await tab(page, '動畫').click();
  await expect(page.getByTestId('mini-box')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByText('格子裡放了圖片之後，這裡會播放動畫。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('拖放與貼上：拖到某一格從那一格開始放、拖到代表圖換代表圖、貼上到滑鼠指著的格子（F06、F21、F28）', async ({
  page,
}) => {
  const errors = await open(page);
  await clearGrid(page);
  await settle(page);
  const at = await screenAt(page, ...center3(4));
  await dropAt(page, at, [
    ['gold.png', await solidPng('#ddaa22')],
    ['pink.png', await solidPng('#ee66aa')],
  ]);
  await expect.poll(async () => (await state(page)).cells[4].image?.name).toBe('gold.png');
  let s = await state(page);
  expect(s.cells[0].image?.name).toBe('pink.png');
  await settle(page);
  /* 拖到代表圖上 */
  const av = await screenAt(page, 318, 60);
  await dropAt(page, av, [['me.png', await solidPng('#f2711c')]]);
  await expect.poll(async () => (await state(page)).avatar.image?.name).toBe('me.png');
  await expect.poll(async () => near(await pixel(page, 318, 60), [0xf2, 0x71, 0x1c], 3)).toBe(true);
  await settle(page);
  /* 貼上：滑鼠指著第 9 格 */
  await cellBox(page, 8).hover();
  await paste(page, 'teal.png', await solidPng('#11aaaa'));
  await expect.poll(async () => (await state(page)).cells[8].image?.name).toBe('teal.png');
  s = await state(page);
  expect(s.cells[8].selected).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 代表圖 ---------- */

test('代表圖：放入、縮放 100～400%、回到初始、調整範圍、拿掉、點預覽上的空代表圖選檔（F06～F11）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('avatar-name')).toContainText('範例圖');
  await avatarInput(page).setInputFiles(file('half.png', await halfPng()));
  await expect(toast(page, '已換上代表圖')).toBeVisible();
  await expect(page.getByTestId('avatar-name')).toContainText('half.png');
  /* 蓋滿：中央是紅藍交界，左邊紅、右邊藍 */
  expect(near(await pixel(page, 285, 60), [210, 40, 40], 6)).toBe(true);
  expect(near(await pixel(page, 351, 60), [40, 70, 210], 6)).toBe(true);
  await settle(page);
  const zoom = page.getByRole('slider', { name: '縮放' });
  await zoom.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await state(page)).avatar.place.zoom).toBe(4);
  await expect(page.getByRole('spinbutton', { name: '縮放' })).toHaveValue('400');
  await settle(page);
  await page.getByRole('button', { name: '回到初始' }).click();
  expect((await state(page)).avatar.place).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
  await settle(page);
  /* 調整範圍：點預覽上的代表圖也會打開 */
  await page.getByRole('button', { name: '代表圖：按一下放入或調整範圍' }).click();
  await expect(dialog(page).getByRole('heading', { name: '調整代表圖的範圍' })).toBeVisible();
  await dialog(page).getByRole('button', { name: '旋轉 90°' }).click();
  await dialog(page).getByRole('button', { name: '套用' }).click();
  await expect.poll(async () => (await state(page)).avatar.place.turns).toBe(1);
  await settle(page);
  await page.getByRole('button', { name: '拿掉代表圖' }).click();
  expect((await state(page)).avatar.image).toBeNull();
  /* 空的代表圖：半透明的白框（色帶色變淡） */
  const p = await pixel(page, 318, 60);
  expect(near(p, hex('#5b8def'), 4)).toBe(false);
  expect(p[0]).toBeGreaterThan(0x5b);
  await expect(page.getByRole('spinbutton', { name: '縮放' })).toBeDisabled();
  await settle(page);
  await chooseFiles(page, page.getByRole('button', { name: '代表圖：按一下放入或調整範圍' }), [
    file('red.png', await solidPng('#dd2222')),
  ]);
  await expect.poll(async () => (await state(page)).avatar.image?.name).toBe('red.png');
  expect(errors).toEqual([]);
});

/* ---------- 外觀 ---------- */

test('外觀：主題色（色票、自訂、亮色用深色字）、格數（藏起來的格子保留）、底部操作列（F12～F14）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '主題色 #ee6a5f' }).click();
  await expect(page.getByRole('button', { name: '主題色 #ee6a5f' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await state(page)).theme).toBe('#ee6a5f');
  expect(near(await pixel(page, 10, 60), hex('#ee6a5f'), 4)).toBe(true);
  expect(near(await pixel(page, ...badge3(0)), hex('#ee6a5f'), 6)).toBe(true);
  await settle(page);
  const custom = page.getByTestId('custom-theme').getByRole('textbox');
  await custom.fill('#fff3a0');
  await custom.press('Enter');
  await expect.poll(async () => (await state(page)).theme).toBe('#fff3a0');
  await expect(page.getByTestId('custom-theme')).toHaveAttribute('data-active', 'true');
  await settle(page);
  /* 4 × 4：16 格，後 7 格空；卡片大小不變 */
  await page.getByRole('radio', { name: '4 × 4' }).click();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 4 格・圖片 9／16 格');
  await expect(canvas(page)).toHaveAttribute('data-size', '760x1130');
  await expect(cellBox(page, 15)).toHaveAttribute('data-state', 'empty');
  await settle(page);
  await chooseFiles(page, cell(page, 12), [file('x.png', await solidPng('#123456'))]);
  await expect.poll(async () => (await state(page)).cells[12].image?.name).toBe('x.png');
  await settle(page);
  await page.getByRole('radio', { name: '3 × 3' }).click();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 4 格・圖片 9／9 格');
  await expect(cellBox(page, 12)).toHaveCount(0);
  await settle(page);
  await page.getByRole('radio', { name: '4 × 4' }).click();
  await expect(cellBox(page, 12)).toHaveAttribute('data-state', 'on');
  await settle(page);
  /* 底部操作列 */
  await page.getByRole('switch', { name: '底部操作列' }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '760x996');
  expect((await state(page)).showFoot).toBe(false);
  const t = await timeline(page);
  expect(t.frames.some((f) => f.s.press)).toBe(false);
  expect(errors).toEqual([]);
});

/* ---------- 動畫 ---------- */

test('動畫：結尾的欄位、游標、點選順序、速度（影格表與原作相同的數值）（F29～F37）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '動畫').click();
  let t = await timeline(page);
  expect(t.frames).toHaveLength(61);
  expect(t.frames.reduce((a, f) => a + f.ms, 0)).toBe(7010);
  await expect(page.getByRole('textbox', { name: '勾選框文字' })).toHaveValue('我不是機器人');
  /* 失敗 */
  await page.getByRole('radio', { name: '失敗' }).click();
  await expect(page.getByTestId('ending-desc')).toContainText('紅叉');
  t = await timeline(page);
  expect(t.frames.at(-1)?.ms).toBe(2000);
  await settle(page);
  /* 錯誤文字 */
  await page.getByRole('radio', { name: '錯誤文字' }).click();
  await expect(page.getByRole('textbox', { name: '勾選框文字' })).toHaveCount(0);
  const err = page.getByRole('textbox', { name: '錯誤文字' });
  await err.fill('你漏掉了一個探索者');
  await err.blur();
  t = await timeline(page);
  expect(t.frames.at(-1)?.s.n).toBe(0);
  expect(t.frames.at(-1)?.s.err).toBe(1);
  await settle(page);
  /* 跳出視窗 */
  await page.getByRole('radio', { name: '跳出視窗' }).click();
  await expect(page.getByTestId('popup-fields')).toBeVisible();
  await page.getByRole('radio', { name: '警告' }).click();
  await settle(page);
  await page.getByRole('textbox', { name: '標題' }).fill('SAN 值檢定');
  await page.getByRole('textbox', { name: '標題' }).blur();
  await settle(page);
  await page.getByRole('textbox', { name: '內容' }).fill('請擲 1D100。');
  await page.getByRole('textbox', { name: '內容' }).blur();
  await settle(page);
  await page.getByRole('textbox', { name: '按鈕文字' }).fill('擲骰');
  await page.getByRole('textbox', { name: '按鈕文字' }).blur();
  const s = await state(page);
  expect(s.popup).toEqual({
    icon: 'warn',
    title: 'SAN 值檢定',
    message: '請擲 1D100。',
    button: '擲骰',
  });
  t = await timeline(page);
  expect(t.frames).toHaveLength(50);
  expect(t.frames.at(-1)?.ms).toBe(2300);
  await settle(page);
  /* 游標關掉 */
  await page.getByRole('switch', { name: '滑鼠游標' }).click();
  t = await timeline(page);
  expect(t.frames).toHaveLength(15);
  expect(t.frames.every((f) => !f.s.cursor)).toBe(true);
  await settle(page);
  /* 速度：慢 → 開頭停 750 */
  await page.getByRole('radio', { name: '慢', exact: true }).click();
  t = await timeline(page);
  expect(t.frames[0].ms).toBe(750);
  await settle(page);
  await page.getByRole('radio', { name: '快', exact: true }).click();
  t = await timeline(page);
  expect(t.frames[0].ms).toBe(325);
  await settle(page);
  /* 隨機順序：換一個順序＝種子加 1 */
  await page.getByRole('radio', { name: '隨機' }).click();
  await settle(page);
  const seed0 = (await state(page)).orderSeed;
  await page.getByRole('button', { name: '換一個順序' }).click();
  expect((await state(page)).orderSeed).toBe(seed0 + 1);
  expect((await state(page)).order).toBe('random');
  expect(errors).toEqual([]);
});

test('小預覽一直播放、可以暫停；放大預覽（播放列、匯出 GIF）（F38～F40）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await tab(page, '動畫').click();
  const mini = page.getByTestId('mini-canvas');
  await expect(mini).toBeVisible();
  await expect(mini).toHaveAttribute('data-frames', '61');
  await expect(page.getByTestId('mini-info')).toHaveText('61 格、約 7.0 秒');
  const f0 = Number(await mini.getAttribute('data-frame'));
  await expect.poll(async () => Number(await mini.getAttribute('data-frame'))).not.toBe(f0);
  await page.getByTestId('mini-toggle').click();
  const paused = await mini.getAttribute('data-frame');
  await page.waitForTimeout(400);
  expect(await mini.getAttribute('data-frame')).toBe(paused);
  await page.getByTestId('mini-toggle').click();
  /* 改設定：從頭播 */
  await page.getByRole('radio', { name: '失敗' }).click();
  await expect(mini).toHaveAttribute('data-frames', '70');
  /* 放大預覽 */
  await page.getByRole('button', { name: '放大預覽' }).click();
  await expect(dialog(page).getByRole('heading', { name: '動畫預覽' })).toBeVisible();
  const big = page.getByTestId('big-canvas');
  await expect(big).toHaveAttribute('width', '570');
  await expect(big).toHaveAttribute('height', '848');
  await expect(dialog(page)).toContainText('70 格、約 7.3 秒');
  /* 播放列：暫停、拉到結尾 */
  await dialog(page).getByRole('button', { name: '暫停' }).click();
  await dialog(page).getByRole('slider').first().focus();
  await page.keyboard.press('End');
  await expect(big).toHaveAttribute('data-frame', '69');
  /* 結尾是失敗：小視窗的勾選框裡有紅叉 */
  const red = await big.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 80 && d[i + 2] < 70) n++;
    return n;
  });
  expect(red).toBeGreaterThan(30);
  await dialog(page).getByRole('button', { name: '匯出 GIF' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('export-result')).toContainText('.gif');
  expect((await prefs(page)).format).toBe('gif');
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：3 倍 1140 × 1695、像素與預覽一致；1 倍 380 × 565；檔名（F43、F45、F46）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const png = await exportFile(page, 'PNG');
  expect(png.name).toBe('captcha-探索者.png');
  const p = readPng(png.bytes);
  expect([p.width, p.height]).toEqual([1140, 1695]);
  for (const [x, y] of [[10, 60], badge3(0), corner3(1), corner3(4), [340, 530], [200, 530]] as [
    number,
    number,
  ][])
    expect(near(p.at(Math.round(x * 3), Math.round(y * 3)), await pixel(page, x, y), 12)).toBe(
      true,
    );
  await expect(png.result).toContainText('1140×1695');
  /* 1 倍 */
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  expect((await prefs(page)).pngScale).toBe(1);
  const small = readPng((await exportFile(page, 'PNG')).bytes);
  expect([small.width, small.height]).toEqual([380, 565]);
  /* 動畫的倍率另外記著（還是 1.5） */
  expect((await prefs(page)).animScale).toBe(1.5);
  expect(errors).toEqual([]);
});

test('匯出 GIF：570 × 848、影格表的延遲、無限循環與播放次數；APNG、WebP（F42、F44、F47）', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  const t = await timeline(page);
  const gif = await exportFile(page, 'GIF');
  expect(gif.name).toBe('captcha-探索者.gif');
  const g = parseGif(gif.bytes);
  expect([g.width, g.height]).toEqual([570, 848]);
  expect(g.loopCount).toBe(0);
  /* 延遲＝影格表（毫秒 ÷ 10）；畫面完全相同的連續兩格由共用編碼器合成一格（點完最後一格的停留＋停 380、小視窗不透明度 0 的那格） */
  const want = t.frames.map((f) => f.ms / 10);
  const got = g.frames.map((f) => f.delayCs);
  expect(got.reduce((a, b) => a + b, 0)).toBe(want.reduce((a, b) => a + b, 0));
  let k = 0;
  for (const d of got) {
    let sum = 0;
    while (sum < d && k < want.length) sum += want[k++];
    expect(sum).toBe(d);
  }
  expect(k).toBe(want.length);
  expect(g.frames).toHaveLength(59);
  /* 第 0 格沒有勾選、最後一格四格都勾了（勾勾圓是主題色） */
  const frames = composeGif(g);
  const at = (i: number, x: number, y: number) => {
    const k = (Math.round(y * 1.5) * 570 + Math.round(x * 1.5)) * 4;
    return Array.from(frames[i].slice(k, k + 3));
  };
  expect(near(at(0, ...badge3(0)), hex('#5b8def'), 30)).toBe(false);
  expect(near(at(30, ...badge3(0)), hex('#5b8def'), 30)).toBe(true);
  expect(near(at(30, ...badge3(8)), hex('#5b8def'), 30)).toBe(true);
  /* 結尾的小視窗在中央（白色） */
  expect(near(at(58, 190, 282), [255, 255, 255], 12)).toBe(true);
  await expect(gif.result).toContainText('59 格');
  /* 播放 3 次 */
  const panel = exportPanel(page);
  await panel.getByRole('switch', { name: '無限循環' }).click();
  await panel.getByRole('spinbutton', { name: '播放次數' }).fill('3');
  await panel.getByRole('spinbutton', { name: '播放次數' }).press('Enter');
  await expect.poll(async () => (await prefs(page)).plays).toBe(3);
  const g3 = parseGif((await exportFile(page, 'GIF')).bytes);
  expect(g3.loopCount).toBe(2);
  /* APNG */
  const apng = await exportFile(page, 'APNG');
  expect(apng.name).toBe('captcha-探索者.png');
  const a = parseApng(apng.bytes);
  expect([a.ihdr.width, a.ihdr.height]).toEqual([570, 848]);
  expect(a.frames.length).toBeGreaterThan(30);
  /* WebP */
  const webp = await exportFile(page, 'WebP');
  expect(webp.name).toBe('captcha-探索者.webp');
  expect(strFromU8(webp.bytes.slice(0, 4))).toBe('RIFF');
  expect(strFromU8(webp.bytes.slice(8, 12))).toBe('WEBP');
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含圖片）；復原／重做（F49、F51）', async ({ page }) => {
  const errors = await open(page);
  await clearGrid(page);
  await settle(page);
  await chooseFiles(page, cell(page, 0), [file('red.png', await solidPng('#dd2222'))]);
  await expect.poll(async () => (await state(page)).cells[0].image?.name).toBe('red.png');
  await settle(page);
  await page.getByRole('button', { name: '主題色 #4dbb86' }).click();
  await settle(page);
  await page.reload();
  await expect(page.getByTestId('grid-count')).toHaveText('已勾選 1 格・圖片 1／9 格');
  await expect
    .poll(async () => near(await pixel(page, ...center3(0)), [221, 34, 34], 3))
    .toBe(true);
  expect(near(await pixel(page, 10, 60), hex('#4dbb86'), 4)).toBe(true);
  /* 復原／重做（重新整理後的新動作） */
  await cell(page, 0).click();
  await expect(cellBox(page, 0)).toHaveAttribute('data-state', 'off');
  await settle(page);
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(cellBox(page, 0)).toHaveAttribute('data-state', 'on');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(cellBox(page, 0)).toHaveAttribute('data-state', 'off');
  await page.keyboard.press('Control+z');
  await expect(cellBox(page, 0)).toHaveAttribute('data-state', 'on');
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋圖片）、重設、開啟還原；缺圖片的不開啟（F50、F52）', async ({
  page,
}) => {
  const errors = await open(page);
  await chooseFiles(page, toolbar(page).getByRole('button', { name: '放入圖片' }), [
    file('a.png', await solidPng('#dd2222')),
  ]);
  await expect(toast(page, '沒有空的格子')).toBeVisible();
  await cellBox(page, 1).hover();
  await chooseFiles(page, page.getByRole('button', { name: '第 2 格：換一張圖片' }), [
    file('blue.png', await solidPng('#2244cc')),
  ]);
  await expect.poll(async () => (await state(page))?.cells[1].image?.name).toBe('blue.png');
  await settle(page);
  const kw = page.getByRole('textbox', { name: '關鍵字' });
  await kw.fill('古神');
  await kw.blur();
  await settle(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project.tool).toBe('captcha-card');
  expect(project.data.keyword).toBe('古神');
  const id = project.data.cells[1].image.id as string;
  expect(Object.keys(zip).some((n) => n.startsWith(`files/${id}`))).toBe(true);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect(kw).toHaveValue('探索者');
  expect((await state(page)).cells[1].image?.kind).toBe('sample');
  await settle(page);
  /* 開啟 */
  const openZip = async (name: string, bytes: Uint8Array) => {
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('開啟專案檔？');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      confirm.getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser.setFiles({ name, mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  };
  await openZip('p.zip', zipSync(zip));
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect(kw).toHaveValue('古神');
  await expect
    .poll(async () => near(await pixel(page, ...center3(1)), [34, 68, 204], 3))
    .toBe(true);
  await settle(page);
  /* 缺圖片 */
  const missing = { ...project, data: { ...project.data, keyword: '缺圖' } };
  missing.data.cells[1].image.id = 'f'.repeat(64);
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(
    page.getByText('專案檔裡缺少圖片（或圖片無法讀取），沒有開啟。').first(),
  ).toBeVisible();
  expect((await state(page)).keyword).toBe('古神');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('captcha-card-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('captcha-card-390.png', { fullPage: true });
  await tab(page, '動畫').click();
  await noHorizontalScroll(page);
  await page.getByRole('radio', { name: '跳出視窗' }).click();
  await noHorizontalScroll(page);
  await toolbar(page).getByRole('button', { name: '排列模式' }).click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
