/**
 * 立繪裁切器（建置產物 tools/ccfolia-cropper/）的端對端測試：
 * - 開頁沒有 pageerror／console error；沒有圖時的按鈕啟用規則；頁尾只放靈感來源；
 * - 選檔、拖放、貼上載入（只收 PNG／WebP、取代清單、壞檔指出檔名並略過、貼上檔名用本地時間）；
 * - 比例、範圍、五種基準：下載的 PNG 與參考做法（瀏覽器讀到的原圖像素 → logic.ts 的裁切）逐像素相同；
 * - 拖曳裁切框（只能左右、夾在圖內）、回到基準位置、[ ／ ] 快捷鍵、每張各自記住、A／D 換張；
 * - 預覽的滾輪縮放（20%～500%）、拖曳平移、縮放歸位；
 * - 全部套用同一基準（主控裁定的新語意）；
 * - 效果：預覽與下載相同、角色像素不變、各樣式的參數；
 * - 批次下載：檔名、順序、間隔約 0.2 秒、按鈕狀態、完成訊息；Ctrl＋S；快捷鍵的焦點例外；
 * - 對等驗證後的追加裁定：拖曳或點過裁切框後快捷鍵照常（F39）、光暈的強度（σ ＝ 模糊值）、預覽區的大小；
 * - 記住設定；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import {
  type Anchor,
  type Aspect,
  cropGeometry,
  cropPixels,
  DEFAULT_SETTINGS,
  figureFromPixels,
  type Settings,
} from '../../src/tools/ccfolia-cropper/logic';
import { applyEffects, effectParams } from '../../src/tools/ccfolia-cropper/process';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('ccfolia-cropper') ?? { id: 'ccfolia-cropper', status: 'next' })}/`;

type Rgb = [number, number, number];

/* ---------- 測試圖 ---------- */

async function pngOf(
  w: number,
  h: number,
  paint: (set: (x: number, y: number, c: Rgb, a?: number) => void) => void,
) {
  const px = new Uint8Array(w * h * 4);
  paint((x, y, c, a = 255) => px.set([...c, a], (y * w + x) * 4));
  return Buffer.from(await encodePng(px, w, h));
}

/** 規格 3.2 的測試圖 A（700 × 1200）：頭 x 220～379、y 70～229 的圓，身體 x 230～369、y 230～799，裙襬 x 100～399、y 800～1149 */
const figureA = () =>
  pngOf(700, 1200, (set) => {
    for (let y = 70; y <= 229; y++)
      for (let x = 220; x <= 379; x++)
        if ((x - 299.5) ** 2 + (y - 149.5) ** 2 <= 80 * 80) set(x, y, [240, 200, 170]);
    for (let y = 230; y <= 799; y++) for (let x = 230; x <= 369; x++) set(x, y, [60, 90, 200]);
    for (let y = 800; y <= 1149; y++) for (let x = 100; x <= 399; x++) set(x, y, [200, 50, 60]);
    /* 頭的邊緣一圈半透明（確認半透明像素原封不動） */
    for (let y = 70; y <= 229; y++)
      for (let x = 220; x <= 379; x++) {
        const d = Math.hypot(x - 299.5, y - 149.5);
        if (d > 80 && d <= 81.5) set(x, y, [240, 200, 170], 96);
      }
  });

/** 第二張：頭偏左、右手往上舉（上半身中心與頭部中心不同） */
const figureB = () =>
  pngOf(500, 800, (set) => {
    for (let y = 40; y <= 159; y++)
      for (let x = 100; x <= 219; x++)
        if ((x - 159.5) ** 2 + (y - 99.5) ** 2 <= 60 * 60) set(x, y, [250, 220, 190]);
    for (let y = 160; y <= 699; y++) for (let x = 110; x <= 209; x++) set(x, y, [40, 160, 90]);
    /* 手臂：第 300～320 列往右伸到 x＝420 */
    for (let y = 300; y <= 320; y++) for (let x = 210; x <= 420; x++) set(x, y, [40, 160, 90]);
  });

/** 第三張：小圖、背景完全不透明 */
const figureC = () =>
  pngOf(240, 160, (set) => {
    for (let y = 0; y < 160; y++)
      for (let x = 0; x < 240; x++) set(x, y, [(x * 3) & 255, (y * 5) & 255, 128]);
  });

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/* ---------- 頁面操作 ---------- */

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* 記錄每次下載的檔名與時間（<a download> 被點的那一刻） */
  await page.addInitScript(() => {
    const log: { name: string; t: number }[] = [];
    (window as unknown as { __downloads: typeof log }).__downloads = log;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) log.push({ name: this.download, t: performance.now() });
      return click.call(this);
    };
  });
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '立繪裁切器' })).toBeVisible();
  return errors;
}

const dropZone = (page: Page) => page.getByRole('group', { name: '把 PNG／WebP 立繪拖到這裡' });
const input = (page: Page) => dropZone(page).locator('input[type=file]');
const status = (page: Page) => page.getByTestId('status-text');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const counter = (page: Page) => page.getByTestId('counter');
const frame = (page: Page) => page.getByTestId('crop-frame');
const stage = (page: Page) => page.getByRole('region', { name: '裁切預覽' });
const outputSize = (page: Page) => page.getByTestId('output-size');
const anchorSelect = (page: Page) => page.getByRole('combobox', { name: '裁切基準' });
const applyAll = (page: Page) => page.getByRole('checkbox', { name: '全部套用同一基準' });

async function load(page: Page, files: ReturnType<typeof file>[], expected: string) {
  await input(page).setInputFiles(files);
  await expect(status(page)).toHaveText(expected);
}

async function chooseAnchor(page: Page, label: string) {
  await anchorSelect(page).click();
  await page.getByRole('option', { name: new RegExp(`^${label}`) }).click();
  await expect(anchorSelect(page)).toContainText(label);
}

async function setRange(page: Page, v: number) {
  const box = page.getByRole('spinbutton', { name: '裁切範圍' });
  await box.fill(String(v));
  await box.press('Enter');
  await expect(page.getByRole('slider', { name: '裁切範圍' })).toHaveAttribute(
    'aria-valuenow',
    String(v),
  );
}

async function setAspect(page: Page, aspect: Aspect) {
  await page.getByRole('radio', { name: aspect === '3:4' ? '3:4 直式' : '1:1 正方' }).click();
}

/** 讓焦點回到頁面本身（不在任何控制項上） */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

async function frameX(page: Page) {
  return Number(await frame(page).getAttribute('aria-valuenow'));
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 直接解出 PNG 檔裡的像素（不經過瀏覽器，沒有預乘的誤差） */
function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, bitDepth, colorType } = readIhdr(chunks);
  expect([bitDepth, colorType], '8-bit RGBA').toEqual([8, 6]);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

/** 在頁面裡用瀏覽器解碼原圖，回傳整張的 RGBA（工具讀到的像素：解碼、畫到畫布、getImageData） */
async function pixelsOf(page: Page, bytes: Buffer): Promise<PixelBuffer> {
  const r = await page.evaluate(async (b64) => {
    const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([data]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < px.length; i += 0x8000)
      s += String.fromCharCode(...px.subarray(i, i + 0x8000));
    return { width: bmp.width, height: bmp.height, b64: btoa(s) };
  }, bytes.toString('base64'));
  return { width: r.width, height: r.height, data: new Uint8Array(Buffer.from(r.b64, 'base64')) };
}

/** 按下載鈕（或快捷鍵），回傳檔名與內容 */
async function downloadVia(page: Page, act: () => Promise<void>) {
  const wait = page.waitForEvent('download');
  await act();
  const d: Download = await wait;
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}
const downloadCurrent = (page: Page) => downloadVia(page, () => btn(page, '下載這張').click());

function diffCount(a: PixelBuffer, b: PixelBuffer) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let n = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++;
  return n;
}

const settingsWith = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁沒有錯誤；沒有圖時的按鈕；頁尾只放靈感來源；說明', async ({ page }) => {
  const errors = await open(page);
  await expect(counter(page)).toHaveText('0／0');
  for (const name of ['上一張', '下一張', '下載這張', '全部下載', '回到基準位置'])
    await expect(btn(page, name)).toBeDisabled();
  await expect(page.getByText('載入立繪後，在這裡調整裁切框')).toBeVisible();
  await expect(frame(page)).toHaveCount(0);
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-fx', 'off');
  /* 沒有圖時也可以縮放歸位（按鈕與 R） */
  const sb = (await stage(page).boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '110');
  await btn(page, '縮放歸位').click();
  await expect(stage(page)).toHaveAttribute('data-zoom', '100');
  await page.mouse.wheel(0, -100);
  await blur(page);
  await page.keyboard.press('r');
  await expect(stage(page)).toHaveAttribute('data-zoom', '100');

  await expect(
    page.getByRole('link', { name: 'kimtaehee2018-maker/ccfolia-cropper' }),
  ).toHaveAttribute('href', 'https://github.com/kimtaehee2018-maker/ccfolia-cropper');
  await expect(page.getByText(/本工具與 CCFOLIA 官方無關/).first()).toBeVisible();
  const usage = page.getByRole('button', { name: '使用方式' });
  await expect(usage).toHaveAttribute('aria-expanded', 'false');
  await usage.click();
  await expect(page.getByText(/把去背的全身立繪裁成固定比例的上半身頭像/).first()).toBeVisible();
  /* 快捷鍵說明 */
  await blur(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: '快捷鍵' });
  for (const label of ['上一張', '下一張', '裁切範圍 −5%', '回到基準位置', '縮放歸位', '下載這張'])
    await expect(help.getByText(label, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('選檔載入：只收 PNG／WebP、載入取代清單、壞檔指出檔名並略過', async ({ page }) => {
  const errors = await open(page);
  const a = await figureA();
  const b = await figureB();
  const c = await figureC();
  /* 混著其他類型：靜默略過 */
  await load(
    page,
    [file('A.png', a), file('筆記.txt', Buffer.from('文字'), 'text/plain')],
    '已載入 1 張。',
  );
  await expect(counter(page)).toHaveText('1／1');
  await expect(page.getByTestId('file-name')).toHaveText('A.png');
  await expect(btn(page, '下載這張')).toBeEnabled();
  await expect(btn(page, '回到基準位置')).toBeEnabled();
  await expect(btn(page, '全部下載')).toBeDisabled();
  await expect(btn(page, '上一張')).toBeDisabled();
  await expect(btn(page, '下一張')).toBeDisabled();
  await expect(outputSize(page)).toHaveText('輸出 486 × 648 px');
  await expect(page.getByTestId('output-name')).toHaveText('A_crop.png');

  /* 全部不合格：錯誤訊息（role=alert），清單不變 */
  await load(
    page,
    [
      file('動圖.gif', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'image/gif'),
      file('照片.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'image/jpeg'),
    ],
    '只能載入 PNG 或 WebP 圖片，目前的清單沒有變動。',
  );
  await expect(page.getByRole('alert').filter({ hasText: '只能載入 PNG 或 WebP' })).toBeVisible();
  await expect(counter(page)).toHaveText('1／1');

  /* 再載入：取代整個清單（不是累加），顯示第一張 */
  await load(page, [file('B.png', b), file('C.png', c)], '已載入 2 張。');
  await expect(counter(page)).toHaveText('1／2');
  await expect(page.getByTestId('file-name')).toHaveText('B.png');
  await expect(btn(page, '全部下載')).toBeEnabled();
  await expect(btn(page, '上一張')).toBeDisabled();
  await expect(btn(page, '下一張')).toBeEnabled();

  /* 沒有副檔名、類型空白的 PNG：依檔頭收下 */
  await load(page, [file('沒有副檔名', c, '')], '已載入 1 張。');
  await expect(page.getByTestId('output-name')).toHaveText('沒有副檔名.png');

  /* WebP（依檔頭；主控核准） */
  const webp = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 90;
    cv.height = 120;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#28c850';
    ctx.fillRect(20, 10, 40, 100);
    const blob = await new Promise<Blob>((r) => cv.toBlob((x) => r(x!), 'image/webp', 1));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s);
  });
  await load(page, [file('D.webp', Buffer.from(webp, 'base64'), 'image/webp')], '已載入 1 張。');
  await expect(page.getByTestId('output-name')).toHaveText('D_crop.png');
  await expect(outputSize(page)).toHaveText('輸出 45 × 60 px');

  /* 壞檔：略過那個檔、其餘照常載入，訊息指出檔名；畫面與下載一致 */
  await load(
    page,
    [
      file('A.png', a),
      file('壞掉.png', Buffer.from('這不是 PNG 的內容'), 'image/png'),
      file('C.png', c),
    ],
    '已載入 2 張；無法讀取「壞掉.png」（檔案可能已損壞），已略過。',
  );
  await expect(counter(page)).toHaveText('1／2');
  await btn(page, '下一張').click();
  await expect(page.getByTestId('file-name')).toHaveText('C.png');
  const got = await downloadCurrent(page);
  expect(got.name).toBe('C_crop.png');
  /* C 全不透明 240 × 160：角色高度 160 → 72 × 96 */
  const px = pngPixels(got.bytes);
  expect([px.width, px.height]).toEqual([72, 96]);

  /* 全部讀不到：錯誤指出檔名，清單不變 */
  await load(
    page,
    [file('壞掉.png', Buffer.from('也不是'), 'image/png')],
    '無法讀取「壞掉.png」，檔案可能已損壞。目前的清單沒有變動。',
  );
  await expect(counter(page)).toHaveText('2／2');
  await expect(page.getByTestId('file-name')).toHaveText('C.png');
  expect(errors).toEqual([]);
});

test('拖放載入：拖曳經過時醒目、離開恢復、放開後取代清單', async ({ page }) => {
  const errors = await open(page);
  const b64 = (await figureC()).toString('base64');
  const dt = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    dt.items.add(new File([bytes], '拖進來的.png', { type: 'image/png' }));
    dt.items.add(new File([bytes], '第二張.png', { type: 'image/png' }));
    dt.items.add(new File(['x'], '說明.txt', { type: 'text/plain' }));
    return dt;
  }, b64);
  const zone = dropZone(page);
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(zone).toHaveAttribute('data-over', 'true');
  await zone.dispatchEvent('dragleave', { dataTransfer: dt });
  await expect(zone).not.toHaveAttribute('data-over');
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect(zone).not.toHaveAttribute('data-over');
  await expect(status(page)).toHaveText('已載入 2 張。');
  await expect(counter(page)).toHaveText('1／2');
  await expect(page.getByTestId('file-name')).toHaveText('拖進來的.png');
  /* 再放一次：取代，不累加 */
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect(counter(page)).toHaveText('1／2');
  expect(errors).toEqual([]);
});

test('貼上：剪貼簿的第一張圖（JPEG 也收），檔名用本地時間；焦點在表單控制項時不作用', async ({
  page,
}) => {
  const errors = await open(page);
  await load(
    page,
    [file('A.png', await figureA()), file('C.png', await figureC())],
    '已載入 2 張。',
  );
  const paste = (target: 'document' | 'active') =>
    page.evaluate(async (target) => {
      const cv = document.createElement('canvas');
      cv.width = 120;
      cv.height = 200;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 120, 200);
      ctx.fillStyle = '#c03030';
      ctx.fillRect(30, 20, 60, 160);
      const jpeg = await new Promise<Blob>((r) => cv.toBlob((x) => r(x!), 'image/jpeg', 0.9));
      const dt = new DataTransfer();
      dt.items.add('純文字', 'text/plain');
      dt.items.add(new File([jpeg], 'image.jpg', { type: 'image/jpeg' }));
      const el = target === 'document' ? document : (document.activeElement ?? document);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
    }, target);

  /* 焦點在滑桿上：不作用 */
  await page.getByRole('slider', { name: '裁切範圍' }).focus();
  await paste('active');
  await page.waitForTimeout(300);
  await expect(counter(page)).toHaveText('1／2');

  await page.getByRole('slider', { name: '裁切範圍' }).blur();
  const hour = await paste('document');
  await expect(status(page)).toHaveText(/^已貼上圖片（clipboard_\d{14}\.png）。$/);
  await expect(counter(page)).toHaveText('1／1');
  const name = (await page.getByTestId('file-name').textContent()) ?? '';
  /* 本地時間（測試環境為 Asia/Taipei）到小時 */
  expect(name.startsWith(`clipboard_${hour}`), name).toBe(true);
  await expect(page.getByTestId('output-name')).toHaveText(name.replace(/\.png$/, '_crop.png'));
  /* JPEG 背景不透明：整張都是角色（200 高 × 60%） */
  await expect(outputSize(page)).toHaveText('輸出 90 × 120 px');
  expect(errors).toEqual([]);
});

test('比例、範圍、五種基準：下載的 PNG 與參考做法逐像素相同（含半透明、框比圖寬）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const a = await figureA();
  await load(page, [file('立繪 01.png', a)], '已載入 1 張。');
  const ref = await pixelsOf(page, a);
  const fig = figureFromPixels(ref);

  const cases: [Aspect, number, Anchor, string, [number, number, number, number]][] = [
    ['3:4', 60, 'head', '頭部', [486, 648, 57, 70]],
    ['3:4', 35, 'figure', '角色範圍中心', [284, 378, 108, 421]],
    ['1:1', 10, 'image', '整張圖中心', [108, 108, 296, 546]],
    ['3:4', 100, 'upper', '上半身', [810, 1080, 0, 70]],
    ['1:1', 35, 'manual', '手動', [378, 378, 111, 70]],
  ];
  for (const [aspect, range, anchor, label, want] of cases) {
    await setAspect(page, aspect);
    await setRange(page, range);
    await chooseAnchor(page, label);
    await expect(outputSize(page)).toHaveText(`輸出 ${want[0]} × ${want[1]} px`);
    await expect(frame(page)).toHaveAttribute('aria-valuenow', String(want[2]));
    const got = await downloadCurrent(page);
    expect(got.name).toBe('立繪 01_crop.png');
    const g = cropGeometry(fig, { aspect, range, anchor, offset: 0 });
    expect([g.width, g.height, g.x, g.y]).toEqual(want);
    const out = pngPixels(got.bytes);
    expect(diffCount(out, cropPixels(ref, g)), `${aspect} ${range}% ${label}`).toBe(0);
  }
  /* 框比圖寬：右側 110 px 透明 */
  await setAspect(page, '3:4');
  await setRange(page, 100);
  const wide = pngPixels((await downloadCurrent(page)).bytes);
  expect([wide.width, wide.height]).toEqual([810, 1080]);
  const alpha = (x: number, y: number) => wide.data[(y * wide.width + x) * 4 + 3];
  expect(alpha(699, 1000)).toBe(0);
  expect(alpha(300, 1000)).toBe(255);
  expect(alpha(805, 500)).toBe(0);
  expect(errors).toEqual([]);
});

test('裁切框：只能左右拖曳、夾在圖內；回到基準位置；[ ／ ] 快捷鍵；改範圍保留位移', async ({
  page,
}) => {
  const errors = await open(page);
  const a = await figureA();
  await load(page, [file('A.png', a)], '已載入 1 張。');
  const ref = await pixelsOf(page, a);
  const fig = figureFromPixels(ref);
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '57');
  /* 游標是左右箭頭 */
  expect(await frame(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('ew-resize');

  /* 往右下拖：只有水平移動 */
  const fb = (await frame(page).boundingBox())!;
  const cb = (await page.getByTestId('preview-canvas').boundingBox())!;
  const scale = cb.width / 700;
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width / 2 + 60 * scale, fb.y + fb.height / 2 + 80, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await frameX(page)) - 117)).toBeLessThanOrEqual(1);
  const x1 = await frameX(page);
  const fb1 = (await frame(page).boundingBox())!;
  expect(Math.abs(fb1.y - fb.y)).toBeLessThan(0.5);
  /* 下載的內容在拖過的位置 */
  const out = pngPixels((await downloadCurrent(page)).bytes);
  expect(diffCount(out, cropPixels(ref, { x: x1, y: 70, width: 486, height: 648 }))).toBe(0);

  /* 改範圍：位移保留（以原圖 px 計） */
  await setRange(page, 35);
  const g35 = cropGeometry(fig, { aspect: '3:4', range: 35, anchor: 'head', offset: x1 - 56.5 });
  expect(Math.abs((await frameX(page)) - g35.x)).toBeLessThanOrEqual(1);
  await setRange(page, 60);
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(x1));

  /* 拖到左邊外面：夾在 0 */
  const fb2 = (await frame(page).boundingBox())!;
  await page.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb2.x - 2000, fb2.y + fb2.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '0');
  /* 按下不動：不會跳 */
  const fb3 = (await frame(page).boundingBox())!;
  await page.mouse.move(fb3.x + fb3.width / 2, fb3.y + fb3.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '0');

  /* 回到基準位置（按鈕、C） */
  await btn(page, '回到基準位置').click();
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '57');
  await frame(page).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '67');
  await blur(page);
  await page.keyboard.press('c');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '57');

  /* [ ／ ]：±5%，夾在 10～100；帶 Ctrl 時不作用 */
  const slider = page.getByRole('slider', { name: '裁切範圍' });
  await page.keyboard.press(']');
  await expect(slider).toHaveAttribute('aria-valuenow', '65');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(slider).toHaveAttribute('aria-valuenow', '55');
  await page.keyboard.press('Control+]');
  await expect(slider).toHaveAttribute('aria-valuenow', '55');
  for (let i = 0; i < 12; i++) await page.keyboard.press(']');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  for (let i = 0; i < 20; i++) await page.keyboard.press('[');
  await expect(slider).toHaveAttribute('aria-valuenow', '10');
  await expect(outputSize(page)).toHaveText('輸出 81 × 108 px');

  /* 切換比例：目前這張的位移歸零 */
  await setRange(page, 60);
  await frame(page).focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '47');
  await setAspect(page, '1:1');
  await setAspect(page, '3:4');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '57');
  expect(errors).toEqual([]);
});

test('每張各自記住基準與位移；A／D 換張（帶 Ctrl／Alt 不作用）；縮放、平移與歸位', async ({
  page,
}) => {
  const errors = await open(page);
  await load(
    page,
    [
      file('A.png', await figureA()),
      file('B.png', await figureB()),
      file('C.png', await figureC()),
    ],
    '已載入 3 張。',
  );
  /* 第 1 張：角色範圍中心＋拖過 */
  await chooseAnchor(page, '角色範圍中心');
  await frame(page).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '17');

  /* 縮放與平移 */
  const sb = (await stage(page).boundingBox())!;
  await page.mouse.move(sb.x + 30, sb.y + 80);
  await page.mouse.wheel(0, -100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '110');
  await page.mouse.wheel(0, -100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '121');
  await page.mouse.wheel(0, 100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '109');
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '500');
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
  await expect(stage(page)).toHaveAttribute('data-zoom', '20');
  /* 頁面沒有因為滾輪而捲動 */
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  /* D：下一張，縮放回到 100% */
  await blur(page);
  await page.keyboard.press('d');
  await expect(counter(page)).toHaveText('2／3');
  await expect(stage(page)).toHaveAttribute('data-zoom', '100');
  await expect(anchorSelect(page)).toContainText('頭部');
  /* B：頭部中心 159.5（手臂不在上方 35%）；上半身看到手臂 */
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(Math.round(159.5 - 297 / 2)));
  await chooseAnchor(page, '上半身');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(Math.round(260 - 297 / 2)));

  /* 帶修飾鍵不作用 */
  await blur(page);
  await page.keyboard.press('Alt+d');
  await page.keyboard.press('Control+a');
  await expect(counter(page)).toHaveText('2／3');
  /* Ctrl＋A 選取了整頁文字：清掉，免得之後的拖曳變成拖曳選取的文字 */
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Shift+D');
  await expect(counter(page)).toHaveText('3／3');
  await page.keyboard.press('d');
  await expect(counter(page)).toHaveText('3／3');
  await expect(btn(page, '下一張')).toBeDisabled();

  /* 回到第 1 張：基準與位移都還在 */
  await page.keyboard.press('a');
  await page.keyboard.press('A');
  await expect(counter(page)).toHaveText('1／3');
  await expect(btn(page, '上一張')).toBeDisabled();
  await expect(anchorSelect(page)).toContainText('角色範圍中心');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '17');
  await page.keyboard.press('a');
  await expect(counter(page)).toHaveText('1／3');

  /* 拖曳平移：在框外按住拖曳；R 歸位 */
  const content = stage(page).locator(':scope > div').first();
  /* 換張後新圖解碼完才換成它的大小（負載高時要等將近 1 秒）：等位置穩定再量 */
  let settled = '';
  await expect
    .poll(
      async () => {
        const k = JSON.stringify(await content.boundingBox());
        const same = k === settled;
        settled = k;
        return same;
      },
      { intervals: [300] },
    )
    .toBe(true);
  const c0 = (await content.boundingBox())!;
  const sb2 = (await stage(page).boundingBox())!;
  await page.mouse.move(sb2.x + 12, sb2.y + 12);
  await page.mouse.down();
  await page.mouse.move(sb2.x + 62, sb2.y + 42, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await content.boundingBox())!.x - c0.x)).toBe(50);
  const c1 = (await content.boundingBox())!;
  expect(Math.round(c1.y - c0.y)).toBe(30);
  await page.keyboard.press('r');
  await expect.poll(async () => Math.round((await content.boundingBox())!.x - c0.x)).toBe(0);

  /* 視窗大小改變：裁切框跟著圖片重新對齊 */
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect
    .poll(async () => {
      const cb = (await page.getByTestId('preview-canvas').boundingBox())!;
      const fb = (await frame(page).boundingBox())!;
      return Math.round(((fb.x - cb.x) / cb.width) * 700);
    })
    .toBe(17);
  expect(errors).toEqual([]);
});

test('全部套用同一基準：勾選時改基準套用到所有圖片；批次下載依各自的基準', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const srcs = [await figureA(), await figureB(), await figureC()];
  await load(
    page,
    [file('A.png', srcs[0]), file('B.png', srcs[1]), file('C.png', srcs[2])],
    '已載入 3 張。',
  );
  const refs = await Promise.all(srcs.map((b) => pixelsOf(page, b)));
  const figs = refs.map(figureFromPixels);
  await expect(applyAll(page)).not.toBeChecked();

  /* 不勾：只改目前這張 */
  await chooseAnchor(page, '角色範圍中心');
  await btn(page, '下一張').click();
  await expect(anchorSelect(page)).toContainText('頭部');
  await frame(page).focus();
  await page.keyboard.press('Shift+ArrowLeft');

  /* 勾選的當下：所有圖片統一成選單上的基準（第 2 張的「頭部」） */
  await applyAll(page).click();
  await expect(applyAll(page)).toBeChecked();
  await btn(page, '上一張').click();
  await expect(anchorSelect(page)).toContainText('頭部');
  /* 勾選期間改基準：套用到所有圖片 */
  await chooseAnchor(page, '整張圖中心');
  await btn(page, '下一張').click();
  await expect(anchorSelect(page)).toContainText('整張圖中心');
  await btn(page, '下一張').click();
  await expect(anchorSelect(page)).toContainText('整張圖中心');

  /* 取消勾選：只改目前這張（第 3 張） */
  await applyAll(page).click();
  await chooseAnchor(page, '上半身');
  await btn(page, '上一張').click();
  await expect(anchorSelect(page)).toContainText('整張圖中心');

  /* 批次下載：每張各自的基準 */
  const downloads: Download[] = [];
  const onDownload = (d: Download) => downloads.push(d);
  page.on('download', onDownload);
  await btn(page, '全部下載').click();
  await expect(status(page)).toHaveText('下載完成：共 3 張。', { timeout: 20_000 });
  await expect.poll(() => downloads.length).toBe(3);
  page.off('download', onDownload);
  const anchors: Anchor[] = ['image', 'image', 'upper'];
  for (let i = 0; i < 3; i++) {
    const out = pngPixels(readFileSync((await downloads[i].path())!));
    const g = cropGeometry(figs[i], { aspect: '3:4', range: 60, anchor: anchors[i], offset: 0 });
    expect(diffCount(out, cropPixels(refs[i], g)), `第 ${i + 1} 張`).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('效果：預覽與下載相同；角色像素不變；各樣式的參數', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const a = await figureA();
  await load(page, [file('A.png', a)], '已載入 1 張。');
  const ref = await pixelsOf(page, a);
  const fig = figureFromPixels(ref);
  const g = cropGeometry(fig, { aspect: '3:4', range: 60, anchor: 'head', offset: 0 });
  const plain = cropPixels(ref, g);
  const canvas = page.getByTestId('preview-canvas');

  const visible = async (labels: string[], hidden: string[]) => {
    for (const l of labels) await expect(page.getByRole('slider', { name: l })).toBeVisible();
    for (const l of hidden) await expect(page.getByRole('slider', { name: l })).toHaveCount(0);
  };
  await visible(['粗細', '不透明度'], ['模糊', '位移']);

  const toggle = page.getByRole('switch', { name: '套用效果' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(canvas).toHaveAttribute('data-fx', 'ready');
  /* 效果在 Worker 裡算（拖曳時畫面不卡） */
  expect(page.workers().length).toBeGreaterThan(0);

  const check = async (patch: Partial<Settings>) => {
    await expect(canvas).toHaveAttribute('data-fx', 'ready');
    const got = pngPixels((await downloadCurrent(page)).bytes);
    const p = effectParams(settingsWith({ effectOn: true, ...patch }))!;
    const want = applyEffects(plain, p);
    expect(diffCount(got, want), JSON.stringify(patch)).toBe(0);
    /* 角色像素（含半透明的邊）原封不動 */
    let changed = 0;
    for (let i = 0; i < got.data.length; i += 4)
      if (plain.data[i + 3] > 0)
        for (let k = 0; k < 4; k++) if (got.data[i + k] !== plain.data[i + k]) changed++;
    expect(changed).toBe(0);
    /* 預覽上裁切框裡的像素就是下載的結果（畫布以預乘儲存，半透明處容許小誤差） */
    const shownB64 = await canvas.evaluate((el, r) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(r.x, r.y, r.width, r.height).data;
      let str = '';
      for (let i = 0; i < d.length; i += 0x8000)
        str += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return btoa(str);
    }, g);
    const shown = new Uint8Array(Buffer.from(shownB64, 'base64'));
    let worst = 0;
    for (let i = 0; i < shown.length; i += 4) {
      worst = Math.max(worst, Math.abs(shown[i + 3] - got.data[i + 3]));
      if (got.data[i + 3] >= 64)
        for (let k = 0; k < 3; k++)
          worst = Math.max(worst, Math.abs(shown[i + k] - got.data[i + k]));
    }
    expect(worst, '預覽與下載的差').toBeLessThanOrEqual(3);
    return got;
  };

  const stroke = await check({});
  /* 白色實線：頭的右邊（輪廓外 1～5 px）有線，頭頂上方沒有空間 */
  const at = (b: PixelBuffer, x: number, y: number) =>
    Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
  /* 第 149 列：頭到 x＝379，線在 380～384 */
  expect(at(stroke, 380 - g.x, 149 - g.y)).toEqual([255, 255, 255, 255]);
  expect(at(stroke, 384 - g.x, 149 - g.y)).toEqual([255, 255, 255, 255]);
  expect(at(stroke, 386 - g.x, 149 - g.y)[3]).toBe(0);
  /* 頭的右上角那段半透明的邊原封不動 */
  expect(at(plain, 357 - g.x, 92 - g.y)[3]).toBe(96);
  expect(at(stroke, 357 - g.x, 92 - g.y)).toEqual(at(plain, 357 - g.x, 92 - g.y));

  /* 顏色、粗細、不透明度 */
  const color = page.getByRole('textbox', { name: '顏色' });
  await color.fill('#ff3366');
  await color.press('Enter');
  const width = page.getByRole('spinbutton', { name: '粗細' });
  await width.fill('10');
  await width.press('Enter');
  const opacity = page.getByRole('spinbutton', { name: '不透明度' });
  await opacity.fill('50');
  await opacity.press('Enter');
  await check({ effectColor: '#ff3366', effectWidth: 10, effectOpacity: 50 });

  /* 光暈：多了模糊 */
  await page.getByRole('radio', { name: '柔和光暈' }).click();
  await visible(['粗細', '模糊', '不透明度'], ['位移']);
  await check({
    effectStyle: 'glow-soft',
    effectColor: '#ff3366',
    effectWidth: 10,
    effectOpacity: 50,
  });
  await page.getByRole('radio', { name: '強烈光暈' }).click();
  const blur = page.getByRole('spinbutton', { name: '模糊' });
  await blur.fill('20');
  await blur.press('Enter');
  await check({
    effectStyle: 'glow-strong',
    effectColor: '#ff3366',
    effectWidth: 10,
    effectOpacity: 50,
    effectBlur: 20,
  });
  /* 陰影：再多了位移 */
  await page.getByRole('radio', { name: '陰影' }).click();
  await visible(['粗細', '模糊', '位移', '不透明度'], []);
  const offset = page.getByRole('spinbutton', { name: '位移' });
  await offset.fill('15');
  await offset.press('Enter');
  await check({
    effectStyle: 'shadow',
    effectColor: '#ff3366',
    effectWidth: 10,
    effectOpacity: 50,
    effectBlur: 20,
    effectOffset: 15,
  });

  /* 拖曳裁切框後：效果跟著新的範圍重算，預覽與下載仍然相同 */
  await frame(page).focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '37');
  await expect(canvas).toHaveAttribute('data-fx', 'ready');
  const moved = pngPixels((await downloadCurrent(page)).bytes);
  const p = effectParams(
    settingsWith({
      effectOn: true,
      effectStyle: 'shadow',
      effectColor: '#ff3366',
      effectWidth: 10,
      effectOpacity: 50,
      effectBlur: 20,
      effectOffset: 15,
    }),
  )!;
  expect(diffCount(moved, applyEffects(cropPixels(ref, { ...g, x: 37 }), p))).toBe(0);

  /* 關掉效果：下載回到原圖像素 */
  await toggle.click();
  await expect(canvas).toHaveAttribute('data-fx', 'off');
  const off = pngPixels((await downloadCurrent(page)).bytes);
  expect(diffCount(off, cropPixels(ref, { ...g, x: 37 }))).toBe(0);
  expect(errors).toEqual([]);
});

test('批次下載：檔名、順序、間隔約 0.2 秒、按鈕狀態與完成訊息；Ctrl＋S 下載目前這張', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const a = await figureA();
  await load(
    page,
    [file('立繪 01.png', a), file('Alice.PNG', a), file('a.b.png', a), file('x.png.png', a)],
    '已載入 4 張。',
  );
  await page.evaluate(() => {
    (window as unknown as { __downloads: unknown[] }).__downloads.length = 0;
  });
  const downloads: Download[] = [];
  const onDownload = (d: Download) => downloads.push(d);
  page.on('download', onDownload);
  /* 開效果讓每張多花一點時間，確認下載期間的按鈕狀態 */
  await page.getByRole('switch', { name: '套用效果' }).click();
  await btn(page, '全部下載').click();
  await expect(page.getByRole('button', { name: '處理中…' })).toBeDisabled();
  await expect(btn(page, '下載這張')).toBeDisabled();
  await expect(status(page)).toHaveText('下載完成：共 4 張。', { timeout: 20_000 });
  await expect(btn(page, '全部下載')).toBeEnabled();
  await expect(btn(page, '下載這張')).toBeEnabled();
  await expect.poll(() => downloads.length).toBe(4);
  page.off('download', onDownload);
  const log = await page.evaluate(
    () => (window as unknown as { __downloads: { name: string; t: number }[] }).__downloads,
  );
  expect(log.map((x) => x.name)).toEqual([
    '立繪 01_crop.png',
    'Alice_crop.png',
    'a.b_crop.png',
    'x.png_crop.png',
  ]);
  for (let i = 1; i < log.length; i++) {
    const gap = log[i].t - log[i - 1].t;
    expect(gap, `第 ${i} 與第 ${i + 1} 張的間隔`).toBeGreaterThanOrEqual(180);
    expect(gap, `第 ${i} 與第 ${i + 1} 張的間隔`).toBeLessThanOrEqual(600);
  }
  expect(downloads.map((d) => d.suggestedFilename())).toEqual(log.map((x) => x.name));

  /* Ctrl＋S：下載目前這張（第 2 張） */
  await btn(page, '下一張').click();
  await blur(page);
  const got = await downloadVia(page, () => page.keyboard.press('Control+s'));
  expect(got.name).toBe('Alice_crop.png');
  await expect(status(page)).toHaveText('已下載「Alice_crop.png」。');
  expect(errors).toEqual([]);
});

test('快捷鍵的焦點例外：表單控制項上不作用（含 Ctrl＋S），一般按鈕上照常', async ({ page }) => {
  const errors = await open(page);
  const c = await figureC();
  await load(page, [file('1.png', c), file('2.png', c), file('3.png', c)], '已載入 3 張。');
  let downloaded = 0;
  page.on('download', () => downloaded++);

  /* 一般按鈕上：作用 */
  await btn(page, '回到基準位置').focus();
  await page.keyboard.press('d');
  await expect(counter(page)).toHaveText('2／3');

  const tries: [string, Locator][] = [
    ['滑桿', page.getByRole('slider', { name: '裁切範圍' })],
    ['數字欄', page.getByRole('spinbutton', { name: '裁切範圍' })],
    ['下拉選單', anchorSelect(page)],
    ['勾選框', applyAll(page)],
    ['開關', page.getByRole('switch', { name: '套用效果' })],
    ['色碼欄', page.getByRole('textbox', { name: '顏色' })],
  ];
  for (const [what, el] of tries) {
    await el.focus();
    await page.keyboard.press('d');
    await page.keyboard.press('c');
    await page.keyboard.press('Control+s');
    await expect(counter(page), what).toHaveText('2／3');
  }
  await page.waitForTimeout(300);
  expect(downloaded).toBe(0);
  expect(errors).toEqual([]);
});

test('拖曳或點過裁切框後（焦點留在框上）：D、C、Ctrl＋S、Esc 與貼上照常，方向鍵仍歸框（F39 追加裁定）', async ({
  page,
}) => {
  const errors = await open(page);
  const a = await figureA();
  await load(page, [file('A.png', a), file('B.png', await figureB())], '已載入 2 張。');
  const ref = await pixelsOf(page, a);
  const drag = async (dx: number) => {
    const fb = (await frame(page).boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(fb.x + fb.width / 2 + dx, fb.y + fb.height / 2, { steps: 3 });
    await page.mouse.up();
  };
  const frameFocused = () =>
    page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'crop-frame');

  /* 拖曳後按 C：回到基準位置 */
  await drag(40);
  await expect.poll(() => frameX(page)).toBeGreaterThan(57);
  expect(await frameFocused()).toBe(true);
  await page.keyboard.press('c');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', '57');

  /* 拖曳後按 Ctrl＋S：下載目前這張（拖過的位置），擋掉瀏覽器的另存網頁 */
  await drag(40);
  await expect.poll(() => frameX(page)).toBeGreaterThan(57);
  const x = await frameX(page);
  expect(await frameFocused()).toBe(true);
  const got = await downloadVia(page, () => page.keyboard.press('Control+s'));
  expect(got.name).toBe('A_crop.png');
  expect(
    diffCount(pngPixels(got.bytes), cropPixels(ref, { x, y: 70, width: 486, height: 648 })),
  ).toBe(0);

  /* 方向鍵仍歸框（移動 1 px），焦點還在框上 */
  await page.keyboard.press('ArrowLeft');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(x - 1));
  expect(await frameFocused()).toBe(true);

  /* 拖曳後按 D：下一張；A：回到上一張（位移各自記住） */
  await page.keyboard.press('d');
  await expect(counter(page)).toHaveText('2／2');
  await drag(-30);
  await page.keyboard.press('a');
  await expect(counter(page)).toHaveText('1／2');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(x - 1));

  /* 只點一下框、再按 Esc：D 仍然有效 */
  const fb = (await frame(page).boundingBox())!;
  await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
  expect(await frameFocused()).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await expect(counter(page)).toHaveText('2／2');

  /* 焦點在框上時貼上圖片：照常載入 */
  await frame(page).focus();
  await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 40;
    cv.height = 80;
    cv.getContext('2d')!.fillRect(10, 10, 20, 60);
    const png = await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([png], 'image.png', { type: 'image/png' }));
    document.activeElement?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }),
    );
  });
  await expect(status(page)).toHaveText(/^已貼上圖片/);
  await expect(counter(page)).toHaveText('1／1');
  expect(errors).toEqual([]);
});

test('光暈的強度：σ ＝ 模糊值，強烈與柔和的總量都在舊版下載的 ±20% 內，柔和比強烈淡（追加裁定）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 規格第 6 節的量測圖：600 × 600、200 × 200 紅色正方形＋1 px 透明度 128 的邊；上下各一個點讓角色高度＝整張圖 */
  const square = await pngOf(600, 600, (set) => {
    for (let y = 199; y <= 400; y++)
      for (let x = 199; x <= 400; x++) {
        const edge = x === 199 || x === 400 || y === 199 || y === 400;
        set(x, y, [255, 0, 0], edge ? 128 : 255);
      }
    set(300, 0, [255, 0, 0]);
    set(300, 599, [255, 0, 0]);
  });
  await load(page, [file('square.png', square)], '已載入 1 張。');
  await setAspect(page, '1:1');
  await setRange(page, 100);
  await expect(outputSize(page)).toHaveText('輸出 600 × 600 px');
  await page.getByRole('switch', { name: '套用效果' }).click();
  const canvas = page.getByTestId('preview-canvas');
  const measure = async (style: string) => {
    await page.getByRole('radio', { name: style }).click();
    await expect(canvas).toHaveAttribute('data-fx', 'ready');
    const out = pngPixels((await downloadCurrent(page)).bytes);
    /* 第 300 列從輪廓（x＝400）往右：p[d − 1] */
    const p = Array.from({ length: 199 }, (_, i) => out.data[(300 * 600 + 401 + i) * 4 + 3]);
    const line = p.findIndex((v) => v < 255);
    return { p, line, total: p.slice(line).reduce((t, v) => t + v, 0) };
  };
  const strong = await measure('強烈光暈');
  const soft = await measure('柔和光暈');
  expect([strong.line, soft.line]).toEqual([5, 3]);
  for (const [name, t] of [
    ['強烈', strong.total],
    ['柔和', soft.total],
  ] as const)
    expect(Math.abs(t - 1050) / 1050, `${name}光暈總量 ${t}（舊版 1050）`).toBeLessThanOrEqual(0.2);
  expect(soft.total).toBeLessThan(strong.total);
  for (let d = 4; d <= 60; d++) expect(soft.p[d - 1]).toBeLessThanOrEqual(strong.p[d - 1]);
  /* σ ＝ 模糊值：模糊 12 時強烈光暈約到 d 34 結束（舊版下載），不是一半的長度 */
  const end = strong.p.findLastIndex((v) => v > 0) + 1;
  expect(end).toBeGreaterThanOrEqual(30);
  expect(end).toBeLessThanOrEqual(40);
  expect(errors).toEqual([]);
});

test('預覽區的大小：1440 × 900 與 1280 × 900 時顯示比例不小於 0.6，整個預覽在畫面內（追加裁定）', async ({
  page,
}) => {
  const errors = await open(page);
  await load(page, [file('A.png', await figureA())], '已載入 1 張。');
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(
        async () => ((await page.getByTestId('preview-canvas').boundingBox())?.height ?? 0) / 1200,
      )
      .toBeGreaterThanOrEqual(0.6);
    const sb = (await stage(page).boundingBox())!;
    expect(sb.y + sb.height, `${width}：預覽的下緣在畫面內`).toBeLessThanOrEqual(900);
    /* 載入、下載的按鈕也在畫面內（右側一欄） */
    for (const name of ['選擇圖片', '下載這張', '全部下載'])
      expect(
        ((await page.getByText(name, { exact: true }).boundingBox())?.y ?? 9999) < 900,
        `${width}：${name}`,
      ).toBe(true);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test('記住設定：比例、範圍、基準與效果；圖片與全部套用不記住', async ({ page }) => {
  const errors = await open(page);
  await load(page, [file('A.png', await figureA())], '已載入 1 張。');
  await setAspect(page, '1:1');
  await setRange(page, 45);
  await chooseAnchor(page, '角色範圍中心');
  await applyAll(page).click();
  await page.getByRole('switch', { name: '套用效果' }).click();
  await page.getByRole('radio', { name: '陰影' }).click();
  const color = page.getByRole('textbox', { name: '顏色' });
  await color.fill('#112233');
  await color.press('Enter');
  const offset = page.getByRole('spinbutton', { name: '位移' });
  await offset.fill('20');
  await offset.press('Enter');
  /* 自動存檔 */
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('trpg-toolkit:ccfolia-cropper') ?? ''))
    .toContain('"effectOffset":20');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪裁切器' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '1:1 正方' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('slider', { name: '裁切範圍' })).toHaveAttribute(
    'aria-valuenow',
    '45',
  );
  await expect(anchorSelect(page)).toContainText('角色範圍中心');
  await expect(applyAll(page)).not.toBeChecked();
  await expect(page.getByRole('switch', { name: '套用效果' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: '陰影' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('textbox', { name: '顏色' })).toHaveValue('#112233');
  await expect(page.getByRole('slider', { name: '位移' })).toHaveAttribute('aria-valuenow', '20');
  await expect(counter(page)).toHaveText('0／0');

  /* 新載入的圖以選單上的基準（記住的「角色範圍中心」）為自己的基準 */
  await load(page, [file('A.png', await figureA())], '已載入 1 張。');
  await expect(anchorSelect(page)).toContainText('角色範圍中心');
  await expect(frame(page)).toHaveAttribute('aria-valuenow', String(Math.round(249.5 - 243)));
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  async function loadTwo(page: Page) {
    await load(
      page,
      [file('A.png', await figureA()), file('B.png', await figureB())],
      '已載入 2 張。',
    );
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await loadTwo(page);
    await expect(page).toHaveScreenshot('ccfolia-cropper-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadTwo(page);
    await page.getByRole('switch', { name: '套用效果' }).click();
    await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-fx', 'ready');
    await page.getByRole('radio', { name: '陰影' }).click();
    await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-fx', 'ready');
    await expect(page).toHaveScreenshot('ccfolia-cropper-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
