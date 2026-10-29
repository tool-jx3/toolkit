/**
 * VTT 棋子產生器（建置產物 next/token-maker/）的端對端測試（規格 docs/refactor/specs/token-maker.md）：
 * - 開頁沒有錯誤、空白預覽（點一下選圖）、頁尾只有靈感來源；
 * - 讀圖 → 擺放（拖曳、滾輪、Shift＋滾輪、方向鍵、鏡像、重設、兩指捏合）→ 出框（魔術棒、Alt、容許度、筆刷、自動、清除、讀入遮罩圖）；
 * - 匯出 PNG（解碼檢查尺寸、四角透明、出框的像素在外框之外、檔名）、尺寸預設與自訂；
 * - 名單（一次讀好幾張、切換、移除、清空）、編號組與全部打包的 ZIP（解開檢查檔名、尺寸、徽章）、
 *   把設定嵌進 PNG 再讀回來（開啟成棋子／當成一般圖片）、名字與徽章（拖曳與吸附）、預設外觀、自訂外框與遮罩、
 *   參考輪廓（只在預覽）、效果、自動配色；
 * - 自動儲存與重新整理、復原；390 寬每個分頁都沒有橫向捲動；1280 與 390 的視覺基準。
 * 測試圖片都由程式產生。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('token-maker') ?? { id: 'token-maker', status: 'next' })}/`;
const N = 1024;

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const GREEN: Rgba = [40, 160, 60, 255];
const SKIN: Rgba = [240, 200, 160, 255];
const BLUE: Rgba = [40, 80, 220, 255];
const PURPLE: Rgba = [130, 40, 160, 255];

/** 400 × 400 不透明：綠底、中間膚色的頭、上面藍色的帽子（x 150～250、y 10～70）、下面紫色的身體 */
async function heroPng(): Promise<Buffer> {
  const w = 400;
  const h = 400;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c =
        x >= 150 && x < 250 && y >= 10 && y < 70
          ? BLUE
          : (x - 200) ** 2 + (y - 160) ** 2 < 90 ** 2
            ? SKIN
            : y > 280 && Math.abs(x - 200) < 150
              ? PURPLE
              : GREEN;
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

/** 300 × 400 透明背景：橘色的圓（中心 150, 150、半徑 100）＋下面的長方形 */
async function cutoutPng(): Promise<Buffer> {
  const w = 300;
  const h = 400;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((x - 150) ** 2 + (y - 150) ** 2 < 100 ** 2 || (y > 250 && x > 50 && x < 250))
        px.set([240, 120, 20, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 遮罩圖：上半白、下半黑（不透明） */
async function halfMaskPng(): Promise<Buffer> {
  const w = 40;
  const h = 40;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(y < 20 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * w + x) * 4);
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
  await expect(page.getByRole('heading', { level: 1, name: 'VTT 棋子產生器' })).toBeVisible();
  return errors;
}

interface View {
  x: number;
  y: number;
  zoom: number;
  rotate: number;
  flip: boolean;
}
interface Token {
  id: string;
  image: { id: string; name: string; width: number; height: number } | null;
  view: View;
  mask: { id: string; width: number; height: number } | null;
  popOn: boolean;
  name: string;
  badge: string;
  adjust: { bright: number; contrast: number; sat: number; hue: number };
}
interface Doc {
  look: Record<string, unknown> & { fx: Record<string, unknown> };
  tokens: Token[];
  current: string | null;
  custom: { frame: { id: string; name: string } | null; mask: { id: string; name: string } | null };
}

const doc = (page: Page): Promise<Doc> =>
  page.evaluate(() => (window as never as { __tokenMaker: { doc: () => Doc } }).__tokenMaker.doc());
const padOf = (page: Page): Promise<number> =>
  page.evaluate(() =>
    (window as never as { __tokenMaker: { pad: () => number } }).__tokenMaker.pad(),
  );
const cur = async (page: Page) => {
  const d = await doc(page);
  return d.tokens.find((t) => t.id === d.current) as Token;
};

const dropInput = (page: Page) =>
  page.getByRole('group', { name: '圖片載入區' }).locator('input[type=file]');
const layer = (page: Page) => page.getByTestId('token-interaction');
const tab = (page: Page, name: '圖片' | '出框' | '外框' | '名字' | '效果' | '匯出') =>
  page.getByRole('tab', { name });
const toolBtn = (page: Page, name: '移動' | '魔術棒' | '筆刷') =>
  page.getByRole('toolbar', { name: '預覽的工具' }).getByRole('button', { name, exact: true });
const ratio = (page: Page) => page.getByTestId('selection-ratio');

async function loadImage(page: Page, buffer: Buffer, name = 'hero.png') {
  await dropInput(page).setInputFiles(file(name, buffer));
  await expect(page.getByTestId('image-info')).toContainText(name);
  await expect(layer(page)).toBeVisible();
  /* 圖片讀好、畫上去了 */
  await expect.poll(async () => (await cur(page))?.image?.name).toBe(name);
}

/** 圖片的 px → 螢幕座標（依目前的擺放與邊距） */
async function imageToScreen(page: Page, u: number, v: number) {
  const t = await cur(page);
  const pad = await padOf(page);
  const img = t.image as NonNullable<Token['image']>;
  const R = N * (0.5 - pad);
  const s = ((2 * R) / Math.min(img.width, img.height)) * t.view.zoom;
  const a = (t.view.rotate * Math.PI) / 180;
  const f = t.view.flip ? -1 : 1;
  const lx = (u - img.width / 2) * s * f;
  const ly = (v - img.height / 2) * s;
  const x = N / 2 + t.view.x * R + lx * Math.cos(a) - ly * Math.sin(a);
  const y = N / 2 + t.view.y * R + lx * Math.sin(a) + ly * Math.cos(a);
  const b = await layer(page).boundingBox();
  if (!b) throw new Error('找不到預覽');
  return { x: b.x + (x / N) * b.width, y: b.y + (y / N) * b.height };
}

async function tokenToScreen(page: Page, x: number, y: number) {
  const b = await layer(page).boundingBox();
  if (!b) throw new Error('找不到預覽');
  return { x: b.x + (x / N) * b.width, y: b.y + (y / N) * b.height };
}

interface Png {
  width: number;
  height: number;
  at(x: number, y: number): Rgba;
  bytes: Uint8Array;
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
    bytes,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function downloadPng(page: Page): Promise<{ name: string; png: Png; path: string }> {
  await tab(page, '匯出').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  const path = (await dl.path()) as string;
  return { name: dl.suggestedFilename(), png: readPng(readFileSync(path)), path };
}

async function downloadZip(page: Page, testId: 'zip-all' | 'zip-set') {
  await tab(page, '匯出').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  return {
    name: dl.suggestedFilename(),
    files: unzipSync(new Uint8Array(readFileSync((await dl.path()) as string))),
  };
}

const roster = (page: Page) => page.getByRole('list', { name: '棋子名單' });

/** 400 × 400 的單色圖（名單用） */
async function solidPng(rgb: [number, number, number]): Promise<Buffer> {
  const px = new Uint8Array(400 * 400 * 4);
  for (let i = 0; i < px.length; i += 4) px.set([...rgb, 255], i);
  return Buffer.from(await encodePng(px, 400, 400));
}

/** 白色的環（自訂外框；外半徑 100、內半徑 75，200 × 200 透明背景） */
async function ringFramePng(): Promise<Buffer> {
  const n = 200;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - 100, y + 0.5 - 100);
      if (d >= 75 && d <= 99) px.set([255, 255, 255, 255], (y * n + x) * 4);
    }
  return Buffer.from(await encodePng(px, n, n));
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const near = (a: Rgba, b: Rgba, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** 棋子座標（R 為單位、相對中心）→ 螢幕座標 */
async function unitToScreen(page: Page, ux: number, uy: number) {
  const pad = await padOf(page);
  const R = N * (0.5 - pad);
  return tokenToScreen(page, N / 2 + ux * R, N / 2 + uy * R);
}

/* ---------- 測試 ---------- */

test('開頁：沒有錯誤、空白預覽點一下選圖、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('token-pick')).toBeVisible();
  await expect(page.getByText('靈感來源：')).toBeVisible();
  await expect(page.getByRole('link', { name: 'arcana-hanna/token-workshop' })).toHaveAttribute(
    'href',
    'https://github.com/arcana-hanna/token-workshop',
  );
  /* 沒有圖片時工具列停用、匯出提示先讀圖 */
  await expect(page.getByRole('button', { name: '自動' }).first()).toBeDisabled();
  await tab(page, '匯出').click();
  await expect(page.getByText('還沒有圖片：先讀入一張角色圖。')).toBeVisible();
  /* 點空白預覽開選檔視窗 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('token-pick').click(),
  ]);
  await chooser.setFiles(file('hero.png', await heroPng()));
  await expect.poll(async () => (await cur(page))?.image?.name).toBe('hero.png');
  expect(errors).toEqual([]);
});

test('擺放：拖曳平移、滾輪縮放、Shift＋滾輪旋轉、方向鍵、鏡像、重設、復原', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  expect((await cur(page)).view).toEqual({ x: 0, y: 0, zoom: 1, rotate: 0, flip: false });
  /* 拖曳：往右下 */
  const c = await tokenToScreen(page, 512, 512);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 30, { steps: 4 });
  await page.mouse.up();
  let v = (await cur(page)).view;
  expect(v.x).toBeGreaterThan(0.1);
  expect(v.y).toBeGreaterThan(0.05);
  /* 一次拖曳＝一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await cur(page)).view.x).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await cur(page)).view.x).toBeGreaterThan(0.1);
  /* 滾輪縮放（以游標為中心）、Shift＋滾輪旋轉 */
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await cur(page)).view.zoom).toBeGreaterThan(1.1);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await cur(page)).view.rotate).toBe(5);
  /* 鏡像：以中線翻，x 與旋轉反過來 */
  v = (await cur(page)).view;
  await page.getByRole('button', { name: '鏡像' }).click();
  const f = (await cur(page)).view;
  expect(f.flip).toBe(true);
  expect(f.x).toBeCloseTo(-v.x);
  expect(f.rotate).toBe(-5);
  /* 重設、方向鍵（1%、Shift 5%）、＋／－、[ ] 旋轉 */
  await page.getByRole('button', { name: '重設位置' }).click();
  expect((await cur(page)).view).toEqual({ x: 0, y: 0, zoom: 1, rotate: 0, flip: false });
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('=');
  await page.keyboard.press(']');
  v = (await cur(page)).view;
  expect(v.x).toBeCloseTo(0.01);
  expect(v.y).toBeCloseTo(-0.05);
  expect(v.zoom).toBeCloseTo(1.02);
  expect(v.rotate).toBe(1);
  await page.keyboard.press('0');
  expect((await cur(page)).view).toEqual({ x: 0, y: 0, zoom: 1, rotate: 0, flip: false });
  /* 縮放滑桿 */
  await page.getByRole('spinbutton', { name: '縮放' }).fill('150');
  await page.getByRole('spinbutton', { name: '縮放' }).press('Enter');
  await expect.poll(async () => (await cur(page)).view.zoom).toBeCloseTo(1.5);
  expect(errors).toEqual([]);
});

test('兩指捏合縮放（觸控）', async ({ page }) => {
  await open(page);
  await loadImage(page, await heroPng());
  const b = (await layer(page).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await layer(page).evaluate(
    (el, [cx, cy]) => {
      const ev = (type: string, id: number, x: number, y: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX: x,
            clientY: y,
            bubbles: true,
            isPrimary: id === 1,
          }),
        );
      ev('pointerdown', 1, cx - 40, cy);
      ev('pointerdown', 2, cx + 40, cy);
      ev('pointermove', 1, cx - 80, cy);
      ev('pointermove', 2, cx + 80, cy);
      ev('pointerup', 1, cx - 80, cy);
      ev('pointerup', 2, cx + 80, cy);
    },
    [cx, cy],
  );
  await expect.poll(async () => (await cur(page)).view.zoom).toBeCloseTo(2, 1);
  /* 捏合＝一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await cur(page)).view.zoom).toBe(1);
});

test('出框：魔術棒（加入、Alt 去掉、容許度重新選）、筆刷、清除、復原', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await expect(ratio(page)).toHaveText('還沒有選取');
  await page.keyboard.press('w');
  await expect(toolBtn(page, '魔術棒')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-badge')).toHaveText('魔術棒・加入');
  /* 點帽子：選到帽子（100 × 60 ÷ 400 × 400 ≈ 3.8%） */
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  await expect(page.getByTestId('token-hint')).toHaveText(/加入了圖片的/);
  /* 容許度拉高到 100：從同一點重新選（整張圖） */
  const slider = page.getByRole('spinbutton', { name: '容許度' });
  await slider.fill('100');
  await slider.press('Enter');
  await expect(ratio(page)).toHaveText('已選取圖片的 100%');
  await slider.fill('18');
  await slider.press('Enter');
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  /* 按住 Alt 點帽子：去掉 */
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('tool-badge')).toHaveText('魔術棒・去掉');
  await page.mouse.click(hat.x, hat.y);
  await page.keyboard.up('Alt');
  await expect(ratio(page)).toHaveText('還沒有選取');
  /* 復原回到有帽子 */
  await page.keyboard.press('Control+z');
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  /* 筆刷：塗頭的上半 */
  await page.keyboard.press('b');
  const a = await imageToScreen(page, 160, 130);
  const z = await imageToScreen(page, 240, 130);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => Number((await ratio(page).textContent())?.match(/[\d.]+/)?.[0] ?? 0))
    .toBeGreaterThan(5);
  /* 一筆＝一步復原 */
  await page.keyboard.press('Control+z');
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  /* Delete 清除 */
  await page.keyboard.press('Delete');
  await expect(ratio(page)).toHaveText('還沒有選取');
  expect((await cur(page)).mask).toBeNull();
  expect(errors).toEqual([]);
});

test('出框：自動（透明背景用透明度）、讀入遮罩圖、更多選單、遮罩跟著擺放', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await cutoutPng(), 'cut.png');
  await page
    .getByRole('toolbar', { name: '預覽的工具' })
    .getByRole('button', { name: '自動' })
    .click();
  await expect(page.getByText('已用圖片的透明度選出主體。').first()).toBeVisible();
  const area = ((Math.PI * 100 * 100 + 200 * 149) / (300 * 400)) * 100;
  await expect
    .poll(async () => Number((await ratio(page).textContent())?.match(/[\d.]+/)?.[0] ?? 0))
    .toBeCloseTo(area, -0.5);
  /* 反轉：剩下透明以外沒有（反轉只選看得到的） */
  await page.getByTestId('mask-menu').click();
  await page.getByRole('menuitem', { name: '反轉選取' }).click();
  await expect(ratio(page)).toHaveText('還沒有選取');
  await page.getByTestId('mask-menu').click();
  await page.getByRole('menuitem', { name: '全部選取' }).click();
  await expect(ratio(page)).toHaveText('已選取圖片的 100%');
  /* 讀入遮罩圖（不透明 → 亮度：上半白） */
  await tab(page, '出框').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '讀入遮罩圖…' }).click(),
  ]);
  await chooser.setFiles(file('mask.png', await halfMaskPng()));
  await expect(page.getByText('已讀入遮罩圖。').first()).toBeVisible();
  await expect(ratio(page)).toHaveText(/已選取圖片的 5[0-3]%/);
  /* 遮罩在圖片的座標：移動圖片時遮罩 id 不變 */
  const before = (await cur(page)).mask?.id;
  await page.keyboard.press('v');
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await cur(page)).mask?.id).toBe(before);
  expect((await cur(page)).view.x).toBeCloseTo(-0.05);
  expect(errors).toEqual([]);
});

test('匯出 PNG：尺寸、四角透明、出框的像素在外框之外、檔名；尺寸預設與自訂', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  /* 先改成手動邊距 20%（外框小一點），圖片往上移 0.3 R：帽子跑到外框外面，再點帽子出框 */
  await tab(page, '出框').click();
  await page.getByRole('switch', { name: '自動邊距' }).click();
  await page.getByRole('spinbutton', { name: '邊距' }).fill('20');
  await page.getByRole('spinbutton', { name: '邊距' }).press('Enter');
  await expect.poll(() => padOf(page)).toBeCloseTo(0.2);
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await cur(page)).view.y).toBeCloseTo(-0.3);
  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  /* 回到自動邊距：外框縮到剛好不切到帽子 */
  await page.getByRole('switch', { name: '自動邊距' }).click();
  await tab(page, '名字').click();
  await page.getByRole('textbox', { name: '名稱' }).fill('哥布林');
  await page.getByRole('textbox', { name: '名稱' }).blur();
  const pad = await padOf(page);
  expect(pad).toBeGreaterThan(0);

  const { name, png } = await downloadPng(page);
  expect(name).toBe('哥布林_512.png');
  expect([png.width, png.height]).toEqual([512, 512]);
  for (const [x, y] of [
    [0, 0],
    [511, 0],
    [0, 511],
    [511, 511],
  ] as [number, number][])
    expect(png.at(x, y)[3]).toBe(0);
  /* 藍色的帽子：有一部分在外框（半徑 R）外面 */
  const R = 512 * (0.5 - pad);
  let outside = 0;
  let farthest = 0;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const p = png.at(x, y);
      if (!near(p, BLUE, 30)) continue;
      const d = Math.hypot(x + 0.5 - 256, y + 0.5 - 256);
      farthest = Math.max(farthest, d);
      if (d > R + 2) outside++;
    }
  expect(outside).toBeGreaterThan(200);
  /* 自動邊距：最遠的帽子也在畫面裡（不被切掉） */
  expect(farthest).toBeLessThan(256);
  /* 外框（中心正下方的外框上）是金色、不是圖片 */
  const ring = png.at(256, Math.round(256 + R - 3));
  expect(ring[3]).toBe(255);
  expect(near(ring, GREEN, 60)).toBe(false);
  /* 關掉出框：外框外面沒有帽子 */
  await tab(page, '出框').click();
  await page.getByRole('switch', { name: '顯示出框' }).click();
  const off = await downloadPng(page);
  const Roff = 512 * (0.5 - (await padOf(page)));
  let blueOut = 0;
  for (let y = 0; y < 512; y += 2)
    for (let x = 0; x < 512; x += 2)
      if (near(off.png.at(x, y), BLUE, 30) && Math.hypot(x - 256, y - 256) > Roff + 2) blueOut++;
  expect(blueOut).toBe(0);

  /* 尺寸：Roll20 280、自訂 300 */
  await tab(page, '匯出').click();
  await page.getByTestId('size-select').click();
  await page.getByRole('option', { name: '280 px（Roll20）' }).click();
  const r20 = await downloadPng(page);
  expect(r20.name).toBe('哥布林_280.png');
  expect(r20.png.width).toBe(280);
  await page.getByTestId('size-select').click();
  await page.getByRole('option', { name: '自訂' }).click();
  await page.getByRole('spinbutton', { name: '自訂尺寸' }).fill('300');
  await page.getByRole('spinbutton', { name: '自訂尺寸' }).press('Enter');
  const custom = await downloadPng(page);
  expect(custom.name).toBe('哥布林_300.png');
  expect([custom.png.width, custom.png.height]).toEqual([300, 300]);
  expect(errors).toEqual([]);
});

test('自動儲存：重新整理之後棋子、圖片、出框都還在', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await tab(page, '外框').click();
  await page
    .getByRole('radiogroup', { name: '外框樣式' })
    .getByRole('radio', { name: '齒輪', exact: true })
    .click();
  const before = await doc(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'VTT 棋子產生器' })).toBeVisible();
  const after = await doc(page);
  expect(after.tokens).toEqual(before.tokens);
  expect(after.look.frame).toBe('gear');
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  /* 預覽畫得出圖片（中心是膚色） */
  await expect
    .poll(() =>
      page.getByTestId('token-canvas').evaluate((el) => {
        const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(512, 512, 1, 1).data;
        return d ? [d[0], d[1], d[2]] : [];
      }),
    )
    .toEqual([SKIN[0], SKIN[1], SKIN[2]]);
  expect(errors).toEqual([]);
});

test('名單：一次讀好幾張、切換、移除（可以復原）、清空先確認；重新整理之後還在', async ({
  page,
}) => {
  const errors = await open(page);
  await dropInput(page).setInputFiles([
    file('red.png', await solidPng([220, 30, 30])),
    file('blue.png', await solidPng([30, 30, 220])),
    file('note.txt', Buffer.from('hello'), 'text/plain'),
  ]);
  await expect(page.getByText('已讀入 2 張圖片').first()).toBeVisible();
  await expect(page.getByText('「note.txt」不是圖片').first()).toBeVisible();
  await expect(roster(page).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('roster-count')).toHaveText('2／60 個');
  /* 選取第一個新的；點第二個切換（切換不算一步復原） */
  let d = await doc(page);
  expect(d.current).toBe(d.tokens[0].id);
  await roster(page).getByRole('listitem').nth(1).click();
  await expect.poll(async () => (await cur(page)).image?.name).toBe('blue.png');
  await expect(page.getByTestId('image-info')).toContainText('blue.png');
  /* 縮圖畫好了（不是佔位） */
  await expect(roster(page).locator('canvas')).toHaveCount(2);
  /* 每個棋子各自的擺放 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Shift+ArrowLeft');
  d = await doc(page);
  expect(d.tokens[1].view.x).toBeCloseTo(-0.05);
  expect(d.tokens[0].view.x).toBe(0);
  /* 移除（可以復原） */
  await roster(page).getByRole('button', { name: '移除「red」' }).click();
  await expect(roster(page).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(roster(page).getByRole('listitem')).toHaveCount(2);
  /* 換圖片：目前的棋子換一張圖 */
  await roster(page).getByRole('listitem').nth(1).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '換圖片' }).click(),
  ]);
  await chooser.setFiles(file('green.png', await solidPng([30, 200, 30])));
  await expect.poll(async () => (await cur(page)).image?.name).toBe('green.png');
  expect((await cur(page)).view.x).toBe(0);
  expect((await doc(page)).tokens).toHaveLength(2);
  /* 重新整理之後名單還在 */
  await page.reload();
  await expect(roster(page).getByRole('listitem')).toHaveCount(2);
  /* 清空：先確認 */
  await page.getByRole('button', { name: '清空名單' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('token-pick')).toBeVisible();
  expect((await doc(page)).tokens).toHaveLength(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).tokens.length).toBe(2);
  expect(errors).toEqual([]);
});

test('編號組與全部打包：ZIP 裡的檔名、尺寸；編號組的徽章 1～N', async ({ page }) => {
  const errors = await open(page);
  await dropInput(page).setInputFiles([
    file('red.png', await solidPng([220, 30, 30])),
    file('blue.png', await solidPng([30, 30, 220])),
  ]);
  await expect(roster(page).getByRole('listitem')).toHaveCount(2);
  await tab(page, '名字').click();
  await page.getByRole('textbox', { name: '名稱' }).fill('骷髏兵');
  await page.getByRole('textbox', { name: '名稱' }).blur();
  /* 徽章的底色改成純藍，量得到 */
  await page.getByTestId('badge-from').click();
  await page.getByRole('option', { name: '自訂' }).click();
  await page.getByRole('textbox', { name: '徽章的底色' }).fill('#0000ff');
  await page.getByRole('textbox', { name: '徽章的底色' }).press('Enter');
  await tab(page, '匯出').click();
  await page.getByTestId('size-select').click();
  await page.getByRole('option', { name: '256 px' }).click();
  await page.getByRole('spinbutton', { name: '張數' }).fill('3');
  await page.getByRole('spinbutton', { name: '張數' }).press('Enter');
  await expect(page.getByTestId('zip-set')).toHaveText('下載編號組（3 張）');
  const set = await downloadZip(page, 'zip-set');
  expect(set.name).toBe('骷髏兵_編號組3_256.zip');
  expect(Object.keys(set.files).sort()).toEqual([
    '骷髏兵_1_256.png',
    '骷髏兵_2_256.png',
    '骷髏兵_3_256.png',
  ]);
  const pngs = Object.values(set.files).map((b) => readPng(b));
  for (const p of pngs) expect([p.width, p.height]).toEqual([256, 256]);
  /* 徽章（右下 0.74 R）是藍色的；三張的徽章文字不同 → 像素不同 */
  const pad = await padOf(page);
  const R = 256 * (0.5 - pad);
  const bx = Math.round(128 + 0.74 * R);
  const badgeBlue = (p: Png) => {
    let n = 0;
    for (let y = bx - 12; y <= bx + 12; y++)
      for (let x = bx - 12; x <= bx + 12; x++) if (near(p.at(x, y), [0, 0, 255, 255], 30)) n++;
    return n;
  };
  for (const p of pngs) expect(badgeBlue(p)).toBeGreaterThan(80);
  const sig = (p: Png) =>
    Array.from(
      { length: 25 * 25 },
      (_, i) => p.at(bx - 12 + (i % 25), bx - 12 + Math.floor(i / 25))[0],
    ).join(',');
  expect(new Set(pngs.map(sig)).size).toBe(3);
  /* 全部打包：名單的每個棋子各一張（檔名照單張的規則） */
  const all = await downloadZip(page, 'zip-all');
  expect(all.name).toMatch(/^棋子_\d{8}-\d{4}_256\.zip$/);
  expect(Object.keys(all.files).sort()).toEqual(['blue_256.png', '骷髏兵_256.png'].sort());
  expect(errors).toEqual([]);
});

test('把設定嵌進 PNG：讀回來開啟成棋子（圖片、出框、擺放、名字、外觀）或當成一般圖片', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await page.keyboard.press('v');
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Shift+ArrowDown');
  await tab(page, '外框').click();
  await page
    .getByRole('radiogroup', { name: '外框樣式' })
    .getByRole('radio', { name: '鉚釘', exact: true })
    .click();
  await tab(page, '名字').click();
  await page.getByRole('textbox', { name: '名稱' }).fill('巫師');
  await page.getByRole('textbox', { name: '名稱' }).blur();
  const before = await cur(page);
  const { name, path } = await downloadPng(page);
  expect(name).toBe('巫師_512.png');
  const bytes = new Uint8Array(readFileSync(path));
  expect(parseChunks(bytes).some((c) => c.type === 'iTXt')).toBe(true);

  /* 外觀換掉、清空名單，再讀回來 */
  await tab(page, '外框').click();
  await page
    .getByRole('radiogroup', { name: '外框樣式' })
    .getByRole('radio', { name: '六角', exact: true })
    .click();
  await tab(page, '圖片').click();
  await page.getByRole('button', { name: '清空名單' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await dropInput(page).setInputFiles(file('巫師_512.png', Buffer.from(bytes)));
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('這張圖嵌了棋子的設定');
  await dialog.getByRole('button', { name: '開啟成棋子' }).click();
  await expect(page.getByText('已開啟 1 個嵌了設定的棋子').first()).toBeVisible();
  const t = await cur(page);
  expect(t.name).toBe('巫師');
  expect(t.view).toEqual(before.view);
  expect(t.image?.width).toBe(400);
  expect(t.mask).not.toBeNull();
  expect((await doc(page)).look.frame).toBe('studs');
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);

  /* 當成一般圖片：圖片就是那張 PNG（512 × 512），沒有出框 */
  await dropInput(page).setInputFiles(file('again.png', Buffer.from(bytes)));
  await page.getByRole('alertdialog').getByRole('button', { name: '當成一般圖片' }).click();
  await expect.poll(async () => (await cur(page)).image?.name).toBe('again.png');
  expect((await cur(page)).image?.width).toBe(512);
  expect((await cur(page)).mask).toBeNull();
  expect((await doc(page)).tokens).toHaveLength(2);
  /* 關掉嵌入：PNG 裡沒有 iTXt */
  await tab(page, '匯出').click();
  await page.getByRole('switch', { name: '把設定嵌進 PNG' }).click();
  const plain = await downloadPng(page);
  expect(parseChunks(new Uint8Array(readFileSync(plain.path))).some((c) => c.type === 'iTXt')).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test('名字與徽章：打開時先填好文字；在預覽上拖曳徽章會吸附到角落，Alt 不吸附', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '名字').click();
  await page.getByRole('switch', { name: '顯示名字' }).click();
  await expect(page.getByRole('textbox', { name: '名稱' })).toHaveValue('角色名');
  await expect(page.getByRole('textbox', { name: '徽章文字' })).toHaveValue('');
  await page.getByRole('switch', { name: '顯示徽章' }).click();
  await page.getByRole('switch', { name: '顯示徽章' }).click();
  await expect(page.getByRole('textbox', { name: '徽章文字' })).toHaveValue('1');
  await page.getByRole('radio', { name: '弧形文字' }).click();
  expect((await doc(page)).look.labelStyle).toBe('arc');
  /* 拖曳徽章：右下 → 接近左上 → 吸到 (-0.74, -0.74) */
  const from = await unitToScreen(page, 0.74, 0.74);
  const to = await unitToScreen(page, -0.68, -0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  let l = (await doc(page)).look;
  expect([l.badgeX, l.badgeY]).toEqual([-0.74, -0.74]);
  /* 一次拖曳＝一步復原 */
  await page.keyboard.press('Control+z');
  l = (await doc(page)).look;
  expect([l.badgeX, l.badgeY]).toEqual([0.74, 0.74]);
  /* Alt：不吸附 */
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  l = (await doc(page)).look;
  expect(l.badgeX as number).toBeCloseTo(-0.68, 1);
  expect(l.badgeY as number).toBeCloseTo(-0.8, 1);
  /* 拖曳名字不會移動圖片 */
  expect((await cur(page)).view.x).toBe(0);
  await page.getByRole('button', { name: '重設位置' }).click();
  l = (await doc(page)).look;
  expect([l.labelX, l.labelY, l.badgeX, l.badgeY]).toEqual([0, 0.8, 0.74, 0.74]);
  expect(errors).toEqual([]);
});

test('預設外觀、隨機、我的預設；效果；自動配色', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '外框').click();
  const presets = page.getByRole('radiogroup', { name: '預設外觀' });
  await presets.getByRole('radio', { name: '金色齒輪' }).click();
  let l = (await doc(page)).look;
  expect(l.frame).toBe('gear');
  await expect(presets.getByRole('radio', { name: '金色齒輪' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  /* 範例：整組外觀（含效果） */
  await presets.getByRole('radio', { name: '頭目' }).click();
  l = (await doc(page)).look;
  expect(l.frame).toBe('arcs');
  expect(l.fx.on).toBe(true);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).look.frame).toBe('gear');
  await page.getByTestId('preset-shuffle').click();
  /* 存成我的預設、套用、刪除 */
  await page.getByTestId('preset-name').fill('我的金環');
  await page.getByTestId('preset-save').click();
  await expect(page.getByText('已存成「我的金環」').first()).toBeVisible();
  const mine = page.getByRole('list', { name: '我的預設' });
  await expect(mine.getByRole('listitem')).toHaveCount(1);
  const saved = (await doc(page)).look.frame;
  await page
    .getByRole('radiogroup', { name: '外框樣式' })
    .getByRole('radio', { name: '方框', exact: true })
    .click();
  await mine
    .getByRole('button', { name: /我的金環/ })
    .first()
    .click();
  expect((await doc(page)).look.frame).toBe(saved);
  await mine.getByRole('button', { name: '刪除「我的金環」' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(mine).toHaveCount(0);
  /* 自動配色：外框色換成圖片裡的顏色 */
  await page.getByTestId('auto-color-frame').click();
  await expect.poll(async () => (await doc(page)).look.colorKey).toBe('custom');
  /* 效果：打開掃描線（順便打開總開關）、重設 */
  await tab(page, '效果').click();
  await page.getByRole('switch', { name: '掃描線' }).click();
  l = (await doc(page)).look;
  expect(l.fx.scan).toBe(true);
  expect(l.fx.on).toBe(true);
  await page.getByTestId('fx-reset').click();
  expect((await doc(page)).look.fx.on).toBe(false);
  expect(errors).toEqual([]);
});

test('自訂外框（自動偵測開口）與自訂遮罩；參考輪廓只在預覽', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '外框').click();
  await page.getByRole('button', { name: '自訂外框與遮罩' }).click();
  let [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('custom-frame-load').click(),
  ]);
  await chooser.setFiles(file('ring.png', await ringFramePng()));
  await expect(page.getByText(/已讀入自訂外框（開口半徑 \d+%）/).first()).toBeVisible();
  let d = await doc(page);
  expect(d.look.frame).toBe('custom');
  expect(d.custom.frame?.name).toBe('ring.png');
  /* 內半徑 75 ÷ 100 → 第 90 百分位＋4 px（512 上）≈ 76～78% */
  expect(d.look.customInner as number).toBeGreaterThanOrEqual(75);
  expect(d.look.customInner as number).toBeLessThanOrEqual(80);
  await expect(page.getByRole('spinbutton', { name: '開口半徑' })).toBeVisible();
  /* 預覽：環上是主色（金），開口裡是圖片 */
  const pad = await padOf(page);
  const R = N * (0.5 - pad);
  const at = (x: number, y: number) =>
    page
      .getByTestId('token-canvas')
      .evaluate(
        (el, [x, y]) =>
          Array.from(
            (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data ?? [],
          ),
        [x, y],
      );
  await expect.poll(async () => (await at(512, Math.round(512 - R * 0.87)))[3]).toBe(255);
  /* 自訂遮罩：右半黑 → 開口的右半被切掉 */
  const half = new Uint8Array(40 * 40 * 4);
  for (let i = 0; i < 1600; i++)
    half.set(i % 40 < 20 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
  [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('custom-mask-load').click(),
  ]);
  await chooser.setFiles(file('half.png', Buffer.from(await encodePng(half, 40, 40))));
  await expect(page.getByText('已讀入自訂遮罩。').first()).toBeVisible();
  await expect.poll(async () => (await at(512 + Math.round(R * 0.3), 512))[3]).toBe(0);
  expect((await at(512 - Math.round(R * 0.3), 512))[3]).toBe(255);
  /* 拿掉自訂外框：回到單純 */
  await page.getByRole('button', { name: '拿掉自訂外框' }).click();
  d = await doc(page);
  expect(d.look.frame).toBe('plain');
  await page.getByRole('button', { name: '拿掉自訂遮罩' }).click();
  /* 參考輪廓：提示層有青色的剪影，匯出不受影響（和關掉時的匯出一模一樣） */
  const plain = await downloadPng(page);
  await tab(page, '圖片').click();
  await page.getByRole('button', { name: '參考輪廓' }).click();
  await page.getByTestId('ref-kind').click();
  await page.getByRole('option', { name: '頭肩' }).click();
  await page.getByRole('radio', { name: '中心十字' }).click();
  const cyan = await page.getByTestId('token-overlay').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const p =
      c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
    let n = 0;
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 20 && p[i + 2] > p[i] + 40) n++;
    return n;
  });
  expect(cyan).toBeGreaterThan(5000);
  const withRef = await downloadPng(page);
  expect(Buffer.from(withRef.png.bytes).equals(Buffer.from(plain.png.bytes))).toBe(true);
  expect(errors).toEqual([]);
});

test('390 寬沒有橫向捲動；視覺基準 1280／390', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect(ratio(page)).toHaveText(/已選取圖片的 3\.\d%/);
  await page.keyboard.press('v');
  for (const b of await page.getByRole('button', { name: '關閉通知' }).all()) await b.click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('token-maker-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('token-maker-390.png', { fullPage: true });
  for (const t of ['出框', '外框', '名字', '效果', '匯出'] as const) {
    await tab(page, t).click();
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
