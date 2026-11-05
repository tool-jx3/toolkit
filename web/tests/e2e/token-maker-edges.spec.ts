/**
 * VTT 棋子產生器 2026-11-05 跟進 token-workshop（ce4c62b）的端對端測試（規格 F08 修訂、F20 修訂、F78～F89）：
 * - 讀新版 TW 匯出的 PNG 與 WebP（rle8 的軟遮罩：半透明留著；色彩平衡、色彩調整、去光暈對應過來），
 *   再匯出時嵌入的設定帶著色彩平衡與去光暈；測試檔 tests/fixtures/tw-ce4c62b-rle8.* 是用原作的程式產生的；
 * - 套索（L、Shift 去掉、一步復原）；
 * - 不透明圖的自動（軟選取）與靈敏度、內縮／外擴的滑桿；
 * - 一鍵修邊（邊緣變半透明＋打開去光暈＝一步復原）、去雜點與填洞、去掉小縫隙；
 * - 檢視遮罩（M）、桌面尺寸預覽、鍵盤操作（方向鍵移動游標、Enter 套用、Shift＋Enter 去掉）；
 * - 漸層的色彩平衡。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { encodePng, readPngText } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('token-maker') ?? { id: 'token-maker', status: 'next' })}/`;
const N = 1024;

test.use({ viewport: { width: 1280, height: 900 } });

const fixture = (name: string) =>
  readFileSync(new globalThis.URL(`../fixtures/${name}`, import.meta.url));

type Rgba = [number, number, number, number];
const GREEN: Rgba = [40, 160, 60, 255];
const SKIN: Rgba = [240, 200, 160, 255];
const BLUE: Rgba = [40, 80, 220, 255];
const PURPLE: Rgba = [130, 40, 160, 255];

/** 400 × 400 不透明：綠底、中間膚色的頭（中心 200, 160、半徑 90）、上面藍色的帽子（x 150～250、y 10～70）、下面紫色的身體 */
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

/** 300 × 300 白底、紅色的圓（中心 150, 150、半徑 90；邊緣 3 px 漸漸混白，像毛邊） */
async function fuzzyPng(): Promise<Buffer> {
  const w = 300;
  const px = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - 150, y + 0.5 - 150);
      const a = Math.max(0, Math.min(1, (93 - d) / 6));
      px.set(
        [
          Math.round(200 * a + 250 * (1 - a)),
          Math.round(40 * a + 250 * (1 - a)),
          Math.round(40 * a + 250 * (1 - a)),
          255,
        ],
        (y * w + x) * 4,
      );
    }
  return Buffer.from(await encodePng(px, w, w));
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

interface Token {
  id: string;
  image: { id: string; name: string; width: number; height: number } | null;
  view: { x: number; y: number; zoom: number; rotate: number; flip: boolean };
  mask: { id: string; width: number; height: number } | null;
  popOn: boolean;
  name: string;
  adjust: { bright: number; contrast: number; sat: number; hue: number };
  halo?: number;
}
interface Doc {
  look: Record<string, unknown>;
  tokens: Token[];
  current: string | null;
}
interface MaskStats {
  width: number;
  height: number;
  zero: number;
  full: number;
  partial: number;
}
type Hook = {
  __tokenMaker: {
    doc: () => Doc;
    pad: () => number;
    maskStats: () => MaskStats | null;
    ui: () => { maskView: boolean };
  };
};

const doc = (page: Page): Promise<Doc> =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.doc());
const cur = async (page: Page) => {
  const d = await doc(page);
  return d.tokens.find((t) => t.id === d.current) as Token;
};
const stats = (page: Page): Promise<MaskStats | null> =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.maskStats());
const padOf = (page: Page): Promise<number> =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.pad());

const dropInput = (page: Page) =>
  page.getByRole('group', { name: '圖片載入區' }).locator('input[type=file]');
const layer = (page: Page) => page.getByTestId('token-interaction');
const tab = (page: Page, name: '圖片' | '出框' | '外框' | '名字' | '效果' | '匯出') =>
  page.getByRole('tab', { name });
const toolBtn = (page: Page, name: '移動' | '魔術棒' | '套索' | '筆刷') =>
  page.getByRole('toolbar', { name: '預覽的工具' }).getByRole('button', { name, exact: true });
const ratio = (page: Page) => page.getByTestId('selection-ratio');
const ratioNum = async (page: Page) =>
  Number((await ratio(page).textContent())?.match(/[\d.]+/)?.[0] ?? 0);

async function loadImage(page: Page, buffer: Buffer, name = 'hero.png') {
  await dropInput(page).setInputFiles(file(name, buffer));
  await expect(page.getByTestId('image-info')).toContainText(name);
  await expect(layer(page)).toBeVisible();
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

/** 在預覽上依序拖過這些圖片上的點（套索） */
async function dragPath(page: Page, pts: [number, number][]) {
  const first = await imageToScreen(page, pts[0][0], pts[0][1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [u, v] of pts.slice(1)) {
    const p = await imageToScreen(page, u, v);
    await page.mouse.move(p.x, p.y, { steps: 8 });
  }
  await page.mouse.up();
}

const canUndo = (page: Page) =>
  page.evaluate(() =>
    (window as never as { __tokenMaker: { canUndo: () => boolean } }).__tokenMaker.canUndo(),
  );

/* ---------- 測試 ---------- */

test('讀新版 token-workshop 的 PNG（rle8 軟遮罩）與 WebP：半透明留著、新的設定對應過來；再匯出時嵌入色彩平衡與去光暈', async ({
  page,
}) => {
  const errors = await open(page);
  const want = JSON.parse(fixture('tw-ce4c62b-rle8.json').toString()) as { mask: number[] };
  const nonzero = want.mask.filter((v) => v > 0).length;
  const partial = want.mask.filter((v) => v > 0 && v < 255).length;
  await dropInput(page).setInputFiles(file('tw-rle8.png', fixture('tw-ce4c62b-rle8.png')));
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('這張圖嵌了棋子的設定');
  await dialog.getByRole('button', { name: '開啟成棋子' }).click();
  await expect(page.getByText('已開啟 1 個嵌了設定的棋子').first()).toBeVisible();
  const t = await cur(page);
  expect(t.image?.name).toBe('tw-rle8');
  expect([t.image?.width, t.image?.height]).toEqual([48, 40]);
  expect(t.halo).toBe(80);
  expect(t.adjust).toEqual({ bright: 120, contrast: 90, sat: 130, hue: 0 });
  expect(t.view.flip).toBe(true);
  const look = (await doc(page)).look;
  expect(look).toMatchObject({ frame: 'gear', colorMode: 'gradient', gMid: 30 });
  /* 軟遮罩：半透明的像素數和原作解出來的一樣 */
  await expect.poll(async () => (await stats(page))?.partial).toBe(partial);
  expect((await stats(page))?.zero).toBe(1920 - nonzero);
  /* 「外框」分頁：漸層的色彩平衡是 30% */
  await tab(page, '外框').click();
  await expect(page.getByRole('spinbutton', { name: '色彩平衡' })).toHaveValue('30');

  /* 再匯出：嵌入的設定帶著色彩平衡與去光暈 */
  await tab(page, '匯出').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  const text = readPngText(
    new Uint8Array(readFileSync((await dl.path()) as string)),
    'trpg-toolkit',
  );
  const embedded = JSON.parse(text ?? '{}');
  expect(embedded.look.gMid).toBe(30);
  expect(embedded.token.halo).toBe(80);

  /* WebP（RIFF 的 TKWS chunk）也一樣 */
  await tab(page, '圖片').click();
  await dropInput(page).setInputFiles(
    file('tw-rle8.webp', fixture('tw-ce4c62b-rle8.webp'), 'image/webp'),
  );
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟成棋子' }).click();
  await expect.poll(async () => (await doc(page)).tokens.length).toBe(2);
  expect((await cur(page)).image?.name).toBe('tw-rle8');
  expect((await cur(page)).halo).toBe(80);
  await expect.poll(async () => (await stats(page))?.partial).toBe(partial);
  /* 當成一般圖片：就是那張 WebP（64 × 64），沒有出框 */
  await dropInput(page).setInputFiles(
    file('plain.webp', fixture('tw-ce4c62b-rle8.webp'), 'image/webp'),
  );
  await page.getByRole('alertdialog').getByRole('button', { name: '當成一般圖片' }).click();
  await expect.poll(async () => (await cur(page)).image?.name).toBe('plain.webp');
  expect((await cur(page)).image?.width).toBe(64);
  expect((await cur(page)).mask).toBeNull();
  expect(errors).toEqual([]);
});

test('套索：L、圈出帽子加入、Shift 圈去掉、一筆一步復原', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page.keyboard.press('l');
  await expect(toolBtn(page, '套索')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-badge')).toHaveText('套索・加入');
  await expect(page.getByTestId('lasso-options')).toBeVisible();
  /* 圈帽子（x 150～250、y 10～70）外面一點的長方形：選到 102 × 62 ÷ 400 × 400 ≈ 4% */
  await dragPath(page, [
    [149, 9],
    [251, 9],
    [251, 71],
    [149, 71],
  ]);
  await expect.poll(() => ratioNum(page)).toBeGreaterThan(3.7);
  expect(await ratioNum(page)).toBeLessThan(4.3);
  await expect(page.getByTestId('token-hint')).toHaveText(/圈進了圖片的/);
  /* 按住 Shift 圈左半邊：去掉 */
  await page.keyboard.down('Shift');
  await dragPath(page, [
    [140, 0],
    [200, 0],
    [200, 80],
    [140, 80],
  ]);
  await page.keyboard.up('Shift');
  await expect.poll(() => ratioNum(page)).toBeLessThan(2.3);
  await expect(page.getByTestId('token-hint')).toHaveText(/去掉了圖片的/);
  /* 一圈＝一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(() => ratioNum(page)).toBeGreaterThan(3.7);
  /* Esc 回到移動 */
  await page.keyboard.press('Escape');
  await expect(toolBtn(page, '移動')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('不透明圖的自動（軟選取）、內縮／外擴與靈敏度的滑桿、自動時順便修邊的開關', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page
    .getByRole('toolbar', { name: '預覽的工具' })
    .getByRole('button', { name: '自動' })
    .click();
  await expect(page.getByText(/已自動選出主體（邊緣是半透明的/).first()).toBeVisible();
  /* 頭、帽子、身體 ≈ 42% */
  const auto = await ratioNum(page);
  expect(auto).toBeGreaterThan(38);
  expect(auto).toBeLessThan(46);
  expect((await cur(page)).halo).toBe(100);
  const full = (await stats(page))?.full ?? 0;
  /* 內縮 6 px：重新自動選取，整圈輪廓往內淡掉（全選的像素變少；放開才一步） */
  await tab(page, '出框').click();
  const shrink = page.getByRole('spinbutton', { name: '內縮／外擴' });
  await shrink.fill('6');
  await shrink.press('Enter');
  await expect.poll(async () => (await stats(page))?.full ?? 0).toBeLessThan(full * 0.9);
  /* 復原回到內縮之前 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stats(page))?.full).toBe(full);
  await shrink.fill('0');
  await shrink.press('Enter');
  /* 關掉「自動時順便修邊」：遮罩是硬的、不打開去光暈 */
  await page.getByRole('switch', { name: '自動時順便修邊' }).click();
  await page.getByRole('button', { name: '清除', exact: true }).first().click();
  await expect(ratio(page)).toHaveText('還沒有選取');
  await page
    .getByRole('toolbar', { name: '預覽的工具' })
    .getByRole('button', { name: '自動' })
    .click();
  await expect.poll(() => ratioNum(page)).toBeGreaterThan(38);
  await expect.poll(async () => (await stats(page))?.partial).toBe(0);
  expect((await cur(page)).halo).toBeUndefined();
  expect(errors).toEqual([]);
});

test('一鍵修邊（邊緣半透明＋去光暈＝一步）、去雜點與填洞、去掉小縫隙、檢視遮罩（M）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await fuzzyPng(), 'fuzzy.png');
  /* 魔術棒點圓的中間（硬的選取） */
  await page.keyboard.press('w');
  const c = await imageToScreen(page, 150, 150);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await expect.poll(async () => (await stats(page))?.partial).toBe(0);
  await tab(page, '出框').click();
  await page.getByRole('button', { name: '一鍵修邊' }).click();
  await expect(page.getByText(/已修好邊緣/).first()).toBeVisible();
  await expect.poll(async () => (await stats(page))?.partial ?? 0).toBeGreaterThan(50);
  expect((await cur(page)).halo).toBe(100);
  await expect(page.getByRole('spinbutton', { name: '去光暈' })).toHaveValue('100');
  /* 一步復原：遮罩與去光暈一起回去 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stats(page))?.partial).toBe(0);
  expect((await cur(page)).halo).toBeUndefined();
  /* 去雜點與填洞：這個選取沒有 */
  await page.getByRole('button', { name: '去雜點與填洞' }).click();
  await expect(page.getByText('沒有這麼小的雜點或洞。').first()).toBeVisible();
  /* 去掉小縫隙：沒有縫，不記一步 */
  const before = (await cur(page)).mask?.id;
  const gap = page.getByRole('spinbutton', { name: '去掉小縫隙' });
  await gap.fill('8');
  await gap.press('Enter');
  await expect(page.getByText(/沒有找到這麼窄|去掉了 \d+ 個縫隙/).first()).toBeVisible();
  /* 檢視遮罩（M）：預覽的提示層整片黑底 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('m');
  await expect
    .poll(() => page.evaluate(() => (window as never as Hook).__tokenMaker.ui().maskView))
    .toBe(true);
  const corner = () =>
    page.getByTestId('token-overlay').evaluate((c: HTMLCanvasElement) => {
      const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(2, 2, 1, 1).data;
      return Array.from(d);
    });
  await expect.poll(corner).toEqual([0, 0, 0, 255]);
  await expect(page.getByRole('switch', { name: '檢視遮罩' })).toBeChecked();
  await page.keyboard.press('m');
  await expect.poll(corner).not.toEqual([0, 0, 0, 255]);
  expect(typeof before).toBe('string');
  expect(errors).toEqual([]);
});

test('鍵盤操作：預覽有焦點、魔術棒時方向鍵移動游標、Enter 選取、Shift＋Enter 去掉；圖片不動', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await page.keyboard.press('w');
  /* 用 Tab 移到預覽（點一下會用魔術棒，所以用 focus） */
  await layer(page).focus();
  const view = (await cur(page)).view;
  /* 游標從中間開始（頭）：Enter 選到膚色的頭 */
  await page.keyboard.press('Enter');
  await expect.poll(() => ratioNum(page)).toBeGreaterThan(14);
  const head = await ratioNum(page);
  expect(head).toBeLessThan(18);
  /* 往下移到身體（Shift 5%）：Enter 加入身體 */
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(() => ratioNum(page)).toBeGreaterThan(head + 10);
  /* Shift＋Enter：去掉身體 */
  await page.keyboard.press('Shift+Enter');
  await expect.poll(() => ratioNum(page)).toBeCloseTo(head, 0);
  /* 方向鍵沒有移動圖片 */
  expect((await cur(page)).view).toEqual(view);
  /* 移動工具：方向鍵照樣移動圖片 */
  await page.keyboard.press('v');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await cur(page)).view.x).toBeCloseTo(-0.01);
  expect(errors).toEqual([]);
});

test('桌面尺寸預覽（40、80、120 px）與漸層的色彩平衡', async ({ page }) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await expect(page.getByTestId('table-strip')).toHaveCount(0);
  await page.getByTestId('mask-menu').click();
  await page.getByRole('menuitem', { name: '顯示桌面尺寸預覽' }).click();
  const strip = page.getByTestId('table-strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('canvas')).toHaveCount(3);
  /* 小預覽畫出來了（中間不是透明的） */
  await expect
    .poll(() =>
      strip
        .locator('canvas')
        .nth(2)
        .evaluate((c: HTMLCanvasElement) => {
          const x = c.getContext('2d') as CanvasRenderingContext2D;
          return x.getImageData(c.width / 2, c.height / 2, 1, 1).data[3];
        }),
    )
    .toBe(255);
  const sizes = await strip
    .locator('canvas')
    .evaluateAll((cs) => cs.map((c) => (c as HTMLCanvasElement).getBoundingClientRect().width));
  expect(sizes.map(Math.round)).toEqual([40, 80, 120]);

  /* 漸層：選熔岩漸層 → 色彩平衡出現（50%）；改成 20%；再選別的漸層回到 50% */
  await tab(page, '外框').click();
  await expect(page.getByRole('spinbutton', { name: '色彩平衡' })).toHaveCount(0);
  await page.getByRole('button', { name: '熔岩漸層' }).click();
  const mid = page.getByRole('spinbutton', { name: '色彩平衡' });
  await expect(mid).toHaveValue('50');
  await mid.fill('20');
  await mid.press('Enter');
  await expect.poll(async () => (await doc(page)).look.gMid).toBe(20);
  expect(await canUndo(page)).toBe(true);
  await page.getByRole('button', { name: '冰霜漸層' }).click();
  await expect(mid).toHaveValue('50');
  expect(errors).toEqual([]);
});
