/**
 * 表情產生器（建置產物 next/emotion-maker/）的端對端測試：
 * - 開頁沒有 pageerror／console error；各類選項數（眼 10、眉 4、嘴 10、裝飾 13）、單選／複選標示、頁尾只放靈感來源；
 * - 點選：單選取代與取消、裝飾複選（新的在最前）、疊放順序（讀預覽的圖層）、裝飾圖層清單的序號、往前／往後、移除；
 * - 儲存（空白不能存、標籤去空白、加在最後）、編輯原地更新、取消編輯、複製插在後方、刪除（含正在編輯的那筆）、
 *   勾選、全選／全不選、刪除勾選的、全部清空、計數、預設組（含確認）、隨機（50 次，裝飾恆為 1 個）、通知取代與淡出；
 * - 自訂部件：只列圖片、非圖片略過、命名與重名、自訂標記、刪除確認與只清同一類的引用、非正方形等比置中（裁定）；
 * - 合輯圖：沒勾選不開啟、量測表的尺寸（欄數依裁定限制在 0～20）、文字區、下載 PNG 解析（尺寸、RGBA、透明、白底、自訂色、
 *   頭像位置、文字置中）、Esc／遮罩／關閉鈕、同一次開頁保留選項、重新整理回到預設；
 * - 匯出 ZIP（設定 JSON＋自訂部件圖片）→ 清空 → 匯入（直接載入、接在後面、取代、取消、無效檔案）；
 * - 自動保存：清單、勾選與自訂部件（含圖片）重新整理後還原，編輯區不保存；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('emotion-maker') ?? { id: 'emotion-maker', status: 'next' })}/`;

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
});

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
  await expect(page.getByRole('heading', { level: 1, name: '表情產生器' })).toBeVisible();
  return errors;
}

const picker = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const part = (page: Page, id: string) => page.locator(`[data-part="${id}"]`);
const preview = (page: Page) => page.getByTestId('emotion-preview');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const list = (page: Page) => page.getByRole('region', { name: '表情清單', exact: true });
const rows = (page: Page) => list(page).getByRole('listitem');
const notices = (page: Page) => page.getByRole('region', { name: /^通知/ }).getByRole('listitem');
const notice = (page: Page, text: string) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text, { exact: true });
const alert = (page: Page) => page.getByRole('alertdialog');
const labelBox = (page: Page) => page.getByRole('textbox', { name: '標籤', exact: true });
const showText = (page: Page) =>
  page.getByRole('switch', { name: '合輯圖格子下顯示文字', exact: true });
const layerList = (page: Page) => page.getByRole('list', { name: '裝飾圖層（上面＝前面）' });
const sheet = (page: Page) => page.getByRole('dialog', { name: '合輯圖' });
const sheetInfo = (page: Page) => page.getByTestId('sheet-info');
const spin = (page: Page, name: string) =>
  sheet(page).getByRole('spinbutton', { name, exact: true });

async function layers(page: Page): Promise<string[]> {
  return ((await preview(page).getAttribute('data-layers')) ?? '').split(',').filter(Boolean);
}

async function expectLayers(page: Page, ids: string[]) {
  await expect(preview(page)).toHaveAttribute(
    'data-layers',
    ['head-fill', 'head-line', ...ids].join(','),
  );
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 依序點部件，填標籤（可選），按儲存 */
async function saveExpression(
  page: Page,
  ids: string[],
  { label, text = true }: { label?: string; text?: boolean } = {},
) {
  for (const id of ids) await part(page, id).click();
  if (label !== undefined) await labelBox(page).fill(label);
  if (!text) await showText(page).click();
  await btn(page, '儲存表情').click();
}

async function addPresets(page: Page) {
  await btn(page, '加入預設表情').click();
  if (
    await alert(page)
      .isVisible()
      .catch(() => false)
  )
    await alert(page).getByRole('button', { name: '加入' }).click();
}

/** 透明畫布上一塊不透明的色塊（x0～x1、y0～y1 為比例） */
async function png(
  w: number,
  h: number,
  rgb: [number, number, number],
  [x0, y0, x1, y1] = [0, 0, 1, 1],
): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = Math.floor(h * y0); y < Math.floor(h * y1); y++) {
    for (let x = Math.floor(w * x0); x < Math.floor(w * x1); x++) {
      const k = (y * w + x) * 4;
      px[k] = rgb[0];
      px[k + 1] = rgb[1];
      px[k + 2] = rgb[2];
      px[k + 3] = 255;
    }
  }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function addImages(
  page: Page,
  category: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: `在「${category}」加入自訂圖片` }).click(),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  expect(await chooser.element().getAttribute('accept')).toBe('image/*');
  await chooser.setFiles(files);
}

interface Png {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  at: (x: number, y: number) => [number, number, number, number];
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
    ...ihdr,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function downloadSheet(page: Page): Promise<{ name: string; png: Png }> {
  await expect(sheet(page).getByRole('button', { name: '下載 PNG' })).toBeEnabled();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    sheet(page).getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  return { name: dl.suggestedFilename(), png: readPng(readFileSync((await dl.path()) as string)) };
}

async function openSheet(page: Page) {
  await btn(page, '合輯圖').click();
  await expect(sheet(page)).toBeVisible();
}

/** 預覽畫布上某個像素（畫布座標） */
async function previewPixel(page: Page, x: number, y: number) {
  return preview(page).evaluate(
    (el, [px, py]) =>
      Array.from((el as HTMLCanvasElement).getContext('2d')!.getImageData(px, py, 1, 1).data),
    [x, y],
  );
}

/* ---------- 開頁 ---------- */

test('開頁沒有錯誤；四類選項數、單選／複選標示、空白狀態；頁尾只放靈感來源；說明', async ({
  page,
}) => {
  const errors = await open(page);
  const counts = { 眼睛: 10, 眉毛: 4, 嘴巴: 10, 裝飾: 13 };
  for (const [name, n] of Object.entries(counts)) {
    const p = picker(page, name);
    await expect(p.locator('[data-part]')).toHaveCount(n);
    await expect(p.getByText(name === '裝飾' ? '複選' : '單選', { exact: true })).toBeVisible();
    await expect(p.getByRole('button', { name: `在「${name}」加入自訂圖片` })).toBeVisible();
  }
  /* 每個選項都有名稱，沒有任何選取 */
  await expect(page.locator('[data-part][aria-pressed="true"]')).toHaveCount(0);
  await expect(picker(page, '眼睛').getByRole('button', { name: '眼睛：一般' })).toHaveAttribute(
    'title',
    '一般',
  );
  /* 頭部底圖永遠在 */
  await expectLayers(page, []);
  await expect(page.getByText('目前沒有裝飾。')).toBeVisible();
  await expect(list(page).getByText(/還沒有表情。/)).toBeVisible();
  await expect(page.getByTestId('card-list-checked')).toHaveCount(0);
  await expect(labelBox(page)).toHaveValue('');
  await expect(labelBox(page)).toHaveAttribute('placeholder', /^例：/);
  await expect(showText(page)).toBeChecked();
  /* 預覽約 340 px、正方形 */
  const box = await preview(page).boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(340);
  expect(Math.round(box?.height ?? 0)).toBe(340);

  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link', { name: 'sotsotssi/emotion-maker' })).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/emotion-maker',
  );
  await page.getByRole('button', { name: '說明' }).click();
  await expect(page.getByRole('dialog', { name: '表情產生器：使用方式' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

/* ---------- 點選與圖層 ---------- */

test('單選取代與取消；裝飾複選與圖層清單（序號、往前／往後、移除）；疊放順序', async ({ page }) => {
  const errors = await open(page);
  await part(page, 'eyes-normal').click();
  await expect(part(page, 'eyes-normal')).toHaveAttribute('aria-pressed', 'true');
  await part(page, 'eyes-closed').click();
  await expect(part(page, 'eyes-normal')).toHaveAttribute('aria-pressed', 'false');
  await expect(part(page, 'eyes-closed')).toHaveAttribute('aria-pressed', 'true');
  await part(page, 'eyes-closed').click();
  await expect(picker(page, '眼睛').locator('[aria-pressed="true"]')).toHaveCount(0);

  await part(page, 'mouth-smile').click();
  await part(page, 'eyes-normal').click();
  await part(page, 'brows-angry').click();
  await part(page, 'deco-blush').click();
  await part(page, 'deco-sweat-many').click();
  /* 由下而上：填色、輪廓、眉、眼、嘴、裝飾（新點的在最上層） */
  await expectLayers(page, [
    'brows-angry',
    'eyes-normal',
    'mouth-smile',
    'deco-blush',
    'deco-sweat-many',
  ]);

  const layerRows = layerList(page).getByRole('listitem');
  await expect(layerRows).toHaveText(['1. 冒汗', '2. 臉紅']);
  await expect(page.getByRole('button', { name: '往前一層：1. 冒汗' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '往後一層：2. 臉紅' })).toBeDisabled();
  await page.getByRole('button', { name: '往後一層：1. 冒汗' }).click();
  await expect(layerRows).toHaveText(['1. 臉紅', '2. 冒汗']);
  await expectLayers(page, [
    'brows-angry',
    'eyes-normal',
    'mouth-smile',
    'deco-sweat-many',
    'deco-blush',
  ]);
  await page.getByRole('button', { name: '往前一層：2. 冒汗' }).click();
  await expect(layerRows).toHaveText(['1. 冒汗', '2. 臉紅']);

  /* 第三個裝飾放在最前面 */
  await part(page, 'deco-anger').click();
  await expect(layerRows).toHaveText(['1. 怒筋', '2. 冒汗', '3. 臉紅']);
  /* 移除鈕＝在選項格取消 */
  await page.getByRole('button', { name: '移除裝飾「冒汗」' }).click();
  await expect(layerRows).toHaveText(['1. 怒筋', '2. 臉紅']);
  await expect(part(page, 'deco-sweat-many')).toHaveAttribute('aria-pressed', 'false');
  await part(page, 'deco-anger').click();
  await part(page, 'deco-blush').click();
  await expect(page.getByText('目前沒有裝飾。')).toBeVisible();
  await expectLayers(page, ['brows-angry', 'eyes-normal', 'mouth-smile']);

  /* 單選與複選的醒目顏色不同 */
  await part(page, 'deco-tears').click();
  const borders = await Promise.all(
    ['eyes-normal', 'deco-tears'].map((id) =>
      part(page, id).evaluate((el) => getComputedStyle(el).borderColor),
    ),
  );
  expect(borders[0]).not.toBe(borders[1]);
  /* 預覽有畫出東西（不是空白） */
  expect((await previewPixel(page, 170, 170))[3]).toBe(255);
  expect(errors).toEqual([]);
});

/* ---------- 儲存、編輯、清單 ---------- */

test('儲存（空白不能存、去空白、加在最後）、摘要、編輯原地更新、取消編輯、複製、刪除', async ({
  page,
}) => {
  const errors = await open(page);
  /* 四類全空 */
  await labelBox(page).fill('只有標籤');
  await btn(page, '儲存表情').click();
  await expect(notice(page, '請至少選一個部件')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);

  await part(page, 'eyes-smile').click();
  await labelBox(page).fill('  開心  ');
  await btn(page, '儲存表情').click();
  await expect(notice(page, '已儲存')).toBeVisible();
  /* 編輯區重設 */
  await expect(labelBox(page)).toHaveValue('');
  await expectLayers(page, []);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText('開心');
  await expect(rows(page).nth(0)).toContainText('笑眼');
  await expect(page.getByRole('checkbox', { name: '勾選「開心」' })).toBeChecked();

  await saveExpression(
    page,
    ['brows-worried', 'eyes-closed', 'mouth-pout', 'deco-blush', 'deco-tears'],
    {
      label: '害羞',
      text: false,
    },
  );
  await expect(showText(page)).toBeChecked();
  await saveExpression(page, ['deco-anger']);
  await expect(rows(page)).toHaveCount(3);
  /* 摘要：眉 · 眼 · 嘴 · 裝飾×n · 不顯示文字；沒有標籤顯示「無標籤」 */
  await expect(rows(page).nth(1)).toContainText('困擾 · 閉眼 · 噘嘴 · 裝飾×2 · 不顯示文字');
  await expect(rows(page).nth(2)).toContainText('無標籤');
  await expect(rows(page).nth(2)).toContainText('裝飾×1');
  await expect(list(page).getByRole('heading', { name: /表情清單/ })).toHaveText('表情清單（3）');
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 3／共 3');

  /* 編輯：載入部件、標籤、顯示文字；按鈕變成「完成修改」；原地更新、勾選不變 */
  await page.getByRole('checkbox', { name: '勾選「害羞」' }).click();
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 2／共 3');
  await page.getByRole('button', { name: '編輯「害羞」' }).click();
  await expect(labelBox(page)).toHaveValue('害羞');
  await expect(showText(page)).not.toBeChecked();
  await expectLayers(page, [
    'brows-worried',
    'eyes-closed',
    'mouth-pout',
    'deco-blush',
    'deco-tears',
  ]);
  await expect(btn(page, '完成修改')).toBeVisible();
  await expect(btn(page, '取消編輯')).toBeVisible();
  await expect(rows(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('editing-badge')).toBeVisible();
  await part(page, 'mouth-smile').click();
  await labelBox(page).fill('害羞２');
  await btn(page, '完成修改').click();
  await expect(notice(page, '已修改')).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText('害羞２');
  await expect(rows(page).nth(1)).toContainText('困擾 · 閉眼 · 微笑');
  await expect(page.getByRole('checkbox', { name: '勾選「害羞２」' })).not.toBeChecked();
  await expect(btn(page, '儲存表情')).toBeVisible();
  await expect(btn(page, '取消編輯')).toHaveCount(0);
  await expect(labelBox(page)).toHaveValue('');

  /* 取消編輯：放棄修改 */
  await page.getByRole('button', { name: '編輯「開心」' }).click();
  await part(page, 'mouth-wide').click();
  await btn(page, '取消編輯').click();
  await expectLayers(page, []);
  await expect(rows(page).nth(0)).not.toContainText('大張口');
  await expect(rows(page).nth(0)).not.toHaveAttribute('aria-current', 'true');

  /* 隨機在編輯中改的是草稿；儲存才更新 */
  await page.getByRole('button', { name: '編輯「開心」' }).click();
  await labelBox(page).fill('開心');
  await btn(page, '隨機').click();
  await expect(labelBox(page)).toHaveValue('開心');
  await btn(page, '取消編輯').click();
  await expect(rows(page).nth(0)).toContainText('笑眼');

  /* 複製：插在正後方、標籤加字尾、勾選相同；新通知取代舊的 */
  await page.getByRole('button', { name: '複製「害羞２」' }).click();
  await expect(notice(page, '已複製')).toBeVisible();
  await expect(notices(page)).toHaveCount(1);
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).nth(2)).toContainText('害羞２（複製）');
  await expect(page.getByRole('checkbox', { name: '勾選「害羞２（複製）」' })).not.toBeChecked();
  await expect(rows(page).nth(3)).toContainText('無標籤');

  /* 刪除（確認訊息帶標籤；沒有標籤用「此表情」）；取消不刪 */
  await page.getByRole('button', { name: '刪除「無標籤」' }).click();
  await expect(alert(page)).toContainText('刪除「此表情」？');
  await alert(page).getByRole('button', { name: '取消' }).click();
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole('button', { name: '刪除「害羞２（複製）」' }).click();
  await expect(alert(page)).toContainText('刪除「害羞２（複製）」？');
  await alert(page).getByRole('button', { name: '刪除' }).click();
  await expect(rows(page)).toHaveCount(3);

  /* 刪除正在編輯的那筆：編輯區一併重設 */
  await page.getByRole('button', { name: '編輯「開心」' }).click();
  await expect(btn(page, '完成修改')).toBeVisible();
  await page.getByRole('button', { name: '刪除「開心」' }).click();
  await alert(page).getByRole('button', { name: '刪除' }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(btn(page, '儲存表情')).toBeVisible();
  await expect(labelBox(page)).toHaveValue('');

  /* 通知約 1.9 秒後消失 */
  await page.getByRole('button', { name: '複製「害羞２」' }).click();
  const n = notice(page, '已複製');
  await expect(n).toBeVisible();
  await expect(n).toBeHidden({ timeout: 3500 });

  /* 重設編輯區 */
  await part(page, 'eyes-dot').click();
  await labelBox(page).fill('abc');
  await showText(page).click();
  await page.getByRole('button', { name: '重設編輯區' }).click();
  await expectLayers(page, []);
  await expect(labelBox(page)).toHaveValue('');
  await expect(showText(page)).toBeChecked();
  expect(errors).toEqual([]);
});

test('預設組（確認）、勾選、全選／全不選、刪除勾選的、全部清空', async ({ page }) => {
  const errors = await open(page);
  /* 清單是空的：直接加入 */
  await btn(page, '加入預設表情').click();
  await expect(notice(page, '已加入 20 個預設表情')).toBeVisible();
  await expect(rows(page)).toHaveCount(20);
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 20／共 20');
  /* 每組都有標籤、顯示文字、勾選 */
  await expect(list(page).getByText('無標籤')).toHaveCount(0);
  await expect(list(page).getByText(/不顯示文字/)).toHaveCount(0);

  /* 清單不是空的：先確認（訊息帶組數） */
  await btn(page, '加入預設表情').click();
  await expect(alert(page)).toContainText('加入 20 個預設表情？');
  await alert(page).getByRole('button', { name: '取消' }).click();
  await expect(rows(page)).toHaveCount(20);
  await btn(page, '加入預設表情').click();
  await alert(page).getByRole('button', { name: '加入' }).click();
  await expect(rows(page)).toHaveCount(40);

  await list(page).getByRole('button', { name: '全不選' }).click();
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 0／共 40');
  /* 沒有勾選時刪除勾選的：通知、不刪 */
  await list(page).getByRole('button', { name: '刪除勾選的' }).click();
  await expect(notice(page, '沒有勾選的表情')).toBeVisible();
  await expect(rows(page)).toHaveCount(40);
  /* 沒有勾選時不開合輯圖 */
  await btn(page, '合輯圖').click();
  await expect(notice(page, '請勾選要放進合輯圖的表情')).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);

  await list(page).getByRole('button', { name: '全選' }).click();
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 40／共 40');
  await list(page).getByRole('button', { name: '全不選' }).click();
  await rows(page).nth(0).getByRole('checkbox').click();
  await rows(page).nth(5).getByRole('checkbox').click();
  /* 正在編輯的那筆被刪掉：編輯區重設 */
  await rows(page).nth(5).getByRole('button', { name: /^編輯/ }).click();
  await expect(btn(page, '完成修改')).toBeVisible();
  await list(page).getByRole('button', { name: '刪除勾選的' }).click();
  await expect(alert(page)).toContainText('刪除勾選的 2 個表情？');
  await alert(page).getByRole('button', { name: '刪除' }).click();
  await expect(notice(page, '已刪除 2 個')).toBeVisible();
  await expect(rows(page)).toHaveCount(38);
  await expect(btn(page, '儲存表情')).toBeVisible();

  /* 全部清空（訊息帶總數） */
  await rows(page).nth(1).getByRole('button', { name: /^編輯/ }).click();
  await list(page).getByRole('button', { name: '全部清空' }).click();
  await expect(alert(page)).toContainText('清空全部 38 個表情？');
  await alert(page).getByRole('button', { name: '清空' }).click();
  await expect(notice(page, '已清空表情清單')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(btn(page, '儲存表情')).toBeVisible();
  await expect(list(page).getByRole('button', { name: '全部清空' })).toBeDisabled();
  await expect(page.getByTestId('card-list-checked')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('隨機：50 次都是眼眉嘴各一、裝飾恰好一個（取代原本的裝飾）；標籤與顯示文字不變', async ({
  page,
}) => {
  const errors = await open(page);
  await part(page, 'deco-blush').click();
  await part(page, 'deco-tears').click();
  await labelBox(page).fill('隨便');
  await showText(page).click();
  const decoIds = await picker(page, '裝飾')
    .locator('[data-part]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-part') as string));
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    await btn(page, '隨機').click();
    const l = await layers(page);
    expect(l.slice(0, 2)).toEqual(['head-fill', 'head-line']);
    expect(l[2]).toMatch(/^brows-/);
    expect(l[3]).toMatch(/^eyes-/);
    expect(l[4]).toMatch(/^mouth-/);
    expect(l.slice(5)).toHaveLength(1);
    expect(decoIds).toContain(l[5]);
    seen.add(l[5]);
  }
  expect(seen.size).toBeGreaterThan(3);
  await expect(labelBox(page)).toHaveValue('隨便');
  await expect(showText(page)).not.toBeChecked();
  await expect(layerList(page).getByRole('listitem')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/* ---------- 自訂部件 ---------- */

test('自訂部件：非圖片略過、命名與重名、隨機候選、刪除只清同一類、非正方形等比置中', async ({
  page,
}) => {
  const errors = await open(page);
  const red = await png(120, 120, [230, 30, 30], [0.25, 0.25, 0.75, 0.75]);
  const tall = await png(200, 400, [20, 160, 60]);

  /* 全部都不是圖片 */
  await addImages(page, '眼睛', [file('readme.txt', Buffer.from('hello'), 'text/plain')]);
  await expect(notice(page, '選的檔案不是圖片')).toBeVisible();
  await expect(picker(page, '眼睛').locator('[data-part]')).toHaveCount(10);

  /* 非圖片略過；名稱＝檔名去副檔名；排在內建之後 */
  await addImages(page, '眼睛', [
    file('紅眼 .png', red),
    file('notes.txt', Buffer.from('x'), 'text/plain'),
    file('tall.v2.png', tall),
    file('.png', red),
  ]);
  await expect(notice(page, '已在「眼睛」新增 3 張')).toBeVisible();
  await expect(notice(page, '略過 1 個不是圖片的檔案。')).toBeVisible();
  const eyes = picker(page, '眼睛').locator('[data-part]');
  await expect(eyes).toHaveCount(13);
  await expect(eyes.nth(10)).toHaveAccessibleName('眼睛：自訂 紅眼');
  await expect(eyes.nth(11)).toHaveAccessibleName('眼睛：自訂 tall.v2');
  await expect(eyes.nth(12)).toHaveAccessibleName('眼睛：自訂 部件');
  await expect(eyes.nth(10).getByText('自訂', { exact: true })).toBeVisible();
  /* 同名再加 → (2)；同一類的內建名稱也算重名 */
  await addImages(page, '眼睛', [file('紅眼.png', red), file('一般.png', red)]);
  await expect(eyes.nth(13)).toHaveAccessibleName('眼睛：自訂 紅眼 (2)');
  await expect(eyes.nth(14)).toHaveAccessibleName('眼睛：自訂 一般 (2)');
  /* 裝飾也放一個同名的「紅眼」 */
  await addImages(page, '裝飾', [file('紅眼.png', red)]);
  await expect(notice(page, '已在「裝飾」新增 1 張')).toBeVisible();
  const decoRed = picker(page, '裝飾').getByRole('button', { name: '裝飾：自訂 紅眼' });

  /* 使用自訂部件 */
  await eyes.nth(10).click();
  await decoRed.click();
  const customEye = (await eyes.nth(10).getAttribute('data-part')) as string;
  const customDeco = (await decoRed.getAttribute('data-part')) as string;
  await expectLayers(page, [customEye, customDeco]);
  await labelBox(page).fill('紅紅');
  await btn(page, '儲存表情').click();
  await expect(rows(page).nth(0)).toContainText('紅眼 · 裝飾×1');

  /* 隨機的候選包含自訂部件 */
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) {
    await btn(page, '隨機').click();
    hit = (await layers(page)).some((id) => !/^(head|eyes|brows|mouth|deco)-/.test(id));
  }
  expect(hit).toBe(true);
  await page.getByRole('button', { name: '重設編輯區' }).click();

  /* 刪除自訂部件：確認（帶名稱）→ 從選項格、編輯區、清單移除；只清同一類的引用 */
  await eyes.nth(10).click();
  await eyes.nth(10).hover();
  await page.getByRole('button', { name: '刪除自訂部件「紅眼」' }).first().click();
  await expect(alert(page)).toContainText('刪除自訂部件「紅眼」？');
  await alert(page).getByRole('button', { name: '刪除' }).click();
  await expect(notice(page, '已刪除自訂部件「紅眼」')).toBeVisible();
  await expect(eyes).toHaveCount(14);
  await expectLayers(page, []);
  await expect(rows(page).nth(0)).toContainText('裝飾×1');
  await expect(rows(page).nth(0)).not.toContainText('紅眼');
  await expect(decoRed).toBeVisible();

  /* 非正方形（200 × 400）：預覽與合輯圖都等比置中（主控裁定） */
  await page.getByRole('button', { name: '眼睛：自訂 tall.v2' }).click();
  /* 預覽畫布 340 × 340（dpr 1）：圖寬 170、置中在 85～255 */
  await expect
    .poll(async () => (await previewPixel(page, 170, 170)).slice(0, 3))
    .toEqual([20, 160, 60]);
  expect((await previewPixel(page, 40, 170)).slice(0, 3)).not.toEqual([20, 160, 60]);
  expect((await previewPixel(page, 120, 170)).slice(0, 3)).toEqual([20, 160, 60]);
  await btn(page, '儲存表情').click();
  await list(page).getByRole('button', { name: '全不選' }).click();
  await rows(page).nth(1).getByRole('checkbox').click();
  await openSheet(page);
  await expect(sheetInfo(page)).toHaveText('表情 1 個 · 1×1 · 輸出 328×328 px');
  const { png: out } = await downloadSheet(page);
  /* 頭像在 (14, 14)～(314, 314)；圖寬 150、置中在 89～239 */
  expect(out.at(164, 164)).toEqual([20, 160, 60, 255]);
  expect(out.at(100, 30)).toEqual([20, 160, 60, 255]);
  expect(out.at(60, 164).slice(0, 3)).not.toEqual([20, 160, 60]);
  expect(out.at(260, 164).slice(0, 3)).not.toEqual([20, 160, 60]);
  expect(errors).toEqual([]);
});

/* ---------- 合輯圖 ---------- */

test('合輯圖：量測表的尺寸、文字區、欄數上限（裁定）、空白格子大小、下載 PNG（透明、白底、自訂色）', async ({
  page,
}) => {
  const errors = await open(page);
  await addPresets(page);
  await saveExpression(page, ['eyes-dot'], { label: '不顯示一', text: false });
  await saveExpression(page, ['eyes-heart'], { label: '不顯示二', text: false });
  await expect(rows(page)).toHaveCount(22);
  await openSheet(page);
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 1584×1879 px');
  await expect(spin(page, '欄數')).toHaveValue('0');
  await expect(spin(page, '格子大小')).toHaveValue('300');
  await expect(spin(page, '間距')).toHaveValue('14');
  await expect(spin(page, '文字大小')).toHaveValue('26');
  await expect(sheet(page).getByRole('radio', { name: '透明' })).toBeChecked();
  await expect(sheet(page).getByRole('switch', { name: '格子下顯示文字' })).toBeChecked();
  await expect(sheet(page).getByRole('textbox', { name: '背景顏色' })).toBeHidden();
  await expect(sheet(page).getByRole('textbox', { name: '文字顏色' })).toHaveValue('#222222');

  /* 下載：8-bit RGBA、檔名、透明背景、頭像位置 */
  const { name, png: a } = await downloadSheet(page);
  expect(name).toMatch(/^emotion-grid_\d{8}_\d{4}\.png$/);
  expect([a.width, a.height, a.bitDepth, a.colorType]).toEqual([1584, 1879, 8, 6]);
  expect(a.at(0, 0)).toEqual([0, 0, 0, 0]);
  expect(a.at(7, 500)).toEqual([0, 0, 0, 0]);
  /* 第 0 格頭像中央是膚色、角落透明；第 1 欄第 1 列的頭像左上角在 (14＋314, 14＋373) */
  expect(a.at(164, 164)[3]).toBe(255);
  expect(a.at(16, 16)).toEqual([0, 0, 0, 0]);
  expect(a.at(328 + 150, 387 + 150)[3]).toBe(255);
  /* 第 0 格的文字：頭像下緣往下一個內距（13）開始，水平置中在 x＝164 */
  const textRow = (x0: number, x1: number) => {
    let n = 0;
    for (let y = 320; y < 372; y++) for (let x = x0; x < x1; x++) if (a.at(x, y)[3] > 0) n++;
    return n;
  };
  expect(textRow(120, 210)).toBeGreaterThan(30);
  expect(textRow(14, 90)).toBe(0);
  expect(textRow(240, 314)).toBe(0);
  let top = 0;
  for (let y = 314; y < 372 && !top; y++)
    for (let x = 120; x < 210; x++) if (a.at(x, y)[3] > 0) top = y;
  /* 規格量測：舊版兩字標籤的字形約在 y 325～350（字形上緣比內距線略高一點） */
  expect(top).toBeGreaterThanOrEqual(321);
  expect(top).toBeLessThanOrEqual(334);

  /* 全域文字關閉：不留文字區 */
  await sheet(page).getByRole('switch', { name: '格子下顯示文字' }).click();
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 1584×1584 px');
  await sheet(page).getByRole('switch', { name: '格子下顯示文字' }).click();

  await spin(page, '欄數').fill('5');
  await spin(page, '格子大小').fill('100');
  await spin(page, '間距').fill('0');
  await spin(page, '文字大小').fill('12');
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 500×635 px');

  /* 欄數 50：依裁定限制在 20（舊版 22 × 1；刻意差異）；離開欄位改寫成 20 */
  await spin(page, '欄數').fill('50');
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 20×2 · 輸出 2000×254 px');
  await spin(page, '欄數').press('Tab');
  await expect(spin(page, '欄數')).toHaveValue('20');
  /* 負數＝自動 */
  await spin(page, '欄數').fill('-3');
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 500×635 px');
  await spin(page, '欄數').fill('5');

  for (const [v, info, shown] of [
    ['5', '400×535', '80'],
    ['5000', '4000×4135', '800'],
    ['', '1500×1635', '300'],
  ]) {
    await spin(page, '格子大小').fill(v);
    await expect(sheetInfo(page)).toHaveText(`表情 22 個 · 5×5 · 輸出 ${info} px`);
    await spin(page, '格子大小').press('Tab');
    await expect(spin(page, '格子大小')).toHaveValue(shown);
  }
  /* 間距、文字大小也夾在欄位標示的範圍 */
  await spin(page, '間距').fill('500');
  await spin(page, '間距').press('Tab');
  await expect(spin(page, '間距')).toHaveValue('120');
  await spin(page, '文字大小').fill('3');
  await spin(page, '文字大小').press('Tab');
  await expect(spin(page, '文字大小')).toHaveValue('8');
  /* 增加／減少按鈕 */
  await sheet(page).getByRole('button', { name: '間距：減少' }).click();
  await expect(spin(page, '間距')).toHaveValue('119');

  /* 背景：白色 → 整張白；自訂顏色才出現色彩欄 */
  await spin(page, '間距').fill('14');
  await spin(page, '格子大小').fill('100');
  await spin(page, '文字大小').fill('12');
  await sheet(page).getByRole('radio', { name: '白色' }).click();
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 584×719 px');
  const { png: w } = await downloadSheet(page);
  expect(w.at(0, 0)).toEqual([255, 255, 255, 255]);
  expect(w.at(583, 718)).toEqual([255, 255, 255, 255]);
  await sheet(page).getByRole('radio', { name: '自訂顏色' }).click();
  const bg = sheet(page).getByRole('textbox', { name: '背景顏色' });
  await expect(bg).toHaveValue('#ffffff');
  await bg.fill('#3366ff');
  await sheet(page).getByRole('textbox', { name: '文字顏色' }).fill('#ff0000');
  await expect(sheetInfo(page)).toHaveText('表情 22 個 · 5×5 · 輸出 584×719 px');
  const { png: c } = await downloadSheet(page);
  expect(c.at(0, 0)).toEqual([51, 102, 255, 255]);
  /* 文字是紅色 */
  let redText = 0;
  for (let y = 114; y < 159; y++)
    for (let x = 14; x < 114; x++) {
      const [r, g, b] = c.at(x, y);
      if (r > 200 && g < 80 && b < 120) redText++;
    }
  expect(redText).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('合輯圖：4 個、欄數 2、30 字標籤換成 3 行、空白行也算 → 642 × 892；關閉方式與選項保留', async ({
  page,
}) => {
  const errors = await open(page);
  await saveExpression(page, ['eyes-normal'], { label: '開心' });
  await saveExpression(page, ['eyes-closed'], {
    label: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十',
  });
  await saveExpression(page, ['eyes-dot'], { label: '第一行\n\n第三行' });
  await saveExpression(page, ['eyes-heart'], { label: '最後' });
  await openSheet(page);
  await spin(page, '欄數').fill('2');
  await expect(sheetInfo(page)).toHaveText('表情 4 個 · 2×2 · 輸出 642×892 px');
  const { png: a } = await downloadSheet(page);
  expect([a.width, a.height]).toEqual([642, 892]);
  /* 第 2 列的頭像左上角在 (14, 14＋300＋125＋14) */
  expect(a.at(14 + 150, 453 + 150)[3]).toBe(255);
  expect(a.at(14 + 150, 453 - 5)).toEqual([0, 0, 0, 0]);
  /* 第 3 格（空白行）：第一行與第三行有字、第二行（y 360～393）沒有 */
  const ink = (y0: number, y1: number, x0 = 14, x1 = 314) => {
    let n = 0;
    for (let y = 453 + 300 + y0; y < 453 + 300 + y1; y++)
      for (let x = x0; x < x1; x++) if (a.at(x, y)[3] > 0) n++;
    return n;
  };
  expect(ink(13, 46)).toBeGreaterThan(30);
  expect(ink(50, 76)).toBe(0);
  expect(ink(79, 112)).toBeGreaterThan(30);

  /* Esc 關閉；再開仍是上次的值 */
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await openSheet(page);
  await expect(spin(page, '欄數')).toHaveValue('2');
  await expect(sheetInfo(page)).toHaveText('表情 4 個 · 2×2 · 輸出 642×892 px');
  /* 點遮罩關閉 */
  await page.mouse.click(5, 5);
  await expect(sheet(page)).toHaveCount(0);
  /* 關閉鈕 */
  await openSheet(page);
  await sheet(page).getByRole('button', { name: '關閉' }).last().click();
  await expect(sheet(page)).toHaveCount(0);
  /* 重新整理後回到預設 */
  await page.reload();
  await openSheet(page);
  await expect(spin(page, '欄數')).toHaveValue('0');
  await expect(sheetInfo(page)).toHaveText('表情 4 個 · 2×2 · 輸出 642×892 px');
  expect(errors).toEqual([]);
});

test('合輯圖太大（瀏覽器畫布上限）：對話框裡顯示錯誤、不能下載；改回來就恢復', async ({ page }) => {
  const errors = await open(page);
  await addPresets(page);
  await addPresets(page);
  await expect(rows(page)).toHaveCount(40);
  await openSheet(page);
  await expect(sheetInfo(page)).toHaveText('表情 40 個 · 7×6 · 輸出 2212×2252 px');
  await spin(page, '欄數').fill('1');
  await spin(page, '格子大小').fill('800');
  /* 寬 800＋2×14、高 40×(800＋59)＋41×14＝34934 > 32767 */
  await expect(sheetInfo(page)).toHaveText('表情 40 個 · 1×40 · 輸出 828×34934 px');
  await expect(sheet(page).getByText(/合輯圖太大（828 × 34934 px）/)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: '下載 PNG' })).toBeDisabled();
  await spin(page, '欄數').fill('0');
  await expect(sheetInfo(page)).toHaveText('表情 40 個 · 7×6 · 輸出 5712×5252 px');
  await expect(sheet(page).getByText(/合輯圖太大/)).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: '下載 PNG' })).toBeEnabled();
  expect(errors).toEqual([]);
});

/* ---------- 匯出、匯入、保存 ---------- */

async function exportZip(page: Page): Promise<{ dl: Download; files: Record<string, Uint8Array> }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出清單').click()]);
  const files = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  return { dl, files };
}

async function importFile(page: Page, path: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '匯入清單').click(),
  ]);
  await chooser.setFiles(path);
}

async function texts(loc: Locator): Promise<string[]> {
  return loc.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
  );
}

test('匯出 ZIP（設定＋自訂部件圖片）→ 清空 → 匯入（直接載入、接在後面、取代、取消、無效檔案）', async ({
  page,
}, info) => {
  const errors = await open(page);
  await btn(page, '匯出清單').click();
  await expect(notice(page, '清單是空的，沒有可以匯出的表情')).toBeVisible();

  const red = await png(80, 80, [230, 30, 30], [0.2, 0.2, 0.8, 0.8]);
  await addImages(page, '嘴巴', [file('我的嘴.png', red)]);
  await addPresets(page);
  await page.getByRole('button', { name: '嘴巴：自訂 我的嘴' }).click();
  await saveExpression(page, ['eyes-normal'], { label: '自訂嘴' });
  await rows(page).nth(3).getByRole('checkbox').click();
  await expect(rows(page)).toHaveCount(21);
  await expect(rows(page).nth(20)).toContainText('一般 · 我的嘴');
  const before = await texts(rows(page));

  const { dl, files } = await exportZip(page);
  expect(dl.suggestedFilename()).toMatch(/^emotion-expressions_\d{8}_\d{4}\.zip$/);
  await expect(notice(page, '已匯出 21 個表情')).toBeVisible();
  const project = JSON.parse(new TextDecoder().decode(files['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'emotion-maker',
    version: 1,
  });
  expect(project.data.expressions).toHaveLength(21);
  expect(project.data.expressions[3].checked).toBe(false);
  expect(project.data.customParts).toHaveLength(1);
  const cp = project.data.customParts[0];
  expect(cp).toMatchObject({ category: 'mouth', name: '我的嘴' });
  expect(Buffer.from(files[`files/${cp.file}`])).toEqual(red);
  const zipPath = info.outputPath('list.zip');
  await dl.saveAs(zipPath);

  /* 清空後匯入：直接載入 */
  await list(page).getByRole('button', { name: '全部清空' }).click();
  await alert(page).getByRole('button', { name: '清空' }).click();
  await importFile(page, zipPath);
  await expect(notice(page, '已匯入 21 個')).toBeVisible();
  expect(await texts(rows(page))).toEqual(before);
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 20／共 21');
  /* 同一張圖沿用本機的自訂部件 */
  await expect(picker(page, '嘴巴').locator('[data-part]')).toHaveCount(11);

  /* 清單不是空的：三選一 */
  await importFile(page, zipPath);
  await expect(alert(page)).toContainText('匯入 21 個表情');
  await expect(alert(page)).toContainText('目前清單已有 21 個表情');
  await alert(page).getByRole('button', { name: '接在後面' }).click();
  await expect(rows(page)).toHaveCount(42);
  await importFile(page, zipPath);
  await alert(page).getByRole('button', { name: '取代目前的清單' }).click();
  await expect(rows(page)).toHaveCount(21);
  await importFile(page, zipPath);
  await alert(page).getByRole('button', { name: '取消' }).click();
  await expect(rows(page)).toHaveCount(21);

  /* 刪掉自訂部件後再匯入：圖片從 ZIP 回來 */
  await page.getByRole('button', { name: '嘴巴：自訂 我的嘴' }).hover();
  await page.getByRole('button', { name: '刪除自訂部件「我的嘴」' }).click();
  await alert(page).getByRole('button', { name: '刪除' }).click();
  await expect(picker(page, '嘴巴').locator('[data-part]')).toHaveCount(10);
  await importFile(page, zipPath);
  await alert(page).getByRole('button', { name: '取代目前的清單' }).click();
  await expect(picker(page, '嘴巴').locator('[data-part]')).toHaveCount(11);
  expect(await texts(rows(page))).toEqual(before);
  await page.getByRole('button', { name: '嘴巴：自訂 我的嘴' }).click();
  await expect
    .poll(async () => (await previewPixel(page, 170, 170)).slice(0, 3))
    .toEqual([230, 30, 30]);

  /* 無效的檔案：失敗通知、清單不變 */
  const bad = info.outputPath('bad.json');
  const fs = await import('node:fs');
  fs.writeFileSync(bad, JSON.stringify({ hello: 1 }));
  await importFile(page, bad);
  await expect(notice(page, '匯入失敗')).toBeVisible();
  await expect(rows(page)).toHaveCount(21);
  expect(errors).toEqual([]);
});

test('自動保存：清單、勾選、自訂部件（含圖片）重新整理後還原；編輯區不保存', async ({ page }) => {
  const errors = await open(page);
  const red = await png(60, 60, [230, 30, 30]);
  await addImages(page, '裝飾', [file('紅塊.png', red)]);
  await addPresets(page);
  await page.getByRole('button', { name: '裝飾：自訂 紅塊' }).click();
  await saveExpression(page, [], { label: '紅' });
  await rows(page).nth(2).getByRole('checkbox').click();
  const before = await texts(rows(page));
  /* 草稿 */
  await part(page, 'eyes-normal').click();
  await labelBox(page).fill('還沒存');

  await page.reload();
  await expect(rows(page)).toHaveCount(21);
  expect(await texts(rows(page))).toEqual(before);
  await expect(rows(page).nth(2).getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByTestId('card-list-checked')).toHaveText('合輯圖已選 20／共 21');
  await expect(labelBox(page)).toHaveValue('');
  await expectLayers(page, []);
  /* 自訂部件與圖片 */
  const custom = page.getByRole('button', { name: '裝飾：自訂 紅塊' });
  await expect(custom).toBeVisible();
  await custom.click();
  const id = (await custom.getAttribute('data-part')) as string;
  await expectLayers(page, [id]);
  expect((await previewPixel(page, 10, 10)).slice(0, 3)).toEqual([230, 30, 30]);
  /* 存在 localStorage 的是清單與部件名稱 */
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('trpg-toolkit:emotion-maker') ?? '{}'),
  );
  expect(stored.state.data.expressions).toHaveLength(21);
  expect(stored.state.data.customParts[0]).toMatchObject({ category: 'deco', name: '紅塊' });
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

async function shotState(page: Page) {
  await saveExpression(page, ['eyes-smile', 'brows-normal', 'mouth-grin', 'deco-blush'], {
    label: '開心！',
  });
  await saveExpression(page, ['eyes-squeeze', 'brows-worried', 'mouth-wide', 'deco-tears'], {
    label: '哇啊啊！',
  });
  for (const id of ['eyes-sparkle', 'brows-normal', 'mouth-cat', 'deco-blush', 'deco-sweat-one'])
    await part(page, id).click();
  await labelBox(page).fill('好期待！');
  await labelBox(page).blur();
  await expect(notices(page)).toHaveCount(0, { timeout: 5000 });
  /* 頁首是 sticky：整頁截圖前回到頂端 */
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('版面', () => {
  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await shotState(page);
    await expect(page).toHaveScreenshot('emotion-maker-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    /* 窄螢幕：編輯區在最上面，部件、清單依序在下 */
    const y = async (loc: Locator) => (await loc.boundingBox())?.y ?? 0;
    expect(await y(preview(page))).toBeLessThan(await y(picker(page, '眼睛')));
    expect(await y(picker(page, '裝飾'))).toBeLessThan(await y(list(page)));
    await shotState(page);
    await noHorizontalScroll(page);
    await openSheet(page);
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(page).toHaveScreenshot('emotion-maker-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
