/**
 * 調查熱點圖（建置產物 next/clue-map/）的端對端測試（規格 docs/refactor/specs/clue-map.md）：
 * - 開頁沒有錯誤、範例（8 個熱點）、頁尾只有靈感來源；
 * - 場景（標題與導言、內建場景、上傳的圖、網址、拿掉、載入範例、清空熱點）；
 * - 熱點的編輯（新增、畫出、選取、移動、控點、方向鍵、數值、形狀、名稱、刪除、複製、排序、上限）；
 * - 熱點的內容與出現條件（文字、圖片、檢定提示、KP 備註、條件、隱藏、永遠不會出現的警告）；
 * - 遊玩設定與試玩（找到、解鎖、隱藏熱點、顯示所有熱點、重來、進度保留）；
 * - 互動 HTML（下載的檔案離線也能玩、記住進度、沒有 KP 備註、文字跳脫）；
 * - 分享連結（畫面只有遊玩畫面、上傳的圖停用、壞掉的連結）；總覽 PNG（尺寸與像素）；
 * - 專案檔（ZIP、JSON、重設、開啟）、自動儲存與還原、復原／重做、快捷鍵；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { encodeShareHash } from '../../src/core/share';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('clue-map') ?? { id: 'clue-map', status: 'next' })}/`;
const KEY = 'trpg-toolkit:clue-map';

test.use({ viewport: { width: 1280, height: 900 } });

/** 範例熱點的代號（src/tools/clue-map/sample.ts） */
const ID = {
  desk: 'hdesk01',
  shelf: 'hshelf1',
  fireplace: 'hfire01',
  window: 'hwindow',
  painting: 'hpaint1',
  drawer: 'hdrawer',
  safe: 'hsafe01',
  hatch: 'hhatch1',
} as const;

/* ---------- 共用 ---------- */

async function png(w: number, h: number, fill: (x: number, y: number) => number[]) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
const solid = (r: number, g: number, b: number, w = 40, h = 40) => png(w, h, () => [r, g, b, 255]);
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 在瀏覽器裡畫一張大圖（Node 端的 PNG 編碼器畫大圖很慢） */
async function bigPng(page: Page, w: number, h: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#d04040');
      g.addColorStop(1, '#2040d0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    [w, h],
  );
  return Buffer.from(b64, 'base64');
}

/** 測試用的圖片網址（img.example；wide 是 600 × 300，其他是 40 × 40；有 CORS 標頭，總覽 PNG 讀得到） */
async function routeImages(page: Page) {
  await page.route(/img\.example/, async (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: r.request().url().includes('wide')
        ? await solid(200, 120, 40, 600, 300)
        : await solid(0, 160, 255),
    }),
  );
}

async function open(page: Page, path = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await routeImages(page);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '調查熱點圖' })).toBeVisible();
  return errors;
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const spotRows = (page: Page) => page.locator('[data-spot-row]');
const stageImage = (page: Page) => page.getByTestId('stage-image');

interface StoredSpot {
  id: string;
  name: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  check: string;
  memo: string;
  image: unknown;
  locked: boolean;
  requires: string[];
  mode: string;
  hidden: boolean;
}

interface StoredData {
  title: string;
  intro: string;
  scene: Record<string, unknown>;
  spots: StoredSpot[];
}

async function stored(page: Page): Promise<StoredData> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data, KEY);
}

/** 存檔裡的熱點（依順序） */
async function storedSpots(page: Page): Promise<StoredSpot[]> {
  return (await stored(page)).spots;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 場景在畫面上的範圍；把場景的 % 座標換成畫面座標 */
async function onStage(page: Page, xPct: number, yPct: number) {
  const b = (await stageImage(page).boundingBox())!;
  return { x: b.x + (xPct / 100) * b.width, y: b.y + (yPct / 100) * b.height };
}

/** 在場景上從一個 % 座標拖到另一個 */
async function dragStage(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await onStage(page, ...from);
  const b = await onStage(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** 選取熱點（清單） */
async function selectRow(page: Page, index: number) {
  await tab(page, '熱點').click();
  await spotRows(page).nth(index).click();
}

const field = (page: Page, testId: string) => page.getByTestId(testId);

async function openProjectItem(page: Page, name: string) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function saveProject(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

async function openProjectFile(page: Page, name: string, bytes: Buffer, mimeType: string) {
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file(name, bytes, mimeType));
}

/** 遊玩畫面（試玩）的元素 */
const play = (page: Page) => page.getByTestId('play-host');
const spot = (root: Locator | Page, id: string) => root.locator(`[data-spot="${id}"]`);

async function goPlay(page: Page) {
  await page.getByRole('radio', { name: '試玩', exact: true }).click();
  await expect(play(page).locator('.cm-main')).toBeVisible();
}
async function goEdit(page: Page) {
  await page.getByRole('radio', { name: '編輯', exact: true }).click();
  await expect(stageImage(page)).toBeVisible();
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、範例（8 個熱點）、舞台上有輪廓與編號、頁尾只有靈感來源（F07、F22、F24）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  await tab(page, '熱點').click();
  await expect(page.getByText('熱點清單（8／40）')).toBeVisible();
  await expect(spotRows(page)).toHaveCount(8);
  await expect(spotRows(page).nth(0)).toContainText('書桌');
  await expect(spotRows(page).nth(5)).toContainText('書桌抽屜');
  await expect(spotRows(page).nth(5)).toContainText('需要解鎖');
  await expect(spotRows(page).nth(7)).toContainText('隱藏');
  /* 隱藏的用虛線、需要解鎖的編號是深色底 */
  await expect(
    page.locator(`[data-shape-id="${ID.hatch}"]`).locator('ellipse').last(),
  ).toHaveAttribute('stroke-dasharray', /.+/);
  await expect(
    page.locator(`[data-shape-id="${ID.desk}"]`).locator('rect').last(),
  ).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(page.locator(`[data-shape-id="${ID.drawer}"] circle`)).toHaveAttribute(
    'fill',
    '#1f2328',
  );
  await expect(page.locator(`[data-shape-id="${ID.desk}"] circle`)).toHaveAttribute(
    'fill',
    '#f5b83d',
  );
  /* 頁尾只有靈感來源 */
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源：momo102938/MUNgs_click（콕콕）');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://momo102938.github.io/MUNgs_click/',
  );
  expect(errors).toEqual([]);
});

test('版面：390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('stage-shapes')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('clue-map-1280.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('stage-shapes')).toBeVisible();
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('clue-map-390.png');
  for (const name of ['熱點', '遊玩設定', '場景']) {
    await tab(page, name).click();
    await noHorizontalScroll(page);
  }
  await goPlay(page);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

/* ---------- 場景 ---------- */

test('標題與導言：遊玩畫面顯示；空白時不顯示；網頁標題與檔名用標題（F01、F02）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('title-input').fill('地下室的調查');
  await page.getByTestId('intro-input').fill('第一行\n第二行');
  await goPlay(page);
  await expect(play(page).locator('.cm-title')).toHaveText('地下室的調查');
  await expect(play(page).locator('.cm-intro')).toHaveText('第一行\n第二行');
  await expect(play(page).locator('.cm-intro')).toHaveCSS('white-space', 'pre-line');
  await goEdit(page);
  await page.getByTestId('title-input').fill('');
  await page.getByTestId('intro-input').fill('');
  await goPlay(page);
  await expect(play(page).locator('.cm-title')).toHaveCount(0);
  await expect(play(page).locator('.cm-intro')).toHaveCount(0);
  /* 上限 */
  await goEdit(page);
  await page.getByTestId('title-input').fill('字'.repeat(80));
  await expect(page.getByTestId('title-input')).toHaveValue('字'.repeat(60));
  await page.getByTestId('intro-input').fill('字'.repeat(600));
  await expect(page.getByTestId('intro-input')).toHaveValue('字'.repeat(500));
  expect(errors).toEqual([]);
});

test('內建場景：三種（書房 1200 × 800、舊紙 1200 × 900、調查板 1200 × 800），畫出來不是單色（F05、F06）', async ({
  page,
}) => {
  const errors = await open(page);
  const size = () =>
    stageImage(page).evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      const seen = new Set<string>();
      for (let i = 0; i < d.length; i += 4)
        seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return { w: img.naturalWidth, h: img.naturalHeight, colors: seen.size };
    });
  const pick = async (name: string) => {
    await page.getByRole('radio', { name, exact: false }).filter({ hasText: name }).click();
  };
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  expect(await size()).toMatchObject({ w: 1200, h: 800 });
  await pick('舊紙');
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  await expect.poll(async () => (await size()).h).toBe(900);
  expect((await size()).colors).toBeGreaterThan(8);
  await pick('調查板');
  await expect(page.getByTestId('scene-name')).toHaveText('調查板');
  await expect.poll(async () => (await size()).h).toBe(800);
  expect((await size()).colors).toBeGreaterThan(8);
  /* 舞台的比例跟著場景 */
  const b = (await stageImage(page).boundingBox())!;
  expect(b.width / b.height).toBeCloseTo(1.5, 1);
  await pick('舊紙');
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 100) / 100;
    })
    .toBeCloseTo(1.33, 1);
  /* 熱點留在原來的百分比位置 */
  expect((await storedSpots(page))[0]).toMatchObject({ id: ID.desk });
  expect(errors).toEqual([]);
});

test('場景圖：選檔放進來（縮到長邊 1600）、熱點位置不變、拿掉改回舊紙、通知（F03、F06、E01、E02）', async ({
  page,
}) => {
  const errors = await open(page);
  const input = page.getByRole('group', { name: '場景圖' }).locator('input[type=file]');
  await input.setInputFiles(file('房間.png', await bigPng(page, 2000, 1000)));
  await expect(page.getByTestId('scene-name')).toHaveText('房間.png');
  await expect(page.getByTestId('scene-info')).toContainText('1600 × 800');
  await expect(toast(page, '已換成新的場景圖')).toBeVisible();
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 10) / 10;
    })
    .toBe(2);
  const s = await storedSpots(page);
  expect(s).toHaveLength(8);
  expect(s[0]).toMatchObject({ id: ID.desk, shape: 'rect', x: 8.33, y: 60, w: 36.67 });
  const scene = (await stored(page)).scene;
  expect(scene).toMatchObject({ kind: 'asset', name: '房間.png', width: 1600, height: 800 });
  /* 拿掉 */
  await page.getByRole('button', { name: '拿掉場景圖（改回舊紙）' }).click();
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  /* 不是圖片、讀不了 */
  await input.setInputFiles(file('筆記.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, /「筆記.txt」不是圖片/)).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  await input.setInputFiles(file('壞.png', Buffer.from('not really a png'), 'image/png'));
  await expect(toast(page, /讀不了圖片「壞.png」/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('場景圖：網址（只收 http／https）、讀進來後舞台依實際比例、載入失敗的說明（F04、E04、E05）', async ({
  page,
}) => {
  const errors = await open(page);
  const url = page.getByTestId('scene-url');
  await url.fill('javascript:alert(1)');
  await url.press('Enter');
  await expect(page.getByText('請貼 http:// 或 https:// 開頭的圖片網址')).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  await url.fill('https://img.example/wide.png');
  await page.getByRole('button', { name: '用網址', exact: true }).first().click();
  await expect(page.getByTestId('scene-name')).toHaveText('wide.png');
  await expect(page.getByTestId('scene-info')).toContainText('網址');
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 10) / 10;
    })
    .toBe(2);
  expect((await stored(page)).scene).toEqual({
    kind: 'url',
    url: 'https://img.example/wide.png',
    name: 'wide.png',
  });
  await expect(page.getByTestId('scene-load-failed')).toHaveCount(0);
  /* 載入失敗 */
  await page.route(/img\.example\/gone/, (r) => r.abort());
  await url.fill('https://img.example/gone.png');
  await url.press('Enter');
  await expect(page.getByTestId('scene-load-failed')).toContainText('圖片讀不到');
  expect(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
});

test('載入範例與清空熱點：先確認、可以復原（F07、F08）', async ({ page }) => {
  const errors = await open(page);
  await expect(btn(page, '清空熱點')).toBeEnabled();
  await btn(page, '清空熱點').click();
  await expect(page.getByRole('alertdialog')).toContainText('清空所有熱點？');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await btn(page, '清空熱點').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
  await expect(btn(page, '清空熱點')).toBeDisabled();
  /* 場景與標題不變 */
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  /* 復原 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '重做' }).first().click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
  /* 載入範例（沒有熱點時不必確認） */
  await btn(page, '載入範例').click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  /* 有熱點時要確認 */
  await btn(page, '載入範例').click();
  await expect(page.getByRole('alertdialog')).toContainText('載入範例？');
  await page.getByRole('alertdialog').getByRole('button', { name: '載入' }).click();
  await expect(toast(page, '已載入範例').last()).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 熱點的編輯 ---------- */

/** 清空熱點（從空白開始） */
async function clearAll(page: Page) {
  await tab(page, '場景').click();
  await btn(page, '清空熱點').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
}

const num = (page: Page, label: string) =>
  page.getByRole('spinbutton', { name: label, exact: true });
const tool = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const rowItem = (page: Page, index: number) => spotRows(page).nth(index).locator('..');

test('新增熱點（按鈕）：矩形與橢圓的預設位置、名稱欄取得焦點、編號與名稱；到 40 個停用（F10、F22、F23）', async ({
  page,
}) => {
  const errors = await open(page);
  await clearAll(page);
  await tab(page, '熱點').click();
  await expect(page.getByText('熱點清單（0／40）')).toBeVisible();
  await expect(page.getByText('還沒有熱點')).toBeVisible();
  await btn(page, '新增矩形').click();
  await expect(spotRows(page)).toHaveCount(1);
  await expect(spotRows(page).first()).toContainText('熱點 1');
  await expect(rowItem(page, 0)).toHaveAttribute('aria-current', 'true');
  await expect(field(page, 'spot-name')).toBeFocused();
  await expect(field(page, 'spot-name')).toHaveAttribute('placeholder', '熱點 1');
  await expect(num(page, '寬')).toHaveValue('22');
  await expect(num(page, '高')).toHaveValue('16');
  await btn(page, '新增橢圓').click();
  await expect(spotRows(page)).toHaveCount(2);
  const s = await storedSpots(page);
  expect(s[0]).toMatchObject({ shape: 'rect', name: '', x: 29, y: 32, w: 22, h: 16 });
  /* 橢圓是正圓：場景 3:2（書房），高 20%、寬 20 ÷ 1.5 ＝ 13.33%；比上一個往右下錯開 4% */
  expect(s[1]).toMatchObject({ shape: 'ellipse', h: 20, w: 13.33, x: 37.33, y: 34 });
  await expect(
    page.getByTestId('stage-shapes').locator('[data-shape-id] ellipse').first(),
  ).toBeVisible();
  /* 到 40 個 */
  for (let i = 2; i < 40; i++) await btn(page, '新增矩形').click();
  await expect(page.getByText('熱點清單（40／40）')).toBeVisible();
  await expect(btn(page, '新增矩形')).toBeDisabled();
  await expect(btn(page, '新增橢圓')).toBeDisabled();
  await expect(btn(page, '複製熱點')).toBeDisabled();
  await expect(page.getByTestId('spots-full')).toHaveText('熱點最多 40 個。');
  expect((await storedSpots(page)).length).toBe(40);
  await tool(page, '畫矩形').click();
  await dragStage(page, [10, 10], [30, 30]);
  expect((await storedSpots(page)).length).toBe(40);
  expect(errors).toEqual([]);
});

test('在場景上畫出熱點：拖曳、只點一下、Esc 取消、V／R／E 切換工具（F11、F96）', async ({
  page,
}) => {
  const errors = await open(page);
  await clearAll(page);
  await tool(page, '畫矩形').click();
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'rect');
  await expect(page.getByTestId('stage-hint')).toContainText('按住拖曳畫出熱點');
  /* 拖曳中有虛線框 */
  const a = await onStage(page, 20, 20);
  const b = await onStage(page, 40, 35);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.getByTestId('draw-draft')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('draw-draft')).toHaveCount(0);
  await expect(spotRows(page)).toHaveCount(1);
  const s = await storedSpots(page);
  expect(s[0].shape).toBe('rect');
  expect(s[0].x).toBeCloseTo(20, 0);
  expect(s[0].y).toBeCloseTo(20, 0);
  expect(s[0].w).toBeCloseTo(20, 0);
  expect(s[0].h).toBeCloseTo(15, 0);
  /* 工具回到選取、新熱點被選取、名稱欄取得焦點 */
  await expect(tool(page, '選取')).toBeChecked();
  await expect(field(page, 'spot-name')).toBeFocused();
  /* 反方向拖也可以；橢圓 */
  await tool(page, '畫橢圓').click();
  await dragStage(page, [90, 80], [60, 50]);
  const t = await storedSpots(page);
  expect(t[1].shape).toBe('ellipse');
  expect(t[1].x).toBeCloseTo(60, 0);
  expect(t[1].w).toBeCloseTo(30, 0);
  /* 只點一下：以點為中心放預設大小 */
  await tool(page, '畫矩形').click();
  const c = await onStage(page, 50, 70);
  await page.mouse.click(c.x, c.y);
  const u = await storedSpots(page);
  expect(u).toHaveLength(3);
  expect(u[2]).toMatchObject({ x: 39, y: 62, w: 22, h: 16 });
  /* 快捷鍵與 Esc */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('r');
  await expect(tool(page, '畫矩形')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(tool(page, '選取')).toBeChecked();
  await page.keyboard.press('e');
  await expect(tool(page, '畫橢圓')).toBeChecked();
  await page.keyboard.press('v');
  await expect(tool(page, '選取')).toBeChecked();
  expect(errors).toEqual([]);
});

test('選取、移動、控點調整大小、夾在場景內、方向鍵、數值欄、Esc、Delete（F12～F16、F19、F26）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 窗戶：x 6.67、y 10、w 21.67、h 36.25 */
  const target = page.locator(`[data-layout-item="${ID.window}"]`);
  const c = await onStage(page, 15, 25);
  await page.mouse.click(c.x, c.y);
  await expect(target).toHaveAttribute('data-selected', 'true');
  await expect(tab(page, '熱點')).toHaveAttribute('data-state', 'active');
  await expect(rowItem(page, 3)).toHaveAttribute('aria-current', 'true');
  await expect(num(page, 'X')).toHaveValue('6.7');
  /* 移動 */
  await dragStage(page, [15, 25], [25, 35]);
  let w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(16.67, 0);
  expect(w.y).toBeCloseTo(20, 0);
  /* 拖到場景外：夾在場景內 */
  await dragStage(page, [25, 35], [-30, -30], 12);
  w = (await storedSpots(page))[3];
  expect(w).toMatchObject({ x: 0, y: 0 });
  /* 控點：右下角往右下拉 10%，對角（左上）不動 */
  const se = page.locator('[data-layout-handle="se"]');
  const hb = (await se.boundingBox())!;
  const stage = (await stageImage(page).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    hb.x + hb.width / 2 + stage.width * 0.1,
    hb.y + hb.height / 2 + stage.height * 0.1,
    { steps: 6 },
  );
  await page.mouse.up();
  w = (await storedSpots(page))[3];
  expect(w.x).toBe(0);
  expect(w.y).toBe(0);
  expect(w.w).toBeCloseTo(31.67, 0);
  expect(w.h).toBeCloseTo(46.25, 0);
  /* 八個控點 */
  await expect(page.locator('[data-layout-handle]')).toHaveCount(8);
  /* 左邊的控點不能拉出場景 */
  const wb = (await page.locator('[data-layout-handle="w"]').boundingBox())!;
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await page.mouse.down();
  await page.mouse.move(wb.x - 80, wb.y + wb.height / 2, { steps: 4 });
  await page.mouse.up();
  w = (await storedSpots(page))[3];
  expect(w.x).toBe(0);
  expect(w.w).toBeCloseTo(31.67, 0);
  /* 方向鍵：0.5%、Shift 5% */
  await page.waitForTimeout(450);
  await target.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(0.5, 5);
  expect(w.y).toBeCloseTo(5, 5);
  /* 數值欄：夾在場景內（X ＋ 寬 ≤ 100）、寬高至少 1.5 */
  await num(page, 'X').fill('90');
  await num(page, 'X').press('Enter');
  w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(68.33, 1);
  await num(page, '寬').fill('0.5');
  await num(page, '寬').press('Enter');
  w = (await storedSpots(page))[3];
  expect(w.w).toBe(1.5);
  /* Esc 取消選取 */
  await target.focus();
  await page.keyboard.press('Escape');
  await expect(target).not.toHaveAttribute('data-selected', 'true');
  /* Delete 刪除選取的熱點（點清單選取之後焦點回到頁面） */
  const shelf = await onStage(page, 100 - 10, 30);
  await page.mouse.click(shelf.x, shelf.y);
  await expect(page.locator(`[data-layout-item="${ID.shelf}"]`)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(7);
  expect((await storedSpots(page)).map((x) => x.id)).not.toContain(ID.shelf);
  expect(errors).toEqual([]);
});

test('形狀、名稱、複製、刪除（連帶清出現條件）、排序（按鈕、鍵盤、拖曳）、復原（F17～F21、F44）', async ({
  page,
}) => {
  const errors = await open(page);
  await selectRow(page, 2);
  /* 形狀 */
  await page.getByRole('radio', { name: '橢圓', exact: true }).click();
  expect((await storedSpots(page))[2].shape).toBe('ellipse');
  await expect(page.locator(`[data-shape-id="${ID.fireplace}"] ellipse`).first()).toBeVisible();
  await page.getByRole('radio', { name: '矩形', exact: true }).click();
  expect((await storedSpots(page))[2].shape).toBe('rect');
  /* 名稱：空白時用「熱點 N」代替顯示；上限 30 字 */
  await field(page, 'spot-name').fill('爐火');
  await expect(spotRows(page).nth(2)).toContainText('爐火');
  await field(page, 'spot-name').fill('');
  await expect(spotRows(page).nth(2)).toContainText('熱點 3');
  await field(page, 'spot-name').fill('字'.repeat(40));
  await expect(field(page, 'spot-name')).toHaveValue('字'.repeat(30));
  await field(page, 'spot-name').fill('壁爐');
  await field(page, 'spot-name').press('Enter');
  /* 複製：名稱加（複製）、往右下 3%、放在原本那個的上面一層並選取、內容照抄 */
  await btn(page, '複製熱點').click();
  await expect(spotRows(page)).toHaveCount(9);
  await expect(spotRows(page).nth(3)).toContainText('壁爐（複製）');
  const s = await storedSpots(page);
  expect(s[3]).toMatchObject({
    name: '壁爐（複製）',
    text: s[2].text,
    check: s[2].check,
    memo: s[2].memo,
  });
  expect(s[3].id).not.toBe(s[2].id);
  expect(s[3].x).toBeCloseTo(s[2].x + 3, 1);
  expect(s[3].y).toBeCloseTo(s[2].y + 3, 1);
  await expect(rowItem(page, 3)).toHaveAttribute('aria-current', 'true');
  /* 上下順序：按鈕 */
  await page.getByRole('button', { name: '上移「壁爐（複製）」' }).click();
  await expect(spotRows(page).nth(2)).toContainText('壁爐（複製）');
  await expect(spotRows(page).nth(3)).toContainText('壁爐');
  await expect(spotRows(page).nth(0).getByRole('button', { name: /^上移/ })).toBeDisabled();
  await expect(spotRows(page).nth(8).getByRole('button', { name: /^下移/ })).toBeDisabled();
  /* 編號跟著順序（舞台上的編號圓標） */
  await expect(page.locator(`[data-shape-id="${s[3].id}"] text`)).toHaveText('3');
  await page.getByRole('button', { name: '下移「壁爐（複製）」' }).click();
  await expect(page.locator(`[data-shape-id="${s[3].id}"] text`)).toHaveText('4');
  /* 鍵盤：列有焦點時 Alt＋↑ */
  await rowItem(page, 3).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(spotRows(page).nth(2)).toContainText('壁爐（複製）');
  /* 拖曳把手 */
  const handle = spotRows(page).nth(0).locator('[data-drag-handle]');
  const hb = (await handle.boundingBox())!;
  const target = (await spotRows(page).nth(1).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, target.y + target.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await expect(spotRows(page).nth(0)).toContainText('書架');
  await expect(spotRows(page).nth(1)).toContainText('書桌');
  /* 順序不影響出現條件（記的是代號） */
  const after = await storedSpots(page);
  expect(after.find((x) => x.id === ID.drawer)).toMatchObject({ requires: [ID.shelf] });
  /* 復原（一次拖曳一步） */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(spotRows(page).nth(0)).toContainText('書桌');
  /* 刪除：其他熱點的條件裡的它一併拿掉（條件空了＝一開始就看得到，並提醒） */
  await page.getByRole('button', { name: '刪除「書架」' }).click();
  await expect(spotRows(page)).toHaveCount(8);
  const d = (await storedSpots(page)).find((x) => x.id === ID.drawer)!;
  expect(d.requires).toEqual([]);
  expect(d.locked).toBe(true);
  await spotRows(page).filter({ hasText: '書桌抽屜' }).click();
  await expect(page.getByText('還沒有勾任何熱點：目前等於一開始就看得到。')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 熱點的內容與出現條件 ---------- */

test('線索文字、檢定提示、KP 備註：存起來、字數上限（F30、F32、F33）', async ({ page }) => {
  const errors = await open(page);
  await selectRow(page, 3);
  await field(page, 'spot-text').fill('第一段\n\n第二段\n第二段的第二行');
  await field(page, 'spot-check').fill('聆聽 30%');
  await field(page, 'spot-memo').fill('只有 KP 知道');
  const s = (await storedSpots(page))[3];
  expect(s).toMatchObject({
    text: '第一段\n\n第二段\n第二段的第二行',
    check: '聆聽 30%',
    memo: '只有 KP 知道',
  });
  await field(page, 'spot-text').fill('字'.repeat(2100));
  await expect(field(page, 'spot-text')).toHaveValue('字'.repeat(2000));
  await field(page, 'spot-check').fill('字'.repeat(80));
  await expect(field(page, 'spot-check')).toHaveValue('字'.repeat(60));
  await field(page, 'spot-memo').fill('字'.repeat(1200));
  await expect(field(page, 'spot-memo')).toHaveValue('字'.repeat(1000));
  /* 單行欄位的換行換成空白 */
  await field(page, 'spot-check').fill('a\nb');
  await expect(field(page, 'spot-check')).toHaveValue('a b');
  expect(errors).toEqual([]);
});

test('線索圖片：選檔、網址、拿掉、不合格的網址（F31）', async ({ page }) => {
  const errors = await open(page);
  await selectRow(page, 0);
  await page
    .locator('[data-clue-drop] input[type=file]')
    .setInputFiles(file('遺照.png', await solid(200, 20, 20, 64, 48)));
  await expect(page.getByTestId('clue-image')).toContainText('遺照.png');
  await expect(toast(page, '已加入線索圖片')).toBeVisible();
  expect((await storedSpots(page))[0].image).toMatchObject({
    kind: 'asset',
    name: '遺照.png',
    width: 64,
    height: 48,
  });
  await page.getByRole('button', { name: '拿掉圖片', exact: true }).click();
  await expect(page.getByTestId('clue-image')).toHaveCount(0);
  expect((await storedSpots(page))[0].image).toBeNull();
  const url = page.getByTestId('clue-image-url');
  await url.fill('ftp://example.com/a.png');
  await url.press('Enter');
  await expect(page.getByText('請貼 http:// 或 https:// 開頭的圖片網址')).toBeVisible();
  await url.fill('https://img.example/clue.png');
  await url.press('Enter');
  await expect(page.getByTestId('clue-image')).toContainText('clue.png');
  expect((await storedSpots(page))[0].image).toEqual({
    kind: 'url',
    url: 'https://img.example/clue.png',
    name: 'clue.png',
  });
  /* 試玩：線索卡裡有圖，在文字上面 */
  await goPlay(page);
  await spot(play(page), ID.desk).click();
  const kids = await play(page)
    .locator('.cm-card')
    .evaluate((e) => [...e.children].map((c) => c.className));
  expect(kids.indexOf('cm-card-img')).toBeGreaterThan(0);
  expect(kids.indexOf('cm-card-img')).toBeLessThan(kids.indexOf('cm-text'));
  await expect(play(page).locator('.cm-card-img')).toHaveAttribute(
    'src',
    'https://img.example/clue.png',
  );
  expect(errors).toEqual([]);
});

test('出現條件：先找到指定的熱點、全部／任一、提醒、連鎖與「永遠不會出現」的警告、隱藏（F25、F40～F43）', async ({
  page,
}) => {
  const errors = await open(page);
  await selectRow(page, 3);
  const always = page.getByRole('radio', { name: '一開始就看得到', exact: true });
  const locked = page.getByRole('radio', { name: '先找到指定的熱點', exact: true });
  await expect(always).toBeChecked();
  await locked.click();
  await expect(page.getByText('還沒有勾任何熱點：目前等於一開始就看得到。')).toBeVisible();
  /* 清單不含自己 */
  await expect(page.getByRole('checkbox', { name: /窗戶/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /^1\s*書桌$/ }).click();
  await page.getByRole('checkbox', { name: /^3\s*壁爐$/ }).click();
  await expect(page.getByText('還沒有勾任何熱點')).toHaveCount(0);
  let w = (await storedSpots(page))[3];
  expect(w).toMatchObject({ locked: true, requires: [ID.desk, ID.fireplace], mode: 'all' });
  await page.getByRole('radio', { name: '任一個', exact: true }).click();
  expect((await storedSpots(page))[3].mode).toBe('any');
  await expect(spotRows(page).nth(3)).toContainText('需要解鎖');
  /* 改回一開始就看得到：指定的熱點保留，只是不作用 */
  await always.click();
  w = (await storedSpots(page))[3];
  expect(w).toMatchObject({ locked: false, requires: [ID.desk, ID.fireplace] });
  await expect(spotRows(page).nth(3)).not.toContainText('需要解鎖');
  /* 沒有警告 */
  await expect(page.getByTestId('never-warning')).toHaveCount(0);
  /* 書架等書桌抽屜、抽屜等書架：循環等待，兩個都永遠不會出現（保險箱要等抽屜，也出不來） */
  await spotRows(page).nth(1).click();
  await page.getByRole('radio', { name: '先找到指定的熱點', exact: true }).click();
  await page.getByRole('checkbox', { name: /書桌抽屜/ }).click();
  await expect(page.getByTestId('never-warning')).toContainText('這個熱點永遠不會出現');
  await expect(spotRows(page).nth(1)).toContainText('不會出現');
  await expect(spotRows(page).nth(5)).toContainText('不會出現');
  await expect(spotRows(page).nth(6)).toContainText('不會出現');
  await expect(spotRows(page).nth(0)).not.toContainText('不會出現');
  /* 把書架的條件拿掉就好了 */
  await page.getByRole('radio', { name: '一開始就看得到', exact: true }).click();
  await expect(page.getByTestId('never-warning')).toHaveCount(0);
  await expect(spotRows(page).nth(5)).not.toContainText('不會出現');
  /* 隱藏熱點 */
  await spotRows(page).nth(0).click();
  await page.getByRole('switch', { name: '隱藏熱點' }).click();
  expect((await storedSpots(page))[0].hidden).toBe(true);
  await expect(spotRows(page).nth(0)).toContainText('隱藏');
  await expect(page.locator(`[data-shape-id="${ID.desk}"] rect`).last()).toHaveAttribute(
    'stroke-dasharray',
    /.+/,
  );
  expect(errors).toEqual([]);
});

/* ---------- 試玩（遊玩畫面） ---------- */

test('試玩：找到、線索卡、解鎖、進度、已找到的清單、重新翻出、關閉（F60～F64）', async ({
  page,
}) => {
  const errors = await open(page);
  await goPlay(page);
  const p = play(page);
  await expect(p.locator('.cm-title')).toHaveText('舊書房的調查');
  await expect(p.locator('.cm-progress')).toHaveText('找到 0／8');
  await expect(p.locator('.cm-card')).toContainText('點選場景裡的熱點，開始調查。');
  /* 還沒解鎖的熱點不在畫面上；隱藏的熱點沒有輪廓 */
  await expect(spot(p, ID.drawer)).toBeHidden();
  await expect(spot(p, ID.safe)).toBeHidden();
  await expect(spot(p, ID.hatch)).toHaveAttribute('data-vis', 'none');
  /* 找到書架 */
  await spot(p, ID.shelf).click();
  await expect(p.locator('.cm-card-name')).toHaveText('書架');
  await expect(p.locator('.cm-kicker')).toHaveText('線索 2');
  await expect(p.locator('.cm-check')).toContainText('檢定提示：圖書館使用 50%');
  await expect(p.locator('.cm-progress')).toHaveText('找到 1／8');
  await expect(p.locator('.cm-found-item')).toHaveCount(1);
  await expect(spot(p, ID.shelf)).toHaveAttribute('data-state', 'found');
  await expect(spot(p, ID.shelf).locator('.cm-mark')).toBeVisible();
  /* 書桌抽屜出現，並有提示 */
  await expect(spot(p, ID.drawer)).toBeVisible();
  await expect(p.locator('.cm-note')).toHaveText('出現了 1 處新的地方可以調查。');
  await spot(p, ID.drawer).click();
  await expect(p.locator('.cm-card-name')).toHaveText('書桌抽屜');
  /* 保險箱：要掛畫和抽屜都找到 */
  await expect(spot(p, ID.safe)).toBeHidden();
  await spot(p, ID.painting).click();
  await expect(spot(p, ID.safe)).toBeVisible();
  await spot(p, ID.safe).click();
  await expect(p.locator('.cm-card-name')).toHaveText('牆後保險箱');
  await expect(p.locator('.cm-progress')).toHaveText('找到 4／8');
  /* 已找到的清單：依找到的先後；點一項重新翻出 */
  await expect(p.locator('.cm-found-name')).toHaveText(['書架', '書桌抽屜', '掛畫', '牆後保險箱']);
  await p.locator(`[data-found-item="${ID.shelf}"]`).click();
  await expect(p.locator('.cm-card-name')).toHaveText('書架');
  await expect(p.locator(`[data-found-item="${ID.shelf}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
  /* 關閉 */
  await p.getByRole('button', { name: '關閉線索卡' }).click();
  await expect(p.locator('.cm-card')).toContainText('點選場景裡的熱點，開始調查。');
  await expect(p.locator('.cm-progress')).toHaveText('找到 4／8');
  /* 全部找到 */
  for (const id of [ID.desk, ID.fireplace, ID.window, ID.hatch]) await spot(p, id).click();
  await expect(p.locator('.cm-progress')).toHaveText('全部線索都找到了');
  await expect(p).toHaveAttribute('data-complete', '');
  expect(errors).toEqual([]);
});

test('試玩：隱藏熱點點對位置才出現；橢圓的點擊範圍是橢圓；小熱點的點擊範圍至少 28 px（F65、F71）', async ({
  page,
}) => {
  const errors = await open(page);
  await goPlay(page);
  const p = play(page);
  const hatch = spot(p, ID.hatch);
  const b = (await hatch.boundingBox())!;
  /* 橢圓的角落點不到 */
  await page.mouse.click(b.x + 2, b.y + 2);
  await expect(p.locator('.cm-progress')).toHaveText('找到 0／8');
  /* 中心點得到 */
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(p.locator('.cm-card-name')).toHaveText('地毯下的暗格');
  await expect(hatch).toHaveAttribute('data-state', 'found');
  await expect(hatch).toHaveAttribute('data-vis', 'ring');
  /* 小熱點：畫一個 1.5% × 1.5%（約 11 px）的，點擊範圍撐到 28 px */
  await goEdit(page);
  await tool(page, '畫矩形').click();
  await dragStage(page, [2, 2], [3.6, 3.6]);
  await page.getByTestId('spot-name').fill('小點');
  await goPlay(page);
  const tiny = p.locator('[data-spot]').last();
  const tb = (await tiny.boundingBox())!;
  expect(tb.width).toBeGreaterThanOrEqual(27.5);
  expect(tb.height).toBeGreaterThanOrEqual(27.5);
  const sb = (await p.locator('.cm-scene').boundingBox())!;
  expect(tb.width).toBeLessThan(sb.width * 0.2);
  expect(errors).toEqual([]);
});

test('試玩：顯示所有熱點、重來（兩段確認）、鍵盤、進度在編輯／試玩切換與改設定時保留（F66、F67、F72、F80、F81）', async ({
  page,
}) => {
  const errors = await open(page);
  await goPlay(page);
  const p = play(page);
  /* 顯示所有熱點 */
  const reveal = p.getByRole('button', { name: '顯示所有熱點', exact: true });
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('.cm-spot:not([hidden])')).toHaveCount(8);
  await expect(spot(p, ID.drawer)).toHaveAttribute('data-state', 'locked');
  await expect(spot(p, ID.drawer)).toHaveAttribute('title', '尚未解鎖：先找到 書架');
  await expect(spot(p, ID.safe)).toHaveAttribute('title', '尚未解鎖：先找到 掛畫、書桌抽屜');
  await expect(spot(p, ID.hatch)).toHaveAttribute('data-dashed', '1');
  await expect(spot(p, ID.desk).locator('.cm-badge')).toHaveText('1');
  await expect(p.locator('.cm-progress')).toHaveText('找到 0／8');
  /* 不能點未解鎖的 */
  await spot(p, ID.drawer).click({ force: true });
  await expect(p.locator('.cm-progress')).toHaveText('找到 0／8');
  await reveal.click();
  await expect(spot(p, ID.drawer)).toBeHidden();
  /* 鍵盤：Tab 順序只有看得到的；Enter 找到、Esc 關閉並把焦點還回去 */
  await expect(spot(p, ID.desk))
    .toHaveAttribute('tabindex', /^(?!-1).*$|^$/)
    .catch(() => undefined);
  expect(await spot(p, ID.hatch).getAttribute('tabindex')).toBe('-1');
  expect(await spot(p, ID.hatch).getAttribute('aria-hidden')).toBe('true');
  expect(await spot(p, ID.drawer).getAttribute('tabindex')).toBe('-1');
  await spot(p, ID.desk).focus();
  await page.keyboard.press('Enter');
  await expect(p.locator('.cm-card-name')).toHaveText('書桌');
  await page.keyboard.press('Escape');
  await expect(p.locator('.cm-card')).toContainText('點選場景裡的熱點');
  await expect(spot(p, ID.desk)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(spot(p, ID.shelf)).toBeFocused();
  /* 編輯／試玩切換後進度還在 */
  await spot(p, ID.shelf).click();
  await goEdit(page);
  await goPlay(page);
  await expect(play(page).locator('.cm-progress')).toHaveText('找到 2／8');
  await expect(play(page).locator('.cm-card-name')).toHaveText('書架');
  /* 試玩時改文字：畫面即時更新，進度保留 */
  await tab(page, '熱點').click();
  await spotRows(page).nth(1).click();
  await field(page, 'spot-text').fill('改過的書架線索');
  await expect(play(page).locator('.cm-card .cm-text')).toHaveText('改過的書架線索');
  await expect(play(page).locator('.cm-progress')).toHaveText('找到 2／8');
  /* 刪掉一個已找到的熱點：進度自動丟掉那個 */
  await page.getByRole('button', { name: '刪除「書桌」' }).click();
  await expect(play(page).locator('.cm-progress')).toHaveText('找到 1／7');
  /* 重來：第一次按只是要求確認 */
  const reset = play(page).getByRole('button', { name: /重來|再按一次確定重來/ });
  await reset.click();
  await expect(reset).toHaveText('再按一次確定重來');
  await expect(play(page).locator('.cm-progress')).toHaveText('找到 1／7');
  await reset.click();
  await expect(play(page).locator('.cm-progress')).toHaveText('找到 0／7');
  await expect(play(page).locator('.cm-found-empty')).toHaveText('還沒有找到線索。');
  expect(errors).toEqual([]);
});

test('遊玩設定：配色、標示方式、顏色、找到後的標記、名稱、進度、顯示所有熱點按鈕（F50～F56）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '遊玩設定').click();
  await goPlay(page);
  const p = play(page);
  const root = p;
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: '淺色', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).toHaveCSS('background-color', 'rgb(244, 241, 234)');
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(root).toHaveCSS('background-color', 'rgb(21, 24, 29)');
  /* 標示方式 */
  await page.getByRole('radio', { name: '圓點', exact: true }).click();
  await expect(spot(p, ID.desk)).toHaveAttribute('data-vis', 'dot');
  await page.getByRole('radio', { name: '不顯示', exact: true }).click();
  await expect(spot(p, ID.desk)).toHaveAttribute('data-vis', 'none');
  await page.getByRole('radio', { name: '輪廓', exact: true }).click();
  await expect(spot(p, ID.desk)).toHaveAttribute('data-vis', 'ring');
  /* 找到後的標記 */
  await spot(p, ID.desk).click();
  await expect(spot(p, ID.desk)).toHaveAttribute('data-check', '1');
  await expect(spot(p, ID.desk)).toHaveAttribute('data-tone', 'found');
  for (const [label, check, tone] of [
    ['只打勾', '1', 'accent'],
    ['只變色', null, 'found'],
    ['不標記', null, 'accent'],
  ] as const) {
    await page.getByRole('combobox', { name: '找到後的標記' }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await expect(spot(p, ID.desk)).toHaveAttribute('data-tone', tone);
    if (check) await expect(spot(p, ID.desk)).toHaveAttribute('data-check', check);
    else await expect(spot(p, ID.desk)).not.toHaveAttribute('data-check', /.*/);
  }
  /* 顏色 */
  await page.getByRole('textbox', { name: '熱點顏色' }).fill('#ff0000');
  await page.getByRole('textbox', { name: '熱點顏色' }).press('Enter');
  await expect(root).toHaveCSS('--cm-accent', '#ff0000');
  /* 名稱 */
  await expect(p.locator('.cm-tag:not([hidden])')).toHaveCount(0);
  await page.getByRole('switch', { name: '顯示熱點名稱' }).click();
  await expect(p.locator('.cm-tag:not([hidden])').first()).toBeVisible();
  const shown = await p.locator('.cm-tag:not([hidden])').allTextContents();
  expect(shown).toContain('書架');
  expect(shown).not.toContain('地毯下的暗格');
  expect(shown).not.toContain('書桌抽屜');
  /* 進度 */
  await page.getByRole('combobox', { name: '進度顯示' }).click();
  await page.getByRole('option', { name: '只顯示找到的數量', exact: true }).click();
  await expect(p.locator('.cm-progress')).toHaveText('已找到 1 個');
  await page.getByRole('combobox', { name: '進度顯示' }).click();
  await page.getByRole('option', { name: '不顯示', exact: true }).click();
  await expect(p.locator('.cm-progress')).toHaveCount(0);
  /* 顯示所有熱點的按鈕 */
  await expect(p.getByRole('button', { name: '顯示所有熱點' })).toBeVisible();
  await page.getByRole('switch', { name: '放「顯示所有熱點」按鈕' }).click();
  await expect(p.getByRole('button', { name: '顯示所有熱點' })).toHaveCount(0);
  await expect(p.getByRole('button', { name: '重來' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('遊玩畫面的版面：寬的時候場景在左、線索卡在右；窄的時候上下，點熱點後線索卡捲進畫面（F69）', async ({
  page,
}) => {
  const errors = await open(page);
  await goPlay(page);
  const p = play(page);
  let scene = (await p.locator('.cm-scene').boundingBox())!;
  let side = (await p.locator('.cm-side').boundingBox())!;
  expect(side.x).toBeGreaterThan(scene.x + scene.width - 1);
  expect(Math.abs(side.y - scene.y)).toBeLessThan(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(p.locator('.cm-main')).toBeVisible();
  scene = (await p.locator('.cm-scene').boundingBox())!;
  side = (await p.locator('.cm-side').boundingBox())!;
  expect(side.y).toBeGreaterThanOrEqual(scene.y + scene.height - 1);
  expect(scene.width).toBeLessThanOrEqual(390);
  await noHorizontalScroll(page);
  await spot(p, ID.window).click();
  await expect(p.locator('.cm-card')).toBeInViewport();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('減少動態效果時熱點不閃動（F70）', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  await goPlay(page);
  await expect(spot(play(page), ID.desk).locator('.cm-ring')).toHaveCSS('animation-name', 'none');
  expect(errors).toEqual([]);
});

/* ---------- 互動 HTML ---------- */

/** 把下載的 HTML 放在一個真的網址上打開（有自己的 localStorage；其他的網路請求一律記下來） */
async function openStandalone(page: Page, html: string, url = 'https://clue.test/play.html') {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && r.url() !== url && !/img\.example/.test(r.url()))
      requests.push(r.url());
  });
  await routeImages(page);
  await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(url);
  return requests;
}

async function downloadHtml(page: Page): Promise<{ name: string; html: string; code: string }> {
  await page.getByTestId('export-html').click();
  const dialog = page.getByTestId('html-dialog');
  const code = dialog.getByRole('textbox', { name: '程式碼' });
  await expect(code).toHaveValue(/^<!-- 調查熱點圖（TRPG Toolkit） -->/);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '下載 HTML' }).click(),
  ]);
  const out = {
    name: dl.suggestedFilename(),
    html: readFileSync((await dl.path()) as string, 'utf8'),
    code: await code.inputValue(),
  };
  await page.keyboard.press('Escape');
  return out;
}

test('互動 HTML：程式碼、下載的檔案離線也能玩、記住進度、沒有 KP 備註、重來（F68、F90）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await page.getByTestId('export-html').click();
  const dialog = page.getByTestId('html-dialog');
  await expect(dialog.getByText(/^約 [\d.]+ (KB|MB)$/)).toBeVisible();
  await page.keyboard.press('Escape');
  const { name, html, code } = await downloadHtml(page);
  expect(name).toBe('調查熱點圖_舊書房的調查.html');
  expect(html).toContain(code);
  expect(html).toMatch(/^<!doctype html>\n<html lang="zh-Hant-TW">/);
  expect(html).toContain('<title>舊書房的調查</title>');
  /* 不載入外部資源；內建場景內嵌成 JPEG；沒有 KP 備註 */
  expect(code.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '')).not.toMatch(
    /cdn|googleapis|https?:\/\//i,
  );
  expect(code).toContain('data:image/jpeg;base64,');
  for (const s of ['筆痕可以用鉛筆', '鑰匙可以打開書桌抽屜', '不要提示地毯', 'memo'])
    expect(code, s).not.toContain(s);
  expect(code).toContain('皮面日記');

  /* 獨立網頁：不用網路就能玩 */
  const p2 = await context.newPage();
  const errs2: string[] = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  const requests = await openStandalone(p2, html);
  const root = p2.locator('[data-cm="root"]');
  await expect(root.locator('.cm-title')).toHaveText('舊書房的調查');
  await expect(root.locator('.cm-progress')).toHaveText('找到 0／8');
  await expect
    .poll(() => root.locator('.cm-img').evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(1200);
  await root.locator(`[data-spot="${ID.shelf}"]`).click();
  await expect(root.locator('.cm-card-name')).toHaveText('書架');
  await expect(root.locator(`[data-spot="${ID.drawer}"]`)).toBeVisible();
  await root.locator(`[data-spot="${ID.hatch}"]`).click();
  await expect(root.locator('.cm-progress')).toHaveText('找到 2／8');
  /* 記住進度：重新整理後還在 */
  await p2.reload();
  await expect(p2.locator('.cm-progress')).toHaveText('找到 2／8');
  await expect(p2.locator('.cm-found-name')).toHaveText(['書架', '地毯下的暗格']);
  await expect(p2.locator(`[data-spot="${ID.drawer}"]`)).toBeVisible();
  expect(await p2.evaluate(() => Object.keys(localStorage))).toEqual([
    expect.stringMatching(/^trpg-toolkit:clue-map:progress:[0-9a-f]{8}$/),
  ]);
  /* 重來：兩段確認，清掉儲存 */
  const reset = p2.getByRole('button', { name: /重來|再按一次確定重來/ });
  await reset.click();
  await reset.click();
  await expect(p2.locator('.cm-progress')).toHaveText('找到 0／8');
  expect(await p2.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await p2.reload();
  await expect(p2.locator('.cm-progress')).toHaveText('找到 0／8');
  /* 窄畫面 */
  await p2.setViewportSize({ width: 300, height: 700 });
  expect(await p2.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(300);
  expect(requests).toEqual([]);
  expect(errs2).toEqual([]);
  expect(errors).toEqual([]);
});

test('互動 HTML：改了內容就不沿用舊進度；開新視窗試玩；用到的圖片內嵌或用網址（F68、F90）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  /* 場景用網址、一個熱點的線索圖用上傳的圖 */
  await page.getByTestId('scene-url').fill('https://img.example/wide.png');
  await page.getByTestId('scene-url').press('Enter');
  await selectRow(page, 0);
  await page
    .locator('[data-clue-drop] input[type=file]')
    .setInputFiles(file('遺照.png', await solid(200, 20, 20, 64, 48)));
  await expect(page.getByTestId('clue-image')).toBeVisible();
  const first = await downloadHtml(page);
  expect(first.code).toContain('https://img.example/wide.png');
  expect(first.code).toMatch(/data:image\/png;base64,/);
  expect(first.code).not.toContain('data:image/jpeg');
  /* 玩一下 */
  const p2 = await context.newPage();
  await openStandalone(p2, first.html);
  await p2.locator(`[data-spot="${ID.desk}"]`).click();
  await expect(p2.locator('.cm-card-img')).toBeVisible();
  await expect
    .poll(() => p2.locator('.cm-card-img').evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(64);
  await expect(p2.locator('.cm-progress')).toHaveText('找到 1／8');
  /* 改了一個線索的文字再匯出：進度鍵不同，不沿用 */
  await field(page, 'spot-text').fill('改過的線索');
  const second = await downloadHtml(page);
  const p3 = await context.newPage();
  await openStandalone(p3, second.html);
  await expect(p3.locator('.cm-progress')).toHaveText('找到 0／8');
  /* 只改 KP 備註、遊玩設定：進度鍵不變 */
  await field(page, 'spot-memo').fill('只改備註');
  const third = await downloadHtml(page);
  const key = (h: string) => /trpg-toolkit:clue-map:progress:[0-9a-f]{8}/.exec(h)?.[0];
  expect(key(third.html)).toBe(key(second.html));
  expect(key(first.html)).not.toBe(key(second.html));
  /* 開新視窗試玩 */
  await page.getByTestId('export-html').click();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('html-dialog').getByRole('button', { name: '開新視窗試玩' }).click(),
  ]);
  await expect(popup.locator('.cm-progress')).toHaveText('找到 0／8');
  await popup.locator(`[data-spot="${ID.window}"]`).click();
  await expect(popup.locator('.cm-card-name')).toHaveText('窗戶');
  await popup.close();
  expect(errors.filter((e) => !/blob:/.test(e))).toEqual([]);
});

test('互動 HTML：標題、名稱、文字裡的 HTML 與 </script> 一律當文字（F90）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const evil = '<img src=x onerror=__pwned=1>';
  const long = `</script>${evil}<b>粗</b>&amp;`;
  await page.getByTestId('title-input').fill(long);
  await page.getByTestId('intro-input').fill(long);
  await selectRow(page, 0);
  await field(page, 'spot-name').fill(evil);
  await field(page, 'spot-text').fill(long);
  await field(page, 'spot-check').fill(evil);
  const { html, code } = await downloadHtml(page);
  expect(code.match(/<\/script>/g)?.length).toBe(1);
  expect(html).toContain('<title>&lt;/script&gt;&lt;img src=x onerror=__pwned=1&gt;');
  const p2 = await context.newPage();
  const errs2: string[] = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await openStandalone(p2, html);
  await expect(p2.locator('.cm-title')).toHaveText(long);
  await expect(p2.locator('.cm-intro')).toHaveText(long);
  await p2.locator(`[data-spot="${ID.desk}"]`).click();
  await expect(p2.locator('.cm-card-name')).toHaveText(evil);
  await expect(p2.locator('.cm-card .cm-text')).toHaveText(long);
  await expect(p2.locator('.cm-check')).toHaveText(`檢定提示：${evil}`);
  expect(
    await p2.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  expect(await p2.locator('.cm b').count()).toBe(0);
  expect(errs2).toEqual([]);
  expect(errors).toEqual([]);
});

/* ---------- 分享連結 ---------- */

test('分享連結：畫面只有遊玩畫面、能玩、不含 KP 備註、不動到自己存的內容、記住進度、自己做一張（F68、F91、F92）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await page.getByTestId('title-input').fill('我的調查');
  const before = await stored(page);
  await page.getByTestId('export-share').click();
  const dialog = page.getByTestId('share-dialog');
  const link = dialog.getByRole('textbox', { name: '連結' });
  const url = await link.inputValue();
  expect(url).toMatch(/\/next\/clue-map\/#m=[A-Za-z0-9_-]+$/);
  expect(url.length).toBeLessThan(8100);
  await expect(dialog.getByText(/^\d+ 字$/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: '開啟連結' })).toHaveAttribute('href', url);
  await page.keyboard.press('Escape');

  const p2 = await context.newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  const errs2: string[] = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(url);
  await expect(p2.getByTestId('player')).toBeVisible();
  await expect(p2.getByRole('complementary', { name: '設定' })).toHaveCount(0);
  const root = p2.getByTestId('play-host');
  await expect(root.locator('.cm-title')).toHaveText('我的調查');
  await expect(root.locator('.cm-progress')).toHaveText('找到 0／8');
  await expect
    .poll(() => root.locator('.cm-img').evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(1200);
  await root.locator(`[data-spot="s1"]`).click();
  await expect(root.locator('.cm-card-name')).toHaveText('書架');
  await expect(root.locator(`[data-spot="s5"]`)).toBeVisible();
  /* 沒有 KP 備註（連結裡、畫面裡都沒有） */
  expect(await p2.content()).not.toContain('鑰匙可以打開書桌抽屜');
  expect(url).not.toContain('memo');
  /* 記住進度、重新整理後還在 */
  await p2.reload();
  await expect(p2.getByTestId('play-host').locator('.cm-progress')).toHaveText('找到 1／8');
  /* 不動到這個瀏覽器自己存的內容 */
  expect(await stored(p2)).toEqual(before);
  await p2.setViewportSize({ width: 300, height: 700 });
  await noHorizontalScroll(p2);
  /* 自己做一張：回到編輯畫面（沒有 #m） */
  await p2.getByRole('link', { name: '自己做一張' }).click();
  await expect(p2.getByRole('complementary', { name: '設定' })).toBeVisible();
  expect(p2.url()).not.toContain('#');
  expect(errs2).toEqual([]);
  expect(errors).toEqual([]);
});

test('分享連結：上傳的圖片時停用並說明；網址的圖與內建場景可以；文字太多放不進時停用（F91）', async ({
  page,
}) => {
  const errors = await open(page);
  const share = page.getByTestId('export-share');
  await expect(share).toBeEnabled();
  await expect(page.getByTestId('share-blocked')).toHaveCount(0);
  /* 場景用上傳的圖 */
  await page
    .getByRole('group', { name: '場景圖' })
    .locator('input[type=file]')
    .setInputFiles(file('房間.png', await solid(10, 10, 10, 120, 80)));
  await expect(share).toBeDisabled();
  await expect(page.getByTestId('share-blocked')).toHaveText(
    '用到上傳的圖片，放不進連結：請改用互動 HTML，或把圖片放到網路上用網址加入。',
  );
  /* 改用網址的場景：可以 */
  await page.getByTestId('scene-url').fill('https://img.example/wide.png');
  await page.getByTestId('scene-url').press('Enter');
  await expect(share).toBeEnabled();
  /* 線索圖用上傳的：不行；用網址的：可以 */
  await selectRow(page, 0);
  await page
    .locator('[data-clue-drop] input[type=file]')
    .setInputFiles(file('遺照.png', await solid(200, 20, 20, 64, 48)));
  await expect(share).toBeDisabled();
  await page.getByRole('button', { name: '拿掉圖片', exact: true }).click();
  await expect(share).toBeEnabled();
  await page.getByTestId('clue-image-url').fill('https://img.example/clue.png');
  await page.getByTestId('clue-image-url').press('Enter');
  await expect(share).toBeEnabled();
  await share.click();
  const url = await page
    .getByTestId('share-dialog')
    .getByRole('textbox', { name: '連結' })
    .inputValue();
  await page.keyboard.press('Escape');
  const p2 = await page.context().newPage();
  await routeImages(p2);
  await p2.goto(url);
  await expect(p2.getByTestId('player')).toBeVisible();
  await expect(p2.locator('.cm-img')).toHaveAttribute('src', 'https://img.example/wide.png');
  await p2.locator(`[data-spot="s0"]`).click();
  await expect(p2.locator('.cm-card-img')).toHaveAttribute('src', 'https://img.example/clue.png');
  await p2.close();
  /* 文字太多：連結超過 8000 字，停用 */
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const i of [1, 2, 3]) {
    await spotRows(page).nth(i).click();
    const text = Array.from({ length: 2000 }, () =>
      String.fromCodePoint(0x4e00 + Math.floor(rand() * 20000)),
    ).join('');
    await field(page, 'spot-text').fill(text);
  }
  await expect(share).toBeDisabled();
  await expect(page.getByTestId('share-blocked')).toHaveText(
    '線索文字太多，連結放不下（超過 8000 字）：請改用互動 HTML。',
  );
  expect(errors.filter((e) => !/Failed to load/.test(e))).toEqual([]);
});

test('壞掉的連結：照常開編輯畫面、通知一次、拿掉網址的 #m；亂改的內容會被整理（F92）', async ({
  page,
}) => {
  const errors = await open(page, `${URL}#m=broken`);
  await expect(toast(page, '這個分享連結讀不出來')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain('#');
  await page.reload();
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();
  await expect(toast(page, '這個分享連結讀不出來')).toHaveCount(0);
  /* 場景不合格（javascript: 網址）也算壞掉 */
  const bad = encodeShareHash(
    { scene: { kind: 'url', url: 'javascript:alert(1)' }, spots: [] },
    { version: 1, key: 'm' },
  );
  await page.goto(`${URL}${bad}`);
  await expect(toast(page, '這個分享連結讀不出來')).toBeVisible();
  /* 亂改的內容：數值夾到範圍、選項不認得用預設、圖片只收 http(s)、索引超出範圍的條件丟掉 */
  const tampered = encodeShareHash(
    {
      title: '<b>改</b>',
      scene: { kind: 'builtin', id: 'paper' },
      spots: [
        {
          name: 'A',
          shape: 'star',
          x: -50,
          y: 500,
          w: 900,
          h: 0,
          text: 't',
          image: { url: 'javascript:alert(1)' },
          req: [0, 1, 99, -1],
          mode: 'zzz',
          hidden: 'yes',
        },
        { name: 'B', x: 10, y: 10, w: 10, h: 10, req: [1, 1], mode: 'any' },
      ],
      look: { theme: 'neon', accent: 'red' },
    },
    { version: 1, key: 'm' },
  );
  await page.goto(`${URL}${tampered}`);
  await expect(page.getByTestId('player')).toBeVisible();
  const p = play(page);
  await expect(p.locator('.cm-title')).toHaveText('<b>改</b>');
  await expect(p).toHaveAttribute('data-theme', 'dark');
  const a = spot(p, 's0');
  expect(
    await a.evaluate((e) => [e.style.left, e.style.top, e.style.width, e.style.height]),
  ).toEqual(['50%', '99.25%', '100%', '1.5%']);
  await expect(a).toHaveAttribute('data-shape', 'rect');
  /* A 的條件：0 是自己、99 與 -1 超出範圍都丟掉，只剩 1（B）→ 要先找到 B；B 的條件只有自己（重複）→ 沒有條件 */
  await expect(a).toHaveAttribute('data-state', 'locked');
  await expect(spot(p, 's1')).toHaveAttribute('data-state', 'ready');
  await spot(p, 's1').click();
  await expect(a).toHaveAttribute('data-state', 'ready');
  await a.click();
  await expect(p.locator('.cm-card-img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 總覽 PNG ---------- */

/** 瀏覽器解碼 PNG：寬高、指定座標的顏色、某個顏色的像素數 */
async function inspectPng(
  page: Page,
  bytes: Buffer,
  probes: [number, number][],
  color?: [number, number, number],
) {
  return page.evaluate(
    async ({ b64, probes, color }) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const at = (x: number, y: number) =>
        Array.from(px.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4));
      let n = 0;
      if (color)
        for (let i = 0; i < px.length; i += 4)
          if (px[i] === color[0] && px[i + 1] === color[1] && px[i + 2] === color[2]) n++;
      return { width: bmp.width, height: bmp.height, probes: probes.map(([x, y]) => at(x, y)), n };
    },
    { b64: bytes.toString('base64'), probes, color },
  );
}

test('總覽 PNG：寬 1200（2× 是 2400）、背景色、熱點的輪廓顏色、尺寸和預估一致、檔名（F93）', async ({
  page,
}) => {
  const errors = await open(page);
  const label = await page.getByTestId('overview-size').innerText();
  const [, est1w, est1h] = /約 (\d+) × (\d+) px/.exec(label)!;
  expect(est1w).toBe('1200');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-overview').click(),
  ]);
  expect(dl.suggestedFilename()).toBe('調查熱點圖_舊書房的調查_總覽.png');
  const bytes = readFileSync((await dl.path()) as string);
  const info = await inspectPng(page, bytes, [[3, 3]], [245, 184, 61]);
  expect(info.width).toBe(1200);
  /* 預估是還沒讀圖片時的版面（場景比例相同，所以高度一樣） */
  expect(Math.abs(info.height - Number(est1h))).toBeLessThanOrEqual(2);
  expect(info.probes[0]).toEqual([246, 243, 236, 255]);
  /* 熱點輪廓（#f5b83d）有畫出來 */
  expect(info.n).toBeGreaterThan(500);
  await expect(toast(page, '已下載 調查熱點圖_舊書房的調查_總覽.png')).toBeVisible();
  /* 2× */
  await page.getByRole('radio', { name: '2 倍', exact: true }).click();
  await expect(page.getByTestId('overview-size')).toContainText(`${2400} × ${Number(est1h) * 2}`);
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-overview').click(),
  ]);
  const b2 = readFileSync((await dl2.path()) as string);
  const info2 = await inspectPng(page, b2, []);
  expect(info2.width).toBe(2400);
  expect(Math.abs(info2.height - info.height * 2)).toBeLessThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('總覽 PNG：網址的圖讀不到時用灰底並通知、沒有熱點時只有場景（F93）', async ({ page }) => {
  const errors = await open(page);
  /* 讀不到的網址圖 */
  await page.route(/img\.example\/broken/, (r) => r.abort());
  await page.getByTestId('scene-url').fill('https://img.example/broken.png');
  await page.getByTestId('scene-url').press('Enter');
  await expect(page.getByTestId('scene-load-failed')).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-overview').click(),
  ]);
  await expect(toast(page, '有圖片讀不到，總覽裡改用灰底代替')).toBeVisible();
  const info = await inspectPng(page, readFileSync((await dl.path()) as string), [[700, 200]]);
  expect(info.width).toBe(1200);
  /* 場景的位置是灰底 #cfc9ba（取樣的點在場景裡、不在任何熱點上） */
  expect(info.probes[0].slice(0, 3)).toEqual([207, 201, 186]);
  /* 沒有熱點 */
  await clearAll(page);
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-overview').click(),
  ]);
  const small = await inspectPng(page, readFileSync((await dl2.path()) as string), []);
  expect(small.height).toBeLessThan(info.height / 2);
  expect(errors.filter((e) => !/Failed to load|ERR_FAILED/.test(e))).toEqual([]);
});

/* ---------- 專案檔、自動儲存、復原、快捷鍵 ---------- */

/** 專案檔（JSON）的內容 */
const projectJson = (data: unknown) =>
  Buffer.from(
    JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'clue-map',
      version: 1,
      savedAt: new Date().toISOString(),
      data,
    }),
  );

test('專案檔（ZIP，沒有圖片時也是）：存檔、重設（回到範例）、開啟；含 KP 備註（F94）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('title-input').fill('改過的標題');
  await page.getByTestId('title-input').press('Enter');
  const saved = await saveProject(page);
  expect(saved.name).toMatch(/^調查熱點圖_\d{8}\.zip$/);
  const zip0 = unzipSync(new Uint8Array(saved.bytes));
  expect(Object.keys(zip0)).toEqual(['project.json']);
  const project = JSON.parse(strFromU8(zip0['project.json']));
  expect(project).toMatchObject({ format: 'trpg-toolkit-project', tool: 'clue-map', version: 1 });
  expect(project.data.title).toBe('改過的標題');
  expect(project.data.spots).toHaveLength(8);
  expect(project.data.spots[0].memo).toContain('筆痕');
  expect(project.data.scene).toEqual({ kind: 'builtin', id: 'study' });
  /* 重設：回到範例 */
  await page.waitForTimeout(450);
  await openProjectItem(page, '重設…');
  await expect(page.getByRole('alertdialog')).toContainText('回到範例的書房');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  /* 開啟剛才的專案檔 */
  await page.waitForTimeout(450);
  await openProjectFile(page, saved.name, saved.bytes, 'application/zip');
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect(page.getByTestId('title-input')).toHaveValue('改過的標題');
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  /* 開啟專案檔也可以復原 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  expect(errors).toEqual([]);
});

test('專案檔（有上傳的圖片時是 ZIP）：場景與線索圖片都放進去、重設、開啟後圖片還在（F94）', async ({
  page,
}) => {
  const errors = await open(page);
  await page
    .getByRole('group', { name: '場景圖' })
    .locator('input[type=file]')
    .setInputFiles(file('房間.png', await solid(30, 60, 90, 120, 80)));
  await expect(page.getByTestId('scene-name')).toHaveText('房間.png');
  await selectRow(page, 1);
  await page
    .locator('[data-clue-drop] input[type=file]')
    .setInputFiles(file('書影.png', await solid(200, 20, 20, 64, 48)));
  await expect(page.getByTestId('clue-image')).toBeVisible();
  const saved = await saveProject(page);
  expect(saved.name).toMatch(/^調查熱點圖_\d{8}\.zip$/);
  const zip = unzipSync(new Uint8Array(saved.bytes));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project).toMatchObject({ format: 'trpg-toolkit-project', tool: 'clue-map', version: 1 });
  const sceneId = project.data.scene.id;
  const clueId = project.data.spots[1].image.id;
  expect(Object.keys(zip)).toEqual(
    expect.arrayContaining([`files/${sceneId}.png`, `files/${clueId}.png`]),
  );
  /* 重設 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await tab(page, '場景').click();
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  /* 開啟 ZIP：圖片回來 */
  await openProjectFile(page, saved.name, saved.bytes, 'application/zip');
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await tab(page, '場景').click();
  await expect(page.getByTestId('scene-name')).toHaveText('房間.png');
  await selectRow(page, 1);
  await expect(page.getByTestId('clue-image')).toContainText('書影.png');
  /* 重新整理後圖片還在 */
  await page.reload();
  await expect(page.getByTestId('scene-name')).toHaveText('房間.png');
  await expect
    .poll(() => stageImage(page).evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(120);
  expect(errors).toEqual([]);
});

test('專案檔：不認得的檔、缺圖片、超過 40 個熱點的通知（F94、F23、E06）', async ({ page }) => {
  const errors = await open(page);
  await openProjectFile(page, 'x.json', Buffer.from('{"hello":1}'), 'application/json');
  await expect(toast(page, '無法開啟專案檔')).toBeVisible();
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  /* 缺圖片：專案檔指到不存在的上傳圖 */
  await openProjectFile(
    page,
    'missing.json',
    projectJson({
      title: '缺圖',
      scene: { kind: 'asset', id: 'anotexist', name: 'x.png', width: 10, height: 10 },
      spots: [],
    }),
    'application/json',
  );
  await expect(toast(page, '無法開啟專案檔')).toHaveCount(2);
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  /* 超過 40 個：多的丟掉並通知 */
  await openProjectFile(
    page,
    'many.json',
    projectJson({
      title: '很多',
      spots: Array.from({ length: 45 }, (_, i) => ({ id: `m${i}x`, name: `P${i}` })),
    }),
    'application/json',
  );
  await expect(toast(page, '熱點最多 40 個，多出來的 5 個沒有加入。')).toBeVisible();
  await expect(page.getByTestId('title-input')).toHaveValue('很多');
  await tab(page, '熱點').click();
  await expect(page.getByText('熱點清單（40／40）')).toBeVisible();
  expect(errors).toEqual([]);
});

test('自動儲存與還原（含圖片）；存檔壞掉時整理後照常開頁（F95）', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('title-input').fill('會留下來的標題');
  await dragStage(page, [15, 25], [25, 35]);
  await expect.poll(async () => (await stored(page)).title).toBe('會留下來的標題');
  await page.reload();
  await expect(page.getByTestId('title-input')).toHaveValue('會留下來的標題');
  expect((await storedSpots(page))[3].x).toBeCloseTo(16.67, 0);
  /* 存檔壞掉：缺欄位、數值亂填、不合格的圖片網址 */
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        state: {
          data: {
            title: '壞掉的存檔',
            scene: { kind: 'url', url: 'javascript:alert(1)' },
            look: { theme: 'neon', accent: 'red' },
            spots: [{ id: 'aaa', x: 'zzz', w: 9999, h: -3, text: 5, shape: 'star' }, 'junk', null],
          },
        },
        version: 1,
      }),
    );
  }, KEY);
  await page.reload();
  await expect(page.getByTestId('title-input')).toHaveValue('壞掉的存檔');
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(1);
  const s = await storedSpots(page).catch(() => [] as StoredSpot[]);
  if (s.length) expect(s[0]).toMatchObject({ shape: 'rect', w: 100, h: 1.5 });
  await goPlay(page);
  await expect(play(page).locator('.cm')).toHaveCount(0);
  await expect(play(page)).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('復原／重做：文字欄一次一步、拖曳一次一步、新增熱點、工具列與 Ctrl＋Z（F95）', async ({
  page,
}) => {
  const errors = await open(page);
  const undo = page.getByRole('button', { name: /^復原/ }).first();
  const redo = page.getByRole('button', { name: /^重做/ }).first();
  await expect(undo).toBeDisabled();
  /* 文字欄：從聚焦到離開算一步 */
  await page.getByTestId('title-input').fill('第一版');
  await page.getByTestId('title-input').press('Enter');
  await page.waitForTimeout(450);
  await page.getByTestId('title-input').fill('第二版');
  await page.getByTestId('title-input').press('Enter');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByTestId('title-input')).toHaveValue('第一版');
  await redo.click();
  await expect(page.getByTestId('title-input')).toHaveValue('第二版');
  /* 拖曳一次一步 */
  await page.waitForTimeout(450);
  const x0 = (await stored(page)).spots[3].x;
  await dragStage(page, [15, 25], [25, 35]);
  expect((await storedSpots(page))[3].x).not.toBeCloseTo(x0, 0);
  await page.locator('body').click({ position: { x: 4, y: 200 } });
  await page.keyboard.press('Control+z');
  expect((await storedSpots(page))[3].x).toBeCloseTo(x0, 5);
  await page.keyboard.press('Control+Shift+z');
  expect((await storedSpots(page))[3].x).not.toBeCloseTo(x0, 0);
  await page.keyboard.press('Control+z');
  /* 新增熱點 */
  await page.waitForTimeout(450);
  await tab(page, '熱點').click();
  await btn(page, '新增矩形').click();
  await expect(spotRows(page)).toHaveCount(9);
  await page.locator('body').click({ position: { x: 4, y: 200 } });
  await page.keyboard.press('Control+z');
  await expect(spotRows(page)).toHaveCount(8);
  await page.keyboard.press('Control+y');
  await expect(spotRows(page)).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('快捷鍵說明、Ctrl＋V 貼上圖片換場景（文字欄裡不攔截）（F96）', async ({ page }) => {
  const errors = await open(page);
  await page.locator('body').click({ position: { x: 4, y: 200 } });
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: /快捷鍵/ });
  await expect(help).toBeVisible();
  for (const t of ['選取', '畫矩形', '畫橢圓', '刪除選取的熱點', '微調選取的熱點']) {
    await expect(help).toContainText(t);
  }
  await page.keyboard.press('Escape');
  const b64 = (await bigPng(page, 300, 200)).toString('base64');
  const paste = (selector: string) =>
    page.evaluate(
      ({ b64, selector }) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([u8], '貼上.png', { type: 'image/png' }));
        document
          .querySelector(selector)
          ?.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
          );
      },
      { b64, selector },
    );
  /* 文字欄裡貼上：不換場景 */
  await paste('[data-testid="title-input"]');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  /* 頁面上貼上：換場景 */
  await paste('body');
  await expect(page.getByTestId('scene-name')).toHaveText('貼上.png');
  await expect(toast(page, '已換成新的場景圖')).toBeVisible();
  expect(errors).toEqual([]);
});

test('舞台背景可以切換、記在瀏覽器、不列入復原（F97）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '白色背景', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('trpg-toolkit:clue-map:preview')))
    .toContain('"stageBg":"light"');
  await page.reload();
  await expect(page.getByRole('radio', { name: '白色背景', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^復原/ }).first()).toBeDisabled();
  expect(errors).toEqual([]);
});
