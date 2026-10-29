/**
 * QR Code 產生器（建置產物 next/qr-maker/）的端對端測試（規格 docs/refactor/specs/qr-maker.md）：
 * - 開頁沒有錯誤、預設值（照原作）、預覽與掃描檢查、頁尾只有靈感來源；
 * - 內容：中文（UTF-8）讀得回來、文字欄離開才記一步復原；QR code 設定：等級、版本（放不下的說明）、模式（不能用的字）；
 * - 樣式：外觀預設（可以復原）、點與角的樣式、單色／漸層、背景透明與圓角；
 * - 中間的圖：讀入、拿掉後面的點、蓋在點上、拿掉；
 * - 掃描檢查的提醒：對比太低、反色、找不到定位方框（漸層的淡端）、透明背景、四周留白；
 * - 匯出：PNG（用 core/qr 讀回來＝輸入的文字）、倍率、JPEG（透明的地方是白色）、WebP、SVG（向量、圖嵌在裡面）、檔名、
 *   Ctrl＋S 直接下載、複製圖片；
 * - 自動儲存（含中間的圖）、專案檔（ZIP 含圖）、重設；390 寬每個分頁都沒有橫向捲動；1280 與 390 的視覺基準。
 * 測試用的圖都由程式產生。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { checkQrPixels } from '../../src/core/qr/check';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('qr-maker') ?? { id: 'qr-maker', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:qr-maker';

test.use({ viewport: { width: 1280, height: 900 } });

interface Grid {
  x: number;
  y: number;
  cell: number;
  count: number;
}
interface Decoded {
  ok: boolean;
  text?: string;
  version?: number;
  ecl?: string;
  modes?: string[];
  corrected?: number;
  worst?: number;
}
interface Check {
  state: 'pending' | 'done' | 'none';
  decoded: Decoded | null;
  finders: boolean[] | null;
  wrong: number | null;
  view: {
    notice: { tone: string; message: string } | null;
    items: { level: string; id: string; message: string }[];
  } | null;
  grid: Grid | null;
}
// biome-ignore lint/suspicious/noExplicitAny: 測試直接讀工具的狀態
type Doc = any;

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
  await expect(page.getByRole('heading', { level: 1, name: 'QR Code 產生器' })).toBeVisible();
  return errors;
}

const doc = (page: Page): Promise<Doc> =>
  page.evaluate(() => (window as never as { __qrMaker: { doc: () => Doc } }).__qrMaker.doc());
const check = (page: Page): Promise<Check> =>
  page.evaluate(() => (window as never as { __qrMaker: { check: () => Check } }).__qrMaker.check());
const tab = (page: Page, name: '內容' | '樣式' | '圖片' | '匯出') =>
  page.getByRole('tab', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const dataBox = (page: Page) => page.getByTestId('qr-data');
const checkBox = (page: Page) => page.getByTestId('qr-check');
/** 等掃描檢查跑完（狀態不是 pending），回傳結果 */
async function settled(page: Page): Promise<Check> {
  await expect.poll(async () => (await check(page)).state, { timeout: 10_000 }).not.toBe('pending');
  return check(page);
}
/** 等到讀回來的文字是 text */
async function decodedAs(page: Page, text: string) {
  await expect
    .poll(
      async () => {
        const c = await check(page);
        return c.state === 'done' ? (c.decoded?.text ?? null) : null;
      },
      { timeout: 10_000 },
    )
    .toBe(text);
  return check(page);
}
const radio = (page: Page, group: string, name: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true });
const thumb = (page: Page, group: string, name: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true });

async function pickSelect(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** 畫布上一點的顏色 */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page
    .getByTestId('qr-canvas')
    .evaluate(
      (c: HTMLCanvasElement, [px, py]) =>
        Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data),
      [x, y],
    );
}

/** 200 × 200 的紅底白圈 Logo（不透明的正方形） */
async function logoPng(): Promise<Buffer> {
  const w = 200;
  const px = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 100, y - 100);
      px.set(r > 50 && r < 70 ? [255, 255, 255, 255] : [200, 30, 40, 255], (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, w));
}
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function loadLogo(page: Page) {
  await tab(page, '圖片').click();
  await page
    .getByRole('group', { name: '中間的圖載入區' })
    .locator('input[type=file]')
    .setInputFiles(file('logo.png', await logoPng()));
  await expect(page.getByTestId('image-info')).toContainText('logo.png・200 × 200 px');
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
    pixels: decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType),
  };
}

const scaled = (g: Grid, k: number): Grid => ({
  x: g.x * k,
  y: g.y * k,
  cell: g.cell * k,
  count: g.count,
});

/** 匯出（ExportPanel）：選格式與倍率、按匯出、從結果卡下載 */
async function exportFile(
  page: Page,
  format: 'PNG' | 'JPEG' | 'WebP' | 'SVG',
  scaleLabel?: RegExp,
) {
  await tab(page, '匯出').click();
  const panel = page.getByRole('region', { name: '匯出' });
  await panel.getByRole('radio', { name: format, exact: true }).click();
  if (scaleLabel) {
    await panel.getByRole('combobox').first().click();
    await page.getByRole('option', { name: scaleLabel }).click();
  }
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const link = panel.getByTestId('export-result').getByRole('link', { name: '下載' });
  await expect(link).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

/** 在頁面裡解出點陣圖的像素（JPEG、WebP、SVG） */
async function browserPixels(page: Page, bytes: Uint8Array, type: string) {
  return page.evaluate(
    async ([b64, t]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const url = globalThis.URL.createObjectURL(new Blob([bin], { type: t }));
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0);
      return {
        width: c.width,
        height: c.height,
        pixels: Array.from(x.getImageData(0, 0, c.width, c.height).data),
      };
    },
    [Buffer.from(bytes).toString('base64'), type] as const,
  );
}

/* ---------- 開頁與內容 ---------- */

test('開頁：預設值照原作、預覽讀得出來、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const d = await doc(page);
  expect(d.data).toBe('https://example.com/');
  /* 邊距 24 px（和原作的 0 不同，規格 D2） */
  expect([d.width, d.height, d.margin, d.shape]).toEqual([300, 300, 24, 'square']);
  expect(d.qr).toEqual({ version: 0, mode: 'auto', ecl: 'Q' });
  expect([d.dots.type, d.dots.paint.color, d.dots.roundSize]).toEqual(['square', '#000000', true]);
  expect([d.cornerSquare.type, d.cornerDot.type, d.background.color]).toEqual([
    'none',
    'none',
    '#ffffff',
  ]);
  expect(d.imageOptions).toEqual({ size: 0.4, margin: 0, hideBackgroundDots: true });
  const c = await decodedAs(page, 'https://example.com/');
  expect(c.decoded).toMatchObject({ ok: true, version: 2, ecl: 'Q', corrected: 0 });
  expect(c.finders).toEqual([true, true, true]);
  expect(c.wrong).toBe(0);
  await expect(checkBox(page)).toHaveAttribute('data-state', 'success');
  await expect(checkBox(page)).toContainText('讀得出來');
  /* 預設的邊距約 2.4 格：沒有留白的提醒 */
  expect(c.grid).toEqual({ x: 25, y: 25, cell: 10, count: 25 });
  expect(c.view?.items).toEqual([]);
  await expect(checkBox(page)).not.toContainText('四周留白');
  await expect(page.getByTestId('qr-canvas')).toHaveJSProperty('width', 300);
  const footer = page.locator('footer');
  await expect(footer).toHaveText('靈感來源：kozakdenys/qr-code-styling');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/kozakdenys/qr-code-styling',
  );
  expect(errors).toEqual([]);
});

test('內容：中文與表情符號以 UTF-8 讀得回來；離開文字欄才記一步復原', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  const text = '今晚八點開團！🎲 https://example.com/s/克蘇魯';
  await dataBox(page).fill(text);
  await dataBox(page).blur();
  const c = await decodedAs(page, text);
  expect(c.decoded?.modes).toEqual(['byte']);
  await expect(page.getByText(/位元組模式・\d+ 位元組・第 \d 版/)).toBeVisible();
  /* 一次打字＝一步 */
  await page.keyboard.press('Control+z');
  await decodedAs(page, 'https://example.com/');
  await page.keyboard.press('Control+Shift+z');
  await decodedAs(page, text);
  /* 清空：預覽說明、沒有檢查 */
  await dataBox(page).fill('');
  await expect(page.getByTestId('qr-error')).toHaveText('請在「內容」輸入網址或文字。');
  expect(errors).toEqual([]);
});

test('QR code 設定：錯誤更正等級、版本（放不下時說明至少要第幾版）、模式（不能用的字）', async ({
  page,
}) => {
  const errors = await open(page);
  await settled(page);
  await radio(page, '錯誤更正等級', 'H').click();
  await expect.poll(async () => (await check(page)).decoded?.ecl).toBe('H');
  /* 第 1 版、等級 H 放不下 20 個位元組 */
  await pickSelect(page, 'qr-version', '第 1 版');
  await expect(page.getByTestId('qr-error')).toHaveText(/第 1 版放不下這段內容，至少要第 \d+ 版/);
  await expect(checkBox(page)).toHaveAttribute('data-state', 'none');
  await pickSelect(page, 'qr-version', '第 6 版');
  await expect.poll(async () => (await check(page)).decoded?.version).toBe(6);
  expect((await check(page)).grid?.count).toBe(41);
  await pickSelect(page, 'qr-version', '自動（放得下的最小版本）');
  /* 數字模式不能有英文 */
  await pickSelect(page, 'qr-mode', '數字');
  await expect(page.getByTestId('qr-error')).toHaveText(
    '「h」不能用數字模式；請把模式改成自動或位元組。',
  );
  await dataBox(page).fill('0912345678');
  await dataBox(page).blur();
  const c = await decodedAs(page, '0912345678');
  expect(c.decoded?.modes).toEqual(['numeric']);
  await pickSelect(page, 'qr-mode', '英數字');
  await dataBox(page).fill('HTTPS://EXAMPLE.COM/A');
  await dataBox(page).blur();
  expect((await decodedAs(page, 'HTTPS://EXAMPLE.COM/A')).decoded?.modes).toEqual(['alphanumeric']);
  await pickSelect(page, 'qr-mode', '漢字（Shift_JIS）');
  await dataBox(page).fill('探索者の手記');
  await dataBox(page).blur();
  expect((await decodedAs(page, '探索者の手記')).decoded?.modes).toEqual(['kanji']);
  /* 「妳」不在 Shift_JIS 裡 */
  await dataBox(page).fill('妳好');
  await expect(page.getByTestId('qr-error')).toContainText('不能用漢字模式');
  expect(errors).toEqual([]);
});

test('大小：寬高、邊距（四周留白的提醒消失）、太小時說明', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await page.getByRole('spinbutton', { name: '寬' }).fill('500');
  await page.getByRole('spinbutton', { name: '寬' }).press('Enter');
  await expect(page.getByTestId('qr-canvas')).toHaveJSProperty('width', 500);
  /* 邊距 0：四周留白的提醒（資訊） */
  await page.getByRole('spinbutton', { name: '邊距' }).fill('0');
  await page.getByRole('spinbutton', { name: '邊距' }).press('Enter');
  await expect(checkBox(page)).toContainText('四周留白約 0 格');
  await page.getByRole('spinbutton', { name: '邊距' }).fill('40');
  await page.getByRole('spinbutton', { name: '邊距' }).press('Enter');
  await expect.poll(async () => (await doc(page)).margin).toBe(40);
  await expect
    .poll(async () => (await check(page)).grid)
    .toEqual({ x: 150, y: 50, cell: 8, count: 25 });
  await expect(checkBox(page)).not.toContainText('四周留白');
  await page.getByRole('spinbutton', { name: '寬' }).fill('40');
  await page.getByRole('spinbutton', { name: '寬' }).press('Enter');
  await expect(page.getByTestId('qr-error')).toHaveText(/尺寸太小，放不下 25 × 25 格/);
  expect(errors).toEqual([]);
});

/* ---------- 樣式 ---------- */

test('樣式：外觀預設（可以復原）、點與角的樣式、單色與漸層、背景透明與圓角', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await tab(page, '樣式').click();
  await page.getByRole('button', { name: /圓形徽章/ }).click();
  await expect.poll(async () => (await doc(page)).shape).toBe('circle');
  expect((await doc(page)).background.round).toBe(1);
  const c = await decodedAs(page, 'https://example.com/');
  expect(c.view?.notice?.tone).toBe('success');
  /* 圓形背景：四角透明 */
  expect((await pixel(page, 2, 2))[3]).toBe(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).shape).toBe('square');

  await thumb(page, '點的樣式', '圓點').click();
  await expect.poll(async () => (await doc(page)).dots.type).toBe('dots');
  await thumb(page, '外框的樣式', '圓框').click();
  await expect(
    page.getByText(/圓框、圓角框：有些掃描程式（例如部分電腦版的讀取程式）找不到這種角/),
  ).toBeVisible();
  await thumb(page, '中心的樣式', '圓').click();
  await expect
    .poll(async () => [(await doc(page)).cornerSquare.type, (await doc(page)).cornerDot.type])
    .toEqual(['dot', 'dot']);
  await decodedAs(page, 'https://example.com/');
  expect((await check(page)).finders).toEqual([true, true, true]);

  /* 角的外框改成紅色：左上角圓框的左邊是紅的、點還是黑的 */
  await radio(page, '角的外框的顏色', '單色').click();
  await page.getByRole('textbox', { name: '角的外框色碼' }).fill('#c00000');
  await page.getByRole('textbox', { name: '角的外框色碼' }).press('Enter');
  const g = (await check(page)).grid as Grid;
  await expect
    .poll(() => pixel(page, g.x + Math.floor(g.cell / 2), g.y + Math.floor(3.5 * g.cell)))
    .toEqual([192, 0, 0, 255]);
  /* 中心跟著外框 */
  expect(await pixel(page, g.x + Math.floor(3.5 * g.cell), g.y + Math.floor(3.5 * g.cell))).toEqual(
    [192, 0, 0, 255],
  );

  /* 點改成漸層 */
  await radio(page, '點的顏色', '漸層').click();
  await expect(page.getByRole('group', { name: '點的漸層' })).toBeVisible();
  await expect.poll(async () => (await doc(page)).dots.paint.mode).toBe('gradient');
  await decodedAs(page, 'https://example.com/');

  /* 背景：透明＋提醒；圓角 */
  await radio(page, '背景的顏色', '透明').click();
  await expect(checkBox(page)).toContainText('背景透明');
  /* 左上角方框旁的分隔線（淺色的格）是透明的 */
  const g2 = (await check(page)).grid as Grid;
  expect(
    (await pixel(page, g2.x + Math.floor(7.5 * g2.cell), g2.y + Math.floor(3.5 * g2.cell)))[3],
  ).toBe(0);
  await radio(page, '背景的顏色', '單色').click();
  await page.getByRole('slider', { name: '圓角' }).focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await doc(page)).background.round).toBe(1);
  expect(errors).toEqual([]);
});

test('掃描檢查的提醒：對比太低、反色、漸層的淡端找不到定位方框', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await tab(page, '樣式').click();
  const dots = page.getByRole('textbox', { name: '點色碼' });
  /* 淡灰色的點 */
  await dots.fill('#b0b0b0');
  await dots.press('Enter');
  await expect(checkBox(page)).toContainText('對比太低');
  await expect(checkBox(page)).toHaveAttribute('data-state', 'info');
  await expect(checkBox(page)).toContainText('很多掃描程式可能讀不出來');
  /* 白點黑底：反過來才讀得出來 */
  await dots.fill('#ffffff');
  await dots.press('Enter');
  await page.getByRole('textbox', { name: '背景色碼' }).fill('#000000');
  await page.getByRole('textbox', { name: '背景色碼' }).press('Enter');
  await expect(checkBox(page)).toContainText('顏色是反過來的');
  /* 總結不寫「讀得出來」 */
  await expect(checkBox(page)).toContainText('只有部分掃描程式讀得出來（反色');
  await expect(checkBox(page)).not.toContainText('讀得出來：');
  await expect.poll(async () => (await check(page)).decoded?.ok).toBe(false);
  await page.getByRole('textbox', { name: '背景色碼' }).fill('#ffffff');
  await page.getByRole('textbox', { name: '背景色碼' }).press('Enter');
  /* 漸層：由左（黑）到右（淡灰）＝右上角的方框太淡 */
  await radio(page, '點的顏色', '漸層').click();
  await page.getByRole('slider', { name: '點的漸層色標 1（#000000）' }).focus();
  await page.getByRole('textbox', { name: '色標 1色碼' }).fill('#000000');
  await page.getByRole('slider', { name: /點的漸層色標 2/ }).focus();
  await page.getByRole('textbox', { name: '色標 2色碼' }).fill('#e0e0e0');
  await page.getByRole('textbox', { name: '色標 2色碼' }).press('Enter');
  /* 淡端 #e0e0e0 在白底上：對比極低＝紅 */
  await expect(checkBox(page)).toContainText('對比極低');
  await expect(checkBox(page)).toContainText('很可能掃不到');
  await expect(checkBox(page)).toHaveAttribute('data-state', 'error');
  /* 邊距 0：右上角的定位方框也太淡 */
  await tab(page, '內容').click();
  await page.getByRole('spinbutton', { name: '邊距' }).fill('0');
  await page.getByRole('spinbutton', { name: '邊距' }).press('Enter');
  await expect(checkBox(page)).toContainText('右上的定位方框太淡');
  await expect(checkBox(page)).toHaveAttribute('data-state', 'error');
  expect((await check(page)).finders).toEqual([true, false, true]);
  expect(errors).toEqual([]);
});

/* ---------- 中間的圖 ---------- */

test('中間的圖：拿掉後面的點（靠錯誤更正）、蓋在點上、等級 H、拿掉', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await loadLogo(page);
  await expect.poll(async () => (await check(page)).decoded?.corrected ?? 0).toBeGreaterThan(0);
  let c = await check(page);
  expect(c.decoded?.text).toBe('https://example.com/');
  await expect(checkBox(page)).toContainText('靠錯誤更正修回來');
  /* 圖畫在中間：中心是紅色 */
  expect(await pixel(page, 150, 150)).toEqual([200, 30, 40, 255]);
  /* 等級 H：用掉的容錯變少 */
  const worstQ = c.decoded?.worst ?? 1;
  await tab(page, '內容').click();
  await radio(page, '錯誤更正等級', 'H').click();
  await expect.poll(async () => (await check(page)).decoded?.ecl).toBe('H');
  c = await check(page);
  expect(c.decoded?.ok).toBe(true);
  expect(c.decoded?.worst ?? 1).toBeLessThan(worstQ);
  /* 蓋在點上：還讀得出來 */
  await tab(page, '圖片').click();
  await page.getByRole('switch', { name: '拿掉圖後面的點' }).click();
  await expect.poll(async () => (await doc(page)).imageOptions.hideBackgroundDots).toBe(false);
  await decodedAs(page, 'https://example.com/');
  /* 圖的大小 */
  await page.getByRole('slider', { name: '大小' }).focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => (await doc(page)).imageOptions.size).toBe(0.05);
  await page.getByRole('button', { name: '拿掉圖' }).click();
  await expect.poll(async () => (await doc(page)).image).toBeNull();
  await expect.poll(async () => (await check(page)).decoded?.corrected).toBe(0);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：和輸入的文字讀得回來；倍率 2；檔名', async ({ page }) => {
  const errors = await open(page);
  const text = '第三章的線索：地下室的鑰匙在書架後面。';
  await dataBox(page).fill(text);
  await dataBox(page).blur();
  await decodedAs(page, text);
  await tab(page, '樣式').click();
  await page.getByRole('button', { name: /古文書/ }).click();
  await decodedAs(page, text);
  const grid = (await check(page)).grid as Grid;
  await tab(page, '匯出').click();
  await page.getByRole('textbox', { name: '檔名' }).fill('線索 QR');
  const png = await exportFile(page, 'PNG');
  expect(png.name).toBe('線索 QR.png');
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([300, 300]);
  const r = checkQrPixels({ ...img, grid });
  expect(r.decoded).toMatchObject({ ok: true, text });
  const big = await exportFile(page, 'PNG', /^200%/);
  const img2 = readPng(big.bytes);
  expect([img2.width, img2.height]).toEqual([600, 600]);
  expect(checkQrPixels({ ...img2, grid: scaled(grid, 2) }).decoded).toMatchObject({
    ok: true,
    text,
  });
  expect(errors).toEqual([]);
});

test('匯出 JPEG（透明的地方鋪白）、WebP、SVG（向量、圖嵌進去）', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await tab(page, '樣式').click();
  await radio(page, '背景的顏色', '透明').click();
  await loadLogo(page);
  await decodedAs(page, 'https://example.com/');
  const grid = (await check(page)).grid as Grid;

  const jpg = await exportFile(page, 'JPEG');
  expect(jpg.name).toBe('qr.jpg');
  const j = await browserPixels(page, jpg.bytes, 'image/jpeg');
  expect([j.width, j.height]).toEqual([300, 300]);
  /* 左上角的方框外面（第 7 格的分隔線）是白色 */
  const k =
    (Math.floor(grid.y + 7.5 * grid.cell) * j.width + Math.floor(grid.x + 3 * grid.cell)) * 4;
  expect(j.pixels.slice(k, k + 3).every((v) => v > 240)).toBe(true);
  expect(checkQrPixels({ ...j, pixels: Uint8Array.from(j.pixels), grid }).decoded).toMatchObject({
    ok: true,
  });

  const webp = await exportFile(page, 'WebP');
  expect(webp.name).toBe('qr.webp');
  const w = await browserPixels(page, webp.bytes, 'image/webp');
  expect(checkQrPixels({ ...w, pixels: Uint8Array.from(w.pixels), grid }).decoded).toMatchObject({
    ok: true,
  });

  const svg = await exportFile(page, 'SVG');
  expect(svg.name).toBe('qr.svg');
  const src = new TextDecoder().decode(svg.bytes);
  expect(src.startsWith('<?xml version="1.0" standalone="no"?>')).toBe(true);
  expect(src).toContain('viewBox="0 0 300 300"');
  expect(src).toContain('<image href="data:image/png;base64,');
  expect(src).not.toContain('<rect');
  const s = await browserPixels(page, svg.bytes, 'image/svg+xml');
  expect(checkQrPixels({ ...s, pixels: Uint8Array.from(s.pixels), grid }).decoded).toMatchObject({
    ok: true,
    text: 'https://example.com/',
  });
  expect(errors).toEqual([]);
});

test('Ctrl＋S 用目前的格式直接下載；複製圖片（PNG）', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await settled(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  expect(dl.suggestedFilename()).toBe('qr.png');
  await expect(toast(page, '已下載 qr.png')).toBeVisible();
  await tab(page, '匯出').click();
  await page.getByRole('button', { name: '複製圖片' }).click();
  await expect(toast(page, '已複製圖片（PNG）')).toBeVisible();
  const info = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const bmp = await createImageBitmap(await items[0].getType('image/png'));
    return { types: items[0].types, w: bmp.width, h: bmp.height };
  });
  expect(info).toEqual({ types: ['image/png'], w: 300, h: 300 });
  /* 複製也用目前的倍率（同 Ctrl＋S） */
  const panel = page.getByRole('region', { name: '匯出' });
  await panel.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /^200%/ }).click();
  await page.getByRole('button', { name: '複製圖片' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        return (await createImageBitmap(await items[0].getType('image/png'))).width;
      }),
    )
    .toBe(600);
  expect(errors).toEqual([]);
});

test('大尺寸：點陣圖超過 Safari 的畫布上限時提醒（SVG 不提醒）', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await page.getByRole('spinbutton', { name: '寬' }).fill('4096');
  await page.getByRole('spinbutton', { name: '寬' }).press('Enter');
  await page.getByRole('spinbutton', { name: '高' }).fill('4096');
  await page.getByRole('spinbutton', { name: '高' }).press('Enter');
  await tab(page, '匯出').click();
  const panel = page.getByRole('region', { name: '匯出' });
  /* 4096 × 4096＝16,777,216：剛好不超過 */
  await expect(page.getByTestId('canvas-limit')).toHaveCount(0);
  await panel.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /^200%/ }).click();
  await expect(page.getByTestId('canvas-limit')).toContainText('8192 × 8192 px');
  await expect(page.getByTestId('canvas-limit')).toContainText('Safari');
  await panel.getByRole('radio', { name: 'SVG', exact: true }).click();
  await expect(page.getByTestId('canvas-limit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存：重新整理之後內容、樣式、中間的圖都還在', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await dataBox(page).fill('https://example.com/handout/7');
  await dataBox(page).blur();
  await tab(page, '樣式').click();
  await page.getByRole('button', { name: /深海/ }).click();
  await loadLogo(page);
  await expect.poll(async () => (await doc(page)).image?.name).toBe('logo.png');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'QR Code 產生器' })).toBeVisible();
  const d = await doc(page);
  expect(d.data).toBe('https://example.com/handout/7');
  expect(d.dots.type).toBe('rounded');
  expect(d.image?.name).toBe('logo.png');
  await decodedAs(page, 'https://example.com/handout/7');
  await expect.poll(() => pixel(page, 150, 150)).toEqual([200, 30, 40, 255]);
  /* 存檔被改壞時整理 */
  await page.evaluate((key) => {
    const v = JSON.parse(localStorage.getItem(key) as string);
    v.state.data.width = 99999;
    v.state.data.dots.type = 'star';
    localStorage.setItem(key, JSON.stringify(v));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'QR Code 產生器' })).toBeVisible();
  expect([(await doc(page)).width, (await doc(page)).dots.type]).toEqual([4096, 'square']);
  expect(errors).toEqual([]);
});

test('專案檔：沒有圖時 JSON；有圖時存成 ZIP（設定＋圖）、重設、開啟還原', async ({ page }) => {
  const errors = await open(page);
  await settled(page);
  await dataBox(page).fill('專案檔測試');
  await dataBox(page).blur();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '專案' }).click();
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/\.json$/);
  const plain = JSON.parse(readFileSync((await json.path()) as string, 'utf8'));
  expect([plain.tool, plain.data.data, plain.data.image]).toEqual(['qr-maker', '專案檔測試', null]);
  await loadLogo(page);
  await expect.poll(async () => (await doc(page)).image?.name).toBe('logo.png');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zip = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project.tool).toBe('qr-maker');
  expect(project.data.data).toBe('專案檔測試');
  const id = project.data.image.id as string;
  expect(Object.keys(zip).some((n) => n.startsWith(`files/${id}`))).toBe(true);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect.poll(async () => (await doc(page)).data).toBe('https://example.com/');
  expect((await doc(page)).image).toBeNull();
  await page.waitForTimeout(450);
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    confirm.getByRole('button', { name: '選擇專案檔' }).click(),
  ]);
  await chooser.setFiles({
    name: 'p.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(zip)),
  });
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect.poll(async () => (await doc(page)).image?.name).toBe('logo.png');
  await decodedAs(page, '專案檔測試');
  await expect.poll(() => pixel(page, 150, 150)).toEqual([200, 30, 40, 255]);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬：每個分頁都沒有橫向捲動；視覺基準 1280／390', async ({ page }) => {
  const errors = await open(page);
  await decodedAs(page, 'https://example.com/');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('qr-maker-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['內容', '樣式', '圖片', '匯出'] as const) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, name).toBeLessThanOrEqual(390);
  }
  await tab(page, '樣式').click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('qr-maker-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('元件展示頁的 core/qr 示範：畫好讀回來', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(`/${outputDir(getTool('_gallery') ?? { id: '_gallery', status: 'next' })}/`);
  await page.getByRole('tab', { name: '模組' }).click();
  await expect(page.getByTestId('qr-demo-result')).toHaveText(
    '讀回來：「https://example.com/展示頁」（第 3 版・等級 M）',
  );
});
