/**
 * AI 誤判梗圖產生器（建置產物 next/ai-fail/）的端對端測試（規格 docs/refactor/specs/ai-fail.md）：
 * - 開頁沒有錯誤、空白預覽（點一下選照片）、下載與放大停用、頁尾只有靈感來源；
 * - 載入：選檔、拖放（整個視窗）、貼上、不是圖片、壞檔；換照片清掉所有框（可以復原）；
 * - 比例：四種尺寸、框跟著縮放（字級與線寬乘較小的比值）、照片回到置中；
 * - 照片：放大以畫布中心為準、平移一律蓋滿、重設位置；
 * - 畫框：太小不建立、預設值、建立後選取並回到選取模式；Esc 依序取消（畫到一半、新增框模式、選取）；
 * - 選取、移動（不夾範圍）、八個控制點（最小 24、比上層的框優先）、游標、點空白處取消選取；
 * - 選取的框：標籤 40 字、顏色、線寬、字級、對齊、標籤位置（上方放不下時放進框內）、刪除；
 * - 框的清單：上層在前、編號與尺寸、點列選取、往前／往後一層、拖曳排序、刪除；
 * - 鍵盤：方向鍵 1／10 px、［］、Delete／Backspace；文字欄裡不作用；
 * - 下載 PNG：檔名、尺寸、像素（照片、方框線、標籤；不含選取標示），與預覽逐像素相同；
 * - 自動儲存與還原、照片讀不到的提醒；復原／重做（按鈕與快捷鍵，拖曳算一步）；
 * - 專案檔 ZIP（內容、重設、開啟還原、缺照片的不套用）；
 * - 觸控：畫框、移動、控制點、平移；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('ai-fail') ?? { id: 'ai-fail', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:ai-fail';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 40, 40, 255];
const BLUE: Rgba = [40, 80, 200, 255];
const GREEN: Rgba = [40, 160, 60, 255];
const YELLOW: Rgba = [230, 200, 40, 255];
const BOX_GREEN = [0x59, 0xb6, 0x4c];

interface StoredBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  lineWidth: number;
  fontSize: number;
  labelPos: string;
  align: string;
}
interface Stored {
  aspect: string;
  photo: { id: string; name: string; width: number; height: number } | null;
  view: { zoom: number; x: number; y: number };
  boxes: StoredBox[];
  font: { source: string; family: string; weight: number };
}

/* ---------- 共用 ---------- */

/** 四個象限四種顏色的測試照片 */
async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? (y < h / 2 ? RED : GREEN) : y < h / 2 ? BLUE : YELLOW;
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
  await expect(page.getByRole('heading', { level: 1, name: 'AI 誤判梗圖產生器' })).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('meme-canvas');
const layer = (page: Page) => page.getByTestId('edit-layer');
const downloadBtn = (page: Page) => page.getByRole('button', { name: '下載 PNG' });
const fileInput = (page: Page) =>
  page.getByRole('group', { name: '照片載入區' }).locator('input[type=file]');
const panel = (page: Page) => page.getByTestId('selected-panel');
const list = (page: Page) => page.getByRole('list', { name: '框的清單（上層在前）' });
const rows = (page: Page) => list(page).locator('[data-box-row]');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });

async function state(page: Page): Promise<Stored> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

async function loadPhoto(page: Page, buffer?: Buffer, name = 'quad.png') {
  await fileInput(page).setInputFiles(file(name, buffer ?? (await quadPng())));
  await expect(page.getByTestId('photo-name')).toContainText(name);
  await expect(downloadBtn(page)).toBeEnabled();
}

/** 畫布座標 → 螢幕座標 */
async function at(page: Page, x: number, y: number) {
  const b = await canvas(page).boundingBox();
  const [w, h] = ((await canvas(page).getAttribute('data-size')) ?? '1x1').split('x').map(Number);
  if (!b) throw new Error('找不到畫布');
  return { x: b.x + (x / w) * b.width, y: b.y + (y / h) * b.height };
}

async function dragCanvas(page: Page, a: [number, number], b: [number, number], steps = 5) {
  const p = await at(page, a[0], a[1]);
  const q = await at(page, b[0], b[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps });
  await page.mouse.up();
}

async function clickCanvas(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function drawBox(page: Page, a: [number, number], b: [number, number]) {
  await radio(page, '新增框').click();
  await dragCanvas(page, a, b);
}

/** 預覽畫布上一點的顏色 */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
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

/** 預覽畫布上某個範圍裡接近某色的像素的外接範圍 */
async function colorBounds(
  page: Page,
  rect: [number, number, number, number],
  rgb: number[],
  tol = 50,
): Promise<[number, number, number, number] | null> {
  return canvas(page).evaluate(
    (el, { rect, rgb, tol }) => {
      const [rx, ry, rw, rh] = rect;
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(rx, ry, rw, rh).data;
      if (!d) return null;
      let x0 = 1e9;
      let y0 = 1e9;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < rw; x++) {
          const k = (y * rw + x) * 4;
          if ([0, 1, 2].every((i) => Math.abs(d[k + i] - rgb[i]) <= tol)) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
        }
      return x1 < 0
        ? null
        : ([x0 + rx, y0 + ry, x1 + rx, y1 + ry] as [number, number, number, number]);
    },
    { rect, rgb, tol },
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

/* ---------- 開頁與載入 ---------- */

test('開頁：沒有錯誤、空白預覽、停用的控制項、頁尾只有靈感來源；點空白預覽選照片（F01、F02、F07、F08）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-size', '1000x1000');
  await expect(page.getByTestId('export-size')).toHaveText('1000 × 1000 px');
  await expect(downloadBtn(page)).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: '放大' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重設位置' })).toBeDisabled();
  await expect(page.getByTestId('mode-hint')).toHaveText('先放進一張照片才能畫框。');
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText(/放進照片後，按「新增框」/)).toBeVisible();
  /* 頁尾只有靈感來源；沒有原作者的其他連結 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/swoonqx/ai-fails-meme-maker',
  );
  await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
  /* 點空白預覽：開啟選檔 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('empty-pick').click(),
  ]);
  await chooser.setFiles(file('貓.png', await quadPng()));
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x900');
  await expect(page.getByTestId('empty-pick')).toHaveCount(0);
  await expect(page.getByTestId('load-area')).toHaveAttribute('data-state', 'loaded');
  await expect(page.getByTestId('photo-name')).toContainText('貓.png');
  await expect(downloadBtn(page)).toBeEnabled();
  await expect(page.getByRole('spinbutton', { name: '放大' })).toBeEnabled();
  /* 鋪滿：原圖比例剛好等於畫布 */
  await expect(canvas(page)).toHaveAttribute('data-photo-rect', '0,0,1200,900');
  expect(near(await pixel(page, 100, 100), RED)).toBe(true);
  expect(near(await pixel(page, 1100, 100), BLUE)).toBe(true);
  expect(near(await pixel(page, 100, 800), GREEN)).toBe(true);
  expect(near(await pixel(page, 1100, 800), YELLOW)).toBe(true);
  expect(errors).toEqual([]);
});

test('載入：拖放（整個視窗）、貼上、不是圖片、壞檔；換照片清掉所有框、可以復原（F03～F07）', async ({
  page,
}) => {
  const errors = await open(page);
  const tall = await quadPng(300, 500);
  /* 拖放到視窗任何地方 */
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'tall.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, tall.toString('base64'));
  await expect(canvas(page)).toHaveAttribute('data-size', '720x1200');
  await drawBox(page, [100, 200], [400, 500]);
  expect((await state(page)).boxes).toHaveLength(1);
  /* 貼上：換照片、框全部清掉 */
  const wide = await quadPng(400, 300);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, wide.toString('base64'));
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x900');
  await expect(page.getByTestId('photo-name')).toContainText('pasted.png');
  expect((await state(page)).boxes).toEqual([]);
  await expect(panel(page)).toHaveCount(0);
  /* 復原：照片與框都回來 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '720x1200');
  expect((await state(page)).boxes).toHaveLength(1);
  /* 不是圖片：訊息、內容不變 */
  await fileInput(page).setInputFiles(file('notes.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, '「notes.txt」不是圖片檔，請選擇照片。')).toBeVisible();
  /* 壞檔：訊息、內容不變 */
  await fileInput(page).setInputFiles(file('broken.png', Buffer.from('not a png at all')));
  await expect(toast(page, /無法讀取「broken\.png」/)).toBeVisible();
  const s = await state(page);
  expect(s.photo?.name).toBe('tall.png');
  expect(s.boxes).toHaveLength(1);
  await expect(canvas(page)).toHaveAttribute('data-size', '720x1200');
  expect(errors).toEqual([]);
});

/* ---------- 比例與照片 ---------- */

test('比例：四種尺寸、框跟著縮放、照片回到置中；再選一次不做事（F12～F14）', async ({ page }) => {
  const errors = await open(page);
  /* 沒有照片時也換尺寸 */
  await radio(page, '3:4（直式）').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '900x1200');
  await radio(page, '原圖比例').click();
  await loadPhoto(page);
  await expect(page.getByTestId('aspect-hint')).toContainText('輸出 1200 × 900 px');
  await drawBox(page, [120, 90], [420, 240]);
  const b0 = (await state(page)).boxes[0];
  const zoom = page.getByRole('spinbutton', { name: '放大' });
  await zoom.fill('2');
  await zoom.press('Enter');
  expect((await state(page)).view.zoom).toBe(2);
  /* 再選一次原圖：不做事（位置與倍率保留） */
  await radio(page, '原圖比例').click();
  expect((await state(page)).view.zoom).toBe(2);

  await radio(page, '3:4（直式）').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '900x1200');
  await expect(page.getByTestId('export-size')).toHaveText('900 × 1200 px');
  let s = await state(page);
  expect(s.view.zoom).toBe(1);
  expect(s.boxes[0].x).toBeCloseTo(b0.x * 0.75, 5);
  expect(s.boxes[0].y).toBeCloseTo((b0.y * 4) / 3, 5);
  expect(s.boxes[0].width).toBeCloseTo(b0.width * 0.75, 5);
  expect(s.boxes[0].height).toBeCloseTo((b0.height * 4) / 3, 5);
  expect(s.boxes[0]).toMatchObject({ fontSize: 30, lineWidth: 3 });
  /* 照片 400 × 300 鋪滿 900 × 1200：高 1200、寬 1600、置中 */
  await expect(canvas(page)).toHaveAttribute('data-photo-rect', '-350,0,1600,1200');

  await radio(page, '1:1（正方形）').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1000x1000');
  s = await state(page);
  /* 900 × 1200 → 1000 × 1000：較小的比值 0.833…，字級 30 → 25、線寬 3 → 3 */
  expect(s.boxes[0]).toMatchObject({ fontSize: 25, lineWidth: 3 });
  await radio(page, '4:3（橫式）').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x900');
  await radio(page, '原圖比例').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x900');
  expect(errors).toEqual([]);
});

test('照片：放大以畫布中心為準、拖曳平移一律蓋滿、重設位置（F08～F11）', async ({ page }) => {
  const errors = await open(page);
  await radio(page, '1:1（正方形）').click();
  await loadPhoto(page);
  const rect = async () =>
    ((await canvas(page).getAttribute('data-photo-rect')) ?? '').split(',').map(Number);
  expect(await rect()).toEqual([-166.667, 0, 1333.333, 1000]);
  /* 放大 1 倍時只能左右移：上下拖不動 */
  await dragCanvas(page, [500, 500], [560, 700]);
  let r = await rect();
  expect(r[0]).toBeCloseTo(-106.667, 0);
  expect(r[1]).toBe(0);
  await page.getByRole('button', { name: '重設位置' }).click();
  expect(await rect()).toEqual([-166.667, 0, 1333.333, 1000]);
  /* 放大 2 倍：中心不動 */
  const zoom = page.getByRole('spinbutton', { name: '放大' });
  await zoom.fill('2');
  await zoom.press('Enter');
  expect(await rect()).toEqual([-833.333, -500, 2666.667, 2000]);
  /* 平移 */
  await dragCanvas(page, [500, 500], [800, 700]);
  r = await rect();
  expect(r[0]).toBeCloseTo(-533.333, 0);
  expect(r[1]).toBeCloseTo(-300, 0);
  /* 拖過頭：夾回蓋滿 */
  await dragCanvas(page, [10, 10], [990, 990]);
  expect((await rect()).slice(0, 2)).toEqual([0, 0]);
  expect(near(await pixel(page, 5, 5), RED)).toBe(true);
  /* 在左上角放大到 4：畫布中心對著照片同一點，再夾值 */
  await zoom.fill('4');
  await zoom.press('Enter');
  r = await rect();
  expect(r[2]).toBeCloseTo(5333.333, 1);
  /* 原本中心 (500, 500) 對著照片 500/2666.67 處 → 新的位置 500 − 0.1875 × 5333.33 = −500 */
  expect(r[0]).toBeCloseTo(-500, 1);
  expect(r[1]).toBeCloseTo(-500, 1);
  /* 縮回 1：夾回蓋滿 */
  await zoom.fill('1');
  await zoom.press('Enter');
  r = await rect();
  expect(r[1]).toBe(0);
  expect(r[0]).toBeLessThanOrEqual(0);
  expect(r[0]).toBeGreaterThanOrEqual(-333.334);
  await page.getByRole('button', { name: '重設位置' }).click();
  expect(await rect()).toEqual([-166.667, 0, 1333.333, 1000]);
  expect((await state(page)).view.zoom).toBe(1);
  expect(errors).toEqual([]);
});

/* ---------- 畫框與選取 ---------- */

test('畫框：太小不建立、預設值、選取並回到選取模式；Esc 依序取消（F15～F18、F38）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await radio(page, '新增框').click();
  await expect(layer(page)).toHaveAttribute('data-mode', 'draw');
  await expect(page.getByTestId('mode-hint')).toContainText('按住拖曳畫出新的框');
  /* 寬 10：不建立、維持新增框模式 */
  await dragCanvas(page, [100, 100], [110, 300]);
  expect((await state(page)).boxes).toEqual([]);
  await expect(radio(page, '新增框')).toBeChecked();
  /* 反方向拉也可以 */
  await dragCanvas(page, [500, 600], [200, 300]);
  const [b] = (await state(page)).boxes;
  expect(b.x).toBeCloseTo(200, 0);
  expect(b.y).toBeCloseTo(300, 0);
  expect(b.width).toBeCloseTo(300, 0);
  expect(b.height).toBeCloseTo(300, 0);
  expect(b).toMatchObject({
    id: 'b1',
    label: 'object',
    color: '#59b64c',
    lineWidth: 4,
    fontSize: 40,
    labelPos: 'top',
    align: 'left',
  });
  await expect(radio(page, '選取／移動')).toBeChecked();
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  await expect(panel(page).getByRole('textbox', { name: '標籤文字' })).toHaveValue('object');
  await expect(page.getByTestId('selection')).toBeVisible();
  /* 方框線與上方的標籤 */
  expect(near(await pixel(page, Math.round(b.x), 450), BOX_GREEN, 30)).toBe(true);
  const label = await colorBounds(page, [150, 230, 300, 68], BOX_GREEN);
  expect(label).not.toBeNull();
  expect(label?.[0]).toBeGreaterThanOrEqual(Math.floor(b.x) - 1);
  expect(label?.[3]).toBeLessThanOrEqual(Math.ceil(b.y) - 6);

  /* Esc：畫到一半 → 取消這個框（維持新增框模式） */
  await radio(page, '新增框').click();
  const p = await at(page, 700, 100);
  const q = await at(page, 1000, 400);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await expect(page.getByTestId('draft-box')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draft-box')).toHaveCount(0);
  await page.mouse.move(q.x + 10, q.y + 10);
  await page.mouse.up();
  expect((await state(page)).boxes).toHaveLength(1);
  await expect(radio(page, '新增框')).toBeChecked();
  /* Esc：新增框模式 → 選取模式（選取保留） */
  await page.keyboard.press('Escape');
  await expect(radio(page, '選取／移動')).toBeChecked();
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  /* Esc：取消選取 */
  await page.keyboard.press('Escape');
  await expect(layer(page)).toHaveAttribute('data-selected', '');
  await expect(panel(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('選取、移動（不夾範圍）、八個控制點（最小 24、比上層的框優先）、游標、點空白處取消選取（F19～F23）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [100, 100], [400, 400]);
  await drawBox(page, [350, 350], [700, 700]);
  const box = async (id: string) => (await state(page)).boxes.find((b) => b.id === id) as StoredBox;
  /* 點 b1 裡面：選取 b1 */
  await clickCanvas(page, 150, 150);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  /* b1 的右下控制點落在 b2（上層）裡面：控制點優先 */
  const a0 = await box('b1');
  await dragCanvas(
    page,
    [a0.x + a0.width, a0.y + a0.height],
    [a0.x + a0.width + 50, a0.y + a0.height + 30],
  );
  let a = await box('b1');
  expect(a.width).toBeCloseTo(a0.width + 50, 0);
  expect(a.height).toBeCloseTo(a0.height + 30, 0);
  expect(a.x).toBeCloseTo(a0.x, 3);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  /* 左上控制點拖過頭：停在 24 × 24，右下角不動 */
  await dragCanvas(page, [a.x, a.y], [1100, 850]);
  const right = a.x + a.width;
  const bottom = a.y + a.height;
  a = await box('b1');
  expect(a.width).toBe(24);
  expect(a.height).toBe(24);
  expect(a.x + a.width).toBeCloseTo(right, 3);
  expect(a.y + a.height).toBeCloseTo(bottom, 3);
  /* 上方中點：只改高 */
  await dragCanvas(page, [a.x + 12, a.y], [a.x + 80, a.y - 100]);
  a = await box('b1');
  expect(a.width).toBe(24);
  expect(a.height).toBeCloseTo(124, 0);
  /* 移動 b2，可以拖出畫布 */
  const b0 = await box('b2');
  await dragCanvas(page, [600, 600], [650, 500]);
  let b = await box('b2');
  await expect(layer(page)).toHaveAttribute('data-selected', 'b2');
  expect(b.x - b0.x).toBeCloseTo(50, 0);
  expect(b.y - b0.y).toBeCloseTo(-100, 0);
  expect(b.width).toBeCloseTo(b0.width, 5);
  await dragCanvas(page, [600, 500], [1150, 500]);
  b = await box('b2');
  expect(b.x + b.width).toBeGreaterThan(1200);
  /* 游標 */
  const hover = async (x: number, y: number) => {
    const pt = await at(page, x, y);
    await page.mouse.move(pt.x, pt.y);
    return layer(page).evaluate((el) => (el as HTMLElement).style.cursor);
  };
  expect(await hover(b.x + b.width / 2 - 100, b.y + b.height / 2)).toBe('move');
  expect(await hover(b.x, b.y)).toBe('nwse-resize');
  expect(await hover(b.x + b.width / 2, b.y + b.height)).toBe('ns-resize');
  expect(await hover(50, 850)).toBe('grab');
  /* 點空白處：取消選取 */
  await clickCanvas(page, 50, 850);
  await expect(layer(page)).toHaveAttribute('data-selected', '');
  expect(errors).toEqual([]);
});

test('選取的框：標籤 40 字、顏色、線寬、字級、對齊、標籤位置（上方放不下時放進框內）、標籤字型、刪除（F24～F31、F52）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [300, 300], [700, 600]);
  const label = panel(page).getByRole('textbox', { name: '標籤文字' });
  await label.fill('x'.repeat(50));
  await expect(label).toHaveValue('x'.repeat(40));
  await expect(panel(page)).toContainText('40／40 字');
  await label.fill('cat');
  const hex = panel(page).getByRole('textbox', { name: '顏色' });
  await hex.fill('#ff0000');
  await hex.press('Enter');
  for (const [name, v] of [
    ['線寬', '10'],
    ['字級', '72'],
  ] as const) {
    const input = panel(page).getByRole('spinbutton', { name });
    await input.fill(v);
    await input.press('Enter');
  }
  let [b] = (await state(page)).boxes;
  expect(b).toMatchObject({ label: 'cat', color: '#ff0000', lineWidth: 10, fontSize: 72 });
  /* 線寬 10：以邊為中心各 5 px */
  expect(near(await pixel(page, Math.round(b.x) - 4, 450), [255, 0, 0])).toBe(true);
  expect(near(await pixel(page, Math.round(b.x) + 4, 450), [255, 0, 0])).toBe(true);
  expect(near(await pixel(page, Math.round(b.x) - 8, 450), [255, 0, 0])).toBe(false);
  const RED_ON_TOP: [number, number, number, number] = [0, Math.ceil(b.y) - 6 - 90, 1200, 88];
  /* 靠左：文字左緣在框的左緣 */
  let t = await colorBounds(page, RED_ON_TOP, [255, 0, 0], 40);
  expect(t?.[0]).toBeGreaterThanOrEqual(Math.floor(b.x));
  expect(t?.[0]).toBeLessThan(b.x + 20);
  /* 置中、靠右 */
  await radio(panel(page), '置中').click();
  t = await colorBounds(page, RED_ON_TOP, [255, 0, 0], 40);
  expect(Math.abs(((t?.[0] ?? 0) + (t?.[2] ?? 0)) / 2 - (b.x + b.width / 2))).toBeLessThan(8);
  await radio(panel(page), '靠右').click();
  t = await colorBounds(page, RED_ON_TOP, [255, 0, 0], 40);
  expect(t?.[2]).toBeLessThanOrEqual(Math.ceil(b.x + b.width));
  expect(t?.[2]).toBeGreaterThan(b.x + b.width - 20);
  /* 框內：上方沒有字、框內右上有字 */
  await radio(panel(page), '框內').click();
  expect(await colorBounds(page, RED_ON_TOP, [255, 0, 0], 40)).toBeNull();
  const inside: [number, number, number, number] = [
    Math.ceil(b.x + 10),
    Math.ceil(b.y + 10),
    Math.floor(b.width - 20),
    110,
  ];
  t = await colorBounds(page, inside, [255, 0, 0], 40);
  expect(t).not.toBeNull();
  expect(t?.[2]).toBeLessThanOrEqual(Math.ceil(b.x + b.width - 24));
  /* 回到上方，把框移到頂端：上方放不下 → 自動畫在框內（設定不變） */
  await radio(panel(page), '框的上方').click();
  await dragCanvas(page, [500, 450], [500, 450 - (b.y - 40)]);
  [b] = (await state(page)).boxes;
  expect(b.y).toBeCloseTo(40, 0);
  expect(b.labelPos).toBe('top');
  t = await colorBounds(
    page,
    [Math.ceil(b.x + 10), Math.ceil(b.y + 10), Math.floor(b.width - 20), 100],
    [255, 0, 0],
    40,
  );
  expect(t).not.toBeNull();
  /* 標籤字型（所有框共用）：字重 */
  await page.getByRole('combobox', { name: '字重' }).click();
  await page.getByRole('option', { name: '700 粗' }).click();
  expect((await state(page)).font).toEqual({
    source: 'google',
    family: 'Noto Sans TC',
    weight: 700,
  });
  /* 清空標籤：不畫字，清單顯示「沒有標籤」 */
  await label.fill('');
  await expect(rows(page).first()).toContainText('沒有標籤');
  /* 刪除 */
  await panel(page).getByRole('button', { name: '刪除這個框' }).click();
  expect((await state(page)).boxes).toEqual([]);
  await expect(panel(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('框的清單：上層在前、編號與尺寸、點列選取、往前／往後一層、拖曳排序、刪除（F32～F37）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [100, 100], [300, 300]);
  await drawBox(page, [400, 100], [650, 300]);
  await drawBox(page, [700, 100], [1000, 400]);
  const order = async () => (await state(page)).boxes.map((b) => b.id);
  const rowIds = async () =>
    rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-box-row')));
  await expect(page.getByText('拖曳或用上下按鈕調整前後')).toBeVisible();
  expect(await rowIds()).toEqual(['b3', 'b2', 'b1']);
  await expect(rows(page).nth(0)).toContainText('#3');
  await expect(rows(page).nth(2)).toContainText('#1');
  await expect(rows(page).nth(2).getByTestId('box-size')).toHaveText('200 × 200 px');
  /* 點列選取 */
  await rows(page).nth(2).click();
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  await expect(list(page).locator('li[aria-current="true"] [data-box-row]')).toHaveAttribute(
    'data-box-row',
    'b1',
  );
  /* 最上層的「往前」、最底層的「往後」停用 */
  await expect(page.getByRole('button', { name: '往前一層：object（#3）' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '往後一層：object（#1）' })).toBeDisabled();
  /* 往前一層：同一個框保持選取 */
  await page.getByRole('button', { name: '往前一層：object（#1）' }).click();
  expect(await order()).toEqual(['b2', 'b1', 'b3']);
  expect(await rowIds()).toEqual(['b3', 'b1', 'b2']);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  await page.getByRole('button', { name: '往後一層：object（#3）' }).click();
  expect(await order()).toEqual(['b2', 'b3', 'b1']);
  /* 拖曳排序：最底層那列拖到最上面 */
  const handle = rows(page).nth(2).locator('[data-drag-handle]');
  const target = await rows(page).nth(0).boundingBox();
  const h = await handle.boundingBox();
  if (!target || !h) throw new Error('找不到清單列');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, target.y + 4, { steps: 12 });
  await page.mouse.up();
  expect(await rowIds()).toEqual(['b2', 'b1', 'b3']);
  expect(await order()).toEqual(['b3', 'b1', 'b2']);
  /* 拖曳排序算一步復原 */
  await page.keyboard.press('Control+z');
  expect(await order()).toEqual(['b2', 'b3', 'b1']);
  /* 刪除 */
  await page.getByRole('button', { name: '刪除：object（#2）' }).click();
  expect(await order()).toEqual(['b2', 'b1']);
  expect(errors).toEqual([]);
});

test('鍵盤：方向鍵 1／10 px、［］調整上下層、Delete 與 Backspace 刪除；文字欄裡不作用（F38～F41）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [100, 100], [300, 300]);
  await drawBox(page, [500, 100], [700, 300]);
  await clickCanvas(page, 200, 200);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  const b1 = async () => (await state(page)).boxes.find((b) => b.id === 'b1') as StoredBox;
  const start = await b1();
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown'])
    await page.keyboard.press(k);
  await page.keyboard.press('Shift+ArrowLeft');
  let b = await b1();
  expect(b.x - start.x).toBeCloseTo(-7, 5);
  expect(b.y - start.y).toBeCloseTo(1, 5);
  /* 連按算一步復原 */
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  b = await b1();
  expect(b.x).toBeCloseTo(start.x, 5);
  /* ］往前、［往後 */
  await page.keyboard.press(']');
  expect((await state(page)).boxes.map((x) => x.id)).toEqual(['b2', 'b1']);
  await page.keyboard.press('[');
  expect((await state(page)).boxes.map((x) => x.id)).toEqual(['b1', 'b2']);
  /* 文字欄裡：Delete、方向鍵、Esc 只作用在文字上 */
  const label = panel(page).getByRole('textbox', { name: '標籤文字' });
  await label.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(label).toHaveValue('objec');
  expect((await state(page)).boxes).toHaveLength(2);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  /* 離開文字欄後：Backspace 刪除 */
  await clickCanvas(page, 200, 200);
  await page.keyboard.press('Backspace');
  expect((await state(page)).boxes.map((x) => x.id)).toEqual(['b2']);
  await clickCanvas(page, 600, 200);
  await page.keyboard.press('Delete');
  expect((await state(page)).boxes).toEqual([]);
  expect(errors).toEqual([]);
});

/* ---------- 輸出 ---------- */

test('下載 PNG：檔名、尺寸、像素（照片、方框線、標籤；不含選取標示），與預覽逐像素相同（F42、F43）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [300, 250], [700, 600]);
  await expect(page.getByTestId('selection')).toBeVisible();
  const [b] = (await state(page)).boxes;
  const { name, png } = await downloadPng(page);
  expect(name).toBe('ai-fail-meme.png');
  expect([png.width, png.height]).toEqual([1200, 900]);
  expect(near(png.at(100, 100), RED)).toBe(true);
  expect(near(png.at(1100, 100), BLUE)).toBe(true);
  expect(near(png.at(100, 800), GREEN)).toBe(true);
  expect(near(png.at(1100, 800), YELLOW)).toBe(true);
  expect(png.at(100, 100)[3]).toBe(255);
  /* 方框的左邊線（綠）；選取標示的位置（框外 5 px）只有照片的顏色 */
  expect(near(png.at(Math.round(b.x), 500), BOX_GREEN, 30)).toBe(true);
  expect(near(png.at(Math.round(b.x) - 6, 500), GREEN)).toBe(true);
  expect(near(png.at(Math.round(b.x + b.width / 2), Math.round(b.y) - 6), RED)).toBe(true);
  /* 與預覽畫布逐像素相同（比對雜湊） */
  const fnv = (d: ArrayLike<number>) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
    return h >>> 0;
  };
  const previewHash = await canvas(page).evaluate((el) => {
    const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, 1200, 900).data ?? [];
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
    return h >>> 0;
  });
  expect(png.px.length).toBe(1200 * 900 * 4);
  expect(fnv(png.px)).toBe(previewHash);
  expect(errors).toEqual([]);
});

/* ---------- 儲存、復原、專案檔 ---------- */

test('自動儲存與還原、照片讀不到的提醒；復原／重做（按鈕與快捷鍵，拖曳算一步）（F49、F50）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadPhoto(page);
  await drawBox(page, [300, 250], [700, 600]);
  const b0 = (await state(page)).boxes[0];
  /* 拖曳移動：整次算一步 */
  await dragCanvas(page, [500, 400], [600, 450], 10);
  expect((await state(page)).boxes[0].x).toBeCloseTo(b0.x + 100, 0);
  await page.keyboard.press('Control+z');
  expect((await state(page)).boxes[0].x).toBeCloseTo(b0.x, 5);
  await page.keyboard.press('Control+z');
  expect((await state(page)).boxes).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).boxes).toHaveLength(1);
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).boxes[0].x).toBeCloseTo(b0.x + 100, 0);
  await page.getByRole('button', { name: /^復原/ }).click();
  await page.keyboard.press('Control+y');
  expect((await state(page)).boxes[0].x).toBeCloseTo(b0.x + 100, 0);
  /* 文字欄：從聚焦到離開算一步 */
  await clickCanvas(page, 550, 450);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  const label = panel(page).getByRole('textbox', { name: '標籤文字' });
  await label.fill('');
  await label.pressSequentially('dog');
  await label.blur();
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).boxes[0].label).toBe('object');
  await page.getByRole('button', { name: /^重做/ }).click();
  expect((await state(page)).boxes[0].label).toBe('dog');

  /* 重新整理：照片與框都還原（選取不保存） */
  const before = await state(page);
  await page.reload();
  await expect(canvas(page)).toHaveAttribute('data-size', '1200x900');
  await expect(downloadBtn(page)).toBeEnabled();
  expect(await state(page)).toEqual(before);
  await expect(rows(page)).toHaveCount(1);
  await expect(layer(page)).toHaveAttribute('data-selected', '');
  expect(near(await pixel(page, 100, 100), RED)).toBe(true);
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();

  /* 照片讀不到（例如已從瀏覽器清除）：提醒重新選擇，不能下載 */
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    raw.state.data.photo.id = 'amissingphoto0';
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('上次的照片讀不到了')).toBeVisible();
  await expect(downloadBtn(page)).toBeDisabled();
  await loadPhoto(page);
  await expect(page.getByText('上次的照片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋照片）、重設、開啟還原；缺照片的不套用（F51）', async ({ page }) => {
  const errors = await open(page);
  await radio(page, '1:1（正方形）').click();
  await loadPhoto(page);
  await drawBox(page, [300, 250], [700, 600]);
  await panel(page).getByRole('textbox', { name: '標籤文字' }).fill('cat 0.98');
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^ai-fail_\d{8}.*\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('ai-fail');
  expect(project.data.aspect).toBe('1:1');
  expect(project.data.boxes[0]).toMatchObject({ label: 'cat 0.98', color: '#59b64c' });
  const photoId = project.data.photo.id;
  const photoFile = Object.keys(entries).find((k) => k.startsWith(`files/${photoId}`));
  expect(photoFile).toBe(`files/${photoId}.png`);

  /* 重設 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1000x1000');
  await expect(page.getByTestId('empty-pick')).toBeVisible();
  expect((await state(page)).boxes).toEqual([]);

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
  await expect(canvas(page)).toHaveAttribute('data-size', '1000x1000');
  await expect(downloadBtn(page)).toBeEnabled();
  expect((await state(page)).boxes[0].label).toBe('cat 0.98');
  expect(near(await pixel(page, 50, 50), RED)).toBe(true);

  /* 缺照片（這個瀏覽器沒有、ZIP 裡也沒有）：不套用 */
  const missing = {
    ...project,
    data: { ...project.data, photo: { ...project.data.photo, id: 'anotherphoto1' }, boxes: [] },
  };
  await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
  await expect(page.getByText('專案檔裡少了照片，或照片無法讀取。').first()).toBeVisible();
  expect((await state(page)).boxes).toHaveLength(1);
  expect(errors).toEqual([]);
});

/* ---------- 觸控 ---------- */

test('觸控：畫框、移動、拖控制點、平移照片（F53）', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  await radio(page, '1:1（正方形）').click();
  await loadPhoto(page);
  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (a: [number, number], b: [number, number]) => {
    const p = await at(page, a[0], a[1]);
    const q = await at(page, b[0], b[1]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: p.x + ((q.x - p.x) * i) / 5, y: p.y + ((q.y - p.y) * i) / 5 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await radio(page, '新增框').tap();
  await touchDrag([200, 200], [500, 500]);
  let [b] = (await state(page)).boxes;
  expect(b.width).toBeCloseTo(300, 0);
  await expect(layer(page)).toHaveAttribute('data-selected', 'b1');
  await touchDrag([350, 350], [450, 400]);
  [b] = (await state(page)).boxes;
  expect(b.x).toBeCloseTo(300, 0);
  expect(b.y).toBeCloseTo(250, 0);
  await touchDrag([b.x + b.width, b.y + b.height], [b.x + b.width + 100, b.y + b.height + 50]);
  [b] = (await state(page)).boxes;
  expect(b.width).toBeCloseTo(400, 0);
  expect(b.height).toBeCloseTo(350, 0);
  const x0 = (await state(page)).view.x;
  await touchDrag([100, 900], [180, 700]);
  expect((await state(page)).view.x).toBeCloseTo(x0 + 80, 0);
  expect((await state(page)).view.y).toBe(0);
  await expect(layer(page)).toHaveAttribute('data-selected', '');
  expect(errors).toEqual([]);
  await ctx.close();
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));
  const errors = await open(page);
  await noHorizontalScroll(page);
  await loadPhoto(page);
  await drawBox(page, [300, 250], [700, 600]);
  await drawBox(page, [760, 400], [1100, 700]);
  await panel(page).getByRole('textbox', { name: '標籤文字' }).fill('cat 0.98');
  await panel(page).getByRole('textbox', { name: '標籤文字' }).blur();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('ai-fail-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('ai-fail-390.png', { fullPage: true });
  await page.goto(URL);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
