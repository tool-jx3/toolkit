/**
 * 線索道具產生器（建置產物 next/handout-maker/）的端對端測試（規格 docs/refactor/specs/handout-maker.md）：
 * - 開頁沒有錯誤、預設一張基本主題的範例、頁尾只有靈感來源、說明連到本站的相關工具；
 * - 11 種主題都畫得出來（外形的透明角、主題專用的欄位、換主題時的配色）、套用範例（加成新的一張／取代）；
 * - 塗黑（文字顏色的條、跳脫的不塗黑）、簡訊的泡泡（自己發的靠右藍色）、狀態印章；
 * - 背景色（半透明）、紙張質感、背景圖（擺法、不透明度、色調）；附圖與濾鏡（黑白、反相）、附圖大小；
 * - 匯出 PNG（倍率與尺寸、和預覽相同、透明的角）、清單裡全部（ZIP）、對齊 24 px、複製圖片；
 * - 道具清單（新增、副本、刪除、切換、排序）、自動儲存與重新整理（含圖片）、專案檔 ZIP；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('handout-maker') ?? { id: 'handout-maker', status: 'next' })}/`;

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Handout {
  id: string;
  theme: string;
  font: string;
  title: string;
  body: string;
  fontSize: number;
  stamp: string;
  image: { id: string; name: string; width: number; height: number } | null;
  imageSize: number;
  imageFilter: string;
  texture: string;
  bg: {
    image: { id: string; name: string } | null;
    fit: string;
    blur: number;
    hue: number;
    opacity: number;
  };
  snap: boolean;
  width: number;
  height: number;
  bgColor: string;
  textColor: string;
  extra: Record<string, string>;
}

/* ---------- 共用 ---------- */

async function solidPng(rgba: Rgba, w = 40, h = 40): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(rgba, i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 四色圖（左上紅、右上藍、左下綠、右下黃） */
async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c: Rgba =
        x < w / 2
          ? y < h / 2
            ? [220, 30, 30, 255]
            : [30, 160, 60, 255]
          : y < h / 2
            ? [30, 60, 220, 255]
            : [230, 200, 40, 255];
      px.set(c, (y * w + x) * 4);
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
  await expect(page.getByRole('heading', { level: 1, name: '線索道具產生器' })).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('handout-canvas');
const tab = (page: Page, name: '內容' | '外觀' | '圖片') => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const alertDialog = (page: Page) => page.getByRole('alertdialog');
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const imageInput = (page: Page) =>
  page.getByRole('group', { name: '附圖載入區' }).locator('input[type=file]');
const bgInput = (page: Page) =>
  page.getByRole('group', { name: '背景圖載入區' }).locator('input[type=file]');
const titleBox = (page: Page) => page.getByRole('textbox', { name: '標題', exact: true });
const bodyBox = (page: Page) => page.locator('[data-field="body"]');

async function active(page: Page): Promise<Handout> {
  return page.evaluate(() =>
    (window as unknown as { __handoutMaker: { active: () => Handout } }).__handoutMaker.active(),
  );
}

async function items(page: Page): Promise<Handout[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __handoutMaker: { doc: () => { items: Handout[] } } }
      ).__handoutMaker.doc().items,
  );
}

/** 從下拉選單選一項（名稱以 label 開頭） */
async function choose(page: Page, trigger: Locator, label: string) {
  await trigger.click();
  await page
    .getByRole('option', { name: new RegExp(`^${label.replace(/[()（）]/g, '.')}`) })
    .click();
}

const themeSelect = (page: Page) => page.getByTestId('theme-select');

async function setTheme(page: Page, label: string, id: string) {
  await tab(page, '內容').click();
  await choose(page, themeSelect(page), label);
  await expect(canvas(page)).toHaveAttribute('data-theme', id);
}

async function setText(box: Locator, value: string) {
  await box.fill(value);
  await box.blur();
}

/** 預覽畫布（2 倍像素）上一點的顏色，座標是畫面 px */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')?.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y],
  );
}

/** 一個範圍（畫面 px）裡接近某個顏色的像素比例 */
async function ratio(
  page: Page,
  rect: [number, number, number, number],
  rgb: [number, number, number],
  tol = 40,
): Promise<number> {
  return canvas(page).evaluate(
    (el, [rect, rgb, tol]) => {
      const c = el as HTMLCanvasElement;
      const [x0, y0, x1, y1] = (rect as number[]).map((v) => Math.round(v * 2));
      const d = c.getContext('2d')?.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      if (!d) return 0;
      let n = 0;
      const [r, g, b] = rgb as number[];
      for (let i = 0; i < d.length; i += 4)
        if (
          d[i + 3] > 200 &&
          Math.abs(d[i] - r) <= (tol as number) &&
          Math.abs(d[i + 1] - g) <= (tol as number) &&
          Math.abs(d[i + 2] - b) <= (tol as number)
        )
          n++;
      return n / (d.length / 4);
    },
    [rect, rgb, tol] as const,
  );
}

const near = (a: number[], b: number[], tol = 12) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

/** 清掉標題、印章、本文（版面從內容框的左上角開始） */
async function clean(page: Page) {
  await tab(page, '內容').click();
  await setText(titleBox(page), '');
  await setText(bodyBox(page), '');
  await choose(page, page.getByTestId('stamp-select'), '不加');
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

async function setScale(page: Page, percent: 100 | 200 | 300) {
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: new RegExp(`^${percent}%`) }).click();
}

/** 匯出一張並下載 */
async function exportOne(page: Page) {
  const panel = exportPanel(page);
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 開頁 ---------- */

test('開頁：預設一張基本主題的範例、頁尾只有靈感來源、說明連到相關工具（F01、F25、F32）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-theme', 'basic');
  await expect(canvas(page)).toHaveAttribute('data-size', '384x528');
  await expect(page.getByTestId('list-count')).toHaveText('1 / 60 張');
  const h = await active(page);
  expect(h.title).toBe('線索一：停在三點十七分的懷錶');
  expect(h.stamp).toBe('investigating');
  expect([h.bgColor, h.textColor]).toEqual(['#ffffff', '#333333']);
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link', { name: 'KKumuu/trpgforkk' })).toHaveAttribute(
    'href',
    'https://github.com/KKumuu/trpgforkk',
  );
  /* 說明裡連到本站的拍立得、鎖定畫面、社群貼文 */
  await page.getByRole('button', { name: '說明' }).click();
  const related = page.getByTestId('related-tools');
  await expect(related.getByRole('link', { name: '拍立得相框產生器' })).toHaveAttribute(
    'href',
    /polaroid\/$/,
  );
  await expect(related.getByRole('link', { name: '鎖定畫面訊息產生器' })).toHaveAttribute(
    'href',
    /lock-screen\/$/,
  );
  await expect(related.getByRole('link', { name: '社群貼文產生器' })).toHaveAttribute(
    'href',
    /social-post\/$/,
  );
  await page.keyboard.press('Escape');
  /* 塗黑的條在畫面上（「致 ||H. L.||」那一行有一段文字顏色的實心條） */
  expect(await ratio(page, [36, 100, 348, 300], [0x33, 0x33, 0x33], 30)).toBeGreaterThan(0.02);
  expect(errors).toEqual([]);
});

/* ---------- 主題 ---------- */

const THEMES: [string, string][] = [
  ['基本', 'basic'],
  ['便條', 'memo'],
  ['便利貼', 'sticky'],
  ['拍立得', 'polaroid'],
  ['報紙', 'newspaper'],
  ['通緝令', 'wanted'],
  ['系統視窗', 'window'],
  ['狀態視窗', 'status'],
  ['終端機', 'terminal'],
  ['簡訊', 'sms'],
  ['電子郵件', 'email'],
];

test('11 種主題都畫得出來：外形、主題專用的欄位、換主題時的配色（F02、F07、F20、F21）', async ({
  page,
}) => {
  const errors = await open(page);
  for (const [label, id] of THEMES) {
    await setTheme(page, label, id);
    /* 畫面大部分是不透明的，而且不是單一顏色 */
    const info = await canvas(page).evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      if (!d) return { opaque: 0, colors: 0 };
      let opaque = 0;
      const colors = new Set<number>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200) opaque++;
        if (i % 400 === 0) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      }
      return { opaque: opaque / (d.length / 4), colors: colors.size };
    });
    expect(info.opaque, label).toBeGreaterThan(0.9);
    expect(info.colors, label).toBeGreaterThan(2);
  }
  /* 圓角的主題：左上角透明；方形的不透明 */
  await setTheme(page, '系統視窗', 'window');
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  await setTheme(page, '簡訊', 'sms');
  expect((await pixel(page, 1, 1))[3]).toBe(0);
  /* 便利貼右下角捲起的地方透明 */
  await setTheme(page, '便利貼', 'sticky');
  expect((await pixel(page, 383, 527))[3]).toBe(0);
  /* 便條上方的打孔是透明的 */
  await setTheme(page, '便條', 'memo');
  const holes = await canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')?.getImageData(0, 26, c.width, 1).data;
    let n = 0;
    for (let i = 3; i < (d?.length ?? 0); i += 4) if ((d?.[i] ?? 255) === 0) n++;
    return n;
  });
  expect(holes).toBeGreaterThan(20);
  await setTheme(page, '基本', 'basic');
  expect((await pixel(page, 0, 0))[3]).toBe(255);

  /* 主題專用的欄位 */
  await setTheme(page, '簡訊', 'sms');
  await expect(titleBox(page)).toBeHidden();
  await expect(page.getByTestId('stamp-select')).toBeHidden();
  await expect(page.getByRole('textbox', { name: '對話對象' })).toBeVisible();
  await expect(page.getByTestId('marker-hint')).toHaveText('||文字|| 自己發的');
  await setTheme(page, '報紙', 'newspaper');
  await expect(page.getByRole('textbox', { name: '報紙名稱' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '日期列' })).toBeVisible();
  await expect(page.getByTestId('marker-hint')).toHaveText('||文字|| 塗黑');
  await setTheme(page, '終端機', 'terminal');
  await expect(page.getByRole('textbox', { name: '使用者與主機' })).toHaveValue('kp@archive');
  await setTheme(page, '電子郵件', 'email');
  for (const n of ['寄件者', '收件者', '日期'])
    await expect(page.getByRole('textbox', { name: n })).toBeVisible();
  await setTheme(page, '通緝令', 'wanted');
  await expect(page.getByRole('textbox', { name: '大字標頭' })).toHaveValue('懸賞通緝');
  await expect(page.getByRole('radio', { name: '置中' })).toBeHidden();
  await setTheme(page, '狀態視窗', 'status');
  await expect(page.getByRole('textbox', { name: '通知標頭' })).toHaveValue('【系統通知】');

  /* 配色：都還是預設時跟著主題換；改過就不動 */
  let h = await active(page);
  expect([h.bgColor, h.textColor]).toEqual(['#0f1928', '#44ddff']);
  await tab(page, '外觀').click();
  const text = page.getByRole('textbox', { name: '文字與框線顏色' });
  await text.fill('#ff8800');
  await text.press('Enter');
  await setTheme(page, '終端機', 'terminal');
  h = await active(page);
  expect([h.bgColor, h.textColor]).toEqual(['#0f1928', '#ff8800']);
  /* 回到主題預設 */
  await tab(page, '外觀').click();
  await page.getByRole('button', { name: '文字與框線顏色回到主題預設' }).click();
  await page.getByRole('button', { name: '背景色回到主題預設' }).click();
  h = await active(page);
  expect([h.bgColor, h.textColor]).toEqual(['#000000', '#00ff00']);
  expect(errors).toEqual([]);
});

test('範例：加成新的一張、取代目前這張（可以復原）（F03、F31）', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('examples-open').click();
  const gallery = page.getByTestId('examples');
  await expect(gallery.getByRole('button')).toHaveCount(11);
  await gallery.getByRole('button', { name: /^報紙/ }).click();
  await page.getByRole('button', { name: '加成新的一張' }).click();
  await expect(toast(page, '已套用「報紙」的範例')).toBeVisible();
  await expect(page.getByTestId('list-count')).toHaveText('2 / 60 張');
  let h = await active(page);
  expect(h).toMatchObject({ theme: 'newspaper', width: 600, height: 720, snap: true });
  expect(h.extra.masthead).toBe('霧港日報');
  await expect(canvas(page)).toHaveAttribute('data-size', '600x720');
  /* 取代 */
  await page.getByTestId('examples-open').click();
  await gallery.getByRole('button', { name: /^簡訊/ }).click();
  await page.getByRole('button', { name: '取代目前這張' }).click();
  h = await active(page);
  expect(h.theme).toBe('sms');
  expect(h.extra.contact).toBe('阿凱');
  expect((await items(page)).length).toBe(2);
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await active(page)).theme).toBe('newspaper');
  expect(errors).toEqual([]);
});

/* ---------- 塗黑、簡訊、印章 ---------- */

test('塗黑：||文字|| 畫成文字顏色的條、跳脫的不塗黑；簡訊：自己發的靠右藍色泡泡（F11～F13）', async ({
  page,
}) => {
  const errors = await open(page);
  await clean(page);
  /* 第一行從 (36, 36) 開始，行高 15 × 1.9 */
  const row: [number, number, number, number] = [44, 46, 120, 54];
  await setText(bodyBox(page), '||一二三四五六七八||');
  expect(await ratio(page, row, [0x33, 0x33, 0x33], 20)).toBeGreaterThan(0.95);
  await setText(bodyBox(page), '\\|\\|一二三四五六七八\\|\\|');
  expect(await ratio(page, row, [0x33, 0x33, 0x33], 20)).toBeLessThan(0.5);
  await setText(bodyBox(page), '一二三四五六七八');
  const plain = await ratio(page, row, [0x33, 0x33, 0x33], 20);
  expect(plain).toBeLessThan(0.5);
  /* 塗黑的條用文字顏色 */
  await tab(page, '外觀').click();
  const text = page.getByRole('textbox', { name: '文字與框線顏色' });
  await text.fill('#b91c1c');
  await text.press('Enter');
  await tab(page, '內容').click();
  await setText(bodyBox(page), '||一二三四五六七八||');
  expect(await ratio(page, row, [0xb9, 0x1c, 0x1c], 20)).toBeGreaterThan(0.95);

  /* 簡訊：第一則（收到的）靠左灰色、第二則（自己發的）靠右藍色 */
  await setTheme(page, '簡訊', 'sms');
  await setText(page.getByRole('textbox', { name: '對話對象' }), '');
  await setText(bodyBox(page), '甲\n||乙||');
  /* 泡泡從 y＝62 開始、高 15 × 1.4 ＋ 20；第二則在 +10 之後，靠右到 x＝352 */
  expect(near(await pixel(page, 40, 82), [0xe5, 0xe5, 0xea])).toBe(true);
  expect(near(await pixel(page, 346, 133), [0x0b, 0x93, 0xf6])).toBe(true);
  expect(near(await pixel(page, 346, 82), [0xff, 0xff, 0xff])).toBe(true);
  expect(errors).toEqual([]);
});

test('狀態印章：畫在標題右邊；7 種都畫得出來（F14）', async ({ page }) => {
  const errors = await open(page);
  await clean(page);
  await setText(titleBox(page), '標題');
  const corner: [number, number, number, number] = [306, 36, 348, 78];
  expect(await ratio(page, corner, [0x33, 0x33, 0x33], 80)).toBe(0);
  for (const s of ['重要', '上鎖', '調查中', '危險', '疑問', '隱藏', '完成']) {
    await choose(page, page.getByTestId('stamp-select'), s);
    expect(await ratio(page, corner, [0x33, 0x33, 0x33], 80), s).toBeGreaterThan(0.04);
  }
  expect((await active(page)).stamp).toBe('done');
  expect(errors).toEqual([]);
});

/* ---------- 背景與圖片 ---------- */

test('背景：背景色（可以透明）、紙張質感、背景圖的擺法、不透明度、色調（F18～F20、F22）', async ({
  page,
}) => {
  const errors = await open(page);
  await clean(page);
  await tab(page, '外觀').click();
  const bg = page.getByRole('textbox', { name: '背景色' });
  await bg.fill('#336699');
  await bg.press('Enter');
  expect(near(await pixel(page, 192, 450), [0x33, 0x66, 0x99])).toBe(true);
  /* 全透明的背景：匯出的 PNG 在背景處透明 */
  await bg.fill('#33669900');
  await bg.press('Enter');
  expect((await active(page)).bgColor).toBe('#33669900');
  expect((await pixel(page, 192, 450))[3]).toBe(0);
  await bg.fill('#ffffff');
  await bg.press('Enter');
  /* 質感：方格紙在空白處有格線（同一列的顏色不一樣） */
  /* 中間的一列（y＝450）與一欄（x＝192）有幾種紅色值 */
  const rowColors = async () =>
    canvas(page).evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      const set = new Set<number>();
      for (const d of [
        ctx?.getImageData(0, 900, c.width, 1).data,
        ctx?.getImageData(384, 0, 1, c.height).data,
      ])
        for (let i = 0; i < (d?.length ?? 0); i += 4) set.add(d?.[i] ?? 0);
      return set.size;
    });
  expect(await rowColors()).toBeLessThanOrEqual(2);
  for (const t of ['羊皮紙', '方格紙', '橫線', '格紋', '點點', '老舊雜訊', '高級紙']) {
    await choose(page, page.getByTestId('texture-select'), t);
    await expect.poll(rowColors, { message: t }).toBeGreaterThan(2);
  }
  await choose(page, page.getByTestId('texture-select'), '無');
  /* 背景圖 */
  await tab(page, '圖片').click();
  await bgInput(page).setInputFiles(file('red.png', await solidPng([220, 20, 20, 255])));
  await expect.poll(async () => (await active(page)).bg.image?.name).toBe('red.png');
  await expect.poll(async () => near(await pixel(page, 192, 450), [220, 20, 20], 2)).toBe(true);
  /* 完整顯示：正方形的圖在直式的畫面裡，上下留空 */
  await page.getByRole('radio', { name: '完整顯示' }).click();
  await expect.poll(async () => near(await pixel(page, 192, 20), [255, 255, 255])).toBe(true);
  expect(near(await pixel(page, 192, 264), [220, 20, 20])).toBe(true);
  await page.getByRole('radio', { name: '填滿' }).click();
  /* 不透明度 50%：和白底各半 */
  const opacity = page.getByRole('spinbutton', { name: '不透明度' });
  await opacity.fill('50');
  await opacity.press('Enter');
  await expect.poll(async () => near(await pixel(page, 192, 450), [238, 138, 138], 4)).toBe(true);
  await opacity.fill('100');
  await opacity.press('Enter');
  /* 色調 120°：紅色轉成綠色系 */
  const hue = page.getByRole('spinbutton', { name: '色調' });
  await hue.fill('120');
  await hue.press('Enter');
  await expect
    .poll(async () => {
      const [r, g, b] = await pixel(page, 192, 450);
      return g > r && g > b;
    })
    .toBe(true);
  /* 拿掉 */
  await page.getByRole('button', { name: '拿掉背景圖' }).click();
  expect(near(await pixel(page, 192, 450), [255, 255, 255])).toBe(true);
  expect(errors).toEqual([]);
});

test('附圖：載入、大小、濾鏡（黑白、反相）、拿掉；換新的圖時大小與濾鏡回到預設（F15～F17）', async ({
  page,
}) => {
  const errors = await open(page);
  await clean(page);
  await tab(page, '圖片').click();
  await imageInput(page).setInputFiles(file('quad.png', await quadPng()));
  await expect.poll(async () => (await active(page)).image?.name).toBe('quad.png');
  await expect(page.getByTestId('image-name')).toHaveText('quad.png');
  /* 內容寬 312：附圖寬 min(400, 312 × 90%) ＝ 280.8，置中、從 y＝36 開始 */
  const red = () => pixel(page, 70, 60);
  const blue = () => pixel(page, 320, 60);
  await expect.poll(async () => near(await red(), [220, 30, 30])).toBe(true);
  expect(near(await blue(), [30, 60, 220])).toBe(true);
  /* 黑白 */
  await choose(page, page.getByTestId('filter-select'), '黑白');
  await expect
    .poll(async () => {
      const [r, g, b] = await red();
      return Math.max(r, g, b) - Math.min(r, g, b);
    })
    .toBeLessThan(4);
  /* 反相 */
  await choose(page, page.getByTestId('filter-select'), '反相');
  await expect.poll(async () => near(await red(), [35, 225, 225])).toBe(true);
  for (const f of ['懷舊', '模糊', '鮮明', '原圖']) {
    await choose(page, page.getByTestId('filter-select'), f);
  }
  await expect.poll(async () => near(await red(), [220, 30, 30])).toBe(true);
  /* 大小 50%：寬 156，右上的藍色區塊移到 x 約 192～270 */
  const size = page.getByRole('spinbutton', { name: '大小' });
  await size.fill('50');
  await size.press('Enter');
  expect((await active(page)).imageSize).toBe(50);
  await expect.poll(async () => near(await blue(), [255, 255, 255])).toBe(true);
  expect(near(await pixel(page, 230, 60), [30, 60, 220])).toBe(true);
  /* 換新的圖：大小 90%、濾鏡原圖（同原作） */
  await choose(page, page.getByTestId('filter-select'), '黑白');
  await imageInput(page).setInputFiles(file('quad2.png', await quadPng(200, 150)));
  await expect.poll(async () => (await active(page)).image?.name).toBe('quad2.png');
  const h = await active(page);
  expect([h.imageSize, h.imageFilter]).toEqual([90, 'none']);
  /* 不是圖片 */
  await imageInput(page).setInputFiles(file('note.txt', Buffer.from('hi'), 'text/plain'));
  await expect(toast(page, '無法使用這個檔案')).toBeVisible();
  /* 拿掉 */
  await page.getByRole('button', { name: '拿掉附圖' }).click();
  expect((await active(page)).image).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 尺寸、匯出、複製 ---------- */

test('對齊 24 px：寬高取 24 的倍數、顯示格數；不對齊時 ±10（F23、F24）', async ({ page }) => {
  const errors = await open(page);
  await tab(page, '外觀').click();
  const w = page.getByRole('spinbutton', { name: '寬' });
  const hgt = page.getByRole('spinbutton', { name: '高' });
  await w.fill('400');
  await w.press('Enter');
  expect((await active(page)).width).toBe(400);
  await w.press('ArrowUp');
  expect((await active(page)).width).toBe(410);
  await page.getByRole('switch', { name: '對齊 24 px 的格子' }).click();
  let h = await active(page);
  expect([h.width, h.height, h.snap]).toEqual([408, 528, true]);
  await expect(page.getByTestId('size-cells')).toHaveText('17 × 22 格');
  await w.press('ArrowUp');
  expect((await active(page)).width).toBe(432);
  await hgt.fill('500');
  await hgt.press('Enter');
  h = await active(page);
  expect(h.height).toBe(504);
  await expect(canvas(page)).toHaveAttribute('data-size', '432x504');
  await expect(page.getByTestId('size-output')).toHaveText('匯出 2 倍：864 × 1,008 px');
  expect(errors).toEqual([]);
});

test('匯出 PNG：倍率 1／2／3、和預覽相同、圓角透明；清單裡全部打包成 ZIP（F26、F27）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 預設 2 倍＝預覽的像素 */
  const out = await exportOne(page);
  expect(out.name).toBe('線索一：停在三點十七分的懷錶.png');
  let png = readPng(out.bytes);
  expect([png.width, png.height]).toEqual([768, 1056]);
  for (const [x, y] of [
    [80, 80],
    [200, 300],
    [700, 1000],
    [400, 130],
  ]) {
    const preview = await pixel(page, x / 2, y / 2);
    expect(near(png.at(x, y), preview, 2), `${x},${y}`).toBe(true);
  }
  await setScale(page, 100);
  png = readPng((await exportOne(page)).bytes);
  expect([png.width, png.height]).toEqual([384, 528]);
  await setScale(page, 300);
  png = readPng((await exportOne(page)).bytes);
  expect([png.width, png.height]).toEqual([1152, 1584]);
  /* 系統視窗：圓角外透明 */
  await setScale(page, 200);
  await setTheme(page, '系統視窗', 'window');
  png = readPng((await exportOne(page)).bytes);
  expect(png.at(0, 0)[3]).toBe(0);
  expect(png.at(384, 528)[3]).toBe(255);
  /* 清單裡全部 */
  await page.getByTestId('add-handout').click();
  await setText(titleBox(page), '第二張');
  await page.getByRole('radio', { name: '匯出清單裡的每一張' }).click();
  await exportPanel(page).getByRole('button', { name: /^匯出/ }).click();
  const batch = page.getByTestId('export-batch');
  await expect(batch).toContainText('共 2 個檔案', { timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    batch.getByRole('button', { name: '打包成 ZIP' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('線索道具.zip');
  const entries = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  expect(Object.keys(entries).sort()).toEqual([
    '01_線索一：停在三點十七分的懷錶.png',
    '02_第二張.png',
  ]);
  const second = readPng(entries['02_第二張.png']);
  expect([second.width, second.height]).toEqual([768, 1056]);
  expect(errors).toEqual([]);
});

test('複製圖片：目前這張以匯出倍率放進剪貼簿（F28）', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await page.getByTestId('copy-image').click();
  await expect(toast(page, '已複製圖片')).toBeVisible();
  const size = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType('image/png');
    const bmp = await createImageBitmap(blob);
    return [bmp.width, bmp.height];
  });
  expect(size).toEqual([768, 1056]);
  expect(errors).toEqual([]);
});

/* ---------- 清單、儲存 ---------- */

test('道具清單：新增、副本、切換、排序、刪除（可以復原）（F01、F04）', async ({ page }) => {
  const errors = await open(page);
  const list = page.getByRole('list', { name: '線索道具清單' });
  await setTheme(page, '終端機', 'terminal');
  await page.getByTestId('add-handout').click();
  let all = await items(page);
  expect(all.map((h) => h.theme)).toEqual(['terminal', 'terminal']);
  expect(all[1].title).toBe('');
  await setText(titleBox(page), '第二張');
  await page.getByTestId('duplicate-handout').click();
  all = await items(page);
  expect(all.map((h) => h.title)).toEqual(['線索一：停在三點十七分的懷錶', '第二張', '第二張']);
  expect(new Set(all.map((h) => h.id)).size).toBe(3);
  await expect(page.getByTestId('list-count')).toHaveText('3 / 60 張');
  /* 點縮圖切換 */
  await list.getByText('線索一：停在三點十七分的懷錶').click();
  expect((await active(page)).id).toBe(all[0].id);
  await expect(titleBox(page)).toHaveValue('線索一：停在三點十七分的懷錶');
  /* 排序：Alt＋↓ */
  await list.focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect((await items(page)).map((h) => h.id)).toEqual([all[1].id, all[0].id, all[2].id]);
  /* 刪除目前這張：改選同一個位置的那張；通知裡可以復原 */
  await list.getByRole('button', { name: '刪除「線索一：停在三點十七分的懷錶」' }).click();
  expect((await items(page)).length).toBe(2);
  await page.getByTestId('toast-action').click();
  expect((await items(page)).length).toBe(3);
  /* 只剩一張時不能刪 */
  for (let i = 0; i < 2; i++)
    await list
      .getByRole('button', { name: /^刪除「/ })
      .first()
      .click();
  await expect(list.getByRole('button', { name: /^刪除「/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('自動儲存：重新整理後清單、目前這張、圖片都還在（F29）', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('add-handout').click();
  await setText(titleBox(page), '重新整理之後');
  await tab(page, '圖片').click();
  await imageInput(page).setInputFiles(file('quad.png', await quadPng()));
  await expect.poll(async () => (await active(page)).image?.name).toBe('quad.png');
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  const h = await active(page);
  expect(h.title).toBe('重新整理之後');
  expect(h.image?.name).toBe('quad.png');
  expect((await items(page)).length).toBe(2);
  await clean(page);
  await expect.poll(async () => near(await pixel(page, 70, 60), [220, 30, 30])).toBe(true);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（清單＋圖片）、清空、開啟還原（F30）', async ({ page }) => {
  const errors = await open(page);
  await tab(page, '圖片').click();
  await imageInput(page).setInputFiles(file('quad.png', await quadPng()));
  await expect.poll(async () => (await active(page)).image?.name).toBe('quad.png');
  await page.getByTestId('add-handout').click();
  await tab(page, '內容').click();
  await setText(titleBox(page), '第二張');
  const before = await items(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('handout-maker');
  expect(project.data.items).toHaveLength(2);
  expect(Object.keys(entries)).toContain(`files/${before[0].image?.id}.png`);
  /* 清空 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  expect((await items(page)).length).toBe(1);
  expect((await active(page)).title).toBe('');
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    alertDialog(page).getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', zipBytes, 'application/zip'));
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  expect(await items(page)).toEqual(before);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(800);
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('handout-maker-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await noHorizontalScroll(page);
  for (const t of ['外觀', '圖片'] as const) {
    await tab(page, t).click();
    await noHorizontalScroll(page);
  }
  await tab(page, '內容').click();
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('handout-maker-390.png', { fullPage: true });
});
