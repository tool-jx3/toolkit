/**
 * 壓克力周邊工房（建置產物 tools/acrylic-goods/）的端對端測試（WebGL 在無頭 Chromium 走 SwiftShader）：
 * - 開頁：沒有 console error、三種周邊的示範內容、外框與頁尾、分頁記住；
 * - 立牌：換正面圖、移除背面圖、正反面各自算（轉到背面換一塊）、底座開關與形狀、錯誤訊息（沒有正面圖、整張透明、不是圖片）；
 * - 搖搖樂：零件數、加零件與刪除、數量、外框形狀、錯誤訊息、物理（零件往下掉）、拖曳搖晃、搖一搖、陀螺儀（沉浸模式、傾斜、Esc 返回）；
 * - 立體透視：圖層深度與順序、間距、偏移與水平旋轉（不重建）、排序、錯誤訊息；
 * - 打光（打光盤的鍵盤操作、主光、環境光、重設）、自動旋轉、重設鏡頭、鍵盤轉動鏡頭、背景色與透明背景；
 * - 匯出：APNG（格數、延遲、循環、尺寸、倍率）、GIF（格數、延遲、透明）、WebP（ANIM／ANMF）、PNG（目前畫面、底色）、
 *   搖搖樂 90 格、GLB（檔頭、JSON、BIN）；
 * - 復原／重做、自動保存（重新整理後還原，含上傳的圖）、專案檔（存、重設、開）；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖（3D 畫面遮住，只比對介面）。
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { parseGlb } from '../../src/core/three/glbInfo';
import { getTool, outputDir } from '../../src/registry';
import { gifFrameRgba, parseGif } from '../helpers/gif';
import { composeApng, decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('acrylic-goods') ?? { id: 'acrylic-goods', status: 'next' })}/`;

type V3 = [number, number, number];
interface Info {
  kind: string;
  meshes: number;
  parts: number;
  layers: number;
  walls: number;
  outlinePoints: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  base: { width: number; depth: number } | null;
}
interface EngineInfo {
  camera: V3;
  target: V3;
  rotation: V3 | null;
  spin: number;
  keyLight: { position: V3; intensity: number };
  ambient: number;
  sides: { front: boolean; back: boolean } | null;
  parts: V3[];
  gravity: V3 | null;
  shake: { x: number; y: number };
  gyro: { gamma: number; beta: number } | null;
  layers: { id: string; position: V3; rotationY: number }[];
  bufferSize: { width: number; height: number };
  outputColorSpace: string;
  running: boolean;
  /** 組過幾次場景、最近一次組好的時間（performance.now()） */
  builds: number;
  builtAt: number;
}
interface Session {
  info: Info | null;
  error: string | null;
  building: boolean;
  exporting: boolean;
  immersive: boolean;
}

const call = <T>(page: Page, src: string, arg?: unknown) =>
  page.evaluate(
    ([s, a]) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const h = (window as any).__acrylicGoods;
      return new Function('h', 'a', `return (${s})(h, a)`)(h, a);
    },
    [src, arg] as const,
  ) as Promise<T>;

// biome-ignore lint/suspicious/noExplicitAny: 測試入口的設定
const settings = (page: Page) => call<any>(page, '(h) => h.settings()');
const session = (page: Page) => call<Session>(page, '(h) => h.session()');
const engine = (page: Page) => call<EngineInfo>(page, '(h) => h.engine()');
const setValue = (page: Page, path: string, value: unknown) =>
  call<void>(page, '(h, a) => h.set(a[0], a[1])', [path, value]);

async function open(page: Page, { fresh = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '壓克力周邊工房' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __acrylicGoods?: unknown }).__acrylicGoods,
  );
  if (fresh) await ready(page, 'stand');
  return errors;
}

/** 等到畫面上是 kind 的周邊（或錯誤） */
async function ready(page: Page, kind: string) {
  await expect
    .poll(async () => {
      const s = await session(page);
      return s.building ? 'building' : (s.info?.kind ?? s.error);
    })
    .toBe(kind);
}

async function expectError(page: Page, text: string) {
  await expect(page.getByTestId('build-error')).toHaveText(text);
  expect((await session(page)).info).toBeNull();
}

/** 測試用 PNG：fill(x, y) 回傳 [r, g, b, a] */
async function png(
  w: number,
  h: number,
  fill: (x: number, y: number) => number[],
): Promise<Buffer> {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
/** 粉紅圓頭＋藍色身體（舊版比對用的那張） */
const charPng = () =>
  png(300, 400, (x, y) =>
    Math.hypot(x - 150, y - 120) < 75
      ? [233, 30, 99, 255]
      : x >= 75 && x < 225 && y >= 180 && y < 380
        ? [63, 81, 181, 255]
        : [0, 0, 0, 0],
  );
const boxPng = (w: number, h: number, rgb: number[]) =>
  png(w, h, (x, y) =>
    x >= w * 0.1 && x < w * 0.9 && y >= h * 0.1 && y < h * 0.9 ? [...rgb, 255] : [0, 0, 0, 0],
  );
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

const slot = (page: Page, label: string) =>
  page.locator(`[data-image-slot="${label}"] input[type=file]`);

async function setNumber(page: Page, name: string, value: number) {
  const input = page.getByRole('spinbutton', { name, exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function exportAs(page: Page, format: 'APNG' | 'GIF' | 'WebP' | 'PNG') {
  await page.getByRole('radio', { name: format, exact: true }).click();
  await page.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path()) as string)),
  };
}

const at = (rgba: Uint8Array, w: number, x: number, y: number) =>
  Array.from(rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

test.describe.configure({ timeout: 180_000 });

test('開頁：示範內容、三個分頁、外框與頁尾、沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('壓克力周邊工房｜TRPG Toolkit');
  await expect(page.getByRole('link', { name: 'sotsotssi/acrylic-goods' })).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/acrylic-goods',
  );
  /* 不燒浮水印、不放作者署名 */
  await expect(page.getByText('@bb_uu_t')).toHaveCount(0);
  const stand = (await session(page)).info!;
  expect(stand).toMatchObject({ kind: 'stand', meshes: 4, base: { width: 300, depth: 300 } });
  const e = await engine(page);
  expect(e.bufferSize).toEqual({ width: 800, height: 800 });
  expect(e.outputColorSpace).toBe('srgb-linear');
  /* 燈光：舊版的強度 × π（現行物理單位） */
  expect(e.keyLight.position).toEqual([200, 300, 200]);
  expect(e.keyLight.intensity).toBeCloseTo(0.5 * Math.PI, 6);
  expect(e.ambient).toBeCloseTo(0.6 * Math.PI, 6);
  /* 畫面中央是立牌（不是透明） */
  expect((await call<number[]>(page, '(h) => h.pixel(400, 400)'))[3]).toBe(255);
  expect((await call<number[]>(page, '(h) => h.pixel(5, 5)'))[3]).toBe(0);
  await expect(page.locator('[data-viewport-background]')).toHaveAttribute(
    'data-viewport-background',
    '#eef1f5',
  );

  await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
  await ready(page, 'shaker');
  expect((await session(page)).info).toMatchObject({ parts: 11, walls: 32 });
  await expect(page.getByRole('button', { name: '搖一搖' })).toBeVisible();
  await page.getByRole('tab', { name: '壓克力立體透視' }).click();
  await ready(page, 'diorama');
  expect((await session(page)).info).toMatchObject({ layers: 3, meshes: 7 });
  await expect(page.getByRole('button', { name: '搖一搖' })).toHaveCount(0);
  /* 重新整理後停在同一個分頁 */
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __acrylicGoods?: unknown }).__acrylicGoods,
  );
  await ready(page, 'diorama');
  await expect(page.getByRole('tab', { name: '壓克力立體透視' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});

test('立牌：換圖、背面、正反面各自算、底座、錯誤訊息', async ({ page }) => {
  const errors = await open(page);
  await slot(page, '正面圖').setInputFiles(file('char.png', await charPng()));
  await expect(page.locator('[data-image-slot="正面圖"] [data-testid="image-size"]')).toHaveText(
    '300 × 400',
  );
  /* 外框＝不透明範圍（像素中心 75.5～224.5、45.5～379.5）＋四周各 15 */
  const height = async () => {
    const b = (await session(page)).info?.bounds;
    return b ? Math.round(b.maxY - b.minY) : null;
  };
  await expect.poll(async () => Math.abs(((await height()) ?? 0) - 364)).toBeLessThanOrEqual(2);
  let info = (await session(page)).info!;
  expect(info.bounds!.maxX - info.bounds!.minX).toBeCloseTo(179, 0);
  /* 移除背面圖：背面印正面圖（左右相反），只有一塊 */
  await page.getByRole('button', { name: '背面圖（可省略）：移除' }).click();
  await expect(
    page.locator('[data-image-slot="背面圖（可省略）"] [data-testid="image-name"]'),
  ).toHaveText('還沒有圖');
  await expect.poll(async () => (await engine(page)).sides).toBeNull();
  /* 正反面各自算（有背面圖時）：轉到背面時換成背面那一塊 */
  await slot(page, '背面圖（可省略）').setInputFiles(
    file('back.png', await boxPng(200, 300, [0, 150, 0])),
  );
  await page.getByRole('radio', { name: '正反面各自算' }).click();
  await expect.poll(async () => (await engine(page)).sides).toEqual({ front: true, back: false });
  await call(page, '(h) => h.rotateTo(Math.PI)');
  await expect.poll(async () => (await engine(page)).sides).toEqual({ front: false, back: true });
  await call(page, '(h) => h.rotateTo(0)');
  /* 底座：方形、依圖形狀（沒有底面圖時是方形）、關掉 */
  await page.getByRole('radio', { name: '方形' }).click();
  await setNumber(page, '大小', 100);
  await expect
    .poll(async () => (await session(page)).info?.base)
    .toEqual({ width: 200, depth: 200 });
  await page.getByRole('radio', { name: '依圖形狀' }).click();
  await expect(page.getByRole('spinbutton', { name: '大小', exact: true })).toHaveCount(0);
  await slot(page, '底面圖（可省略）').setInputFiles(
    file('base.png', await boxPng(400, 200, [200, 0, 0])),
  );
  await expect.poll(async () => (await session(page)).info?.base?.width).toBeCloseTo(320 + 30, -1);
  info = (await session(page)).info!;
  const withBase = info.meshes;
  await page.getByRole('switch', { name: '加底座' }).click();
  await expect.poll(async () => (await session(page)).info?.base).toBeNull();
  expect((await session(page)).info!.meshes).toBeLessThan(withBase);
  await page.getByRole('switch', { name: '加底座' }).click();

  /* 錯誤：整張透明、沒有正面圖、不是圖片 */
  await slot(page, '正面圖').setInputFiles(
    file('empty.png', await png(50, 50, () => [0, 0, 0, 0])),
  );
  await expectError(page, '抓不出外框（圖片可能整張都是透明的）。');
  await setValue(page, 'stand.front', null);
  await expectError(page, '請先選一張正面圖。');
  await slot(page, '正面圖').setInputFiles({
    name: 'note.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByText('「note.png」不是可以讀取的圖片。').first()).toBeVisible();
  /* 復原回到透明的那張 → 再復原回到人物 */
  await page.keyboard.press('Control+z');
  await expectError(page, '抓不出外框（圖片可能整張都是透明的）。');
  await page.keyboard.press('Control+z');
  await ready(page, 'stand');
  expect(errors).toEqual([]);
});

test('搖搖樂：零件、外框、物理、搖晃、陀螺儀、錯誤訊息', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
  await ready(page, 'shaker');
  /* 物理：零件往下掉（重力＝鏡頭的下方 × 3000）。先停住迴圈、重新產生，看零件出現的位置 */
  await call(page, '(h) => h.pause()');
  const seed = (await call<{ seed: number }>(page, '(h) => h.session()')).seed;
  await page.getByRole('button', { name: '重新產生' }).click();
  await expect
    .poll(async () => (await call<{ seed: number }>(page, '(h) => h.session()')).seed)
    .toBe(seed + 1);
  const before = (await engine(page)).parts;
  await call(page, '(h) => h.resume()');
  expect(before).toHaveLength(11);
  for (const p of before) expect(p[2]).toBe(23);
  await expect
    .poll(async () => {
      const after = (await engine(page)).parts;
      return after.reduce((s, p) => s + p[1], 0) / after.length;
    })
    .toBeLessThan(before.reduce((s, p) => s + p[1], 0) / before.length - 8);
  const g = (await engine(page)).gravity!;
  expect(g[0]).toBeCloseTo(0, 0);
  expect(g[1]).toBeLessThan(-2900);
  /* 拖曳畫面＝搖晃的力（每 px 100；往右拖 → 往右、往下拖 → 往下）；停住迴圈才不會衰減 */
  await call(page, '(h) => h.pause()');
  const canvas = page.getByTestId('acrylic-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 3 });
  await page.mouse.up();
  expect((await engine(page)).shake).toEqual({ x: 6000, y: -2000 });
  /* 搖一搖：左右甩一下（±12000） */
  await page.getByRole('button', { name: '搖一搖' }).click();
  expect(Math.abs((await engine(page)).shake.x - 6000)).toBe(12000);
  /* 預覽有焦點時空白鍵也是搖一搖 */
  const sx = (await engine(page)).shake.x;
  await canvas.focus();
  await page.keyboard.press('Space');
  expect(Math.abs((await engine(page)).shake.x - sx)).toBe(12000);
  await call(page, '(h) => h.resume()');
  await expect.poll(async () => Math.abs((await engine(page)).shake.x)).toBeLessThan(100);

  /* 零件：加一個（沒有圖的不算）、放圖、數量、刪除 */
  await page.getByRole('button', { name: '加零件' }).click();
  await expect(page.getByRole('button', { name: '零件（5）' })).toBeVisible();
  await slot(page, '零件 5的零件圖').setInputFiles(
    file('g.png', await boxPng(80, 80, [0, 200, 0])),
  );
  await expect.poll(async () => (await session(page)).info?.parts).toBe(12);
  await setNumber(page, '零件 5的數量', 3);
  await expect.poll(async () => (await session(page)).info?.parts).toBe(14);
  await page.getByRole('button', { name: '刪除零件 1' }).click();
  await expect.poll(async () => (await session(page)).info?.parts).toBe(10);
  /* 外框：方形 4 面牆、依圖片（沒有圖時錯誤） */
  await page.getByRole('radio', { name: '方形' }).click();
  await expect.poll(async () => (await session(page)).info?.walls).toBe(4);
  await page.getByRole('radio', { name: '依圖片' }).click();
  await expectError(page, '請先放一張搖搖樂的背景圖。');
  await slot(page, '背景圖').setInputFiles(
    file('frame.png', await boxPng(300, 300, [250, 220, 0])),
  );
  await ready(page, 'shaker');
  expect((await session(page)).info!.bounds!.maxX).toBeCloseTo(135, -1);
  /* 沒有零件 */
  await setValue(page, 'shaker.parts', []);
  await expectError(page, '至少要加一張零件圖。');
  await page.keyboard.press('Control+z');
  await ready(page, 'shaker');

  /* 陀螺儀：沉浸模式、手機傾斜 → 重力、Esc 返回 */
  await page.getByRole('button', { name: '開啟陀螺儀（手機）' }).click();
  await expect(page.locator('[data-immersive]')).toBeVisible();
  expect((await session(page)).immersive).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { gamma: 30, beta: 10 })),
  );
  await expect.poll(async () => (await engine(page)).gyro).toEqual({ gamma: 30, beta: 10 });
  await expect.poll(async () => (await engine(page)).gravity?.[0]).toBeGreaterThan(800);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-immersive]')).toHaveCount(0);
  expect((await engine(page)).gyro).toBeNull();
  await page.getByRole('button', { name: '開啟陀螺儀（手機）' }).click();
  await page.getByRole('button', { name: '回到編輯畫面' }).click();
  await expect(page.locator('[data-immersive]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('陀螺儀：權限被拒、無法請求權限、沒有感測器', async ({ page }) => {
  await page.addInitScript(() => {
    const mode = sessionStorage.getItem('gyro-mode') ?? 'denied';
    // biome-ignore lint/suspicious/noExplicitAny: 模擬 iOS 的權限 API
    const w = window as any;
    if (mode === 'none') delete w.DeviceOrientationEvent;
    else
      w.DeviceOrientationEvent.requestPermission = async () => {
        if (mode === 'throw') throw new Error('not https');
        return 'denied';
      };
  });
  const errors = await open(page);
  const tryGyro = async (mode: string, text: string) => {
    await page.evaluate((m) => sessionStorage.setItem('gyro-mode', m), mode);
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __acrylicGoods?: unknown }).__acrylicGoods,
    );
    await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
    await page.getByRole('button', { name: '開啟陀螺儀（手機）' }).click();
    await expect(page.getByText(text).first()).toBeVisible();
    expect((await session(page)).immersive).toBe(false);
  };
  await tryGyro('denied', '陀螺儀的存取被拒絕了。請到瀏覽器設定裡允許權限。');
  await tryGyro('throw', '沒辦法請求陀螺儀權限。這個功能只在 HTTPS 環境下能用。');
  await tryGyro('none', '這台裝置沒有陀螺儀感測器。');
  expect(errors).toEqual([]);
});

test('立體透視：深度、間距、偏移、旋轉、排序、錯誤訊息', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '壓克力立體透視' }).click();
  await ready(page, 'diorama');
  const ids = (await settings(page)).diorama.layers.map((l: { id: string }) => l.id);
  const z = async () => (await engine(page)).layers.map((l) => l.position[2]);
  /* 清單最上面在最前面 */
  expect(await z()).toEqual([40, 0, -40]);
  await setNumber(page, '圖層間距', 100);
  await expect.poll(z).toEqual([100, 0, -100]);
  expect((await session(page)).info!.base!.depth).toBe(2 * 100 + 20 + 60);
  /* 偏移與旋轉立刻套用（不重建） */
  const meshes = (await session(page)).info!.meshes;
  await setNumber(page, '圖層 2的上下位置', 55);
  await expect.poll(async () => (await engine(page)).layers[1].position[1]).toBeGreaterThan(55);
  await setNumber(page, '圖層 2的左右位置', -300);
  await expect.poll(async () => (await engine(page)).layers[1].position[0]).toBe(-300);
  await page.getByRole('button', { name: '圖層 2：水平旋轉 +90°' }).click();
  await expect(page.getByTestId('layer-rotation').nth(1)).toHaveText('90°');
  await expect
    .poll(async () => (await engine(page)).layers[1].rotationY)
    .toBeCloseTo(Math.PI / 2, 6);
  await page.getByRole('button', { name: '圖層 2：水平旋轉 −90°' }).click();
  await page.getByRole('button', { name: '圖層 2：水平旋轉 −90°' }).click();
  await expect(page.getByTestId('layer-rotation').nth(1)).toHaveText('270°');
  expect((await session(page)).info!.meshes).toBe(meshes);
  /* 排序（Alt＋↓）：第一張移到第二 */
  await page.getByRole('list', { name: '立體透視的圖層' }).locator(':scope > li').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => (await settings(page)).diorama.layers.map((l: { id: string }) => l.id))
    .toEqual([ids[1], ids[0], ids[2]]);
  await expect
    .poll(async () => (await engine(page)).layers.map((l) => l.id))
    .toEqual([ids[1], ids[0], ids[2]]);
  /* 刪光 */
  for (let i = 3; i >= 1; i--) await page.getByRole('button', { name: `刪除圖層 ${i}` }).click();
  await expectError(page, '至少要加一張圖層圖片。');
  await page.getByRole('button', { name: '加圖層' }).click();
  await expectError(page, '至少要加一張圖層圖片。');
  await slot(page, '圖層 1的圖片').setInputFiles(
    file('a.png', await boxPng(200, 200, [0, 0, 255])),
  );
  await ready(page, 'diorama');
  expect((await engine(page)).layers.map((l) => l.position[2])).toEqual([0]);
  expect(errors).toEqual([]);
});

test('打光、自動旋轉、重設鏡頭、鍵盤轉動鏡頭、背景', async ({ page }) => {
  const errors = await open(page);
  const pad = page.getByRole('slider', { name: '光源方向' });
  await pad.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await engine(page)).keyLight.position).toEqual([180, 300, 120]);
  await setNumber(page, '主光（立體感）', 1.2);
  await setNumber(page, '環境光（陰影亮度）', 0.3);
  await expect
    .poll(async () => (await engine(page)).keyLight.intensity)
    .toBeCloseTo(1.2 * Math.PI, 5);
  expect((await engine(page)).ambient).toBeCloseTo(0.3 * Math.PI, 5);
  await page.getByRole('button', { name: '打光回到預設值' }).click();
  await expect.poll(async () => (await engine(page)).keyLight.position).toEqual([200, 300, 200]);
  expect((await engine(page)).ambient).toBeCloseTo(0.6 * Math.PI, 5);
  await expect(page.getByRole('button', { name: '打光回到預設值' })).toBeDisabled();

  /* 自動旋轉 */
  await setNumber(page, '自動旋轉', 6);
  await expect.poll(async () => (await engine(page)).rotation![1]).toBeGreaterThan(0.5);
  await setNumber(page, '自動旋轉', 0);
  const r1 = (await engine(page)).rotation![1];
  await page.waitForTimeout(300);
  expect((await engine(page)).rotation![1]).toBe(r1);

  /* 鍵盤轉動鏡頭、拉近；重設鏡頭回到正面（重設鏡頭依周邊目前的角度算範圍，先轉回正面） */
  await call(page, '(h) => h.rotateTo(0)');
  await page.getByRole('button', { name: '重設鏡頭' }).click();
  const home = (await engine(page)).camera;
  await page.getByTestId('acrylic-canvas').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('+');
  await expect.poll(async () => (await engine(page)).camera[0]).not.toBeCloseTo(0, 0);
  await page.getByRole('button', { name: '重設鏡頭' }).click();
  await expect
    .poll(async () => (await engine(page)).camera.map((v) => Math.round(v)))
    .toEqual(home.map((v) => Math.round(v)));

  /* 背景色與透明背景（畫布本身一律透明，底色鋪在後面） */
  const bgInput = page.getByRole('textbox', { name: '背景色' });
  await bgInput.fill('#123456');
  await bgInput.press('Enter');
  await expect(page.locator('[data-viewport-background]')).toHaveAttribute(
    'data-viewport-background',
    '#123456',
  );
  await page.getByRole('switch', { name: '透明背景' }).click();
  await expect(page.locator('[data-viewport-background]')).toHaveAttribute(
    'data-viewport-background',
    'transparent',
  );
  expect(errors).toEqual([]);
});

test('匯出：APNG、GIF、WebP、PNG、GLB', async ({ page }) => {
  const errors = await open(page);
  /* 預覽：轉一圈 2.62 秒、52 格 */
  await expect(page.getByTestId('export-plan')).toContainText('轉一圈（2.62 秒）');
  await expect(page.getByTestId('export-estimate')).toContainText('52 格');
  const rotBefore = (await engine(page)).rotation;

  const apng = await exportAs(page, 'APNG');
  expect(apng.name).toBe('acrylic-animated.png');
  const a = parseApng(apng.bytes);
  expect([a.ihdr.width, a.ihdr.height]).toEqual([800, 800]);
  expect(a.numPlays).toBe(0);
  expect(a.numFrames).toBe(52);
  for (const f of a.frames) expect((f.delayNum / (f.delayDen || 100)) * 1000).toBeCloseTo(50, 6);
  const frames = composeApng(a);
  /* 底色是背景色（不透明）、中央是立牌；轉到一半（第 26 格）從背面看 */
  expect(at(frames[0], 800, 3, 3)).toEqual([238, 241, 245, 255]);
  expect(at(frames[0], 800, 400, 400)).not.toEqual([238, 241, 245, 255]);
  expect(at(frames[26], 800, 400, 400)).not.toEqual(at(frames[0], 800, 400, 400));
  /* 匯出後角度還原、預覽繼續 */
  expect((await engine(page)).rotation).toEqual(rotBefore);
  expect((await engine(page)).running).toBe(true);
  expect((await engine(page)).bufferSize).toEqual({ width: 800, height: 800 });

  /* GIF：透明背景、每格 5／100 秒、倍率 50% */
  await page.getByRole('switch', { name: '透明背景' }).click();
  await page.getByRole('radio', { name: 'GIF', exact: true }).click();
  await page.getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^50%/ }).click();
  const gif = await exportAs(page, 'GIF');
  expect(gif.name).toBe('acrylic-animated.gif');
  const g = parseGif(gif.bytes);
  expect([g.width, g.height]).toEqual([400, 400]);
  expect(g.loopCount).toBe(0);
  expect(g.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(260);
  expect(g.frames[0].transparentIndex).not.toBeNull();

  /* WebP：52 格、每格 50 ms */
  const webp = await exportAs(page, 'WebP');
  expect(webp.name).toBe('acrylic-animated.webp');
  const chunks = parseWebp(webp.bytes);
  const vp8x = chunks.find((c) => c.fourcc === 'VP8X')!.data;
  expect((vp8x[4] | (vp8x[5] << 8) | (vp8x[6] << 16)) + 1).toBe(400);
  const anmf = chunks.filter((c) => c.fourcc === 'ANMF');
  expect(anmf.reduce((t, c) => t + (c.data[12] | (c.data[13] << 8) | (c.data[14] << 16)), 0)).toBe(
    2600,
  );

  /* PNG（目前畫面）：透明背景時四角透明 */
  const still = await exportAs(page, 'PNG');
  expect(still.name).toBe('acrylic-goods.png');
  const sc = parseChunks(still.bytes);
  const ih = readIhdr(sc);
  expect([ih.width, ih.height]).toEqual([400, 400]);
  const idat = sc.filter((c) => c.type === 'IDAT');
  const z = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let off = 0;
  for (const c of idat) {
    z.set(c.data, off);
    off += c.data.length;
  }
  const px = decodePixels(z, 400, 400, ih.colorType);
  expect(at(px, 400, 2, 2)[3]).toBe(0);
  expect(at(px, 400, 200, 200)[3]).toBe(255);

  /* GLB */
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出 GLB' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('acrylic-goods.glb');
  const glb = parseGlb(new Uint8Array(readFileSync((await dl.path()) as string)));
  expect(glb.version).toBe(2);
  expect(glb.json.asset?.version).toBe('2.0');
  expect(glb.json.meshes!.length).toBeGreaterThanOrEqual(4);
  /* 正面、背面兩張圖（示範圖） */
  expect(glb.json.images?.length).toBe(2);
  expect(glb.json.images?.every((i) => i.mimeType === 'image/png')).toBe(true);
  expect(glb.binLength).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('匯出：搖搖樂左右搖 90 格；沒有周邊時的訊息', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
  await ready(page, 'shaker');
  await expect(page.getByTestId('export-plan')).toContainText('左右搖晃 4.5 秒');
  await page.getByRole('radio', { name: 'GIF', exact: true }).click();
  await page.getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^50%/ }).click();
  const gif = await exportAs(page, 'GIF');
  const g = parseGif(gif.bytes);
  expect(g.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(450);
  expect(g.frames.length).toBeGreaterThan(80);
  /* 匯出後零件留在原地（物理狀態還原） */
  expect((await engine(page)).rotation![2]).toBe(0);

  await setValue(page, 'shaker.parts', []);
  await expectError(page, '至少要加一張零件圖。');
  await page.getByRole('button', { name: '匯出 GIF' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '匯出失敗' })).toContainText(
    '至少要加一張零件圖。',
  );
  await expect(page.getByRole('button', { name: '匯出 GLB' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('選好的檔案之後就讀不到（Android 相片挑選器的權限失效）：存成專案檔照常含原圖', async ({
  page,
}) => {
  const errors = await open(page);
  const dir = mkdtempSync(join(tmpdir(), 'acrylic-picked-'));
  const path = join(dir, '1000003457.png');
  const original = await charPng();
  writeFileSync(path, original);
  await slot(page, '正面圖').setInputFiles(path);
  await expect.poll(async () => (await settings(page)).stand.front).not.toMatch(/^demo:/);
  await ready(page, 'stand');
  await page.waitForTimeout(300);
  /* 選好之後改掉磁碟上的檔案：之後再讀原本的 File 會 NotReadableError（同手機上權限失效） */
  writeFileSync(path, Buffer.concat([original, Buffer.alloc(16)]));
  await page.getByRole('button', { name: '專案' }).click();
  const [proj] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync((await proj.path()) as string)));
  const images = Object.entries(zip).filter(([name]) => /^files\/.+\.png$/.test(name));
  expect(images.some(([, data]) => Buffer.from(data).equals(original))).toBe(true);
  expect(errors).toEqual([]);
});

test('復原／重做、自動保存、專案檔', async ({ page }) => {
  const errors = await open(page);
  await setNumber(page, '厚度', 30);
  await expect.poll(async () => (await settings(page)).material.thickness).toBe(30);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await settings(page)).material.thickness).toBe(20);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await settings(page)).material.thickness).toBe(30);
  await page.getByRole('radio', { name: '霧面' }).click();
  await slot(page, '正面圖').setInputFiles(file('char.png', await charPng()));
  await expect.poll(async () => (await settings(page)).stand.front).not.toMatch(/^demo:/);
  const saved = await settings(page);
  await expect(page.getByText(/已自動儲存/)).toBeVisible();

  /* 重新整理：設定與上傳的圖都還在 */
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __acrylicGoods?: unknown }).__acrylicGoods,
  );
  await ready(page, 'stand');
  expect(await settings(page)).toEqual(saved);
  const front = page.locator('[data-image-slot="正面圖"]');
  await expect(front.getByTestId('image-name')).toHaveText('char.png');
  await expect(front.getByTestId('image-size')).toHaveText('300 × 400');

  /* 存成專案檔（ZIP，含圖）→ 重設 → 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  const [proj] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(proj.suggestedFilename()).toMatch(/^acrylic-goods_\d{8}\.zip$/);
  const zipPath = (await proj.path()) as string;
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await settings(page)).material.thickness).toBe(20);
  expect((await settings(page)).stand.front).toBe('demo:hero');
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(zipPath);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect.poll(async () => settings(page)).toEqual(saved);
  await ready(page, 'stand');
  /* 專案檔讀回也有檔名 */
  await expect(front.getByTestId('image-name')).toHaveText('char.png');
  await expect(front.getByTestId('image-size')).toHaveText('300 × 400');
  const b = (await session(page)).info!.bounds!;
  expect(Math.abs(b.maxY - b.minY - 364)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後的修正（規格 7.1） ---------- */

test.describe('對等驗證後的修正', () => {
  /** 鏡頭到目標的距離 */
  const distance = async (page: Page) => {
    const e = await engine(page);
    return Math.hypot(...e.camera.map((v, i) => v - e.target[i]));
  };

  test('F74 鍵盤：＋ 拉近、− 拉遠（與滾輪同方向）', async ({ page }) => {
    const errors = await open(page);
    await call(page, '(h) => h.rotateTo(0)');
    await page.getByRole('button', { name: '重設鏡頭' }).click();
    const d0 = await distance(page);
    const canvas = page.getByTestId('acrylic-canvas');
    await canvas.focus();
    await page.keyboard.press('+');
    await expect.poll(() => distance(page)).toBeLessThan(d0 * 0.95);
    expect(await distance(page)).toBeCloseTo(d0 / 1.15, 0);
    await page.keyboard.press('-');
    await expect.poll(() => distance(page)).toBeGreaterThan(d0 * 0.99);
    expect(await distance(page)).toBeCloseTo(d0, 0);
    await page.keyboard.press('-');
    await expect.poll(() => distance(page)).toBeGreaterThan(d0 * 1.1);
    /* 滾輪往上（deltaY < 0）也是拉近 */
    const d1 = await distance(page);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => distance(page)).toBeLessThan(d1 * 0.99);
    expect(errors).toEqual([]);
  });

  test('F48 預覽的游標：滑鼠在上面是手掌、拖曳中是抓住', async ({ page }) => {
    const errors = await open(page);
    const canvas = page.getByTestId('acrylic-canvas');
    const cursor = () => canvas.evaluate((el) => getComputedStyle(el).cursor);
    expect(await cursor()).toBe('grab');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(cursor).toBe('grabbing');
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    expect(await cursor()).toBe('grabbing');
    await page.mouse.up();
    await expect.poll(cursor).toBe('grab');
    expect(errors).toEqual([]);
  });

  test('F55 不透明背景的 GIF 每格各自減色（壓克力外框不會被併進底色）', async ({ page }) => {
    const errors = await open(page);
    /* 對等驗證用的人形圖（沒有背面圖）、圓形底座 */
    await slot(page, '正面圖').setInputFiles(file('char.png', await charPng()));
    await page.getByRole('button', { name: '背面圖（可省略）：移除' }).click();
    await expect.poll(async () => (await engine(page)).sides).toBeNull();
    await ready(page, 'stand');
    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^50%/ }).click();
    const apng = composeApng(parseApng((await exportAs(page, 'APNG')).bytes));
    const g = parseGif((await exportAs(page, 'GIF')).bytes);
    expect(g.frames).toHaveLength(52);
    /* 第 2 格起每格都有自己的調色盤 */
    expect(g.frames.slice(1).every((f) => f.localPalette !== null)).toBe(true);
    /*
     * 第一格與 APNG 的第一格幾乎相同。整段共用一個調色盤時，淡灰色的壓克力外框與底座被併進底色：
     * 平均每通道差 2.45、最大 36（修正後 0.02、最大 5）。
     */
    const f0 = gifFrameRgba(g, g.frames[0]);
    let max = 0;
    let sum = 0;
    for (let i = 0; i < f0.length; i++) {
      const d = Math.abs(f0[i] - apng[0][i]);
      sum += d;
      if (d > max) max = d;
    }
    expect(max).toBeLessThanOrEqual(16);
    expect(sum / f0.length).toBeLessThan(0.3);
    expect(errors).toEqual([]);
  });

  test('F56 GLB：亮面（Phong）材質 metallic 0.5、roughness 0.5；霧面不受光照', async ({ page }) => {
    const errors = await open(page);
    const glbJson = async () => {
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: '匯出 GLB' }).click(),
      ]);
      return parseGlb(new Uint8Array(readFileSync((await dl.path()) as string))).json;
    };
    let json = await glbJson();
    const acrylic = json.materials!.find((m) => m.name === '壓克力')!;
    expect(acrylic.pbrMetallicRoughness).toMatchObject({
      metallicFactor: 0.5,
      roughnessFactor: 0.5,
    });
    const prints = json.materials!.filter((m) => m.pbrMetallicRoughness?.baseColorTexture);
    expect(prints.length).toBe(2);
    for (const m of prints) {
      expect(m.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0.5, roughnessFactor: 0.5 });
      expect(m.extensions?.KHR_materials_unlit).toBeUndefined();
    }
    await page.getByRole('radio', { name: '霧面' }).click();
    await expect.poll(async () => (await settings(page)).material.finish).toBe('matte');
    await ready(page, 'stand');
    json = await glbJson();
    const matte = json.materials!.filter((m) => m.pbrMetallicRoughness?.baseColorTexture);
    expect(matte.length).toBe(2);
    for (const m of matte) expect(m.extensions?.KHR_materials_unlit).toEqual({});
    expect(json.materials!.find((m) => m.name === '壓克力')!.pbrMetallicRoughness).toMatchObject({
      metallicFactor: 0.5,
      roughnessFactor: 0.5,
    });
    expect(errors).toEqual([]);
  });

  test('F69 圖片欄：檔名與尺寸，太長時省略並有完整名稱的提示', async ({ page }) => {
    const errors = await open(page);
    const meta = (label: string) => page.locator(`[data-image-slot="${label}"]`);
    await expect(meta('正面圖').getByTestId('image-name')).toHaveText('示範：冒險者');
    await expect(meta('正面圖').getByTestId('image-size')).toHaveText('360 × 520');
    await slot(page, '正面圖').setInputFiles(file('char.png', await charPng()));
    await expect(meta('正面圖').getByTestId('image-name')).toHaveText('char.png');
    await expect(meta('正面圖').getByTestId('image-size')).toHaveText('300 × 400');
    const long = `${'冒險者的立牌正面圖－第二版－去背完成－'.repeat(4)}final.png`;
    await slot(page, '背面圖（可省略）').setInputFiles(
      file(long, await boxPng(200, 300, [0, 150, 0])),
    );
    const name = meta('背面圖（可省略）').getByTestId('image-name');
    await expect(name).toHaveText(long);
    await expect(name).toHaveAttribute('title', long);
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(meta('背面圖（可省略）').getByTestId('image-size')).toHaveText('200 × 300');
    /* 移除後沒有檔名 */
    await page.getByRole('button', { name: '背面圖（可省略）：移除' }).click();
    await expect(name).toHaveText('還沒有圖');
    await expect(meta('背面圖（可省略）').getByTestId('image-size')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('F24 零件清單只能從把手（☰）拖曳排序', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    const errors = await open(page);
    await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
    await ready(page, 'shaker');
    /* 停住 3D 的算繪迴圈（無頭環境畫一格很慢，滑鼠事件會跟著等） */
    await call(page, '(h) => h.pause()');
    const order = async () =>
      (await settings(page)).shaker.parts.map((p: { id: string }) => p.id) as string[];
    const start = await order();
    const rows = page.locator('[data-part]');
    const drag = async (from: Locator, to: Locator) => {
      /* 兩列都在畫面中間（指標拖不到畫面外；靠近上下緣會自動捲動） */
      await to.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const a = (await from.boundingBox())!;
      const b = (await to.boundingBox())!;
      const sx = a.x + a.width / 2;
      const sy = a.y + a.height / 2;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(sx, sy + ((b.y + 30 - sy) * i) / 12);
      await page.mouse.up();
      await page.waitForTimeout(100);
    };
    /* 從圖片欄的縮圖、名稱拖：不排序 */
    await drag(rows.nth(3).locator('[data-image-slot] .checker').first(), rows.nth(2));
    expect(await order()).toEqual(start);
    await drag(rows.nth(3).getByTestId('image-name'), rows.nth(2));
    expect(await order()).toEqual(start);
    await drag(rows.nth(3).getByText('零件 4', { exact: true }), rows.nth(2));
    expect(await order()).toEqual(start);
    /* 從把手拖：移到那個位置 */
    await drag(rows.nth(3).locator('[data-drag-handle]'), rows.nth(2));
    expect(await order()).toEqual([start[0], start[1], start[3], start[2]]);
    expect(errors).toEqual([]);
  });

  test('F28 沉浸模式蓋住整個畫面（含頁首），返回鈕在畫布下方', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
    await ready(page, 'shaker');
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.getByRole('button', { name: '開啟陀螺儀（手機）' }).click();
    await expect(page.locator('[data-immersive]')).toBeVisible();
    const r = await page.evaluate(() => {
      const vp = document.querySelector('[data-immersive]') as HTMLElement;
      const points = [
        [innerWidth / 2, 5],
        [20, 20],
        [innerWidth - 20, 20],
        [innerWidth / 2, innerHeight - 5],
      ];
      const rect = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
      };
      const exit = [...vp.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('回到編輯畫面'),
      ) as HTMLElement;
      return {
        hits: points.map(([x, y]) => vp.contains(document.elementFromPoint(x, y))),
        canvas: rect(vp.querySelector('[data-testid=acrylic-canvas]') as Element),
        exit: rect(exit),
        exitOnTop: exit.contains(
          document.elementFromPoint(
            exit.getBoundingClientRect().left + 10,
            exit.getBoundingClientRect().top + 10,
          ),
        ),
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    expect(r.hits).toEqual([true, true, true, true]);
    expect(r.canvas.top).toBeGreaterThanOrEqual(0);
    expect(r.canvas.bottom).toBeLessThanOrEqual(r.vh);
    expect(r.canvas.right - r.canvas.left).toBeGreaterThan(r.vh * 0.75);
    expect(r.exitOnTop).toBe(true);
    expect(r.exit.top).toBeGreaterThanOrEqual(r.canvas.bottom);
    expect(r.exit.bottom).toBeLessThanOrEqual(r.vh);
    /* Esc 與「回到編輯畫面」照舊 */
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-immersive]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '壓克力周邊工房' })).toBeVisible();
    await page.getByRole('button', { name: '開啟陀螺儀（手機）' }).click();
    await expect(page.locator('[data-immersive]')).toBeVisible();
    await page.getByRole('button', { name: '回到編輯畫面' }).click();
    await expect(page.locator('[data-immersive]')).toHaveCount(0);
    expect((await session(page)).immersive).toBe(false);
    expect(errors).toEqual([]);
  });

  test('F07 拉桿拖曳、鍵盤連按中不重建，放開或停頓 0.2 秒後才重建', async ({ page }) => {
    /*
     * 「停頓」以頁面的時間為準：測試控制頁面的時鐘（拖曳、連按時每一步只讓頁面過 40 ms），
     * 機器負載高、測試送出輸入變慢時，也不會被頁面當成停頓。
     */
    await page.clock.install();
    const errors = await open(page);
    const builds = async () => (await engine(page)).builds;
    const margin = async () => (await settings(page)).material.margin as number;
    /** 停住頁面的時鐘（時鐘照常走時，目標時間要留得夠遠，負載高時才不會已經過了） */
    const pause = async () => {
      for (let i = 0; ; i++) {
        const t = await page.evaluate(() => Date.now());
        try {
          return await page.clock.pauseAt(t + 1000);
        } catch (e) {
          if (i >= 2 || !String(e).includes('past')) throw e;
        }
      }
    };
    /** 讓頁面一次過 40 ms，直到組好的次數變成 n（停頓之後的重建） */
    const tickUntilBuilds = async (n: number) => {
      for (let i = 0; i < 50 && (await builds()) < n; i++) await page.clock.runFor(40);
      expect(await builds()).toBe(n);
    };
    const thumb = page.getByRole('slider', { name: '外框留白' });
    await thumb.scrollIntoViewIfNeeded();
    const tb = (await thumb.boundingBox())!;
    const x = tb.x + tb.width / 2;
    const y = tb.y + tb.height / 2;
    const b0 = await builds();
    const m0 = await margin();

    /* 拖曳 8 步（每步頁面過 40 ms）：每一步都改了值，但不重建；放開後重建一次 */
    await pause();
    await page.mouse.move(x, y);
    await page.mouse.down();
    let last = m0;
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x + i * 10, y);
      await page.clock.runFor(40);
      const m = await margin();
      expect(m).toBeGreaterThan(last);
      last = m;
    }
    expect(await builds()).toBe(b0);
    await page.mouse.up();
    await tickUntilBuilds(b0 + 1);
    await page.clock.runFor(400);
    expect(await builds()).toBe(b0 + 1);

    /* 拖到一半停住 0.2 秒以上：還按著就重建一次；再拖再放：再一次 */
    await page.mouse.move(x + 80, y);
    await page.mouse.down();
    for (let i = 1; i <= 3; i++) {
      await page.mouse.move(x + 80 - i * 10, y);
      await page.clock.runFor(40);
    }
    expect(await builds()).toBe(b0 + 1);
    await page.clock.runFor(160);
    await tickUntilBuilds(b0 + 2);
    for (let i = 4; i <= 6; i++) {
      await page.mouse.move(x + 80 - i * 10, y);
      await page.clock.runFor(40);
    }
    expect(await builds()).toBe(b0 + 2);
    await page.mouse.up();
    await tickUntilBuilds(b0 + 3);

    /* 鍵盤：連按（每次頁面過 40 ms）時不重建，停頓後重建一次 */
    await thumb.focus();
    const before = await margin();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await page.clock.runFor(40);
    }
    expect(await margin()).toBe(before + 3);
    expect(await builds()).toBe(b0 + 3);
    await page.clock.runFor(160);
    await tickUntilBuilds(b0 + 4);
    await page.clock.runFor(400);
    expect(await builds()).toBe(b0 + 4);

    /* 時間照常走：畫面組好、停在最後的值 */
    await page.clock.resume();
    await ready(page, 'stand');
    expect(await builds()).toBe(b0 + 4);
    expect(errors).toEqual([]);
  });

  test('F07 重建時先畫出依種類的處理中文字，再組場景', async ({ page }) => {
    /* 記下處理中的遮罩出現過的文字，以及遮罩畫上畫面的時間（下一個畫面） */
    await page.addInitScript(() => {
      const w = window as unknown as { __busy: (string | null)[]; __busyPainted: number[] };
      w.__busy = [];
      w.__busyPainted = [];
      let seen = false;
      new MutationObserver(() => {
        const b = document.querySelector('[data-testid=viewport-busy]');
        if (b && !seen) {
          w.__busy.push(b.textContent);
          requestAnimationFrame(() => w.__busyPainted.push(performance.now()));
        }
        seen = !!b;
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    const errors = await open(page);
    type BusyLog = { __busy: string[]; __busyPainted: number[] };
    const log = () => page.evaluate(() => (window as unknown as BusyLog).__busy);
    const clearLog = () =>
      page.evaluate(() => {
        const w = window as unknown as BusyLog;
        w.__busy = [];
        w.__busyPainted = [];
      });

    /* 依種類的文字 */
    await clearLog();
    await page.getByRole('tab', { name: '壓克力搖搖樂' }).click();
    await ready(page, 'shaker');
    await page.getByRole('tab', { name: '壓克力立體透視' }).click();
    await ready(page, 'diorama');
    await page.getByRole('tab', { name: '壓克力立牌' }).click();
    await ready(page, 'stand');
    expect(await log()).toEqual(
      expect.arrayContaining(['產生壓克力搖搖樂中…', '產生壓克力立體透視中…', '產生壓克力立牌中…']),
    );

    /* 大圖（3000 × 3000）改留白：先畫出提示，再算外框 */
    await slot(page, '正面圖').setInputFiles(
      file(
        'big.png',
        await png(3000, 3000, (x, y) =>
          Math.hypot(x - 1500, y - 1500) < 1300 ? [200, 60, 60, 255] : [0, 0, 0, 0],
        ),
      ),
    );
    await expect
      .poll(async () => (await session(page)).info?.bounds?.maxX ?? 0, { timeout: 60_000 })
      .toBeGreaterThan(1000);
    await ready(page, 'stand');
    await clearLog();
    await setNumber(page, '外框留白', 40);
    await expect.poll(async () => (await settings(page)).material.margin).toBe(40);
    await ready(page, 'stand');
    expect(await log()).toContain('產生壓克力立牌中…');
    const painted = await page.evaluate(() => (window as unknown as BusyLog).__busyPainted);
    expect(painted.length).toBeGreaterThan(0);
    expect(painted[0]).toBeLessThan((await engine(page)).builtAt);
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  const masks = (page: Page) => [
    page.getByTestId('acrylic-canvas'),
    page.getByRole('status').filter({ hasText: '自動儲存' }),
  ];
  async function prepare(page: Page) {
    await call(page, '(h) => h.pause()');
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await prepare(page);
    await expect(page).toHaveScreenshot('acrylic-goods-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    for (const tab of ['壓克力搖搖樂', '壓克力立體透視', '壓克力立牌']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await ready(page, 'stand');
    await prepare(page);
    await expect(page).toHaveScreenshot('acrylic-goods-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
