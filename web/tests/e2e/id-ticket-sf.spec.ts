/**
 * 證件與票券產生器的 SF 證件與 2026-10-30 的追加（規格 1.11～1.16、D23～D40；參考 CyberDelaai/sinforge-ui）：
 * - SF 證件：5 款、欄位共用、點預覽上的字／條碼／執照格／DNA 條、執照（切換、改名稱、自訂圖示＋裁切）、
 *   配色與裝飾、照片＋照片效果、浮水印、裝飾圖（放入後依序裁切、拖曳、縮放、上下層、刪除）、匯出 1 倍／2 倍；
 * - 掛繩（證件與 SF 證件）：只在預覽（預設，匯出和「不要」逐位元組相同）、掛繩孔（透明的洞；印刷是白的）、掛繩孔＋掛繩（往上延伸）；
 * - 既有證件的照片效果；自動儲存與專案檔（資料版本 2，版本 1 照讀）；390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { waitForFileChooser } from '../helpers/fileChooser';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('id-ticket') ?? { id: 'id-ticket', status: 'next' })}/`;
const PREFS_KEY = 'trpg-toolkit:id-ticket:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface SfDoc {
  kind: string;
  sf: {
    blank: string;
    values: Record<string, string>;
    captions: Record<string, string>;
    style: Record<string, unknown> & { photoFx: { fx: string } };
    photo: { image: { id: string } } | null;
    watermark: Record<string, unknown>;
    elements: Record<
      string,
      { id: string; x: number; y: number; size: number; crop: { w: number } }[]
    >;
    licenses: string[];
    licenseCaps: Record<string, string>;
    licenseIcons: Record<string, { image: { id: string } }>;
  };
  idPhotoFx: { fx: string };
}

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
  await expect(page.getByRole('heading', { level: 1, name: '證件與票券產生器' })).toBeVisible();
  return errors;
}

const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });
const tab = (page: Page, name: '內容' | '樣式') => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const fieldInput = (page: Page, key: string) => page.locator(`[data-field="${key}"]`);
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const sfCanvas = (page: Page) => page.getByTestId('sf-canvas');
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __idTicket: { doc: () => SfDoc } }).__idTicket.doc());

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

async function sfOpen(page: Page, blank = '公民 ID') {
  await radio(page, 'SF 證件').click();
  await radio(page.getByTestId('template-list'), blank).click();
  await expect(sfCanvas(page)).toBeVisible();
}

async function chooseLanyard(page: Page, label: string) {
  await page.getByTestId('lanyard').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** 四色照片（左上紅、右上藍、左下綠、右下黃） */
async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c: Rgba =
        x < w / 2
          ? y < h / 2
            ? [200, 40, 40, 255]
            : [40, 160, 60, 255]
          : y < h / 2
            ? [40, 80, 200, 255]
            : [230, 200, 40, 255];
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

/** 白底上的紅色圓環（裝飾圖） */
async function ringPng(size = 200): Promise<Buffer> {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2, y - size / 2);
      px.set(
        d < size * 0.35 && d > size * 0.2 ? [220, 30, 30, 255] : [255, 255, 255, 255],
        (y * size + x) * 4,
      );
    }
  return Buffer.from(await encodePng(px, size, size));
}

const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

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
  const bpp = ihdr.colorType === 6 ? 4 : 3;
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x: number, y: number): Rgba => {
      const k = (y * ihdr.width + x) * bpp;
      return [px[k], px[k + 1], px[k + 2], bpp === 4 ? px[k + 3] : 255];
    },
  };
}

async function download(page: Page, link: Locator) {
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

/** 匯出 PNG 並下載（同一個結果卡被換掉之前先等它消失） */
async function exportPng(page: Page) {
  const panel = exportPanel(page);
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const out = await download(page, result.getByRole('link', { name: '下載' }));
  await result
    .getByRole('button', { name: /關閉|移除|清除/ })
    .first()
    .click()
    .catch(() => undefined);
  return out;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const isInk = (c: Rgba) => c[0] < 20 && c[1] < 20 && c[2] < 20 && c[3] === 255;
const isWhite = (c: Rgba) => c[0] > 240 && c[1] > 240 && c[2] > 240 && c[3] === 255;

/* ---------- SF 證件：範本、欄位、點預覽 ---------- */

test('SF 證件：5 款；欄位在各款共用；切換類別內容留著；點預覽上的字、條碼、執照格、DNA 條（F65～F70）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, 'SF 證件').click();
  const list = page.getByTestId('template-list');
  await expect(list).toHaveAttribute('data-kind', 'sf');
  await expect(list.getByRole('radio')).toHaveCount(5);
  await expect(radio(list, '公民 ID')).toHaveAttribute('aria-checked', 'true');
  /* 預覽 0.75 倍：1600 × 1010 → 1200 × 758 */
  await expect
    .poll(() =>
      sfCanvas(page).evaluate((c) => [
        (c as HTMLCanvasElement).width,
        (c as HTMLCanvasElement).height,
      ]),
    )
    .toEqual([1200, 758]);
  await expect(fieldInput(page, 'surname')).toHaveValue('LIN');
  await fieldInput(page, 'given').fill('KAI');
  await fieldInput(page, 'given').blur();
  await radio(list, '通行證').click();
  await expect(sfCanvas(page)).toHaveAttribute('data-template', 'pass');
  await expect(fieldInput(page, 'given')).toHaveValue('KAI');
  /* 換到證件再回來：SF 的內容留著 */
  await radio(page, '證件').click();
  await expect(page.getByTestId('card-front')).toBeVisible();
  await radio(page, 'SF 證件').click();
  await expect(fieldInput(page, 'given')).toHaveValue('KAI');
  expect((await doc(page)).sf.blank).toBe('pass');
  /* 公民 ID：點預覽上的「姓」跳到欄位 */
  await radio(list, '公民 ID').click();
  await page.locator('[data-region="field:surname"]').first().click();
  await expect(fieldInput(page, 'surname')).toBeFocused();
  /* 點條碼：重新產生身分編號（5 種格式之一） */
  const before = (await doc(page)).sf.values.number;
  await page.locator('[data-region="code:number"]').click();
  await expect.poll(async () => (await doc(page)).sf.values.number).not.toBe(before);
  expect((await doc(page)).sf.values.number).toMatch(
    /^(X[1-9]\d-\d{4}|ID-[1-9]\d{3}-\d{4}|[A-HJ-NP-Z]{2}-[1-9]\d{3}-[A-HJ-NP-Z]|[0-9A-F]{2}(:[0-9A-F]{2}){3}|[A-HJ-NP-Z]{3}\/[1-9]\d{4})$/,
  );
  /* 點 DNA 條：雙螺旋 ↔ 字母 */
  await page.locator('[data-region="dna:dna"]').click();
  await expect.poll(async () => (await doc(page)).sf.style.dnaText).toBe(true);
  /* 執照卡：點預覽上的格子切換 */
  await radio(list, '執照卡').click();
  expect((await doc(page)).sf.licenses).toEqual(['firearms', 'driver', 'medic', 'decker']);
  await page.locator('[data-region="license:magic"]').click();
  await expect.poll(async () => (await doc(page)).sf.licenses).toContain('magic');
  await expect(page.getByRole('button', { name: '執照：魔法' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '執照：槍械' }).click();
  await expect.poll(async () => (await doc(page)).sf.licenses).not.toContain('firearms');
  /* 復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).sf.licenses).toContain('firearms');
  expect(errors).toEqual([]);
});

test('執照：改卡上的名稱、換成自己的圖示（方形裁切、單色印）、回到內建（F71、F72）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page, '執照卡');
  await page.getByRole('button', { name: '改「魔法」' }).click();
  const dialog = page.getByRole('dialog', { name: '執照：魔法' });
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-license-cap="magic"]').fill('ARCANA');
  await dialog.locator('[data-license-cap="magic"]').blur();
  await expect.poll(async () => (await doc(page)).sf.licenseCaps.magic).toBe('ARCANA');
  const chooser = await waitForFileChooser(page, () =>
    dialog.getByRole('button', { name: '選擇圖示' }).click(),
  );
  await chooser.setFiles(file('rune.png', await ringPng()));
  const crop = page.getByRole('dialog', { name: '裁切執照的圖示' });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '確定' }).click();
  await expect(crop).toBeHidden();
  await expect.poll(async () => !!(await doc(page)).sf.licenseIcons.magic).toBe(true);
  await expect(page.locator('[data-license="magic"]')).toContainText('＊');
  await page
    .getByRole('dialog', { name: '執照：魔法' })
    .getByRole('button', { name: '回到內建' })
    .click();
  await expect.poll(async () => (await doc(page)).sf.licenseCaps.magic).toBeUndefined();
  expect((await doc(page)).sf.licenseIcons.magic).toBeUndefined();
  expect(errors).toEqual([]);
});

/* ---------- 樣式：配色、裝飾、浮水印 ---------- */

test('樣式：配色組合、裝飾開關（機讀區、DNA 條關掉時照片格變大）、QR code、照片框、浮水印（F73～F77）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await tab(page, '樣式').click();
  await page.locator('[data-scheme="night"]').click();
  await expect
    .poll(async () => {
      const st = (await doc(page)).sf.style;
      return [st.card, st.ink, st.accent];
    })
    .toEqual(['#0b0b10', '#00f0ff', '#fcee0a']);
  const decor = page.getByTestId('sf-decor');
  await expect(decor.getByRole('switch')).toHaveCount(7);
  await decor.getByRole('switch', { name: '機讀區' }).click();
  await decor.getByRole('switch', { name: 'DNA 條' }).click();
  await expect
    .poll(async () => [(await doc(page)).sf.style.mrz, (await doc(page)).sf.style.dna])
    .toEqual([false, false]);
  /* 照片格往下長到 878（調整範圍的比例 413 ÷ 658） */
  await radio(page, 'QR code').click();
  await expect.poll(async () => (await doc(page)).sf.style.code).toBe('qr');
  await expect(page.locator('[data-region="qr:qr"]')).toHaveCount(1);
  await page.getByRole('combobox', { name: '照片框' }).click();
  await page.getByRole('option', { name: '瞄準鏡', exact: true }).click();
  await expect.poll(async () => (await doc(page)).sf.style.frame).toBe('scope');
  /* 通行證只有 3 個裝飾開關 */
  await tab(page, '內容').click();
  await radio(page.getByTestId('template-list'), '通行證').click();
  await tab(page, '樣式').click();
  await expect(decor.getByRole('switch')).toHaveCount(3);
  /* 浮水印：文字 */
  const off = readPng((await exportPng(page)).bytes);
  await radio(page, '文字').click();
  await expect.poll(async () => (await doc(page)).sf.watermark.mode).toBe('text');
  const on = readPng((await exportPng(page)).bytes);
  /* 照片格裡不印；卡面的底有印到 */
  let diff = 0;
  for (let y = 700; y < 1500; y += 7)
    for (let x = 120; x < 880; x += 7) if (on.at(x, y).join() !== off.at(x, y).join()) diff++;
  expect(diff).toBeGreaterThan(50);
  expect(on.at(290, 450)).toEqual(off.at(290, 450));
  expect(errors).toEqual([]);
});

/* ---------- 照片與照片效果 ---------- */

test('照片與照片效果：SF 證件的單色化只有墨色與卡面；網點；既有證件也能用（F78、F79）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await page
    .getByRole('group', { name: '放入照片' })
    .locator('input[type=file]')
    .setInputFiles(file('quad.png', await quadPng()));
  await expect(toast(page, '已放入照片「quad.png」')).toBeVisible();
  await radio(page.getByTestId('photo-fx'), '單色').click();
  await expect.poll(async () => (await doc(page)).sf.style.photoFx.fx).toBe('mono');
  const png = readPng((await exportPng(page)).bytes);
  expect([png.width, png.height]).toEqual([1600, 1010]);
  /* 照片格 157～570 × 220～750：紅、藍、綠變墨色，黃（亮）的透出卡面 */
  let ink = 0;
  let white = 0;
  let other = 0;
  for (let y = 250; y < 720; y += 9)
    for (let x = 190; x < 540; x += 9) {
      const c = png.at(x, y);
      if (isInk(c)) ink++;
      else if (isWhite(c)) white++;
      else other++;
    }
  expect(other).toBe(0);
  expect(ink).toBeGreaterThan(white);
  expect(white).toBeGreaterThan(100);
  await radio(page.getByTestId('photo-fx'), '網點').click();
  await expect(page.getByText('網點大小')).toBeVisible();
  await expect.poll(async () => (await doc(page)).sf.style.photoFx.fx).toBe('halftone');
  /* 既有的證件：照片效果記在 idPhotoFx */
  await radio(page, '證件').click();
  await radio(page.getByTestId('photo-fx'), '抖色').click();
  await expect.poll(async () => (await doc(page)).idPhotoFx.fx).toBe('dither');
  expect(errors).toEqual([]);
});

/* ---------- 裝飾圖 ---------- */

test('裝飾圖：一次放兩張依序裁切；選取、拖曳、大小、上下層、Delete 刪除；每一款各自（F80～F83）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page, '操作員 ID');
  await tab(page, '樣式').click();
  const ring = await ringPng();
  await page
    .getByRole('group', { name: '放入裝飾圖' })
    .locator('input[type=file]')
    .setInputFiles([file('a.png', ring), file('b.png', ring)]);
  /* 放入後馬上打開第一張的裁切 */
  const crop = page.getByRole('dialog', { name: '裁切裝飾圖' });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '確定' }).click();
  /* 第二張接著開 */
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '取消' }).click();
  await expect(crop).toBeHidden();
  await expect.poll(async () => (await doc(page)).sf.elements.operator.length).toBe(2);
  const [a, b] = (await doc(page)).sf.elements.operator;
  /* 放在操作員 ID 的標誌位置（呼號右邊），第二張錯開一點 */
  expect(a.x).toBeGreaterThan(0.75);
  expect(b.x).toBeGreaterThan(a.x);
  /* 縮圖清單點第一張選取；選取的那張在最上面：拖曳 */
  await page.getByRole('list', { name: '這一款的裝飾圖' }).getByRole('listitem').first().click();
  const item = page.locator(`[data-layout-item="${a.id}"]`).last();
  await expect(item).toBeVisible();
  const box = (await item.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await doc(page)).sf.elements.operator[0].x)
    .toBeLessThan(a.x - 0.05);
  /* 大小 */
  const editor = page.getByTestId('element-editor');
  const size = editor.getByRole('spinbutton').first();
  await size.fill('50');
  await size.press('Enter');
  await expect.poll(async () => (await doc(page)).sf.elements.operator[0].size).toBeCloseTo(0.5, 2);
  /* 上一層 */
  await editor.getByRole('button', { name: '上一層' }).click();
  await expect.poll(async () => (await doc(page)).sf.elements.operator[1].id).toBe(a.id);
  /* 每一款各自：活動證沒有 */
  expect((await doc(page)).sf.elements.event).toHaveLength(0);
  /* Delete 刪除選取的那張 */
  await page.locator(`[data-layout-item="${a.id}"]`).last().click();
  await page.keyboard.press('Delete');
  await expect
    .poll(async () => (await doc(page)).sf.elements.operator.map((e) => e.id))
    .toEqual([b.id]);
  /* 照片蓋過裝飾圖 */
  await page.getByRole('switch', { name: '照片蓋過裝飾圖' }).click();
  await expect.poll(async () => (await doc(page)).sf.style.photoOverElements).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 匯出與掛繩 ---------- */

test('SF 證件匯出：1 倍＝原生、2 倍；外形以外透明；通行證的孔；掛繩孔、掛繩孔＋掛繩（F84、F27 修訂）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1600 × 1010 px');
  const one = await exportPng(page);
  expect(one.name).toBe('sf-citizen.png');
  const c = readPng(one.bytes);
  expect([c.width, c.height]).toEqual([1600, 1010]);
  expect(c.at(10, 10)[3]).toBe(0);
  expect(c.at(800, 114)[3]).toBe(255);
  expect(c.at(800, 500)[3]).toBe(255);
  await radio(exportPanel(page), '2 倍（3200 × 2020）').click();
  const two = await exportPng(page);
  expect(two.name).toBe('sf-citizen-2x.png');
  expect([readPng(two.bytes).width, readPng(two.bytes).height]).toEqual([3200, 2020]);
  await radio(exportPanel(page), '1 倍（1600 × 1010）').click();
  /* 掛繩孔：卡片上緣中央透明 */
  await tab(page, '樣式').click();
  await chooseLanyard(page, '掛繩孔');
  await expect.poll(async () => (await prefs(page))?.lanyard).toBe('hole');
  const hole = readPng((await exportPng(page)).bytes);
  expect([hole.width, hole.height]).toEqual([1600, 1010]);
  expect(hole.at(800, 114)[3]).toBe(0);
  expect(hole.at(800, 160)[3]).toBe(255);
  /* 通行證：本來就有孔（不要掛繩時也是透明的） */
  await chooseLanyard(page, '不要');
  await tab(page, '內容').click();
  await radio(page.getByTestId('template-list'), '通行證').click();
  const pass = readPng((await exportPng(page)).bytes);
  expect([pass.width, pass.height]).toEqual([1000, 1600]);
  expect(pass.at(500, 120)[3]).toBe(0);
  /* 掛繩孔＋掛繩：往上延伸 400、掛繩是強調色 */
  await tab(page, '樣式').click();
  await chooseLanyard(page, '掛繩孔＋掛繩');
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1000 × 2000 px');
  const strap = readPng((await exportPng(page)).bytes);
  expect([strap.width, strap.height]).toEqual([1000, 2000]);
  const rib = strap.at(500, 60);
  expect(rib[3]).toBe(255);
  expect(rib[0]).toBeGreaterThan(rib[1] + 80);
  expect(strap.at(100, 60)[3]).toBe(0);
  expect(errors).toEqual([]);
});

test('證件的掛繩：只在預覽與不要的匯出逐位元組相同；掛繩孔透明（印刷是白的）；掛繩往上延伸 20 mm（F27 修訂、D31～D34）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '樣式').click();
  const preview = await exportPng(page);
  await chooseLanyard(page, '不要');
  await expect(page.getByTestId('strap')).toHaveCount(0);
  const none = await exportPng(page);
  expect(Buffer.from(none.bytes).equals(Buffer.from(preview.bytes))).toBe(true);
  /* 掛繩孔：13 × 3.2 mm、離上緣 3.5 mm（600 dpi：中心約 (638, 120)） */
  await chooseLanyard(page, '掛繩孔');
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1276 × 2031 px（54 × 86 mm）');
  const hole = readPng((await exportPng(page)).bytes);
  expect(hole.at(638, 120)[3]).toBe(0);
  expect(hole.at(638, 200)[3]).toBe(255);
  expect(hole.at(400, 120)[3]).toBe(255);
  /* 印刷：孔是白的、尺寸不變 */
  await radio(exportPanel(page), '印刷').click();
  const print = readPng((await exportPng(page)).bytes);
  expect([print.width, print.height]).toEqual([1370, 2126]);
  expect(print.at(638 + 47, 120 + 47)).toEqual([255, 255, 255, 255]);
  /* 掛繩孔＋掛繩：卡片往下挪 472 px（20 mm）；印刷不畫掛繩 */
  await chooseLanyard(page, '掛繩孔＋掛繩');
  await expect(page.getByTestId('strap-canvas')).toBeVisible();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1370 × 2126 px（58 × 90 mm）');
  await radio(exportPanel(page), '卡片').click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1276 × 2503 px（54 × 106 mm）');
  const strap = readPng((await exportPng(page)).bytes);
  expect([strap.width, strap.height]).toEqual([1276, 2503]);
  expect(strap.at(10, 10)[3]).toBe(0);
  /* 掛繩是主題色暗 10%（#2563eb → 約 (33, 89, 212)） */
  const rib = strap.at(638, 60);
  expect(rib[3]).toBe(255);
  expect(rib[2]).toBeGreaterThan(rib[0] + 100);
  /* 孔的下半（扣片只到孔的中間）透明 */
  expect(strap.at(600, 472 + 132)[3]).toBe(0);
  /* 排在一張：兩面都有掛繩 */
  await exportPanel(page)
    .getByRole('radio', { name: '正面、背面左右排在一張（中間隔 6 mm）' })
    .click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 2694 × 2503 px');
  /* 橫式（刑警證）：孔在上緣中央 */
  await exportPanel(page).getByRole('radio', { name: '只輸出目前這一面' }).click();
  await chooseLanyard(page, '掛繩孔');
  await radio(page.getByTestId('template-list'), '刑警證').click();
  const pol = readPng((await exportPng(page)).bytes);
  expect([pol.width, pol.height]).toEqual([2031, 1276]);
  expect(pol.at(1016, 120)[3]).toBe(0);
  await expect.poll(async () => (await prefs(page))?.lanyard).toBe('hole');
  expect(errors).toEqual([]);
});

test('掛繩孔：上緣的字避開孔（往下移、分到孔的兩邊、只用到孔的左邊）；沒打孔時照舊碰得到（D32 修訂）', async ({
  page,
}) => {
  const errors = await open(page);
  type Hook = { slotInk: (side: 'front' | 'back', slot: boolean) => number };
  const ink = (side: 'front' | 'back', slot: boolean) =>
    page.evaluate(
      ([s, k]) => (window as unknown as { __idTicket: Hook }).__idTicket.slotInk(s, k),
      [side, slot] as const,
    );
  /* 上緣的名稱填到很長（上限），沒有避開時一定會碰到孔 */
  const long: [string, string, string][] = [
    ['員工證', 'emp_org', '辰星生技股份有限公司霧港研發中心第三實驗大樓'],
    ['高中學生證', 'hi_school', '霧港市立海霧高級中學附設國民中學部暨進修部'],
    ['大學學生證', 'uni_name', '國立雲棲大學霧港校區附設研究所'],
    ['記者證', 'press_org', '晨鐘日報霧港分社地方新聞中心'],
    ['刑警證', 'pol_unit', '霧港市政府警察局刑事警察大隊'],
    ['會員卡', 'mem_store', '月見書房霧港本店會員專用'],
  ];
  for (const [tpl, key, value] of long) {
    await radio(page.getByTestId('template-list'), tpl).click();
    await fieldInput(page, key).fill(value);
    await fieldInput(page, key).blur();
  }
  const touched: string[] = [];
  for (const tpl of [
    '員工證',
    '高中學生證',
    '大學學生證',
    '記者證',
    '刑警證',
    '會員卡',
    '偵探執照（1920 年代）',
  ]) {
    await radio(page.getByTestId('template-list'), tpl).click();
    for (const side of ['front', 'back'] as const) {
      const before = await ink(side, false);
      const after = await ink(side, true);
      if (before > 5) touched.push(`${tpl}/${side}`);
      /* 會員卡背面的磁條（不是字）照樣打穿（D32） */
      if (tpl === '會員卡' && side === 'back') expect(after).toBeCloseTo(before, 5);
      else expect(after, `${tpl}/${side}：孔裡還有東西`).toBeLessThan(0.5);
    }
  }
  /* 沒有避開時：員工證、高中、大學、記者、刑警、偵探執照的上緣都碰到孔 */
  for (const t of [
    '員工證/front',
    '高中學生證/front',
    '大學學生證/front',
    '大學學生證/back',
    '記者證/front',
    '刑警證/front',
    '偵探執照（1920 年代）/front',
    '偵探執照（1920 年代）/back',
  ])
    expect(touched).toContain(t);
  /* 偵探執照的發照機關沒有空白時：往下移（照樣避開） */
  await fieldInput(page, 'det_agency').fill('霧港市執照審查處');
  await fieldInput(page, 'det_agency').blur();
  expect(await ink('front', true)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('SF 證件的碼太密時提醒：活動證的條碼 1 倍、QR code 內容太長；改 2 倍或縮短就不提醒（D39、D40 修訂）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page, '活動證');
  const dense = page.getByTestId('sf-code-dense');
  await expect(dense).toContainText('條碼在 1 倍時最細的條只有約');
  await expect(dense).toContainText('建議匯出 2 倍');
  /* 編號欄位下面也提醒 */
  await expect(page.getByTestId('qr-dense')).toContainText('條碼在 1 倍時');
  await radio(exportPanel(page), '2 倍（2400 × 3200）').click();
  await expect(dense).toHaveCount(0);
  await radio(exportPanel(page), '1 倍（1200 × 1600）').click();
  await expect(dense).toHaveCount(1);
  /* 編號改短：1 倍也夠 */
  await fieldInput(page, 'number').fill('0413');
  await fieldInput(page, 'number').blur();
  await expect(dense).toHaveCount(0);
  /* QR code：內容很長時提醒，放在 QR code 內容欄 */
  await tab(page, '樣式').click();
  await radio(page, 'QR code').click();
  await tab(page, '內容').click();
  await expect(dense).toHaveCount(0);
  await fieldInput(page, 'qr').fill('https://example.com/'.repeat(14));
  await fieldInput(page, 'qr').blur();
  await expect(dense).toContainText('QR code 在 1 倍時每格只有約');
  await expect(page.getByTestId('qr-dense')).toContainText('QR code 在 1 倍時');
  expect(errors).toEqual([]);
});

test('執照的對話框：Esc 關掉後焦點回到鉛筆按鈕', async ({ page }) => {
  const errors = await open(page);
  await sfOpen(page, '執照卡');
  const pencil = page.getByRole('button', { name: '改「醫療」' });
  await pencil.click();
  await expect(page.getByRole('dialog', { name: '執照：醫療' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '執照：醫療' })).toBeHidden();
  await expect(pencil).toBeFocused();
  expect(errors).toEqual([]);
});

/* ---------- 儲存與專案檔 ---------- */

test('自動儲存與還原；專案檔（資料版本 2，含 SF 證件的圖）；版本 1 的專案檔照讀；以前的掛繩開關照讀（F56、F59 修訂）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page, '活動證');
  await fieldInput(page, 'role').fill('VIP');
  await fieldInput(page, 'role').blur();
  await page
    .getByRole('group', { name: '放入照片' })
    .locator('input[type=file]')
    .setInputFiles(file('quad.png', await quadPng()));
  await expect(toast(page, '已放入照片「quad.png」')).toBeVisible();
  await expect.poll(async () => !!(await doc(page)).sf.photo).toBe(true);
  /* 以前的掛繩開關（strap: false）讀成「不要」（先改一次讓設定寫進瀏覽器，再換成以前的格式） */
  await tab(page, '樣式').click();
  await chooseLanyard(page, '掛繩孔');
  await expect.poll(async () => (await prefs(page))?.lanyard).toBe('hole');
  await page.evaluate((key) => {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    v.state.data.strap = false;
    delete v.state.data.lanyard;
    localStorage.setItem(key, JSON.stringify(v));
  }, PREFS_KEY);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('trpg-toolkit:id-ticket') ?? 'null')?.state?.data?.sf
            ?.values?.role,
      ),
    )
    .toBe('VIP');
  await page.reload();
  await expect(sfCanvas(page)).toHaveAttribute('data-template', 'event');
  await expect(fieldInput(page, 'role')).toHaveValue('VIP');
  expect((await prefs(page))?.lanyard).toBe('none');
  /* 存成專案檔 */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const proj = JSON.parse(strFromU8(zip['project.json']));
  expect(proj.version).toBe(2);
  expect(proj.data.sf.values.role).toBe('VIP');
  const photoId = proj.data.sf.photo.image.id;
  expect(Object.keys(zip).some((k) => k.startsWith(`files/${photoId}`))).toBe(true);
  /* 版本 1 的專案檔（沒有 sf）照讀：SF 回到預設 */
  const v1 = { ...proj, version: 1, data: { ...proj.data, kind: 'ticket' } };
  delete v1.data.sf;
  delete v1.data.idPhotoFx;
  const v1zip = zipSync({ 'project.json': new TextEncoder().encode(JSON.stringify(v1)) });
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  );
  await chooser.setFiles({
    name: 'old.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(v1zip),
  });
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect(page.getByTestId('ticket-canvas')).toBeVisible();
  const d = await doc(page);
  expect(d.sf.values.role).toBe('SPEAKER');
  expect(d.sf.photo).toBeNull();
  expect(d.idPhotoFx.fx).toBe('none');
  expect(errors).toEqual([]);
});

test('390 寬沒有橫向捲動（SF 證件的內容與樣式、執照、裝飾圖）', async ({ page }) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await sfOpen(page, '執照卡');
  await noHorizontalScroll(page);
  await page.getByRole('switch', { name: '改證件上的欄位名稱' }).click();
  await expect(page.getByTestId('sf-captions')).toBeVisible();
  await noHorizontalScroll(page);
  await tab(page, '樣式').click();
  await radio(page, '文字').click();
  await noHorizontalScroll(page);
  await page
    .getByRole('group', { name: '放入裝飾圖' })
    .locator('input[type=file]')
    .setInputFiles([file('a.png', await ringPng())]);
  const crop = page.getByRole('dialog', { name: '裁切裝飾圖' });
  await crop.getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('element-editor')).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
